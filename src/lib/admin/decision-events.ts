import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Locale = "ar" | "en";
type Decision = "approved" | "rejected";
type SubscriptionOperation = "new_subscription" | "renewal";

type EmailMessage = {
  subject: string;
  text: string;
  html: string;
};

type NotificationMessage = {
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  deepLink: string;
  payload: Row;
  dedupeKey: string;
};

type EmailEventInput = {
  eventType: string;
  targetTable: string;
  targetId: string;
  merchantId?: string | null;
  userId?: string | null;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  idempotencyKey: string;
  message: EmailMessage;
  payload: Row;
};

export type DecisionEventResult = {
  emailEventId?: string;
  emailStatus?: string;
  notificationId?: string;
  warnings: string[];
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return email.includes("@") ? email : "";
}

function row(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function localeFromUser(user: Row | null): Locale {
  return text(user?.preferred_language).toLowerCase().startsWith("en")
    ? "en"
    : "ar";
}

function escapeHtml(value: unknown) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlFromLines(lines: string[]) {
  const items = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return `<div dir="auto" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#222">${items}</div>`;
}

function formatDate(value: unknown, locale: Locale) {
  const raw = text(value);
  if (!raw) return locale === "ar" ? "غير متاح" : "Not available";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return locale === "ar" ? "غير متاح" : "Not available";
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function staleSending(value: unknown) {
  const raw = text(value);
  if (!raw) return true;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() > 10 * 60 * 1000;
}

function decisionWord(decision: Decision, locale: Locale) {
  if (decision === "approved") return locale === "ar" ? "قبول" : "approval";
  return locale === "ar" ? "رفض" : "rejection";
}

function statusLabel(status: unknown, locale: Locale) {
  const value = text(status).toLowerCase();
  const labels: Record<string, { ar: string; en: string }> = {
    approved: { ar: "مقبول", en: "Approved" },
    rejected: { ar: "مرفوض", en: "Rejected" },
    active: { ar: "نشط", en: "Active" },
    trialing: { ar: "فترة تجربة", en: "Trialing" },
    past_due: { ar: "بانتظار السداد", en: "Past due" },
    submitted: { ar: "مرسل", en: "Submitted" },
    under_review: { ar: "قيد المراجعة", en: "Under review" },
  };
  return labels[value]?.[locale] ?? (value || (locale === "ar" ? "غير متاح" : "Not available"));
}

function subscriptionOperationLabel(operation: SubscriptionOperation, locale: Locale) {
  if (operation === "renewal") {
    return locale === "ar" ? "تجديد الاشتراك" : "subscription renewal";
  }
  return locale === "ar" ? "اشتراك جديد" : "new subscription";
}

function planName(plan: Row | null, request: Row | null, locale: Locale) {
  const snapshot = row(request?.plan_snapshot);
  const ar =
    text(plan?.name_ar) ||
    text(snapshot?.name_ar) ||
    text(snapshot?.name) ||
    text(request?.plan_name);
  const en =
    text(plan?.name_en) ||
    text(snapshot?.name_en) ||
    text(snapshot?.name) ||
    text(request?.plan_name);
  const primary = locale === "ar" ? ar : en;
  const fallback = locale === "ar" ? en : ar;
  return primary || fallback || (locale === "ar" ? "الخطة المختارة" : "Selected plan");
}

async function ownerUserForMerchant(service: SupabaseClient, merchant: Row | null) {
  const userId = text(merchant?.user_id);
  if (!userId) return null;
  const { data, error } = await service
    .from("users")
    .select("id,primary_email,preferred_language")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Row | null;
}

async function fetchMerchant(service: SupabaseClient, merchantId: string) {
  const { data, error } = await service
    .from("merchants")
    .select("id,user_id,store_name,approval_status,rejection_reason")
    .eq("id", merchantId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Row | null;
}

async function fetchBranchContext(service: SupabaseClient, branchId: string) {
  const { data: branch, error: branchError } = await service
    .from("branches")
    .select("id,merchant_id,name,approval_status,rejection_reason")
    .eq("id", branchId)
    .maybeSingle();
  if (branchError) throw branchError;
  const branchRow = (branch ?? null) as Row | null;
  const merchantId = text(branchRow?.merchant_id);
  const merchant = merchantId ? await fetchMerchant(service, merchantId) : null;
  const owner = await ownerUserForMerchant(service, merchant);
  return { branch: branchRow, merchant, owner };
}

async function fetchManualPaymentContext(service: SupabaseClient, requestId: string) {
  const { data: request, error: requestError } = await service
    .from("manual_payment_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw requestError;
  const requestRow = (request ?? null) as Row | null;
  const merchantId = text(requestRow?.merchant_id);
  const planId = text(requestRow?.plan_id);
  const merchant = merchantId ? await fetchMerchant(service, merchantId) : null;
  const owner = await ownerUserForMerchant(service, merchant);
  const { data: plan, error: planError } = planId
    ? await service
        .from("subscription_plans")
        .select("id,name_ar,name_en")
        .eq("id", planId)
        .maybeSingle()
    : { data: null, error: null };
  if (planError) throw planError;
  const { data: subscription, error: subscriptionError } = await service
    .from("merchant_subscriptions")
    .select("id,status,starts_at,ends_at,plan_id,source_payment_request_id")
    .eq("source_payment_request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  return {
    request: requestRow,
    merchant,
    owner,
    plan: (plan ?? null) as Row | null,
    subscription: (subscription ?? null) as Row | null,
  };
}

async function upsertNotification(
  service: SupabaseClient,
  userId: string | null,
  message: NotificationMessage,
) {
  if (!userId) return undefined;
  const { data, error } = await service
    .from("notifications")
    .upsert(
      {
        user_id: userId,
        type: message.type,
        title_ar: message.titleAr,
        title_en: message.titleEn,
        body_ar: message.bodyAr,
        body_en: message.bodyEn,
        deep_link: message.deepLink,
        is_read: false,
        dedupe_key: message.dedupeKey,
        payload: message.payload,
        push_status: "pending",
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return text((data as Row | null)?.id) || undefined;
}

async function ensureEmailEvent(service: SupabaseClient, input: EmailEventInput) {
  const recipientEmail = cleanEmail(input.recipientEmail);
  const missingRecipient = !recipientEmail;
  const eventRow = {
    event_type: input.eventType,
    target_table: input.targetTable,
    target_id: input.targetId,
    merchant_id: input.merchantId || null,
    user_id: input.userId || null,
    recipient_user_id: input.recipientUserId || null,
    recipient_email: recipientEmail || "missing-recipient@saarly.local",
    subject: input.message.subject,
    body_text: input.message.text,
    body_html: input.message.html,
    status: missingRecipient ? "skipped" : "pending",
    failure_reason: missingRecipient ? "recipient_email_missing" : null,
    idempotency_key: input.idempotencyKey,
    payload: input.payload,
  };

  const { data: existing, error: existingError } = await service
    .from("admin_email_events")
    .select("id,status,attempts,last_attempt_at")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;

  const existingRow = (existing ?? null) as Row | null;
  const existingStatus = text(existingRow?.status);
  if (existingStatus === "sent" || existingStatus === "skipped") {
    return existingRow;
  }
  if (existingStatus === "sending" && !staleSending(existingRow?.last_attempt_at)) {
    return existingRow;
  }

  if (existingRow?.id) {
    const { data, error } = await service
      .from("admin_email_events")
      .update(eventRow)
      .eq("id", text(existingRow.id))
      .select("id,status,attempts,last_attempt_at")
      .single();
    if (error) throw error;
    return data as Row;
  }

  const { data, error } = await service
    .from("admin_email_events")
    .insert(eventRow)
    .select("id,status,attempts,last_attempt_at")
    .single();
  if (!error) return data as Row;

  const { data: raced, error: racedError } = await service
    .from("admin_email_events")
    .select("id,status,attempts,last_attempt_at")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (racedError) throw racedError;
  if (raced) return raced as Row;
  throw error;
}

async function claimEmailEvent(service: SupabaseClient, eventId: string) {
  const { data: current, error: currentError } = await service
    .from("admin_email_events")
    .select("id,status,attempts")
    .eq("id", eventId)
    .maybeSingle();
  if (currentError) throw currentError;

  const currentRow = (current ?? null) as Row | null;
  const currentStatus = text(currentRow?.status);
  if (currentStatus !== "pending" && currentStatus !== "failed") return null;

  const attempts = Number(currentRow?.attempts ?? 0);
  const { data, error } = await service
    .from("admin_email_events")
    .update({
      status: "sending",
      attempts: attempts + 1,
      last_attempt_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", eventId)
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Row | null;
}

async function sendEmailThroughProvider(event: Row) {
  const apiKey = process.env.RESEND_API_KEY || process.env.SAARLY_EMAIL_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ||
    process.env.SAARLY_EMAIL_FROM ||
    "Saarly <support@saarly.app>";

  if (!apiKey) {
    throw new Error("email_provider_not_configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": text(event.idempotency_key) || text(event.id),
    },
    body: JSON.stringify({
      from,
      to: text(event.recipient_email),
      subject: text(event.subject),
      text: text(event.body_text),
      html: text(event.body_html),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`email_provider_failed:${response.status}:${details.slice(0, 240)}`);
  }
}

async function sendDecisionEmail(service: SupabaseClient, input: EmailEventInput) {
  const event = await ensureEmailEvent(service, input);
  const eventId = text(event?.id);
  if (!eventId) return { id: undefined, status: undefined };

  let status = text(event?.status);
  if (status === "sent" || status === "skipped" || status === "sending") {
    return { id: eventId, status };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const claimed = await claimEmailEvent(service, eventId);
    if (!claimed) break;
    try {
      await sendEmailThroughProvider(claimed);
      const { data, error } = await service
        .from("admin_email_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", eventId)
        .select("id,status")
        .single();
      if (error) throw error;
      status = text((data as Row).status);
      break;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "email_send_failed";
      const { data } = await service
        .from("admin_email_events")
        .update({
          status: "failed",
          failure_reason: failureReason,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", eventId)
        .select("id,status")
        .maybeSingle();
      status = text((data as Row | null)?.status) || "failed";
    }
  }

  return { id: eventId, status };
}

function merchantDecisionEmail(
  locale: Locale,
  decision: Decision,
  storeName: string,
  status: unknown,
  reason: string,
  decidedAt: string,
): EmailMessage {
  const approved = decision === "approved";
  const subject =
    locale === "ar"
      ? approved
        ? `تم قبول متجر ${storeName}`
        : `تم رفض طلب متجر ${storeName}`
      : approved
        ? `${storeName} was approved`
        : `${storeName} was rejected`;
  const lines =
    locale === "ar"
      ? approved
        ? [
            `تم قبول متجر ${storeName}.`,
            `حالة الحساب: ${statusLabel(status, locale)}.`,
            "يمكنك الآن تسجيل الدخول والبدء في استخدام النظام.",
            `تاريخ القرار: ${formatDate(decidedAt, locale)}.`,
          ]
        : [
            `تم رفض طلب تسجيل متجر ${storeName}.`,
            `سبب الرفض: ${reason || "لم يتم تحديد سبب واضح."}`,
            "يمكنك تعديل البيانات أو إعادة التقديم حسب الخطوات المتاحة في النظام.",
            `تاريخ القرار: ${formatDate(decidedAt, locale)}.`,
          ]
      : approved
        ? [
            `${storeName} has been approved.`,
            `Account status: ${statusLabel(status, locale)}.`,
            "You can now sign in and start using the system.",
            `Decision date: ${formatDate(decidedAt, locale)}.`,
          ]
        : [
            `${storeName} registration was rejected.`,
            `Reason: ${reason || "No clear reason was provided."}`,
            "You can update the details or submit again according to the current system steps.",
            `Decision date: ${formatDate(decidedAt, locale)}.`,
          ];
  return { subject, text: lines.join("\n"), html: htmlFromLines(lines) };
}

function branchDecisionEmail(
  locale: Locale,
  decision: Decision,
  storeName: string,
  branchName: string,
  status: unknown,
  reason: string,
  decidedAt: string,
): EmailMessage {
  const approved = decision === "approved";
  const subject =
    locale === "ar"
      ? approved
        ? `تم قبول فرع ${branchName}`
        : `تم رفض فرع ${branchName}`
      : approved
        ? `${branchName} branch was approved`
        : `${branchName} branch was rejected`;
  const lines =
    locale === "ar"
      ? approved
        ? [
            `تم قبول فرع ${branchName} التابع لمتجر ${storeName}.`,
            `حالة الفرع: ${statusLabel(status, locale)}.`,
            `تاريخ القرار: ${formatDate(decidedAt, locale)}.`,
          ]
        : [
            `تم رفض فرع ${branchName} التابع لمتجر ${storeName}.`,
            `سبب الرفض: ${reason || "لم يتم تحديد سبب واضح."}`,
            "يمكنك تعديل البيانات أو إعادة رفع المستندات حسب الخطوات المتاحة في النظام.",
            `تاريخ القرار: ${formatDate(decidedAt, locale)}.`,
          ]
      : approved
        ? [
            `${branchName} branch for ${storeName} has been approved.`,
            `Branch status: ${statusLabel(status, locale)}.`,
            `Decision date: ${formatDate(decidedAt, locale)}.`,
          ]
        : [
            `${branchName} branch for ${storeName} was rejected.`,
            `Reason: ${reason || "No clear reason was provided."}`,
            "You can update the details or upload the required documents again according to the current system steps.",
            `Decision date: ${formatDate(decidedAt, locale)}.`,
          ];
  return { subject, text: lines.join("\n"), html: htmlFromLines(lines) };
}

function subscriptionDecisionEmail(
  locale: Locale,
  decision: Decision,
  operation: SubscriptionOperation,
  storeName: string,
  plan: string,
  subscription: Row | null,
  request: Row | null,
  reason: string,
): EmailMessage {
  const approved = decision === "approved";
  const operationLabel = subscriptionOperationLabel(operation, locale);
  const subject =
    locale === "ar"
      ? approved
        ? `تم قبول ${operationLabel} لمتجر ${storeName}`
        : `تم رفض ${operationLabel} لمتجر ${storeName}`
      : approved
        ? `${operationLabel} approved for ${storeName}`
        : `${operationLabel} rejected for ${storeName}`;
  const statusSource = approved ? subscription?.status : request?.status;
  const lines =
    locale === "ar"
      ? approved
        ? [
            `تم قبول طلب ${operationLabel} لمتجر ${storeName}.`,
            `الخطة: ${plan}.`,
            `بداية الاشتراك: ${formatDate(subscription?.starts_at, locale)}.`,
            `نهاية الاشتراك: ${formatDate(subscription?.ends_at, locale)}.`,
            `الحالة الحالية: ${statusLabel(statusSource, locale)}.`,
            "تم تفعيل الاشتراك بنجاح.",
          ]
        : [
            `تم رفض طلب ${operationLabel} لمتجر ${storeName}.`,
            `سبب الرفض: ${reason || "لم يتم تحديد سبب واضح."}`,
            "يمكنك إرسال طلب جديد من بوابة المتاجر بعد تعديل البيانات المطلوبة.",
          ]
      : approved
        ? [
            `${operationLabel} request for ${storeName} has been approved.`,
            `Plan: ${plan}.`,
            `Subscription start: ${formatDate(subscription?.starts_at, locale)}.`,
            `Subscription end: ${formatDate(subscription?.ends_at, locale)}.`,
            `Current status: ${statusLabel(statusSource, locale)}.`,
            "The subscription was activated successfully.",
          ]
        : [
            `${operationLabel} request for ${storeName} was rejected.`,
            `Reason: ${reason || "No clear reason was provided."}`,
            "You can submit a new request from the merchant portal after updating the required details.",
          ];
  return { subject, text: lines.join("\n"), html: htmlFromLines(lines) };
}

function result(warnings: string[]): DecisionEventResult {
  return { warnings };
}

export async function dispatchMerchantDecisionEvents(
  service: SupabaseClient,
  input: { merchantId: string; approved: boolean; reason?: string | null; decidedAt?: string },
): Promise<DecisionEventResult> {
  const decision: Decision = input.approved ? "approved" : "rejected";
  const decidedAt = input.decidedAt || new Date().toISOString();
  const merchant = await fetchMerchant(service, input.merchantId);
  const owner = await ownerUserForMerchant(service, merchant);
  const warnings: string[] = [];
  if (!merchant) return result(["merchant_not_found"]);

  const ownerUserId = text(owner?.id) || text(merchant.user_id) || null;
  const locale = localeFromUser(owner);
  const storeName = text(merchant.store_name) || (locale === "ar" ? "المتجر" : "Store");
  const reasonText = text(input.reason) || text(merchant.rejection_reason);
  const eventType = `merchant_${decision}`;
  const email = merchantDecisionEmail(locale, decision, storeName, merchant.approval_status, reasonText, decidedAt);
  const emailResult = await sendDecisionEmail(service, {
    eventType,
    targetTable: "merchants",
    targetId: input.merchantId,
    merchantId: input.merchantId,
    userId: ownerUserId,
    recipientUserId: ownerUserId,
    recipientEmail: cleanEmail(owner?.primary_email),
    idempotencyKey: `admin:${eventType}:${input.merchantId}`,
    message: email,
    payload: {
      decision,
      store_name: storeName,
      status: merchant.approval_status,
      reason: reasonText,
      decided_at: decidedAt,
    },
  });
  if (emailResult.status === "failed") warnings.push("email_send_failed");

  const notificationId = await upsertNotification(service, ownerUserId, {
    type: eventType,
    titleAr: input.approved ? "تم قبول المتجر" : "تم رفض المتجر",
    titleEn: input.approved ? "Store approved" : "Store rejected",
    bodyAr: input.approved
      ? `تم قبول متجر ${storeName}. يمكنك الآن استخدام النظام.`
      : `تم رفض متجر ${storeName}. السبب: ${reasonText || "لم يتم تحديد سبب واضح."}`,
    bodyEn: input.approved
      ? `${storeName} was approved. You can now use the system.`
      : `${storeName} was rejected. Reason: ${reasonText || "No clear reason was provided."}`,
    deepLink: "saarly://merchant/dashboard",
    dedupeKey: `admin:${eventType}:${input.merchantId}`,
    payload: { decision, reason: reasonText, merchant_id: input.merchantId },
  });

  return { emailEventId: emailResult.id, emailStatus: emailResult.status, notificationId, warnings };
}

export async function dispatchBranchDecisionEvents(
  service: SupabaseClient,
  input: { branchId: string; approved: boolean; reason?: string | null; decidedAt?: string },
): Promise<DecisionEventResult> {
  const decision: Decision = input.approved ? "approved" : "rejected";
  const decidedAt = input.decidedAt || new Date().toISOString();
  const { branch, merchant, owner } = await fetchBranchContext(service, input.branchId);
  const warnings: string[] = [];
  if (!branch) return result(["branch_not_found"]);

  const ownerUserId = text(owner?.id) || text(merchant?.user_id) || null;
  const locale = localeFromUser(owner);
  const storeName = text(merchant?.store_name) || (locale === "ar" ? "المتجر" : "Store");
  const branchName = text(branch.name) || (locale === "ar" ? "الفرع" : "Branch");
  const reasonText = text(input.reason) || text(branch.rejection_reason);
  const eventType = `branch_${decision}`;
  const email = branchDecisionEmail(locale, decision, storeName, branchName, branch.approval_status, reasonText, decidedAt);
  const emailResult = await sendDecisionEmail(service, {
    eventType,
    targetTable: "branches",
    targetId: input.branchId,
    merchantId: text(branch.merchant_id) || null,
    userId: ownerUserId,
    recipientUserId: ownerUserId,
    recipientEmail: cleanEmail(owner?.primary_email),
    idempotencyKey: `admin:${eventType}:${input.branchId}`,
    message: email,
    payload: {
      decision,
      store_name: storeName,
      branch_name: branchName,
      status: branch.approval_status,
      reason: reasonText,
      decided_at: decidedAt,
    },
  });
  if (emailResult.status === "failed") warnings.push("email_send_failed");

  const notificationId = await upsertNotification(service, ownerUserId, {
    type: eventType,
    titleAr: input.approved ? "تم قبول الفرع" : "تم رفض الفرع",
    titleEn: input.approved ? "Branch approved" : "Branch rejected",
    bodyAr: input.approved
      ? `تم قبول فرع ${branchName} في متجر ${storeName}.`
      : `تم رفض فرع ${branchName} في متجر ${storeName}. السبب: ${reasonText || "لم يتم تحديد سبب واضح."}`,
    bodyEn: input.approved
      ? `${branchName} branch for ${storeName} was approved.`
      : `${branchName} branch for ${storeName} was rejected. Reason: ${reasonText || "No clear reason was provided."}`,
    deepLink: "saarly://merchant/dashboard",
    dedupeKey: `admin:${eventType}:${input.branchId}`,
    payload: {
      decision,
      reason: reasonText,
      branch_id: input.branchId,
      merchant_id: text(branch.merchant_id),
    },
  });

  return { emailEventId: emailResult.id, emailStatus: emailResult.status, notificationId, warnings };
}

export async function dispatchSubscriptionDecisionEvents(
  service: SupabaseClient,
  input: {
    requestId: string;
    approved: boolean;
    operation: SubscriptionOperation;
    reason?: string | null;
  },
): Promise<DecisionEventResult> {
  const decision: Decision = input.approved ? "approved" : "rejected";
  const { request, merchant, owner, plan, subscription } = await fetchManualPaymentContext(service, input.requestId);
  const warnings: string[] = [];
  if (!request) return result(["manual_payment_request_not_found"]);

  const ownerUserId = text(owner?.id) || text(merchant?.user_id) || null;
  const locale = localeFromUser(owner);
  const storeName = text(merchant?.store_name) || (locale === "ar" ? "المتجر" : "Store");
  const reasonText = text(input.reason) || text(request.rejection_reason);
  const planLabel = planName(plan, request, locale);
  const operationPrefix = input.operation === "renewal" ? "renewal" : "subscription";
  const eventType = `${operationPrefix}_${decision}`;
  const email = subscriptionDecisionEmail(
    locale,
    decision,
    input.operation,
    storeName,
    planLabel,
    subscription,
    request,
    reasonText,
  );
  const emailResult = await sendDecisionEmail(service, {
    eventType,
    targetTable: "manual_payment_requests",
    targetId: input.requestId,
    merchantId: text(request.merchant_id) || null,
    userId: ownerUserId,
    recipientUserId: ownerUserId,
    recipientEmail: cleanEmail(owner?.primary_email) || cleanEmail(request.contact_email),
    idempotencyKey: `admin:${eventType}:${input.requestId}`,
    message: email,
    payload: {
      decision,
      operation: input.operation,
      store_name: storeName,
      plan_name: planLabel,
      request_status: request.status,
      subscription_status: subscription?.status ?? null,
      starts_at: subscription?.starts_at ?? null,
      ends_at: subscription?.ends_at ?? null,
      reason: reasonText,
    },
  });
  if (emailResult.status === "failed") warnings.push("email_send_failed");

  const titleAr =
    input.operation === "renewal"
      ? input.approved
        ? "تم قبول تجديد الاشتراك"
        : "تم رفض تجديد الاشتراك"
      : input.approved
        ? "تم قبول الاشتراك"
        : "تم رفض الاشتراك";
  const titleEn =
    input.operation === "renewal"
      ? input.approved
        ? "Renewal approved"
        : "Renewal rejected"
      : input.approved
        ? "Subscription approved"
        : "Subscription rejected";

  const notificationId = await upsertNotification(service, ownerUserId, {
    type: eventType,
    titleAr,
    titleEn,
    bodyAr: input.approved
      ? `تم قبول ${subscriptionOperationLabel(input.operation, "ar")} لمتجر ${storeName}. الخطة: ${planLabel}.`
      : `تم رفض ${subscriptionOperationLabel(input.operation, "ar")} لمتجر ${storeName}. السبب: ${reasonText || "لم يتم تحديد سبب واضح."}`,
    bodyEn: input.approved
      ? `${subscriptionOperationLabel(input.operation, "en")} for ${storeName} was approved. Plan: ${planLabel}.`
      : `${subscriptionOperationLabel(input.operation, "en")} for ${storeName} was rejected. Reason: ${reasonText || "No clear reason was provided."}`,
    deepLink: "saarly://merchant/dashboard",
    dedupeKey: `admin:${eventType}:${input.requestId}`,
    payload: {
      decision,
      operation: input.operation,
      reason: reasonText,
      manual_payment_request_id: input.requestId,
      merchant_id: text(request.merchant_id),
    },
  });

  return { emailEventId: emailResult.id, emailStatus: emailResult.status, notificationId, warnings };
}
