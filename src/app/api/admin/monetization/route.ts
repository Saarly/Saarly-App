import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, createUserScopedClient } from "@/lib/supabase/server";
import { dispatchSubscriptionDecisionEvents } from "@/lib/admin/decision-events";

type Row = Record<string, unknown>;

type AdminActor = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
};

type AuthContext = {
  actor: AdminActor;
  service: SupabaseClient;
};

const flagLabels: Record<string, { ar: string; en: string }> = {
  monetization_enabled: { ar: "تشغيل النظام المالي", en: "Enable monetization" },
  monetization_enforcement_enabled: { ar: "تفعيل الإيقاف المالي", en: "Enable billing enforcement" },
  merchant_monthly_subscription_enabled: { ar: "اشتراكات المتاجر", en: "Merchant subscriptions" },
  merchant_commission_enabled: { ar: "نظام العمولة", en: "Commission billing" },
  merchant_can_choose_billing_model: { ar: "اختيار طريقة المحاسبة", en: "Merchant billing choice" },
  manual_payments_enabled: { ar: "التحويل اليدوي", en: "Manual payments" },
  electronic_payments_enabled: { ar: "الدفع الإلكتروني", en: "Electronic payments" },
  billing_grace_enabled: { ar: "فترة السماح", en: "Billing grace period" },
  receiving_orders_during_grace_enabled: { ar: "استقبال الطلبات أثناء السماح", en: "Receive orders during grace" },
  billing_reminders_enabled: { ar: "تنبيهات البريد", en: "Billing reminders" },
  founder_counting_started: { ar: "بدء عد المؤسسين", en: "Founder counting started" },
  founder_free_trial_enabled: { ar: "فترة المؤسسين", en: "Founder trial" }
};

const editableFlags = new Set(Object.keys(flagLabels));
const paymentProviders = new Set(["visa", "wallet", "vodafone_cash", "meeza"]);
const billingPreferences = new Set(["monthly_subscription", "commission"]);
const pricingModes = new Set(["catalog", "manual_quote"]);
const badgeTypes = new Set(["trusted_store", "founding_partner"]);
const discountAppliesTo = new Set(["first_subscription", "renewal", "both"]);
const allowedCurrencies = new Set(["EGP", "USD", "SAR"]);

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown, fallback = 0) {
  return Math.trunc(numberValue(value, fallback));
}

function boolValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean);
  }
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeCurrency(value: unknown) {
  const currency = text(value, "EGP").toUpperCase();
  return allowedCurrencies.has(currency) ? currency : "EGP";
}

function safeCurrencies(value: unknown) {
  const currencies = stringArray(value)
    .map((item) => item.toUpperCase())
    .filter((item) => allowedCurrencies.has(item));
  return currencies.length ? currencies : ["EGP"];
}

function moneyValue(value: number) {
  return Math.round(value * 100) / 100;
}

function safeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function startsWithSafeDate(value: unknown) {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function splitLegacyStoragePath(value: string) {
  const normalized = value.replace(/^storage:\/\//i, "").replace(/^\/+/, "");
  const [bucket, ...pathParts] = normalized.split("/").filter(Boolean);
  const path = pathParts.join("/");
  return bucket && path ? { bucket, path } : null;
}

function inferredDocumentBucket(kind: unknown) {
  const safeKind = text(kind);
  if (safeKind === "store_front" || safeKind === "branch_front") return "storefront-photos";
  if (safeKind.includes("_id_")) return "merchant-ids";
  return "merchant-documents";
}

function planCode(value: unknown) {
  const raw = text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return raw || `plan-${Date.now()}`;
}

function id(value: unknown) {
  const raw = text(value);
  return raw.length >= 12 ? raw : "";
}

async function requireAdmin(request: NextRequest): Promise<AuthContext | NextResponse> {
  const token = bearerToken(request);
  if (!token) return jsonError("auth_required", 401);

  const service = createServiceClient();
  if (!service) return jsonError("service_role_not_configured", 500);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  const authUser = authData.user;
  if (authError || !authUser) return jsonError("invalid_session", 401);

  const userClient = createUserScopedClient(token);
  const { data: rpcProfile } = await userClient.rpc("admin_web_my_profile");

  const { data: userRow, error: userError } = await service
    .from("users")
    .select("id, primary_email, full_name, role, is_blocked")
    .eq("id", authUser.id)
    .maybeSingle();

  if (userError || !userRow || Boolean(userRow.is_blocked)) {
    return jsonError("admin_permission_required", 403);
  }

  const { data: staffProfile } = await service
    .from("admin_staff_profiles")
    .select("permissions, is_active")
    .eq("user_id", authUser.id)
    .maybeSingle();

  const rpcPermissions = isRecord(rpcProfile) && isRecord(rpcProfile.permissions) ? rpcProfile.permissions : {};
  const staffPermissions = isRecord(staffProfile?.permissions) ? staffProfile.permissions : {};
  const isAdmin = userRow.role === "admin" || (isRecord(rpcProfile) && rpcProfile.role === "admin");
  const hasMonetizationPermission =
    Boolean(staffProfile?.is_active) &&
    (staffPermissions.monetization === true || rpcPermissions.monetization === true);

  if (!isAdmin && !hasMonetizationPermission) {
    return jsonError("admin_permission_required", 403);
  }

  return {
    service,
    actor: {
      id: authUser.id,
      email: typeof userRow.primary_email === "string" ? userRow.primary_email : authUser.email ?? null,
      name: typeof userRow.full_name === "string" ? userRow.full_name : null,
      role: typeof userRow.role === "string" ? userRow.role : "admin"
    }
  };
}

async function writeAudit(
  service: SupabaseClient,
  actorId: string,
  action: string,
  targetTable: string,
  targetId: string,
  oldData: Row | null,
  newData: Row | null
) {
  await service.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    old_data: oldData,
    new_data: newData
  });
}

async function rows(
  service: SupabaseClient,
  table: string,
  options: { select?: string; orderBy?: string; ascending?: boolean; limit?: number } = {}
) {
  let query = service.from(table).select(options.select ?? "*");
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  const safeRows = (data ?? []) as unknown as Row[];
  return {
    data: safeRows.map((item) => ({ ...item })),
    warning: error ? `${table}: ${error.message}` : null
  };
}

function dateFilter(items: Row[], key: string, from: string | null, to: string | null) {
  if (!from && !to) return items;
  const fromTime = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : Number.POSITIVE_INFINITY;
  return items.filter((item) => {
    const value = item[key];
    if (typeof value !== "string") return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= fromTime && time <= toTime;
  });
}

function sum(items: Row[], key: string) {
  return items.reduce((total, item) => total + numberValue(item[key], 0), 0);
}

function byId(items: Row[]) {
  return new Map(items.map((item) => [String(item.id), item]));
}

function decorateMerchant(items: Row[], merchants: Map<string, Row>, users: Map<string, Row>): Row[] {
  return items.map((item): Row => {
    const merchant = merchants.get(String(item.merchant_id ?? ""));
    const user = merchant ? users.get(String(merchant.user_id ?? "")) : undefined;
    return {
      ...item,
      store_name: merchant?.store_name ?? null,
      owner_name: merchant?.owner_name ?? null,
      merchant_email: user?.primary_email ?? null
    };
  });
}

async function loadMonetizationData(service: SupabaseClient, from: string | null, to: string | null) {
  const [
    flagsResult,
    paymentSettingsResult,
    plansResult,
    discountsResult,
    discountPlansResult,
    discountMerchantsResult,
    methodsResult,
    requestsResult,
    transactionsResult,
    webhookEventsResult,
    merchantsResult,
    usersResult,
    subscriptionsResult,
    commissionsResult,
    settlementsResult,
    settlementItemsResult,
    documentsResult,
    branchesResult,
    reminderSettingsResult,
    expirationEventsResult,
    emailEventsResult,
    badgesResult,
    auditResult,
    commissionSettingsResult,
    categoriesResult
  ] = await Promise.all([
    rows(service, "feature_flags", { orderBy: "key", ascending: true, limit: 200 }),
    rows(service, "payment_settings", { orderBy: "provider", ascending: true, limit: 50 }),
    rows(service, "subscription_plans", { orderBy: "sort_order", ascending: true, limit: 100 }),
    rows(service, "subscription_discounts", { orderBy: "priority", ascending: true, limit: 150 }),
    rows(service, "subscription_discount_plans", { limit: 500 }),
    rows(service, "subscription_discount_merchants", { limit: 500 }),
    rows(service, "manual_payment_methods", { orderBy: "sort_order", ascending: true, limit: 100 }),
    rows(service, "manual_payment_requests", { orderBy: "created_at", limit: 300 }),
    rows(service, "payment_transactions", { orderBy: "created_at", limit: 300 }),
    rows(service, "payment_webhook_events", { orderBy: "created_at", limit: 300 }),
    rows(service, "merchants", { orderBy: "created_at", limit: 500 }),
    rows(service, "users", { limit: 700 }),
    rows(service, "merchant_subscriptions", { orderBy: "updated_at", limit: 500 }),
    rows(service, "merchant_commissions", { orderBy: "created_at", limit: 500 }),
    rows(service, "merchant_commission_settlements", { orderBy: "created_at", limit: 200 }),
    rows(service, "merchant_commission_settlement_items", { limit: 500 }),
    rows(service, "merchant_documents", { orderBy: "created_at", limit: 500 }),
    rows(service, "branches", { orderBy: "created_at", limit: 500 }),
    rows(service, "billing_reminder_settings", { orderBy: "days_before_due", ascending: true, limit: 100 }),
    rows(service, "billing_expiration_events", { orderBy: "created_at", limit: 300 }),
    rows(service, "admin_email_events", { orderBy: "created_at", limit: 500 }),
    rows(service, "merchant_badges", { orderBy: "created_at", limit: 300 }),
    rows(service, "audit_logs", { orderBy: "created_at", limit: 120 }),
    rows(service, "commission_settings", { orderBy: "updated_at", limit: 1 }),
    rows(service, "categories", { orderBy: "display_order", ascending: true, limit: 500 })
  ]);

  const warnings = [
    flagsResult.warning,
    paymentSettingsResult.warning,
    plansResult.warning,
    discountsResult.warning,
    discountPlansResult.warning,
    discountMerchantsResult.warning,
    methodsResult.warning,
    requestsResult.warning,
    transactionsResult.warning,
    webhookEventsResult.warning,
    merchantsResult.warning,
    usersResult.warning,
    subscriptionsResult.warning,
    commissionsResult.warning,
    settlementsResult.warning,
    settlementItemsResult.warning,
    documentsResult.warning,
    branchesResult.warning,
    reminderSettingsResult.warning,
    expirationEventsResult.warning,
    emailEventsResult.warning,
    badgesResult.warning,
    auditResult.warning,
    commissionSettingsResult.warning,
    categoriesResult.warning
  ].filter(Boolean);

  const merchants = byId(merchantsResult.data);
  const users = byId(usersResult.data);
  const plans = byId(plansResult.data);
  const branches = byId(branchesResult.data);
  const webhooks = byId(webhookEventsResult.data);

  const manualRequests: Row[] = decorateMerchant(
    dateFilter(requestsResult.data, "created_at", from, to).map((request): Row => ({
      ...request,
      plan_name_ar: plans.get(String(request.plan_id ?? ""))?.name_ar ?? null,
      plan_name_en: plans.get(String(request.plan_id ?? ""))?.name_en ?? null
    })),
    merchants,
    users
  );

  const transactions: Row[] = decorateMerchant(
    dateFilter(transactionsResult.data, "created_at", from, to).map((transaction): Row => ({
      ...transaction,
      plan_name_ar: plans.get(String(transaction.plan_id ?? ""))?.name_ar ?? null,
      plan_name_en: plans.get(String(transaction.plan_id ?? ""))?.name_en ?? null,
      webhook_signature_valid: webhooks.get(String(transaction.webhook_event_id ?? ""))?.signature_valid ?? null,
      webhook_processed_at: webhooks.get(String(transaction.webhook_event_id ?? ""))?.processed_at ?? null,
      webhook_error: webhooks.get(String(transaction.webhook_event_id ?? ""))?.error_message ?? null
    })),
    merchants,
    users
  );

  const subscriptions: Row[] = decorateMerchant(subscriptionsResult.data, merchants, users).map((subscription): Row => ({
    ...subscription,
    plan_name_ar: plans.get(String(subscription.plan_id ?? ""))?.name_ar ?? null,
    plan_name_en: plans.get(String(subscription.plan_id ?? ""))?.name_en ?? null
  }));

  const commissions: Row[] = decorateMerchant(dateFilter(commissionsResult.data, "created_at", from, to), merchants, users);
  const settlements: Row[] = decorateMerchant(dateFilter(settlementsResult.data, "created_at", from, to), merchants, users);
  const documents: Row[] = decorateMerchant(documentsResult.data, merchants, users).map((document): Row => ({
    ...document,
    branch_name: branches.get(String(document.branch_id ?? ""))?.name ?? null
  }));

  const emailByExpirationTarget = new Map(
    emailEventsResult.data
      .filter((event) => event.target_table === "billing_expiration_events")
      .map((event) => [String(event.target_id ?? ""), event]),
  );
  const expirationEvents = decorateMerchant(expirationEventsResult.data, merchants, users).map((event): Row => {
    const emailEvent = emailByExpirationTarget.get(String(event.id ?? ""));
    return {
      ...event,
      email_event_id: emailEvent?.id ?? null,
      email_status: emailEvent?.status ?? event.delivery_status ?? event.status ?? null,
      email_attempts: emailEvent?.attempts ?? event.retry_count ?? 0,
      email_failure_reason: emailEvent?.failure_reason ?? event.last_error ?? null,
      email_last_attempt_at: emailEvent?.last_attempt_at ?? null,
      sent_at: emailEvent?.sent_at ?? event.sent_at ?? event.email_sent_at ?? null,
    };
  });

  const succeededTransactions = transactions.filter((item) => ["succeeded", "paid"].includes(String(item.status)));
  const failedTransactions = transactions.filter((item) => ["failed", "cancelled", "refunded"].includes(String(item.status)));
  const approvedManual = manualRequests.filter((item) => item.status === "approved");
  const pendingManual = manualRequests.filter((item) => ["submitted", "under_review"].includes(String(item.status)));
  const activeSubscriptions = subscriptions.filter((item) => ["active", "trialing"].includes(String(item.status)));
  const graceSubscriptions = subscriptions.filter((item) => item.status === "past_due");
  const suspendedSubscriptions = subscriptions.filter((item) => item.status === "suspended" || item.suspended_at);
  const commissionPaid = commissions.filter((item) => item.status === "paid" || item.settlement_id);
  const commissionUnpaid = commissions.filter((item) => !commissionPaid.includes(item));

  const founderFlag = flagsResult.data.find((flag) => flag.key === "founder_counting_started");
  const founderLimit = numberValue(
    isRecord(founderFlag?.configuration) ? founderFlag?.configuration.founder_limit : undefined,
    100
  );
  const foundersCount = merchantsResult.data.filter((merchant) => merchant.founder_number !== null && merchant.founder_number !== undefined).length;

  return {
    actorTime: new Date().toISOString(),
    warnings,
    summary: {
      monetizationEnabled: Boolean(flagsResult.data.find((flag) => flag.key === "monetization_enabled")?.is_enabled),
      enforcementEnabled: Boolean(flagsResult.data.find((flag) => flag.key === "monetization_enforcement_enabled")?.is_enabled),
      foundersCount,
      founderRemaining: Math.max(0, founderLimit - foundersCount),
      activeSubscriptions: activeSubscriptions.length,
      commissionMerchants: merchantsResult.data.filter((merchant) => merchant.billing_preference === "commission").length,
      freeTrials: merchantsResult.data.filter((merchant) => merchant.free_trial_ends_at && new Date(String(merchant.free_trial_ends_at)).getTime() > Date.now()).length,
      graceSubscriptions: graceSubscriptions.length,
      suspendedSubscriptions: suspendedSubscriptions.length,
      pendingManualPayments: pendingManual.length,
      electronicSucceeded: succeededTransactions.length,
      electronicFailed: failedTransactions.length,
      subscriptionRevenue: sum(approvedManual, "final_amount") + sum(succeededTransactions.filter((item) => item.purpose === "subscription"), "amount"),
      commissionsRegistered: sum(commissions, "commission_amount"),
      commissionsPaid: sum(commissionPaid, "commission_amount"),
      commissionsUnpaid: sum(commissionUnpaid, "commission_amount"),
      pendingDocuments: documents.filter((item) => item.status === "pending").length,
      failedEmails: emailEventsResult.data.filter((event) => ["failed", "dead"].includes(String(event.status))).length
    },
    flags: flagsResult.data,
    paymentSettings: paymentSettingsResult.data,
    plans: plansResult.data,
    discounts: discountsResult.data.map((discount) => ({
      ...discount,
      plan_ids: discountPlansResult.data.filter((item) => item.discount_id === discount.id).map((item) => item.plan_id),
      merchant_ids: discountMerchantsResult.data.filter((item) => item.discount_id === discount.id).map((item) => item.merchant_id)
    })),
    manualMethods: methodsResult.data,
    manualRequests,
    transactions,
    webhookEvents: webhookEventsResult.data,
    merchants: merchantsResult.data.map((merchant): Row => ({
      ...merchant,
      merchant_email: users.get(String(merchant.user_id ?? ""))?.primary_email ?? null,
      billing_plan_name_ar: plans.get(String(merchant.billing_plan_id ?? ""))?.name_ar ?? null,
      billing_plan_name_en: plans.get(String(merchant.billing_plan_id ?? ""))?.name_en ?? null,
    })),
    subscriptions,
    commissions,
    settlements,
    settlementItems: settlementItemsResult.data,
    documents,
    branches: decorateMerchant(branchesResult.data, merchants, users),
    reminderSettings: reminderSettingsResult.data,
    expirationEvents,
    badges: badgesResult.data,
    audit: auditResult.data,
    commissionSettings: commissionSettingsResult.data[0] ?? null,
    categories: categoriesResult.data.filter((category) => category.is_active !== false)
  };
}

async function signedStorageLink(service: SupabaseClient, table: string, recordId: string) {
  const allowed = new Set(["manual_payment_requests", "merchant_commission_settlements", "merchant_documents"]);
  if (!allowed.has(table)) return jsonError("signed_link_table_not_allowed", 400);

  const { data, error } = await service.from(table).select("*").eq("id", recordId).maybeSingle();
  if (error || !data) return jsonError("file_record_not_found", 404);

  let bucket = text(data.proof_storage_bucket ?? data.storage_bucket);
  let path = text(data.proof_storage_path ?? data.storage_path);
  if (!bucket || !path) return jsonError("file_not_available", 404);

  if (isHttpUrl(path)) {
    try {
      const url = new URL(path);
      if (url.hostname === "example.com" || url.hostname.endsWith(".example.com")) {
        return jsonError("legacy_file_placeholder", 404);
      }
    } catch {
      return jsonError("file_not_available", 404);
    }
    return NextResponse.json({ data: { url: path, expiresInSeconds: null } });
  }

  const legacy = bucket === "legacy-url" ? splitLegacyStoragePath(path) : null;
  if (legacy) {
    bucket = legacy.bucket;
    path = legacy.path;
  } else if (bucket === "legacy-url" && table === "merchant_documents") {
    bucket = inferredDocumentBucket(data.kind);
  }

  const { data: signed, error: signedError } = await service.storage.from(bucket).createSignedUrl(path, 60 * 5);
  if (signedError || !signed?.signedUrl) return jsonError("signed_link_failed", 400);

  return NextResponse.json({ data: { url: signed.signedUrl, expiresInSeconds: 60 * 5 } });
}

async function setFlag(service: SupabaseClient, actor: AdminActor, key: string, enabled: boolean, configuration: Row | null) {
  if (!editableFlags.has(key)) throw new Error("feature_flag_not_allowed");
  const beforeResult = await service.from("feature_flags").select("*").eq("key", key).maybeSingle();
  const before = (beforeResult.data ?? null) as Row | null;
  const labels = flagLabels[key];
  const previousConfiguration = isRecord(before?.configuration)
    ? before.configuration
    : {};
  const requestedConfiguration = configuration ?? {};
  const nextConfiguration: Row = {
    ...previousConfiguration,
    ...requestedConfiguration,
  };
  if (key === "founder_counting_started") {
    nextConfiguration.founder_limit = Math.max(
      1,
      intValue(
        requestedConfiguration.founder_limit ??
          previousConfiguration.founder_limit,
        100,
      ),
    );
    nextConfiguration.started_at =
      previousConfiguration.started_at ??
      requestedConfiguration.started_at ??
      new Date().toISOString();
    if (enabled) {
      nextConfiguration.resumed_at = new Date().toISOString();
      delete nextConfiguration.paused_at;
    } else {
      nextConfiguration.paused_at = new Date().toISOString();
    }
  }

  const { data, error } = await service
    .from("feature_flags")
    .upsert(
      {
        key,
        description_ar: labels.ar,
        description_en: labels.en,
        is_enabled: enabled,
        configuration: nextConfiguration,
        updated_by: actor.id,
        updated_at: new Date().toISOString()
      },
      { onConflict: "key" }
    )
    .select("*")
    .single();

  if (error) throw error;
  await writeAudit(service, actor.id, "set_feature_flag", "feature_flags", key, before, data as Row);
  return data;
}

async function configureCommissions(
  service: SupabaseClient,
  actor: AdminActor,
  payload: Row,
) {
  const globalRate = numberValue(payload.global_rate, -1);
  if (globalRate < 0 || globalRate > 100) {
    throw new Error("global_rate_must_be_between_0_and_100");
  }

  const rawRates = isRecord(payload.category_rates)
    ? payload.category_rates
    : {};
  const categoryRates: Row = {};
  for (const [categoryId, rawValue] of Object.entries(rawRates)) {
    if (!id(categoryId)) continue;
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      continue;
    }
    const rate = numberValue(rawValue, -1);
    if (rate < 0 || rate > 100) {
      throw new Error("category_rates_must_be_numbers_between_0_and_100");
    }
    categoryRates[categoryId] = rate;
  }

  const { data, error } = await service.rpc(
    "admin_configure_commissions_as",
    {
      p_actor_id: actor.id,
      p_is_enabled: boolValue(payload.is_enabled, false),
      p_global_rate: globalRate,
      p_category_rates: categoryRates,
    },
  );
  if (error) throw error;
  return data;
}

async function savePlan(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const planId = id(payload.id);
  const durationDays = Math.max(1, intValue(payload.duration_days, 30));
  const row = {
    plan_code: planCode(payload.plan_code ?? payload.name_en ?? payload.name_ar),
    name_ar: text(payload.name_ar),
    name_en: text(payload.name_en),
    description_ar: text(payload.description_ar) || null,
    description_en: text(payload.description_en) || null,
    monthly_price: Math.max(0, numberValue(payload.monthly_price, 0)),
    old_price: payload.old_price === null || payload.old_price === "" ? null : Math.max(0, numberValue(payload.old_price, 0)),
    currency: safeCurrency(payload.currency),
    duration_days: durationDays,
    billing_period_months: Math.max(1, Math.round(durationDays / 30)),
    grace_months: Math.max(0, intValue(payload.grace_months, 1)),
    plan_type: text(payload.plan_type, "subscription"),
    features_ar: stringArray(payload.features_ar),
    features_en: stringArray(payload.features_en),
    features: {
      ar: stringArray(payload.features_ar),
      en: stringArray(payload.features_en)
    },
    is_active: boolValue(payload.is_active, false),
    sort_order: intValue(payload.sort_order, 0),
    updated_at: new Date().toISOString()
  };

  if (!row.name_ar || !row.name_en) throw new Error("plan_name_required");

  const before = planId
    ? ((await service.from("subscription_plans").select("*").eq("id", planId).maybeSingle()).data as Row | null)
    : null;

  const query = planId
    ? service.from("subscription_plans").update(row).eq("id", planId).select("*").single()
    : service.from("subscription_plans").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) throw error;
  await writeAudit(service, actor.id, planId ? "update_subscription_plan" : "create_subscription_plan", "subscription_plans", String((data as Row).id), before, data as Row);
  return data;
}

async function saveDiscount(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const discountId = id(payload.id);
  const row = {
    code: text(payload.code) || `discount-${Date.now()}`,
    name_ar: text(payload.name_ar),
    name_en: text(payload.name_en),
    description_ar: text(payload.description_ar) || null,
    description_en: text(payload.description_en) || null,
    discount_percent: payload.discount_percent === null || payload.discount_percent === "" ? null : Math.min(100, Math.max(0, numberValue(payload.discount_percent, 0))),
    discount_amount: payload.discount_amount === null || payload.discount_amount === "" ? null : Math.max(0, numberValue(payload.discount_amount, 0)),
    currency: safeCurrency(payload.currency),
    applies_to: discountAppliesTo.has(text(payload.applies_to)) ? text(payload.applies_to) : "both",
    starts_at: safeDate(payload.starts_at),
    ends_at: safeDate(payload.ends_at),
    usage_limit: payload.usage_limit === null || payload.usage_limit === "" ? null : Math.max(1, intValue(payload.usage_limit, 1)),
    is_active: boolValue(payload.is_active, false),
    priority: intValue(payload.priority, 0),
    metadata: {
      ...(isRecord(payload.metadata) ? payload.metadata : {}),
      default_exclusive: true
    },
    updated_at: new Date().toISOString()
  };

  if (!row.name_ar || !row.name_en) throw new Error("discount_name_required");

  const before = discountId
    ? ((await service.from("subscription_discounts").select("*").eq("id", discountId).maybeSingle()).data as Row | null)
    : null;
  const query = discountId
    ? service.from("subscription_discounts").update(row).eq("id", discountId).select("*").single()
    : service.from("subscription_discounts").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) throw error;
  const saved = data as Row;

  const targetPlans = stringArray(payload.plan_ids);
  await service.from("subscription_discount_plans").delete().eq("discount_id", String(saved.id));
  if (targetPlans.length > 0) {
    const { error: planError } = await service
      .from("subscription_discount_plans")
      .insert(targetPlans.map((planId) => ({ discount_id: saved.id, plan_id: planId })));
    if (planError) throw planError;
  }

  const targetMerchants = stringArray(payload.merchant_ids);
  await service.from("subscription_discount_merchants").delete().eq("discount_id", String(saved.id));
  if (targetMerchants.length > 0) {
    const { error: merchantError } = await service
      .from("subscription_discount_merchants")
      .insert(targetMerchants.map((merchantId) => ({ discount_id: saved.id, merchant_id: merchantId })));
    if (merchantError) throw merchantError;
  }

  await writeAudit(service, actor.id, discountId ? "update_subscription_discount" : "create_subscription_discount", "subscription_discounts", String(saved.id), before, saved);
  return saved;
}

async function saveManualMethod(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const methodId = id(payload.id);
  const provider = text(payload.provider);
  const row = {
    code: text(payload.code) || `manual-${Date.now()}`,
    name_ar: text(payload.name_ar),
    name_en: text(payload.name_en),
    provider: paymentProviders.has(provider) ? provider : null,
    account_label: text(payload.account_label),
    account_number: text(payload.account_number),
    account_holder_name: text(payload.account_holder_name) || null,
    instructions_ar: text(payload.instructions_ar) || null,
    instructions_en: text(payload.instructions_en) || null,
    allowed_mime_types: stringArray(payload.allowed_mime_types).length ? stringArray(payload.allowed_mime_types) : ["image/jpeg", "image/png", "application/pdf"],
    max_file_size_bytes: Math.max(100000, intValue(payload.max_file_size_bytes, 5242880)),
    is_active: boolValue(payload.is_active, true),
    sort_order: intValue(payload.sort_order, 0),
    metadata: isRecord(payload.metadata) ? payload.metadata : {},
    updated_at: new Date().toISOString()
  };

  if (!row.name_ar || !row.name_en || !row.account_number) throw new Error("manual_method_required_fields");

  const before = methodId
    ? ((await service.from("manual_payment_methods").select("*").eq("id", methodId).maybeSingle()).data as Row | null)
    : null;
  const query = methodId
    ? service.from("manual_payment_methods").update(row).eq("id", methodId).select("*").single()
    : service.from("manual_payment_methods").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) throw error;
  await writeAudit(service, actor.id, methodId ? "update_manual_payment_method" : "create_manual_payment_method", "manual_payment_methods", String((data as Row).id), before, data as Row);
  return data;
}

async function saveGateway(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const provider = text(payload.provider);
  if (!paymentProviders.has(provider)) throw new Error("payment_provider_not_supported");

  const before = ((await service.from("payment_settings").select("*").eq("provider", provider).maybeSingle()).data as Row | null) ?? null;
  const isConnected = Boolean(before?.is_connected);
  const requestedEnabled = boolValue(payload.is_enabled, Boolean(before?.is_enabled));
  const isEnabled = requestedEnabled && isConnected;

  const configuration = isRecord(payload.configuration) ? { ...payload.configuration } : {};
  delete configuration.secret;
  delete configuration.secret_key;
  delete configuration.api_key;
  delete configuration.password;

  const secretReference = text(payload.secret_reference) || text(before?.secret_reference) || null;
  const metadata = {
    ...(isRecord(before?.metadata) ? before?.metadata : {}),
    secret_masked: secretReference ? "********" : null,
    updated_by: actor.email,
    updated_at: new Date().toISOString()
  };

  const row = {
    provider,
    display_name_ar: text(payload.display_name_ar) || provider,
    display_name_en: text(payload.display_name_en) || provider,
    is_enabled: isEnabled,
    gateway_environment: text(payload.gateway_environment, "test") === "production" ? "production" : "test",
    config_status: isEnabled ? "connected" : secretReference ? "configured" : "not_configured",
    is_connected: isConnected,
    configuration,
    secret_reference: secretReference,
    webhook_url: text(payload.webhook_url) || null,
    webhook_secret_name: text(payload.webhook_secret_name) || null,
    webhook_signature_header: text(payload.webhook_signature_header, "x-saarly-signature"),
    is_direct_to_merchant_supported: boolValue(payload.is_direct_to_merchant_supported, false),
    supported_currencies: safeCurrencies(payload.supported_currencies),
    supported_methods: stringArray(payload.supported_methods),
    metadata,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await service
    .from("payment_settings")
    .upsert(row, { onConflict: "provider" })
    .select("*")
    .single();
  if (error) throw error;
  await writeAudit(service, actor.id, "save_payment_gateway", "payment_settings", provider, before, data as Row);
  return data;
}

async function testGateway(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const provider = text(payload.provider);
  if (!paymentProviders.has(provider)) throw new Error("payment_provider_not_supported");
  const before = ((await service.from("payment_settings").select("*").eq("provider", provider).maybeSingle()).data as Row | null) ?? null;
  const secretReference = text(before?.secret_reference);
  const alreadyConnected = Boolean(before?.is_connected);
  const row = {
    config_status: alreadyConnected ? "connected" : secretReference ? "configured" : "not_configured",
    is_connected: alreadyConnected,
    last_connection_check_at: new Date().toISOString(),
    is_enabled: alreadyConnected ? Boolean(before?.is_enabled) : false,
    metadata: {
      ...(isRecord(before?.metadata) ? before?.metadata : {}),
      last_test_result: alreadyConnected ? "connection_already_active" : secretReference ? "adapter_required" : "secret_reference_required"
    },
    updated_at: new Date().toISOString()
  };
  const { data, error } = await service.from("payment_settings").update(row).eq("provider", provider).select("*").single();
  if (error) throw error;
  await writeAudit(service, actor.id, "test_payment_gateway", "payment_settings", provider, before, data as Row);
  if (alreadyConnected) return data;
  throw new Error(secretReference ? "payment_adapter_required_before_connection" : "gateway_secret_reference_required");
}

async function updateMerchant(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const merchantId = id(payload.merchant_id);
  const reason = text(payload.reason);
  if (!merchantId) throw new Error("merchant_required");
  if (reason.length < 3) throw new Error("reason_required");

  const before = ((await service.from("merchants").select("*").eq("id", merchantId).maybeSingle()).data as Row | null) ?? null;
  if (!before) throw new Error("merchant_not_found");

  const values: Row = { updated_at: new Date().toISOString() };
  const field = text(payload.field);
  if (field === "is_test_account") {
    values.is_test_account = boolValue(payload.value, false);
  } else if (field === "free_trial_ends_at") {
    values.free_trial_starts_at = before.free_trial_starts_at ?? new Date().toISOString();
    values.free_trial_ends_at = safeDate(payload.value);
    values.admin_extension_until = safeDate(payload.value);
    values.admin_extension_reason = reason;
  } else if (field === "pricing_mode") {
    const value = text(payload.value);
    if (!pricingModes.has(value)) throw new Error("pricing_mode_not_allowed");
    values.pricing_mode = value;
  } else if (field === "billing_preference" || field === "billing_method") {
    const value = text(payload.value);
    if (!billingPreferences.has(value)) throw new Error("billing_preference_not_allowed");
    values.billing_preference = value;
    values.billing_preference_changed_at = new Date().toISOString();

    if (value === "commission") {
      values.billing_plan_id = null;
    } else {
      const planId = id(payload.plan_id);
      if (!planId) throw new Error("subscription_plan_required");
      const { data: selectedPlan, error: selectedPlanError } = await service
        .from("subscription_plans")
        .select("id,is_active")
        .eq("id", planId)
        .maybeSingle();
      if (selectedPlanError) throw selectedPlanError;
      if (!selectedPlan) throw new Error("subscription_plan_not_found");
      if (!Boolean(selectedPlan.is_active) && text(before.billing_plan_id) !== planId) {
        throw new Error("subscription_plan_not_available");
      }
      values.billing_plan_id = planId;
    }
  } else if (field === "suspension") {
    const suspended = boolValue(payload.value, false);
    const { data, error } = await service.rpc("admin_set_merchant_suspension_as", {
      p_actor_id: actor.id,
      p_merchant_id: merchantId,
      p_suspended: suspended,
      p_reason: reason,
    });
    if (error) throw error;
    return data;
  } else {
    throw new Error("merchant_field_not_allowed");
  }

  const { data, error } = await service.from("merchants").update(values).eq("id", merchantId).select("*").single();
  if (error) throw error;
  await writeAudit(service, actor.id, `update_merchant_${field}`, "merchants", merchantId, before, { ...(data as Row), reason });
  return data;
}


async function setMerchantBadges(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const merchantId = id(payload.merchant_id);
  if (!merchantId) throw new Error("merchant_required");
  const { data, error } = await service.rpc("admin_set_merchant_badges_as", {
    p_actor_id: actor.id,
    p_merchant_id: merchantId,
    p_founder_badge: payload.founder_badge === null || payload.founder_badge === undefined ? null : boolValue(payload.founder_badge, false),
    p_trusted_badge: payload.trusted_badge === null || payload.trusted_badge === undefined ? null : boolValue(payload.trusted_badge, false),
    p_reason: text(payload.reason) || null,
    p_is_test_account: payload.is_test_account === null || payload.is_test_account === undefined ? null : boolValue(payload.is_test_account, false),
  });
  if (error) throw error;
  return data;
}

async function setMerchantTrial(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const merchantId = id(payload.merchant_id);
  if (!merchantId) throw new Error("merchant_required");
  const stopTrial = boolValue(payload.stop_trial, false);
  const trialEndsAt = stopTrial ? null : safeDate(payload.trial_ends_at);
  const { data, error } = await service.rpc("admin_set_merchant_trial_as", {
    p_actor_id: actor.id,
    p_merchant_id: merchantId,
    p_trial_ends_at: trialEndsAt,
    p_stop_trial: stopTrial,
    p_reason: text(payload.reason) || null,
  });
  if (error) throw error;
  return data;
}

async function reviewDocument(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const documentId = id(payload.id);
  const approved = boolValue(payload.approved, false);
  const reason = text(payload.reason);
  if (!documentId) throw new Error("document_required");
  if (!approved && reason.length < 3) throw new Error("rejection_reason_required");

  const before = ((await service.from("merchant_documents").select("*").eq("id", documentId).maybeSingle()).data as Row | null) ?? null;
  if (!before) throw new Error("document_not_found");

  const { data, error } = await service.rpc("admin_review_merchant_document_as", {
    p_actor_id: actor.id,
    p_document_id: documentId,
    p_approved: approved,
    p_rejection_reason: approved ? null : reason,
  });
  if (error) throw error;
  return data;
}

async function setBadge(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const merchantId = id(payload.merchant_id);
  const badgeType = text(payload.badge_type);
  const active = boolValue(payload.active, true);
  const reason = text(payload.reason);
  if (!merchantId || !badgeTypes.has(badgeType)) throw new Error("badge_request_invalid");
  if (reason.length < 3) throw new Error("reason_required");

  if (active) {
    const before = ((await service
      .from("merchant_badges")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("badge_type", badgeType)
      .eq("is_active", true)
      .maybeSingle()).data as Row | null) ?? null;

    const query = before
      ? service
          .from("merchant_badges")
          .update({
            reason,
            granted_by: actor.id,
            granted_at: new Date().toISOString(),
            revoked_by: null,
            revoked_at: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", String(before.id))
          .select("*")
          .single()
      : service
          .from("merchant_badges")
          .insert({
            merchant_id: merchantId,
            badge_type: badgeType,
            is_active: true,
            reason,
            granted_by: actor.id
          })
          .select("*")
          .single();
    const { data, error } = await query;
    if (error) throw error;
    await writeAudit(service, actor.id, "grant_merchant_badge", "merchant_badges", String((data as Row).id), before, data as Row);
    return data;
  }

  const before = ((await service
    .from("merchant_badges")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("badge_type", badgeType)
    .eq("is_active", true)
    .maybeSingle()).data as Row | null) ?? null;
  if (!before) throw new Error("active_badge_not_found");

  const { data, error } = await service
    .from("merchant_badges")
    .update({
      is_active: false,
      reason,
      revoked_by: actor.id,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", String(before.id))
    .select("*")
    .single();
  if (error) throw error;
  await writeAudit(service, actor.id, "revoke_merchant_badge", "merchant_badges", String(before.id), before, data as Row);
  return data;
}

async function reviewManualPayment(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const requestId = id(payload.id);
  const approved = boolValue(payload.approved, false);
  const reason = text(payload.reason);
  if (!requestId) throw new Error("manual_payment_request_required");
  if (!approved && reason.length < 3) throw new Error("rejection_reason_required");

  const { data: requestBefore, error: requestBeforeError } = await service
    .from("manual_payment_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (requestBeforeError) throw requestBeforeError;
  if (!requestBefore) throw new Error("manual_payment_request_not_found");

  let operation: "new_subscription" | "renewal" = "new_subscription";
  const merchantId = text((requestBefore as Row).merchant_id);
  if (merchantId) {
    const { data: subscriptions, error: subscriptionsError } = await service
      .from("merchant_subscriptions")
      .select("id,source_payment_request_id,status,ends_at")
      .eq("merchant_id", merchantId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (subscriptionsError) throw subscriptionsError;
    const existing = ((subscriptions ?? []) as Row[]).some(
      (subscription) => text(subscription.source_payment_request_id) !== requestId,
    );
    operation = existing ? "renewal" : "new_subscription";
  }

  if (approved) {
    if (
      !text((requestBefore as Row).proof_storage_bucket) ||
      !text((requestBefore as Row).proof_storage_path)
    ) {
      throw new Error("payment_proof_required");
    }
  }

  const { data, error } = await service.rpc("admin_web_review_manual_payment_request", {
    p_actor_id: actor.id,
    p_request_id: requestId,
    p_approved: approved,
    p_rejection_reason: approved ? null : reason
  });
  if (error) throw error;
  const reviewedRequest = (data ?? {}) as Row;
  const finalStatus = text(reviewedRequest.status);
  const finalApproved = finalStatus === "approved" ? true : finalStatus === "rejected" ? false : approved;
  const decisionResult = await dispatchSubscriptionDecisionEvents(service, {
    requestId,
    approved: finalApproved,
    operation,
    reason: finalApproved ? null : text(reviewedRequest.rejection_reason) || reason
  });
  if (decisionResult.warnings.length > 0) {
    console.warn("Subscription decision event warnings:", decisionResult.warnings);
  }
  return data;
}

async function updateManualPaymentPlan(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const requestId = id(payload.id);
  const planId = id(payload.plan_id);
  if (!requestId) throw new Error("manual_payment_request_required");
  if (!planId) throw new Error("subscription_plan_required");

  const before = ((await service.from("manual_payment_requests").select("*").eq("id", requestId).maybeSingle()).data as Row | null) ?? null;
  if (!before) throw new Error("manual_payment_request_not_found");
  if (String(before.status) !== "submitted") {
    throw new Error("manual_payment_plan_not_editable");
  }

  const { data: plan, error: planError } = await service
    .from("subscription_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || !Boolean(plan.is_active)) throw new Error("subscription_plan_not_available");

  const originalAmount = moneyValue(Math.max(0, numberValue(plan.monthly_price, 0)));
  const discountPercent = Math.min(100, Math.max(0, numberValue(before.discount_percent, 0)));
  const discountAmount = moneyValue(Math.min(originalAmount, (originalAmount * discountPercent) / 100));
  const finalAmount = moneyValue(Math.max(0, originalAmount - discountAmount));
  const durationDays = Math.max(
    1,
    intValue(plan.duration_days, Math.max(1, intValue(plan.billing_period_months, 1)) * 30)
  );
  const currency = safeCurrency(plan.currency);
  const planSnapshot = {
    id: plan.id,
    plan_code: plan.plan_code,
    name_ar: plan.name_ar,
    name_en: plan.name_en,
    description_ar: plan.description_ar,
    description_en: plan.description_en,
    features_ar: plan.features_ar,
    features_en: plan.features_en,
    duration_days: durationDays,
    grace_months: intValue(plan.grace_months, 0)
  };
  const priceSnapshot = {
    original_amount: originalAmount,
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    final_amount: finalAmount,
    currency
  };

  const { data, error } = await service
    .from("manual_payment_requests")
    .update({
      plan_id: planId,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      currency,
      duration_days: durationDays,
      plan_snapshot: planSnapshot,
      price_snapshot: priceSnapshot,
      updated_at: new Date().toISOString()
    })
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) throw error;

  await writeAudit(service, actor.id, "update_manual_payment_plan", "manual_payment_requests", requestId, before, data as Row);
  return data;
}

async function settleCommissions(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const commissionIds = stringArray(payload.commission_ids);
  const reason = text(payload.reason);
  if (!commissionIds.length) throw new Error("commission_selection_required");
  if (reason.length < 3) throw new Error("reason_required");

  const { data: commissions, error: commissionError } = await service
    .from("merchant_commissions")
    .select("*")
    .in("id", commissionIds)
    .is("settlement_id", null);
  if (commissionError) throw commissionError;
  const selected = ((commissions ?? []) as Row[]).filter((commission) => !commission.paid_at);
  if (!selected.length) throw new Error("commission_already_settled");

  const merchantId = String(selected[0].merchant_id);
  if (selected.some((commission) => String(commission.merchant_id) !== merchantId)) {
    throw new Error("single_merchant_required");
  }

  const amount = sum(selected, "commission_amount");
  const { data: settlement, error: settlementError } = await service
    .from("merchant_commission_settlements")
    .insert({
      merchant_id: merchantId,
      requested_amount: amount,
      approved_amount: amount,
      currency: safeCurrency(payload.currency),
      status: "approved",
      reviewed_by: actor.id,
      reviewed_at: new Date().toISOString(),
      idempotency_key: text(payload.idempotency_key) || `admin-settlement-${Date.now()}`,
      metadata: { reason, source: "admin_manual_settlement" }
    })
    .select("*")
    .single();
  if (settlementError) throw settlementError;

  const settlementId = String((settlement as Row).id);
  const { error: itemsError } = await service.from("merchant_commission_settlement_items").insert(
    selected.map((commission) => ({
      settlement_id: settlementId,
      commission_id: commission.id,
      amount: commission.commission_amount
    }))
  );
  if (itemsError) throw itemsError;

  const { error: updateError } = await service
    .from("merchant_commissions")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      settled_at: new Date().toISOString(),
      settlement_id: settlementId,
      updated_at: new Date().toISOString()
    })
    .in("id", selected.map((commission) => String(commission.id)));
  if (updateError) throw updateError;

  await writeAudit(service, actor.id, "settle_merchant_commissions", "merchant_commission_settlements", settlementId, null, {
    ...(settlement as Row),
    commission_ids: selected.map((commission) => commission.id),
    reason
  });
  return settlement;
}

async function triggerEmailDispatcher(service: SupabaseClient, limit = 20) {
  const dispatchSecret = process.env.EMAIL_DISPATCH_SECRET?.trim();
  if (!dispatchSecret) {
    return { triggered: false, reason: "email_dispatch_secret_not_configured" };
  }

  const { data, error } = await service.functions.invoke("process-admin-email-events", {
    body: { limit },
    headers: { "x-saarly-dispatch-secret": dispatchSecret },
  });
  if (error) {
    return { triggered: false, reason: error.message };
  }
  return { triggered: true, result: data };
}

async function retryExpirationEmail(service: SupabaseClient, actor: AdminActor, payload: Row) {
  const eventId = id(payload.id);
  if (!eventId) throw new Error("expiration_event_required");
  const before = ((await service.from("billing_expiration_events").select("*").eq("id", eventId).maybeSingle()).data as Row | null) ?? null;
  if (!before) throw new Error("expiration_event_not_found");
  if (before.sent_at || before.email_sent_at) throw new Error("email_already_sent");

  const now = new Date().toISOString();
  const metadata = isRecord(before.payload) ? before.payload : {};
  const { data, error } = await service
    .from("billing_expiration_events")
    .update({
      status: "pending",
      delivery_status: "pending",
      scheduled_for: now,
      period_ends_at: before.period_ends_at ?? before.scheduled_for ?? now,
      last_error: null,
      payload: {
        ...metadata,
        retry_requested_at: now,
        retry_requested_by: actor.id,
      },
    })
    .eq("id", eventId)
    .select("*")
    .single();
  if (error) throw error;

  const { error: emailResetError } = await service
    .from("admin_email_events")
    .update({
      status: "pending",
      next_attempt_at: now,
      locked_at: null,
      locked_by: null,
      failure_reason: null,
      updated_at: now,
    })
    .eq("target_table", "billing_expiration_events")
    .eq("target_id", eventId)
    .neq("status", "sent");
  if (emailResetError) throw emailResetError;

  const dispatcher = await triggerEmailDispatcher(service, 20);
  await writeAudit(service, actor.id, "retry_billing_email", "billing_expiration_events", eventId, before, {
    ...(data as Row),
    dispatcher,
  });
  return { event: data, dispatcher };
}

async function paymentAdapterAction(service: SupabaseClient, actor: AdminActor, payload: Row, kind: "retry" | "refund") {
  const transactionId = id(payload.id);
  if (!transactionId) throw new Error("payment_transaction_required");
  const transaction = ((await service.from("payment_transactions").select("*").eq("id", transactionId).maybeSingle()).data as Row | null) ?? null;
  if (!transaction) throw new Error("payment_transaction_not_found");
  await writeAudit(
    service,
    actor.id,
    kind === "retry" ? "retry_payment_transaction_requested" : "refund_payment_transaction_requested",
    "payment_transactions",
    transactionId,
    transaction,
    {
      ...transaction,
      adapter_result: "adapter_required",
      requested_at: new Date().toISOString()
    }
  );
  throw new Error(kind === "retry" ? "payment_adapter_required_before_retry" : "payment_adapter_required_before_refund");
}

async function handleAction(service: SupabaseClient, actor: AdminActor, body: Row) {
  const action = text(body.action);
  const payload = isRecord(body.payload) ? body.payload : body;

  if (action === "set_feature_flag") {
    const key = text(payload.key);
    return setFlag(service, actor, key, boolValue(payload.enabled, false), isRecord(payload.configuration) ? payload.configuration : null);
  }
  if (action === "configure_commissions") {
    return configureCommissions(service, actor, payload);
  }
  if (action === "save_payment_modes") {
    const manual = await setFlag(service, actor, "manual_payments_enabled", boolValue(payload.manual_enabled, false), null);
    const electronic = await setFlag(service, actor, "electronic_payments_enabled", boolValue(payload.electronic_enabled, false), null);
    return { manual, electronic };
  }
  if (action === "review_manual_payment") return reviewManualPayment(service, actor, payload);
  if (action === "update_manual_payment_plan") return updateManualPaymentPlan(service, actor, payload);
  if (action === "save_plan") return savePlan(service, actor, payload);
  if (action === "save_discount") return saveDiscount(service, actor, payload);
  if (action === "save_manual_method") return saveManualMethod(service, actor, payload);
  if (action === "save_gateway") return saveGateway(service, actor, payload);
  if (action === "test_gateway") return testGateway(service, actor, payload);
  if (action === "update_merchant") return updateMerchant(service, actor, payload);
  if (action === "set_merchant_badges") return setMerchantBadges(service, actor, payload);
  if (action === "set_merchant_trial") return setMerchantTrial(service, actor, payload);
  if (action === "review_document") return reviewDocument(service, actor, payload);
  if (action === "set_badge") return setBadge(service, actor, payload);
  if (action === "settle_commissions") return settleCommissions(service, actor, payload);
  if (action === "retry_expiration_email") return retryExpirationEmail(service, actor, payload);
  if (action === "retry_transaction") return paymentAdapterAction(service, actor, payload, "retry");
  if (action === "refund_transaction") return paymentAdapterAction(service, actor, payload, "refund");

  throw new Error("unsupported_monetization_action");
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const proofTable = url.searchParams.get("proofTable");
  const proofId = url.searchParams.get("proofId");
  if (proofTable && proofId) {
    return signedStorageLink(auth.service, proofTable, proofId);
  }

  const from = startsWithSafeDate(url.searchParams.get("from")) || null;
  const to = startsWithSafeDate(url.searchParams.get("to")) || null;
  const data = await loadMonetizationData(auth.service, from, to);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as Row;
  try {
    const data = await handleAction(auth.service, auth.actor, body);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "monetization_action_failed";
    return jsonError(message, 400);
  }
}
