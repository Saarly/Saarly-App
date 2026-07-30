import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Lang = "ar" | "en";
type Row = Record<string, unknown>;
type EmailCopy = {
  title: string;
  lead: string;
  body: string[];
  button: string;
  url: string;
  icon: string;
  subject: string;
};

const BRAND_GREEN = "#85BB64";
const BRAND_LIGHT = "#B2F789";
const PAGE_BG = "#F7F6F3";
const DARK = "#23262B";
const LOGO_URL = "https://saarly-admin-web.vercel.app/saarly-logo.png";
const FALLBACK_FROM_NAME = "Saarly | سعرلي";

function env(name: string) {
  const raw = Deno.env.get(name)?.trim() ?? "";
  if (raw.length > 1) {
    const quoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
    if (quoted) return raw.slice(1, -1).trim();
  }
  return raw;
}

function cleanHeader(value: unknown, fallback = "") {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function senderName() {
  const raw = env("EMAIL_FROM_NAME");
  const configured = cleanHeader(raw);
  const rawHasReplacement = raw.includes("\uFFFD") || raw.includes("�");
  const hasExactLatinBrand = /Saarly/i.test(configured);
  const hasExactArabicBrand = configured.includes("سعرلي");
  if (!configured || rawHasReplacement || !hasExactLatinBrand || !hasExactArabicBrand) {
    return FALLBACK_FROM_NAME;
  }
  return configured;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function value(payload: Row, ...keys: string[]) {
  for (const key of keys) {
    const candidate = text(payload[key]);
    if (candidate) return candidate;
  }
  return "";
}

function tr(lang: Lang, ar: string, en: string) {
  return lang === "en" ? en : ar;
}

function formatDate(value: string, lang: Lang) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(date);
}

function baseUrl() {
  return (env("MERCHANT_PORTAL_URL") || "https://saarly.app").replace(/\/+$/, "");
}

function merchantUrl() {
  return `${baseUrl()}/merchant`;
}

function billingUrl() {
  return `${merchantUrl()}/billing`;
}

function emailCopy(event: Row, lang: Lang): EmailCopy {
  const payload = (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload
    : {}) as Row;
  const eventType = text(event.event_type);
  const store = value(payload, "store_name", "merchant_name") || tr(lang, "متجرك", "your store");
  const branch = value(payload, "branch_name", "entity_name") || tr(lang, "الفرع", "the branch");
  const reason = value(payload, "reason", "rejection_reason");
  const documentLabel = value(payload, "document_label") || tr(lang, "المستند", "document");
  const end = formatDate(value(payload, "period_ends_at", "ends_at", "expires_at"), lang);
  const day = value(payload, "days_remaining", "reminder_day");
  let title = "";
  let lead = "";
  let body: string[] = [];
  let button = "";
  let url = merchantUrl();
  let icon = "✓";

  switch (eventType) {
    case "merchant_approved":
      title = tr(lang, "تمت الموافقة على متجرك", "Your store has been approved");
      lead = tr(lang, `يسعدنا إبلاغك بأنه تمت الموافقة على متجر «${store}».`, `We are pleased to let you know that “${store}” has been approved.`);
      body = [tr(lang, "يمكنك الآن فتح سعرلي والبدء في إدارة متجرك والاستفادة من الخدمات المتاحة.", "You can now open Saarly, manage your store, and use the available services.")];
      button = tr(lang, "فتح سعرلي", "Open Saarly");
      break;
    case "merchant_rejected":
      title = tr(lang, "بخصوص طلب تسجيل متجرك", "About your store registration request");
      lead = tr(lang, `شكرًا لاهتمامك بتسجيل متجر «${store}» في سعرلي.`, `Thank you for your interest in registering “${store}” on Saarly.`);
      body = [
        tr(lang, "بعد مراجعة الطلب، لم نتمكن من الموافقة عليه في الوقت الحالي.", "After reviewing your request, we could not approve it at this time."),
        reason ? tr(lang, `سبب عدم الموافقة: ${reason}`, `Reason: ${reason}`) : "",
        tr(lang, "يمكنك مراجعة البيانات وتصحيحها ثم المحاولة مرة أخرى.", "You can review and correct the details, then try again."),
      ];
      button = tr(lang, "مراجعة بياناتك", "Review your details");
      icon = "!";
      break;
    case "branch_approved":
      title = tr(lang, "تمت الموافقة على فرعك", "Your branch has been approved");
      lead = tr(lang, `تمت الموافقة على فرع «${branch}» التابع لمتجر «${store}».`, `The “${branch}” branch for “${store}” has been approved.`);
      body = [tr(lang, "أصبح الفرع جاهزًا للاستخدام داخل سعرلي.", "The branch is now ready to use in Saarly.")];
      button = tr(lang, "فتح سعرلي", "Open Saarly");
      break;
    case "branch_rejected":
      title = tr(lang, "بخصوص طلب إضافة الفرع", "About your branch request");
      lead = tr(lang, `بعد مراجعة فرع «${branch}»، لم نتمكن من الموافقة عليه في الوقت الحالي.`, `After reviewing the “${branch}” branch, we could not approve it at this time.`);
      body = [
        reason ? tr(lang, `سبب عدم الموافقة: ${reason}`, `Reason: ${reason}`) : "",
        tr(lang, "يمكنك تحديث البيانات أو المستندات ثم المحاولة مرة أخرى.", "You can update the details or documents, then try again."),
      ];
      button = tr(lang, "مراجعة بيانات الفرع", "Review branch details");
      icon = "!";
      break;
    case "merchant_document_rejected":
    case "branch_document_rejected": {
      const branchDocument = eventType === "branch_document_rejected";
      title = tr(lang, `مطلوب استبدال ${documentLabel}`, `${documentLabel} must be replaced`);
      lead = branchDocument
        ? tr(lang, `تم رفض ${documentLabel} الخاص بفرع «${branch}» في متجر «${store}».`, `The ${documentLabel} for the “${branch}” branch at “${store}” was rejected.`)
        : tr(lang, `تم رفض ${documentLabel} الخاص بمتجر «${store}».`, `The ${documentLabel} for “${store}” was rejected.`);
      body = [
        reason ? tr(lang, `سبب الرفض: ${reason}`, `Reason: ${reason}`) : "",
        tr(lang, "لازم تستبدل الملف المرفوض بملف واضح وصحيح من شاشة متابعة طلب المتجر، وبعدها تستنى مراجعة الإدارة من جديد.", "Replace the rejected file with a clear and valid file from the store application status screen, then wait for a new admin review."),
      ];
      button = tr(lang, "مراجعة طلب المتجر", "Review store application");
      url = merchantUrl();
      icon = "!";
      break;
    }
    case "subscription_approved":
    case "subscription_renewal_approved": {
      const renewal = eventType.includes("renewal");
      title = tr(lang, renewal ? "تم تجديد اشتراكك بنجاح" : "تم تفعيل اشتراكك بنجاح", renewal ? "Your subscription has been renewed" : "Your subscription is now active");
      lead = tr(lang, "أصبح اشتراكك فعالًا الآن.", "Your subscription is now active.");
      body = [tr(lang, "يمكنك الاستفادة مباشرة من المزايا المشمولة في اشتراكك.", "You can immediately use the features included in your plan.")];
      button = tr(lang, "عرض تفاصيل الاشتراك", "View subscription details");
      url = billingUrl();
      break;
    }
    case "subscription_rejected":
    case "renewal_rejected":
      title = tr(lang, "بخصوص طلب اشتراكك", "About your subscription request");
      lead = tr(lang, "بعد المراجعة، لم نتمكن من الموافقة على الطلب في الوقت الحالي.", "After reviewing your request, we could not approve it at this time.");
      body = [
        reason ? tr(lang, `سبب عدم الموافقة: ${reason}`, `Reason: ${reason}`) : "",
        tr(lang, "يمكنك مراجعة البيانات أو وسيلة الدفع ثم إرسال الطلب مرة أخرى.", "You can review the details or payment method and submit again."),
      ];
      button = tr(lang, "مراجعة الاشتراك", "Review subscription");
      url = billingUrl();
      icon = "!";
      break;
    case "billing_expiry_reminder":
      title = tr(lang, "اشتراكك يقترب من الانتهاء", "Your subscription is nearing expiry");
      lead = day
        ? tr(lang, `يتبقى ${day} يوم على انتهاء اشتراك متجر «${store}».`, `${day} days remain before the subscription for “${store}” ends.`)
        : tr(lang, "اشتراك متجرك يقترب من الانتهاء.", "Your store subscription is nearing expiry.");
      body = [
        end ? tr(lang, `تاريخ الانتهاء: ${end}`, `Expiry date: ${end}`) : "",
        tr(lang, "جدّد اشتراكك في الوقت المناسب لتستمر الخدمات دون توقف.", "Renew in time to keep your services running without interruption."),
      ];
      button = tr(lang, "مراجعة الاشتراك", "Review subscription");
      url = billingUrl();
      icon = "⏳";
      break;
    case "free_trial_expired":
      title = tr(lang, "انتهت الفترة المجانية", "Your free trial has ended");
      lead = tr(lang, `انتهت الفترة المجانية لمتجر «${store}».`, `The free trial for “${store}” has ended.`);
      body = [tr(lang, "يمكنك اختيار الاشتراك المناسب لمواصلة استخدام سعرلي.", "Choose a suitable plan to continue using Saarly.")];
      button = tr(lang, "اختيار الاشتراك", "Choose a plan");
      url = billingUrl();
      icon = "⏳";
      break;
    case "subscription_expired":
      title = tr(lang, "انتهى اشتراكك", "Your subscription has ended");
      lead = tr(lang, `انتهى اشتراك متجر «${store}».`, `The subscription for “${store}” has ended.`);
      body = [tr(lang, "يمكنك تجديد الاشتراك لاستمرار خدمات متجرك.", "Renew your subscription to continue using store services.")];
      button = tr(lang, "تجديد الاشتراك", "Renew subscription");
      url = billingUrl();
      icon = "⏳";
      break;
    case "grace_period_expired":
      title = tr(lang, "انتهت مهلة التجديد", "The renewal grace period has ended");
      lead = tr(lang, `انتهت مهلة تجديد اشتراك متجر «${store}».`, `The renewal grace period for “${store}” has ended.`);
      body = [tr(lang, "تم إيقاف استقبال الطلبات الجديدة مؤقتًا، ويمكنك إعادة تفعيلها بعد التجديد.", "New requests are temporarily paused and will resume after renewal.")];
      button = tr(lang, "تجديد الاشتراك", "Renew subscription");
      url = billingUrl();
      icon = "⏳";
      break;
    default:
      title = lang === "en" ? "A new update from Saarly" : text(event.subject, "تحديث جديد من سعرلي");
      lead = lang === "en" ? "You have a new update in your Saarly account." : text(event.body_text, "لديك تحديث جديد في حسابك على سعرلي.");
      button = tr(lang, "فتح سعرلي", "Open Saarly");
      url = baseUrl();
  }

  title = cleanHeader(title, tr(lang, "تحديث من سعرلي", "Update from Saarly"));
  return { title, lead, body: body.filter(Boolean), button, url, icon, subject: title };
}

function emailHtml(copy: EmailCopy, lang: Lang) {
  const rtl = lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const paragraphs = copy.body
    .map((item) => `<p style="font-size:16px;line-height:1.9;color:#404640;margin:0 0 12px">${escapeHtml(item)}</p>`)
    .join("");
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:640px){.s{width:100%!important;border-radius:0!important}.p{padding:26px 18px!important}.logo{width:190px!important}.title{font-size:25px!important}}</style></head><body style="margin:0;background:${PAGE_BG};font-family:Tahoma,Arial,sans-serif;direction:${dir}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(copy.lead)}</div><table width="100%" role="presentation"><tr><td align="center" style="padding:24px 10px"><table class="s" width="620" role="presentation" style="width:620px;max-width:100%;background:#fff;border:1px solid #e1e5df;border-radius:18px;overflow:hidden"><tr><td style="height:6px;background:${BRAND_GREEN}"></td></tr><tr><td align="center" style="padding:28px 20px"><img class="logo" src="${LOGO_URL}" width="230" style="width:230px;max-width:72%;height:auto" alt="Saarly | سعرلي"></td></tr><tr><td class="p" style="padding:34px 44px;background:#fbfcfa;text-align:${rtl ? "right" : "left"}"><div style="width:72px;height:72px;line-height:72px;margin:0 auto 18px;border-radius:50%;background:${BRAND_LIGHT};color:#4f8834;font-size:38px;font-weight:800;text-align:center">${copy.icon}</div><h1 class="title" style="text-align:center;font-size:30px;color:${DARK};margin:0 0 16px">${escapeHtml(copy.title)}</h1><div style="width:52px;height:4px;background:${BRAND_GREEN};margin:0 auto 24px"></div><p style="font-size:18px;line-height:1.9;color:${DARK};font-weight:700;margin:0 0 14px">${escapeHtml(copy.lead)}</p>${paragraphs}<table role="presentation" style="margin:24px auto 4px"><tr><td bgcolor="${BRAND_GREEN}" style="border-radius:12px"><a href="${escapeHtml(copy.url)}" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.button)}</a></td></tr></table></td></tr><tr><td align="center" style="padding:18px;color:#4c534c;font-size:14px;line-height:1.8">${tr(lang, "مع خالص التحية،", "Kind regards,")}<br><strong style="color:#5f9c42">${tr(lang, "فريق سعرلي", "The Saarly Team")}</strong></td></tr><tr><td align="center" style="padding:16px;background:#f1f2f0;color:#858b85;font-size:12px">${tr(lang, "هذه رسالة آلية من سعرلي، يرجى عدم الرد عليها مباشرة.", "This is an automated message from Saarly. Please do not reply directly.")}</td></tr></table></td></tr></table></body></html>`;
}

function timingSafeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function authorized(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : request.headers.get("apikey")?.trim() ?? "";
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const dispatchSecret = env("EMAIL_DISPATCH_SECRET");
  const customSecret = request.headers.get("x-saarly-dispatch-secret")?.trim() ?? "";
  if (serviceRoleKey && timingSafeEqual(serviceRoleKey, bearer)) return true;
  if (dispatchSecret && timingSafeEqual(dispatchSecret, customSecret || bearer)) return true;
  if (!bearer) return false;
  try {
    const client = createClient(env("SUPABASE_URL"), bearer);
    return !(await client.auth.admin.listUsers({ page: 1, perPage: 1 })).error;
  } catch {
    return false;
  }
}

async function sendEmail(event: Row, lang: Lang) {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const port = Number(env("SMTP_PORT") || 465);
  if (!host || !user || !pass) throw new Error(`smtp_missing:${[!host ? "SMTP_HOST" : "", !user ? "SMTP_USER" : "", !pass ? "SMTP_PASS" : ""].filter(Boolean).join(",")}`);
  const fromAddress = env("EMAIL_FROM_ADDRESS") || user;
  const copy = emailCopy(event, lang);
  const nodemailer = await import("npm:nodemailer@6.9.16");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    tls: { servername: host, minVersion: "TLSv1.2" },
  });
  await transport.sendMail({
    from: { name: senderName(), address: fromAddress },
    to: text(event.recipient_email),
    subject: cleanHeader(copy.subject, tr(lang, "تحديث من سعرلي", "Update from Saarly")),
    text: [copy.title, "", copy.lead, ...copy.body, "", `${copy.button}: ${copy.url}`].join("\n"),
    html: emailHtml(copy, lang),
    headers: { "X-Saarly-Event-ID": text(event.id) },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (!(await authorized(request))) return jsonResponse(401, { error: "unauthorized" });

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let body: Row = {};
  try { body = await request.json(); } catch { /* empty body */ }
  if (body.diagnostics === true) {
    return jsonResponse(200, { ok: true, diagnostics: { provider: "smtp", branded_templates: true, localized_templates: true, utf8_sender_headers: true } });
  }

  const targetEventId = text(body.event_id);
  const workerId = `email-${crypto.randomUUID()}`;
  const events: Row[] = [];
  await db.rpc("enqueue_billing_lifecycle_messages", { p_reference_time: new Date().toISOString() });

  if (targetEventId) {
    const query = await db.from("admin_email_events").select("*").eq("id", targetEventId).maybeSingle();
    if (query.data && query.data.status !== "sent") {
      const claimed = await db
        .from("admin_email_events")
        .update({
          status: "sending",
          attempts: Number(query.data.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          locked_at: new Date().toISOString(),
          locked_by: workerId,
          failure_reason: null,
        })
        .eq("id", targetEventId)
        .in("status", ["pending", "failed", "dead"])
        .select("*")
        .maybeSingle();
      if (claimed.data) events.push(claimed.data as Row);
    }
  } else {
    const claim = await db.rpc("claim_admin_email_events", {
      p_worker_id: workerId,
      p_limit: Math.min(Number(body.limit) || 20, 50),
    });
    if (claim.error) return jsonResponse(500, { error: claim.error.message });
    events.push(...((claim.data ?? []) as Row[]));
  }

  async function locale(event: Row): Promise<Lang> {
    const userId = text(event.recipient_user_id ?? event.user_id);
    if (userId) {
      try {
        const user = await db.auth.admin.getUserById(userId);
        const preferred = user.data.user?.user_metadata?.preferred_language;
        if (preferred === "en" || preferred === "ar") return preferred;
      } catch { /* use public profile */ }
      const profile = await db.from("users").select("preferred_language").eq("id", userId).maybeSingle();
      if (profile.data?.preferred_language === "en") return "en";
    }
    return "ar";
  }

  let sent = 0;
  let failed = 0;
  const results: Row[] = [];
  for (const event of events) {
    try {
      await sendEmail(event, await locale(event));
      const completed = await db.rpc("complete_admin_email_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_success: true,
        p_failure_reason: null,
      });
      if (completed.error) throw completed.error;
      sent += 1;
      results.push({ id: event.id, success: true });
    } catch (error) {
      failed += 1;
      const failureReason = error instanceof Error ? error.message : String(error);
      await db.rpc("complete_admin_email_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_success: false,
        p_failure_reason: failureReason,
      });
      results.push({ id: event.id, success: false, failure_reason: failureReason });
    }
  }

  return jsonResponse(200, {
    ok: true,
    claimed: events.length,
    sent,
    failed,
    target_processed: targetEventId ? results.some((item) => item.id === targetEventId) : null,
    results,
  });
});
