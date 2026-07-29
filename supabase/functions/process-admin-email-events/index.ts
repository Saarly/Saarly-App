import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type EmailEvent = {
  id: string;
  event_type?: string;
  payload?: Record<string, unknown>;
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html: string;
};

type DispatchResult = {
  id: string;
  success: boolean;
  failure_reason: string | null;
};

function env(name: string): string {
  const raw = Deno.env.get(name)?.trim() ?? "";
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw.slice(1, -1).trim();
    }
  }
  return raw;
}

function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name}_required`);
  return value;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown_email_error";
  }
}

function withPortalLinks(event: EmailEvent): EmailEvent {
  const rawBase = env("MERCHANT_PORTAL_URL");
  if (!rawBase) return event;

  const base = rawBase.replace(/\/+$/, "");
  const portalUrl = `${base}/merchant`;
  const billingUrl = `${base}/merchant/billing`;
  const linkedEvents = new Set([
    "billing_expiry_reminder",
    "free_trial_expired",
    "subscription_expired",
    "grace_period_expired",
    "subscription_approved",
    "subscription_renewal_approved",
    "subscription_rejected",
    "renewal_rejected",
    "merchant_approved",
    "merchant_rejected",
    "branch_approved",
    "branch_rejected",
  ]);
  if (!event.event_type || !linkedEvents.has(event.event_type)) return event;

  return {
    ...event,
    body_text: `${event.body_text}\n\nبوابة المتاجر | Merchant portal: ${portalUrl}\nالحساب والتجديد | Account and renewal: ${billingUrl}`,
    body_html: `${event.body_html}<hr><p><a href="${escapeHtml(portalUrl)}">بوابة المتاجر | Merchant portal</a></p><p><a href="${escapeHtml(billingUrl)}">الحساب والتجديد | Account and renewal</a></p>`,
  };
}

function timingSafeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && timingSafeEqual(serviceRoleKey, bearer)) return true;

  const expected = env("EMAIL_DISPATCH_SECRET");
  const headerSecret = request.headers.get("x-saarly-dispatch-secret")?.trim() ?? "";
  return expected.length > 0 && timingSafeEqual(expected, headerSecret || bearer);
}

function selectedProvider(): "smtp" | "resend" {
  const configured = env("EMAIL_PROVIDER").toLowerCase();
  if (configured === "smtp" || configured === "resend") return configured;

  // Prefer the already-configured Hostinger SMTP account when the provider value
  // is missing or was saved incorrectly. This avoids silently defaulting to Resend.
  if (env("SMTP_HOST") || env("SMTP_USER") || env("SMTP_PASS")) return "smtp";
  if (env("RESEND_API_KEY")) return "resend";
  throw new Error("email_provider_missing:EMAIL_PROVIDER");
}

async function sendWithResend(event: EmailEvent): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  const fromAddress = env("EMAIL_FROM_ADDRESS");
  const missing = [
    !apiKey ? "RESEND_API_KEY" : "",
    !fromAddress ? "EMAIL_FROM_ADDRESS" : "",
  ].filter(Boolean);
  if (missing.length) throw new Error(`resend_missing:${missing.join(",")}`);

  const fromName = env("EMAIL_FROM_NAME") || "Saarly | سعرلي";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: [event.recipient_email],
      subject: event.subject,
      text: event.body_text,
      html: event.body_html,
    }),
  });

  if (!response.ok) throw new Error(`resend_${response.status}:${await response.text()}`);
}

async function sendWithSmtp(event: EmailEvent): Promise<void> {
  const smtpHost = env("SMTP_HOST");
  const smtpUser = env("SMTP_USER");
  const smtpPass = env("SMTP_PASS");
  const missing = [
    !smtpHost ? "SMTP_HOST" : "",
    !smtpUser ? "SMTP_USER" : "",
    !smtpPass ? "SMTP_PASS" : "",
  ].filter(Boolean);
  if (missing.length) throw new Error(`smtp_missing:${missing.join(",")}`);

  const smtpPort = Number(env("SMTP_PORT") || "465");
  if (!Number.isInteger(smtpPort) || smtpPort <= 0) throw new Error("smtp_port_invalid");

  const fromAddress = env("EMAIL_FROM_ADDRESS") || smtpUser;
  const fromName = env("EMAIL_FROM_NAME") || "Saarly | سعرلي";
  const nodemailer = await import("npm:nodemailer@6.9.16");
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    tls: {
      servername: smtpHost,
      minVersion: "TLSv1.2",
    },
  });

  await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: event.recipient_email,
    subject: event.subject,
    text: event.body_text,
    html: event.body_html,
  });
}

async function sendEmail(event: EmailEvent): Promise<void> {
  const decoratedEvent = withPortalLinks(event);
  const provider = selectedProvider();
  if (provider === "smtp") return sendWithSmtp(decoratedEvent);
  return sendWithResend(decoratedEvent);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (!isAuthorized(request)) return jsonResponse(401, { error: "unauthorized" });

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let requestedLimit = 20;
  let targetEventId = "";
  let diagnosticsOnly = false;
  try {
    const body = await request.json() as { limit?: number; event_id?: string; diagnostics?: boolean };
    if (Number.isInteger(body.limit)) requestedLimit = Math.max(1, Math.min(body.limit ?? 20, 50));
    targetEventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
    diagnosticsOnly = body.diagnostics === true;
  } catch {
    // Empty body uses defaults.
  }

  const provider = (() => {
    try { return selectedProvider(); } catch { return "missing"; }
  })();
  const diagnostics = {
    provider,
    has_email_provider: Boolean(env("EMAIL_PROVIDER")),
    has_smtp_host: Boolean(env("SMTP_HOST")),
    has_smtp_user: Boolean(env("SMTP_USER")),
    has_smtp_pass: Boolean(env("SMTP_PASS")),
    has_smtp_port: Boolean(env("SMTP_PORT")),
    has_from_address: Boolean(env("EMAIL_FROM_ADDRESS")),
    has_dispatch_secret: Boolean(env("EMAIL_DISPATCH_SECRET")),
  };
  if (diagnosticsOnly) return jsonResponse(200, { ok: true, diagnostics });

  let lifecycleQueued = 0;
  let lifecycleError: string | null = null;
  const { data: lifecycleData, error: lifecycleRpcError } = await serviceClient.rpc(
    "enqueue_billing_lifecycle_messages",
    { p_reference_time: new Date().toISOString() },
  );
  if (lifecycleRpcError) lifecycleError = lifecycleRpcError.message;
  else if (typeof lifecycleData === "number") lifecycleQueued = lifecycleData;

  const workerId = `email-dispatch-${crypto.randomUUID()}`;
  let events: EmailEvent[] = [];

  if (targetEventId) {
    const now = new Date().toISOString();
    const { data: targetRow, error: targetReadError } = await serviceClient
      .from("admin_email_events")
      .select("*")
      .eq("id", targetEventId)
      .maybeSingle();
    if (targetReadError) {
      return jsonResponse(500, { error: "email_target_read_failed", details: targetReadError.message, diagnostics });
    }

    if (targetRow && targetRow.status !== "sent" && !targetRow.sent_at) {
      const { data: claimedTarget, error: targetClaimError } = await serviceClient
        .from("admin_email_events")
        .update({
          status: "sending",
          attempts: Number(targetRow.attempts ?? 0) + 1,
          last_attempt_at: now,
          locked_at: now,
          locked_by: workerId,
          failure_reason: null,
          updated_at: now,
        })
        .eq("id", targetEventId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (targetClaimError) {
        return jsonResponse(500, { error: "email_target_claim_failed", details: targetClaimError.message, diagnostics });
      }
      if (claimedTarget) events = [claimedTarget as EmailEvent];
    }
  } else {
    const { data, error } = await serviceClient.rpc("claim_admin_email_events", {
      p_worker_id: workerId,
      p_limit: requestedLimit,
    });
    if (error) {
      return jsonResponse(500, { error: "email_event_claim_failed", details: error.message, diagnostics });
    }
    events = (data ?? []) as EmailEvent[];
  }
  const results: DispatchResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await sendEmail(event);
      const { error: completeError } = await serviceClient.rpc("complete_admin_email_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_success: true,
        p_failure_reason: null,
      });
      if (completeError) throw completeError;
      sent += 1;
      results.push({ id: event.id, success: true, failure_reason: null });
    } catch (error) {
      failed += 1;
      const reason = readableError(error);
      await serviceClient.rpc("complete_admin_email_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_success: false,
        p_failure_reason: reason,
      });
      results.push({ id: event.id, success: false, failure_reason: reason });
    }
  }

  return jsonResponse(200, {
    ok: true,
    claimed: events.length,
    sent,
    failed,
    target_event_id: targetEventId || null,
    target_processed: targetEventId ? results.some((item) => item.id === targetEventId) : null,
    results,
    diagnostics,
    lifecycle_queued: lifecycleQueued,
    lifecycle_error: lifecycleError,
    worker_id: workerId,
  });
});
