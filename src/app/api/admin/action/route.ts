import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  createUserScopedClient,
} from "@/lib/supabase/server";
import { findSection, sectionIsAllowed } from "@/lib/admin/sections";
import {
  dispatchBranchDecisionEvents,
  dispatchMerchantDecisionEvents,
} from "@/lib/admin/decision-events";

type AnyRow = Record<string, unknown>;
type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;
type DbClient = ReturnType<typeof createUserScopedClient>;
type AdminAuth = {
  userId: string;
  role: "admin" | "support_agent";
  permissions: Record<string, boolean>;
};
type AuthUserForAdmin = {
  id: string;
  email?: string | null;
  phone?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  deleted_at?: string | null;
};

const adminReportDefinitions = [
  {
    key: "admin_report_orders",
    args: { p_from: null, p_to: null, p_status: null, p_merchant_id: null, p_category_id: null },
  },
  {
    key: "admin_report_active_merchants",
    args: { p_from: null, p_to: null, p_limit: 1000 },
  },
  {
    key: "admin_report_active_categories",
    args: { p_from: null, p_to: null, p_limit: 1000 },
  },
  {
    key: "admin_report_top_accepted_offers",
    args: { p_from: null, p_to: null, p_limit: 1000 },
  },
  {
    key: "admin_report_rfq_acceptance",
    args: { p_from: null, p_to: null },
  },
  {
    key: "admin_report_payment_transactions",
    args: { p_status: null, p_provider: null, p_purpose: null, p_from: null, p_to: null },
  },
  {
    key: "admin_report_commission_dues",
    args: { p_from: null, p_to: null, p_merchant_id: null, p_status: null },
  },
  { key: "admin_report_merchant_arrears", args: {} },
  { key: "admin_report_referrals_rewards", args: {} },
] as const;

async function fallbackAdminReport(
  service: ServiceClient,
  reportKey: (typeof adminReportDefinitions)[number]["key"],
): Promise<AnyRow[]> {
  if (reportKey === "admin_report_orders") {
    const { data } = await service
      .from("admin_orders_readable")
      .select("id,buyer_name,merchant_id,store_name,status,accepted_at,confirmed_at,selected_subtotal_snapshot,commission_amount,offer_id")
      .order("created_at", { ascending: false })
      .limit(1000);
    return ((data ?? []) as AnyRow[]).map((row) => ({
      ...row,
      order_id: row.id,
      order_total: row.selected_subtotal_snapshot ?? 0,
      categories_ar: null,
      categories_en: null,
    }));
  }

  if (reportKey === "admin_report_active_merchants") {
    const { data } = await service
      .from("admin_active_merchants_readable")
      .select("id,store_name,category_name_ar,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return ((data ?? []) as AnyRow[]).map((row) => ({
      merchant_id: row.id,
      store_name: row.store_name,
      category_name_ar: row.category_name_ar,
      confirmed_orders_count: 0,
      gross_sales: 0,
      commissions_due: 0,
      average_rating: null,
      last_order_at: null,
    }));
  }

  if (reportKey === "admin_report_active_categories") {
    const { data } = await service
      .from("categories")
      .select("id,name_ar,name_en")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(500);
    return ((data ?? []) as AnyRow[]).map((row) => ({
      category_id: row.id,
      category_name_ar: row.name_ar,
      category_name_en: row.name_en,
      merchants_count: 0,
      confirmed_orders_count: 0,
      gross_sales: 0,
      commissions_due: 0,
    }));
  }

  if (reportKey === "admin_report_top_accepted_offers") {
    const { data } = await service
      .from("admin_orders_readable")
      .select("id,offer_id,merchant_id,store_name,status,accepted_at,confirmed_at,selected_subtotal_snapshot")
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .limit(100);
    return ((data ?? []) as AnyRow[]).map((row, index) => ({
      offer_id: row.offer_id,
      order_id: row.id,
      merchant_id: row.merchant_id,
      store_name: row.store_name,
      ranking: index + 1,
      coverage_percentage: null,
      total_price_snapshot: row.selected_subtotal_snapshot ?? 0,
      accepted_at: row.accepted_at,
      confirmed_at: row.confirmed_at,
      status: row.status,
    }));
  }

  if (reportKey === "admin_report_rfq_acceptance") {
    const { data: requests } = await service
      .from("rfq_requests")
      .select("id,buyer_id,status,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const requestRows = (requests ?? []) as AnyRow[];
    const ids = requestRows.map((row) => String(row.id ?? "")).filter(Boolean);
    const responsesResult = ids.length
      ? await service
          .from("rfq_responses")
          .select("id,rfq_request_id,status,total_price_snapshot")
          .in("rfq_request_id", ids)
          .limit(3000)
      : { data: [] as AnyRow[] };
    const responses = (responsesResult.data ?? []) as AnyRow[];
    return requestRows.map((request) => {
      const related = responses.filter((response) => response.rfq_request_id === request.id);
      return {
        rfq_request_id: request.id,
        buyer_id: request.buyer_id,
        status: request.status,
        created_at: request.created_at,
        responses_count: related.length,
        submitted_responses_count: related.filter((response) => response.status === "submitted").length,
        priced_responses_count: related.filter((response) => Number(response.total_price_snapshot ?? 0) > 0).length,
        accepted_total: null,
      };
    });
  }

  if (reportKey === "admin_report_payment_transactions") {
    const { data } = await service
      .from("admin_payment_transactions_readable")
      .select("id,user_name,store_name,provider,amount,currency,status,purpose,order_id,subscription_id,external_reference,created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    return ((data ?? []) as AnyRow[]).map((row) => ({
      ...row,
      transaction_id: row.id,
      direct_to_merchant: null,
      paid_at: null,
    }));
  }

  if (reportKey === "admin_report_commission_dues") {
    const { data } = await service
      .from("merchant_commissions")
      .select("id,order_id,merchant_id,category_id,base_amount,commission_rate,commission_amount,status,calculated_at,created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    return ((data ?? []) as AnyRow[]).map((row) => ({
      ...row,
      commission_id: row.id,
    }));
  }

  if (reportKey === "admin_report_merchant_arrears") {
    const { data } = await service
      .from("admin_active_merchants_readable")
      .select("id,user_id,store_name,billing_preference,free_trial_ends_at,manually_suspended_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return ((data ?? []) as AnyRow[]).map((row) => ({
      merchant_id: row.id,
      store_name: row.store_name,
      owner_user_id: row.user_id,
      billing_preference: row.billing_preference,
      subscription_status: row.free_trial_ends_at ? "trialing" : null,
      plan_name_ar: null,
      plan_name_en: null,
      monthly_price: 0,
      balance_due: 0,
      unpaid_months: 0,
      grace_months: 0,
      can_receive_new_work: !row.manually_suspended_at,
    }));
  }

  const { data } = await service
    .from("admin_referral_rewards_readable")
    .select("id,referrer_name,rewarded_user_name,referral_code,reward_type,delivery_status,delivered_at,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  return ((data ?? []) as AnyRow[]).map((row) => ({
    ...row,
    referral_id: row.id,
    referrer_email: row.referrer_name,
    confirmed_registrations: null,
    target_confirmed_registrations: null,
  }));
}

const fullAdminPermissions = {
  __full_admin: true,
  __limit_admin: false,
} satisfies Record<string, boolean>;

const editableFields: Record<string, string[]> = {
  users: ["role", "is_blocked"],
  merchants: ["last_admin_contact_at", "billing_preference"],
  branches: [],
  products: [
    "free_name",
    "price",
    "unit",
    "quantity",
    "brand",
    "size",
    "color",
    "image_url",
    "image_urls",
    "is_active",
  ],
  categories: ["name_ar", "name_en", "parent_id", "display_order", "is_active"],
  cities: [
    "country_ar",
    "country_en",
    "name_ar",
    "name_en",
    "governorate_ar",
    "governorate_en",
    "currency_code",
    "currency_name_ar",
    "currency_name_en",
    "display_order",
    "is_active",
  ],
  feature_flags: [
    "description_ar",
    "description_en",
    "is_enabled",
    "configuration",
  ],
  knowledge_base: [
    "title_ar",
    "title_en",
    "content_ar",
    "content_en",
    "category",
    "is_active",
    "needs_embedding",
  ],
  subscription_plans: [
    "name_ar",
    "name_en",
    "description_ar",
    "description_en",
    "monthly_price",
    "features",
    "is_active",
    "billing_period_months",
    "grace_months",
    "sort_order",
  ],
  payment_settings: [
    "provider",
    "is_enabled",
    "configuration",
    "webhook_secret_name",
    "webhook_signature_header",
    "is_direct_to_merchant_supported",
  ],
  ads_banners: [
    "admin_name",
    "image_url",
    "target_url",
    "placement",
    "target_country_ar",
    "target_governorate_ar",
    "target_city_ar",
    "sort_order",
    "starts_at",
    "ends_at",
    "is_ongoing",
    "is_active",
  ],
  support_agents: ["department", "permissions", "is_active"],
  referral_rewards: ["delivery_status", "delivered_at", "notes"],
  content_moderation_terms: [
    "term",
    "language",
    "match_type",
    "category",
    "severity",
    "notes",
    "is_active",
  ],
};

const toggleFieldByTable: Record<string, string> = {
  products: "is_active",
  categories: "is_active",
  cities: "is_active",
  feature_flags: "is_enabled",
  knowledge_base: "is_active",
  subscription_plans: "is_active",
  payment_settings: "is_enabled",
  ads_banners: "is_active",
  support_agents: "is_active",
  content_moderation_terms: "is_active",
};

const idColumnByTable: Record<string, string> = {
  feature_flags: "key",
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function accessTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
}


const allowedAdminFileBuckets = new Set([
  "storefront-photos",
  "merchant-ids",
  "commercial-registers",
  "product-images",
  "banners",
]);

function normalizeAdminStorageReference(
  bucketValue: unknown,
  pathValue: unknown,
  fallbackBucketValue: unknown,
) {
  let bucket = String(bucketValue ?? "").trim();
  let path = String(pathValue ?? "").trim();
  const fallbackBucket = String(fallbackBucketValue ?? "").trim();
  if (!path) throw new Error("file_not_available");

  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (url.hostname === "example.com" || url.hostname.endsWith(".example.com")) {
      throw new Error("legacy_file_placeholder");
    }
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (!match) return { externalUrl: path, bucket: "", path: "" };
    bucket = decodeURIComponent(match[1]);
    path = decodeURIComponent(match[2]);
  } else {
    path = path.replace(/^storage:\/\//i, "").replace(/^\/+/, "");
    const first = path.split("/")[0];
    if (allowedAdminFileBuckets.has(first)) {
      bucket = first;
      path = path.slice(first.length + 1);
    }
  }

  if (!bucket || bucket === "legacy-url") bucket = fallbackBucket;
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  if (!allowedAdminFileBuckets.has(bucket) || !path) throw new Error("file_not_available");
  return { externalUrl: "", bucket, path };
}

async function createAdminFileLink(
  service: ServiceClient,
  bucketValue: unknown,
  pathValue: unknown,
  fallbackBucketValue: unknown,
) {
  const normalized = normalizeAdminStorageReference(bucketValue, pathValue, fallbackBucketValue);
  if (normalized.externalUrl) return normalized.externalUrl;
  const { data, error } = await service.storage.from(normalized.bucket).createSignedUrl(normalized.path, 60 * 10);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "signed_link_failed");
  return data.signedUrl;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const raw = error as Record<string, unknown>;
    const parts = [raw.message, raw.details, raw.hint, raw.code]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());

    if (parts.length > 0) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

function isDbPermissionError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission denied") || normalized.includes("42501")
  );
}

function serviceActionErrorMessage(error: unknown) {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("not_admin") ||
    normalized.includes("user not allowed") ||
    normalized.includes("service_role_key_invalid")
  ) {
    return "service_role_key_invalid";
  }
  return isDbPermissionError(message) ? "service_role_access_denied" : message;
}

function adminDbActionErrorMessage(error: unknown) {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("pgrst116") ||
    normalized.includes("cannot coerce the result to a single json object") ||
    normalized.includes("result contains 0 rows")
  ) {
    return "row_not_returned";
  }
  return isDbPermissionError(message) ? "admin_rls_access_denied" : message;
}

function requiredText(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${field}_required`);
  }
  return text;
}

function serviceRoleKeyProblem() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    return "service_role_key_missing";
  }

  const payloadPart = key.split(".")[1];
  if (!payloadPart) {
    return "service_role_key_invalid";
  }

  try {
    let normalizedPayload = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    while (normalizedPayload.length % 4 !== 0) {
      normalizedPayload += "=";
    }

    const payload = JSON.parse(
      Buffer.from(normalizedPayload, "base64").toString("utf8"),
    ) as {
      role?: string;
      ref?: string;
    };
    if (payload.role !== "service_role") {
      return "service_role_key_invalid";
    }

    const expectedRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
      /^https:\/\/([^.]+)\.supabase\.co/i,
    )?.[1];
    if (expectedRef && payload.ref && payload.ref !== expectedRef) {
      return "service_role_key_invalid";
    }
  } catch {
    return "service_role_key_invalid";
  }

  return null;
}

function actionRequiresServiceRole(action: string) {
  return [
    "create_admin_staff",
    "update_staff_permissions",
    "set_staff_active",
    "remove_admin_staff_access",
    "list_notification_templates",
    "save_notification_template",
    "delete_notification_template",
    "set_user_password",
    "delete_user_account",
    "block_user",
    "unblock_user",
    "upsert_support_label",
    "set_support_labels",
    "convert_support_to_complaint",
    "assign_support_conversation_admin",
    "set_merchant_badges",
    "set_merchant_trial",
    "assign_complaint_admin",
    "send_complaint_message_admin",
    "resolve_complaint_admin",
    "set_complaint_status_admin",
    "set_support_complaint_labels",
    "delete_merchant",
    "restore_merchant",
    "signed_admin_file",
  ].includes(action);
}

function pickAllowed(table: string, values: AnyRow) {
  const allowed = new Set(editableFields[table] ?? []);
  return normalizeEditableValues(
    table,
    Object.fromEntries(
      Object.entries(values).filter(([key]) => allowed.has(key)),
    ),
  );
}

function normalizeUrlValue(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^\/https?:\/\//i.test(text)) {
    return text.slice(1);
  }
  if (/^www\./i.test(text)) {
    return `https://${text}`;
  }
  return text;
}

function normalizeEditableValues(table: string, values: AnyRow) {
  if (table === "cities") {
    return {
      ...values,
      country_ar:
        values.country_ar === undefined
          ? values.country_ar
          : String(values.country_ar || "مصر").trim(),
      country_en:
        values.country_en === undefined
          ? values.country_en
          : String(values.country_en || "Egypt").trim(),
    };
  }

  if (table !== "ads_banners") {
    return values;
  }

  return {
    ...values,
    admin_name:
      values.admin_name === undefined
        ? values.admin_name
        : String(values.admin_name ?? "").trim() || null,
    image_url:
      values.image_url === undefined
        ? values.image_url
        : normalizeUrlValue(values.image_url),
    target_url:
      values.target_url === undefined
        ? values.target_url
        : normalizeUrlValue(values.target_url),
    target_country_ar:
      values.target_country_ar === undefined
        ? values.target_country_ar
        : String(values.target_country_ar ?? "").trim() || null,
    target_governorate_ar:
      values.target_governorate_ar === undefined
        ? values.target_governorate_ar
        : String(values.target_governorate_ar ?? "").trim() || null,
    target_city_ar:
      values.target_city_ar === undefined
        ? values.target_city_ar
        : String(values.target_city_ar ?? "").trim() || null,
  };
}

function normalizePermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, enabled]) => [
      key,
      enabled === true,
    ]),
  );
}

function normalizeLocationText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

function notificationLocationTarget(payload: AnyRow | undefined) {
  const country = normalizeLocationText(payload?.target_country_ar);
  const governorate = normalizeLocationText(payload?.target_governorate_ar);
  const city = normalizeLocationText(payload?.target_city_ar);
  return {
    country,
    governorate,
    city,
    hasTarget: Boolean(country || governorate || city),
  };
}

function locationMatchesTarget(
  location: { country?: unknown; governorate?: unknown; city?: unknown },
  target: ReturnType<typeof notificationLocationTarget>,
) {
  const country = normalizeLocationText(location.country);
  const governorate = normalizeLocationText(location.governorate);
  const city = normalizeLocationText(location.city);

  if (target.country && country !== target.country) return false;
  if (target.governorate && governorate !== target.governorate) return false;
  if (target.city && city !== target.city) return false;
  return true;
}

function authFromProfile(value: unknown): AdminAuth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const profile = value as AnyRow;
  const role =
    profile.role === "admin" || profile.role === "support_agent"
      ? profile.role
      : null;
  const userId = typeof profile.id === "string" ? profile.id : "";
  if (!role || !userId || profile.is_blocked === true) {
    return null;
  }
  return {
    userId,
    role,
    permissions: normalizePermissions(profile.permissions),
  };
}

function trustedRoleFromAuthUser(
  user: AuthUserForAdmin,
): AdminAuth["role"] | null {
  const role = String(
    user.app_metadata?.role ??
      user.app_metadata?.app_role ??
      user.app_metadata?.user_role ??
      "",
  ).trim();

  if (role === "admin" || role === "support_agent") {
    return role;
  }
  return null;
}

function profileValue(user: AuthUserForAdmin, key: string) {
  const value = user.user_metadata?.[key] ?? user.app_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function repairAdminUserProfile(
  service: ServiceClient,
  user: AuthUserForAdmin,
  role: AdminAuth["role"],
  existingProfile: AnyRow | null,
) {
  if (existingProfile?.is_blocked === true) {
    return existingProfile;
  }

  if (existingProfile) {
    if (existingProfile.role !== role) {
      const { data, error } = await service
        .from("users")
        .update({ role })
        .eq("id", user.id)
        .select("id, role, is_blocked")
        .single();
      if (!error && data) return data as AnyRow;
    }
    return existingProfile;
  }

  const email = (user.email ?? `${user.id}@admin.saarly.local`).trim();
  const fullName =
    profileValue(user, "full_name") ||
    profileValue(user, "name") ||
    email.split("@")[0] ||
    "Saarly Admin";
  const mobile =
    (user.phone ?? "").trim() ||
    profileValue(user, "mobile") ||
    profileValue(user, "phone") ||
    `admin-${user.id.slice(0, 8)}`;

  const { data, error } = await service
    .from("users")
    .insert({
      id: user.id,
      full_name: fullName,
      mobile,
      primary_email: email,
      recovery_email: email,
      role,
      preferred_language: "ar",
      theme: "light",
      is_blocked: false,
    })
    .select("id, role, is_blocked")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AnyRow;
}

function permissionKeyFor(action: string, table?: string) {
  if (
    action === "create_admin_staff" ||
    action === "update_staff_permissions" ||
    action === "set_staff_active" ||
    action === "remove_admin_staff_access"
  )
    return "staff";
  if (["send_admin_notification", "list_notification_templates", "save_notification_template", "delete_notification_template"].includes(action)) return "broadcast";
  if (["upsert_support_label", "set_support_labels", "convert_support_to_complaint", "assign_support_conversation_admin"].includes(action)) return "support_chats";
  if (["set_merchant_badges", "set_merchant_trial"].includes(action)) return "monetization";
  if (["assign_complaint_admin", "send_complaint_message_admin", "resolve_complaint_admin", "set_complaint_status_admin", "set_support_complaint_labels"].includes(action)) return "complaints";
  if (action === "signed_admin_file") return "merchant_approvals";
  if (action === "update_referral_settings") return "referrals";
  if (action === "set_user_password" || action === "delete_user_account")
    return "users";
  if (
    action === "approve_merchant" ||
    action === "reject_merchant" ||
    action === "suspend_merchant" ||
    action === "restore_merchant" ||
    action === "delete_merchant"
  )
    return "merchant_approvals";
  if (action === "approve_branch" || action === "reject_branch")
    return "branch_approvals";
  if (action === "block_user" || action === "unblock_user") return "users";
  if (
    action === "deactivate_product" ||
    action === "activate_product" ||
    action === "delete_product"
  )
    return "store_catalog";

  const tablePermissions: Record<string, string> = {
    users: "users",
    merchants: "stores",
    branches: "branch_approvals",
    products: "store_catalog",
    categories: "categories",
    cities: "cities",
    feature_flags: "monetization",
    knowledge_base: "knowledge_base",
    subscription_plans: "monetization",
    payment_settings: "monetization",
    ads_banners: "ads",
    support_agents: "staff",
    referral_rewards: "referrals",
    content_moderation_terms: "content_moderation",
  };
  return table ? tablePermissions[table] : undefined;
}

function assertActionAllowed(auth: AdminAuth, action: string, table?: string) {
  if (auth.role === "admin" && auth.permissions.__limit_admin !== true) {
    return;
  }

  if (
    action === "signed_admin_file" &&
    ["merchant_approvals", "branch_approvals", "store_catalog", "monetization"].some(
      (key) => auth.permissions[key] === true,
    )
  ) {
    return;
  }

  if (
    action === "upsert_support_label" &&
    (auth.permissions.support_chats === true || auth.permissions.complaints === true)
  ) {
    return;
  }

  const permissionKey = permissionKeyFor(action, table);
  if (!permissionKey || auth.permissions[permissionKey] !== true) {
    throw new Error("permission_denied");
  }
}

async function requireAdmin(req: NextRequest, service: ServiceClient) {
  const token = accessTokenFromRequest(req);

  if (!token) {
    return { error: jsonError("missing_access_token", 401) };
  }

  try {
    const userScopedClient = createUserScopedClient(token);
    const { data: rpcProfile } = await userScopedClient.rpc(
      "admin_web_my_profile",
    );
    const rpcAuth = authFromProfile(rpcProfile);
    if (rpcAuth) {
      return rpcAuth;
    }
  } catch {
    // Fall back to the service-role based path below for older databases.
  }

  const { data: userData, error: userError } =
    await service.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: jsonError("invalid_access_token", 401) };
  }

  const authUser = userData.user as AuthUserForAdmin;
  const authEmail = String(authUser.email ?? "")
    .trim()
    .toLowerCase();

  const { data: profileData } = await service
    .from("users")
    .select("id, role, is_blocked")
    .eq("id", authUser.id)
    .maybeSingle();

  let profile = (profileData ?? null) as AnyRow | null;
  if (!profile && authEmail) {
    const { data: emailProfile } = await service
      .from("users")
      .select("id, role, is_blocked")
      .eq("primary_email", authEmail)
      .maybeSingle();
    profile = (emailProfile ?? null) as AnyRow | null;
  }
  if (!profile && authEmail) {
    const { data: recoveryEmailProfile } = await service
      .from("users")
      .select("id, role, is_blocked")
      .eq("recovery_email", authEmail)
      .maybeSingle();
    profile = (recoveryEmailProfile ?? null) as AnyRow | null;
  }

  const permissionUserId = String(profile?.id ?? authUser.id);

  let permissions: Record<string, boolean> = {};
  const { data: staffProfile } = await service
    .from("admin_staff_profiles")
    .select("permissions, is_active")
    .eq("user_id", permissionUserId)
    .maybeSingle();

  let role = (
    profile?.role === "admin" || profile?.role === "support_agent"
      ? profile.role
      : null
  ) as AdminAuth["role"] | null;

  const staffPermissions = normalizePermissions(staffProfile?.permissions);
  if (
    !role &&
    staffProfile?.is_active !== false &&
    Object.values(staffPermissions).some(Boolean)
  ) {
    role = "admin";
  }

  if (!role) {
    role = trustedRoleFromAuthUser(authUser);
  }

  if (!role) {
    return { error: jsonError("admin_required", 403) };
  }

  try {
    profile = await repairAdminUserProfile(service, authUser, role, profile);
  } catch {
    return { error: jsonError("admin_required", 403) };
  }

  if (profile?.is_blocked) {
    return { error: jsonError("admin_required", 403) };
  }

  permissions = staffPermissions;

  if (
    staffProfile?.is_active === false &&
    !(role === "admin" && permissions.__limit_admin !== true)
  ) {
    return { error: jsonError("admin_required", 403) };
  }

  if (role === "admin" && permissions.__limit_admin !== true) {
    permissions = { ...permissions, ...fullAdminPermissions };
  }

  if (role === "support_agent") {
    const { data: agentRow } = await service
      .from("support_agents")
      .select("permissions, is_active")
      .eq("user_id", permissionUserId)
      .maybeSingle();

    if (!agentRow?.is_active) {
      return { error: jsonError("admin_required", 403) };
    }
    permissions = {
      ...normalizePermissions(agentRow.permissions),
      ...permissions,
    };
  }

  return { userId: String(profile?.id ?? permissionUserId), role, permissions };
}

async function getBefore(service: DbClient, table: string, id: string) {
  const idColumn = idColumnByTable[table] ?? "id";
  const { data } = await service
    .from(table)
    .select("*")
    .eq(idColumn, id)
    .maybeSingle();
  return data as AnyRow | null;
}

async function writeAudit(
  service: ServiceClient,
  actorId: string,
  action: string,
  table: string,
  targetId: string,
  oldData: AnyRow | null,
  newData: AnyRow | null,
) {
  const { error } = await service.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_table: table,
    target_id: targetId,
    old_data: oldData,
    new_data: newData,
  });
  if (error) {
    console.warn("Audit log was not saved:", error.message);
  }
}

function storagePathFromValue(value: unknown, bucket: string) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("storage://")) {
    const withoutScheme = trimmed.replace("storage://", "");
    const parts = withoutScheme.split("/");
    return parts[0] === bucket ? parts.slice(1).join("/") : withoutScheme;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, "");
  }

  try {
    const url = new URL(trimmed);
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const signedMarker = `/storage/v1/object/sign/${bucket}/`;
    const marker = url.pathname.includes(publicMarker)
      ? publicMarker
      : signedMarker;
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function removeProductImages(service: DbClient, product: AnyRow | null) {
  const rawImages = [
    product?.image_url,
    ...(Array.isArray(product?.image_urls) ? (product?.image_urls ?? []) : []),
  ];
  const paths = Array.from(
    new Set(
      rawImages
        .map((value) => storagePathFromValue(value, "product-images"))
        .filter(Boolean) as string[],
    ),
  );
  if (paths.length > 0) {
    await service.storage.from("product-images").remove(paths);
  }
}

async function removeMerchantImages(
  service: DbClient,
  merchant: AnyRow | null,
) {
  const storefrontPath = storagePathFromValue(
    merchant?.store_front_image_url,
    "storefront-photos",
  );
  const ownerIdPath = storagePathFromValue(
    merchant?.owner_id_image_url,
    "merchant-ids",
  );
  const commercialPath = storagePathFromValue(
    merchant?.commercial_register_url,
    "commercial-registers",
  );

  if (storefrontPath)
    await service.storage.from("storefront-photos").remove([storefrontPath]);
  if (ownerIdPath)
    await service.storage.from("merchant-ids").remove([ownerIdPath]);
  if (commercialPath)
    await service.storage.from("commercial-registers").remove([commercialPath]);
}

const userOwnedStorageBuckets = [
  "merchant-ids",
  "storefront-photos",
  "commercial-registers",
  "product-images",
  "product-imports",
  "invoices",
  "voice-recordings",
] as const;

type StorageBucketName = (typeof userOwnedStorageBuckets)[number];
type StoragePathMap = Map<StorageBucketName, Set<string>>;

function pathBelongsToUser(path: string, userId: string) {
  const normalized = path.replace(/^\/+/, "");
  return normalized === userId || normalized.startsWith(`${userId}/`);
}

function addStoragePath(
  pathsByBucket: StoragePathMap,
  bucket: StorageBucketName,
  path: string | null,
  userId: string,
) {
  if (!path || !pathBelongsToUser(path, userId)) return;
  const normalized = path.replace(/^\/+/, "");
  const bucketPaths = pathsByBucket.get(bucket) ?? new Set<string>();
  bucketPaths.add(normalized);
  pathsByBucket.set(bucket, bucketPaths);
}

function addStorageValue(
  pathsByBucket: StoragePathMap,
  bucket: StorageBucketName,
  value: unknown,
  userId: string,
) {
  addStoragePath(
    pathsByBucket,
    bucket,
    storagePathFromValue(value, bucket),
    userId,
  );
}

async function collectStoragePrefixPaths(
  service: ServiceClient,
  bucket: StorageBucketName,
  prefix: string,
  paths: Set<string>,
) {
  let offset = 0;
  while (true) {
    const { data, error } = await service.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset });
    if (error) {
      throw new Error(errorMessage(error));
    }
    const items = ((data ?? []) as unknown) as AnyRow[];
    if (items.length === 0) return;

    for (const item of items) {
      const name = String(item.name ?? "").trim();
      if (!name) continue;
      const path = `${prefix}/${name}`;
      if (item.id || item.metadata) {
        paths.add(path);
      } else {
        await collectStoragePrefixPaths(service, bucket, path, paths);
      }
    }

    if (items.length < 100) return;
    offset += items.length;
  }
}

async function collectUserOwnedStoragePaths(
  service: ServiceClient,
  userId: string,
) {
  const pathsByBucket: StoragePathMap = new Map();

  for (const bucket of userOwnedStorageBuckets) {
    const bucketPaths = pathsByBucket.get(bucket) ?? new Set<string>();
    await collectStoragePrefixPaths(service, bucket, userId, bucketPaths);
    if (bucketPaths.size > 0) pathsByBucket.set(bucket, bucketPaths);
  }

  const { data: merchants, error: merchantsError } = await service
    .from("merchants")
    .select(
      "id, owner_id_image_url, store_front_image_url, commercial_register_url",
    )
    .eq("user_id", userId);
  if (merchantsError) {
    throw new Error(errorMessage(merchantsError));
  }

  const merchantRows = (merchants ?? []) as AnyRow[];
  const merchantIds = merchantRows.map((merchant) => String(merchant.id));

  for (const merchant of merchantRows) {
    addStorageValue(
      pathsByBucket,
      "merchant-ids",
      merchant.owner_id_image_url,
      userId,
    );
    addStorageValue(
      pathsByBucket,
      "storefront-photos",
      merchant.store_front_image_url,
      userId,
    );
    addStorageValue(
      pathsByBucket,
      "commercial-registers",
      merchant.commercial_register_url,
      userId,
    );
  }

  if (merchantIds.length > 0) {
    const { data: branches, error: branchesError } = await service
      .from("branches")
      .select("front_image_url")
      .in("merchant_id", merchantIds);
    if (branchesError) {
      throw new Error(errorMessage(branchesError));
    }
    for (const branch of (branches ?? []) as AnyRow[]) {
      addStorageValue(
        pathsByBucket,
        "storefront-photos",
        branch.front_image_url,
        userId,
      );
    }

    const { data: products, error: productsError } = await service
      .from("products")
      .select("image_url, image_urls")
      .in("merchant_id", merchantIds);
    if (productsError) {
      throw new Error(errorMessage(productsError));
    }
    for (const product of (products ?? []) as AnyRow[]) {
      addStorageValue(
        pathsByBucket,
        "product-images",
        product.image_url,
        userId,
      );
      if (Array.isArray(product.image_urls)) {
        for (const imageUrl of product.image_urls) {
          addStorageValue(pathsByBucket, "product-images", imageUrl, userId);
        }
      }
    }

    const { data: importBatches, error: importBatchesError } = await service
      .from("product_import_batches")
      .select("original_file_url")
      .in("merchant_id", merchantIds);
    if (importBatchesError) {
      throw new Error(errorMessage(importBatchesError));
    }
    for (const batch of (importBatches ?? []) as AnyRow[]) {
      addStorageValue(
        pathsByBucket,
        "product-imports",
        batch.original_file_url,
        userId,
      );
    }
  }

  const { data: quoteRequests, error: quoteRequestsError } = await service
    .from("quote_requests")
    .select("source, original_file_url")
    .eq("buyer_id", userId);
  if (quoteRequestsError) {
    throw new Error(errorMessage(quoteRequestsError));
  }
  for (const quoteRequest of (quoteRequests ?? []) as AnyRow[]) {
    const bucket =
      quoteRequest.source === "voice" ? "voice-recordings" : "invoices";
    addStorageValue(
      pathsByBucket,
      bucket,
      quoteRequest.original_file_url,
      userId,
    );
  }

  return { pathsByBucket, merchantIds };
}

async function removeUserOwnedStorage(service: ServiceClient, userId: string) {
  const { pathsByBucket, merchantIds } = await collectUserOwnedStoragePaths(
    service,
    userId,
  );
  let removedCount = 0;

  for (const [bucket, paths] of pathsByBucket.entries()) {
    const pathList = Array.from(paths);
    for (let index = 0; index < pathList.length; index += 100) {
      const chunk = pathList.slice(index, index + 100);
      const { error } = await service.storage.from(bucket).remove(chunk);
      if (error) {
        throw new Error(errorMessage(error));
      }
      removedCount += chunk.length;
    }
  }

  return { removedCount, merchantIds };
}

async function adminDeleteUserAccount(
  service: ServiceClient,
  actorId: string,
  targetId: string,
) {
  if (targetId === actorId) {
    throw new Error("cannot_delete_current_admin");
  }

  const before = await getBefore(service, "users", targetId);
  if (!before) {
    throw new Error("user_not_found");
  }

  const { removedCount, merchantIds } = await removeUserOwnedStorage(
    service,
    targetId,
  );
  const deletedAt = new Date().toISOString();
  const deletedEmail = `deleted_${targetId}@deleted.saarly.app`;

  const cleanupResults = await Promise.all([
    service.from("user_devices").delete().eq("user_id", targetId),
    service.from("favorites").delete().eq("buyer_id", targetId),
    service.from("price_alerts").delete().eq("buyer_id", targetId),
    service.from("support_agents").delete().eq("user_id", targetId),
    service.from("admin_staff_profiles").delete().eq("user_id", targetId),
  ]);
  assertNoDbErrors(cleanupResults);

  if (merchantIds.length > 0) {
    const merchantCleanupResults = await Promise.all([
      service
        .from("products")
        .update({ is_active: false })
        .in("merchant_id", merchantIds),
      service
        .from("branches")
        .update({
          approval_status: "rejected",
          rejection_reason: "تم حذف حساب صاحب المتجر.",
        })
        .in("merchant_id", merchantIds),
      service
        .from("merchants")
        .update({
          approval_status: "rejected",
          rejection_reason: "تم حذف حساب صاحب المتجر.",
          last_admin_contact_at: deletedAt,
        })
        .in("id", merchantIds),
    ]);
    assertNoDbErrors(merchantCleanupResults);
  }

  const anonymizedUser = {
    full_name: "مستخدم محذوف",
    mobile: `deleted_${targetId}`,
    primary_email: deletedEmail,
    recovery_email: null,
    is_blocked: true,
    updated_at: deletedAt,
  };
  const { error: userUpdateError } = await service
    .from("users")
    .update(anonymizedUser)
    .eq("id", targetId);
  if (userUpdateError) {
    throw new Error(errorMessage(userUpdateError));
  }

  const { error: authDeleteError } = await service.auth.admin.deleteUser(
    targetId,
    true,
  );
  const authDeleteMessage = authDeleteError ? errorMessage(authDeleteError) : "";
  const authAlreadyMissing = authDeleteMessage.toLowerCase().includes("not found");
  if (authDeleteError && !authAlreadyMissing) {
    throw new Error(serviceActionErrorMessage(authDeleteError));
  }

  const result = {
    ...anonymizedUser,
    auth_soft_deleted: !authDeleteError,
    auth_already_missing: authAlreadyMissing,
    storage_removed_count: removedCount,
    merchant_ids: merchantIds,
  };

  await writeAudit(
    service,
    actorId,
    "delete_user_account",
    "users",
    targetId,
    before,
    result,
  );

  return { id: targetId, deleted: true, storage_removed_count: removedCount };
}

function assertNoDbErrors(
  results: Array<{ error: unknown | null | undefined }>,
) {
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    throw new Error(errorMessage(failedResult.error));
  }
}

async function resolveNotificationRecipients(
  service: DbClient,
  payload: AnyRow | undefined,
) {
  const audience = String(payload?.audience ?? "all");
  const userIds = Array.isArray(payload?.user_ids)
    ? payload?.user_ids.map(String).filter(Boolean)
    : [];

  let query = service
    .from("users")
    .select("id, role")
    .eq("is_blocked", false)
    .limit(5000);

  if (audience === "buyers") {
    query = query.eq("role", "buyer");
  } else if (audience === "merchants") {
    query = query.eq("role", "merchant");
  } else if (audience === "specific") {
    if (userIds.length === 0) {
      throw new Error("notification_recipients_required");
    }
    query = query.in("id", userIds);
  } else if (audience !== "all") {
    throw new Error("invalid_notification_audience");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{ id: string; role: string }>;
  const target = notificationLocationTarget(payload);
  if (!target.hasTarget || audience === "specific") {
    return Array.from(new Set(rows.map((row) => row.id)));
  }

  const matched = new Set<string>();
  const buyerIds = rows
    .filter((row) => row.role === "buyer")
    .map((row) => row.id);
  const merchantUserIds = rows
    .filter((row) => row.role === "merchant")
    .map((row) => row.id);

  if (buyerIds.length > 0) {
    const { data: buyerLocations, error: buyerLocationError } = await service
      .from("buyer_location_settings")
      .select("buyer_id,country_name,governorate_name,city_name")
      .in("buyer_id", buyerIds)
      .limit(5000);
    if (buyerLocationError) {
      throw new Error(buyerLocationError.message);
    }
    for (const location of (buyerLocations ?? []) as Array<{
      buyer_id: string;
      country_name: string | null;
      governorate_name: string | null;
      city_name: string | null;
    }>) {
      if (
        locationMatchesTarget(
          {
            country: location.country_name,
            governorate: location.governorate_name,
            city: location.city_name,
          },
          target,
        )
      ) {
        matched.add(location.buyer_id);
      }
    }
  }

  if (merchantUserIds.length > 0) {
    const { data: merchants, error: merchantsError } = await service
      .from("merchants")
      .select("id,user_id")
      .in("user_id", merchantUserIds)
      .eq("approval_status", "approved")
      .limit(5000);
    if (merchantsError) {
      throw new Error(merchantsError.message);
    }

    const merchantRows = (merchants ?? []) as Array<{
      id: string;
      user_id: string;
    }>;
    const merchantUserByMerchantId = new Map(
      merchantRows.map((merchant) => [merchant.id, merchant.user_id]),
    );
    const merchantIds = merchantRows.map((merchant) => merchant.id);

    if (merchantIds.length > 0) {
      const { data: branches, error: branchesError } = await service
        .from("branches")
        .select("merchant_id,city_id,city_name,governorate_name")
        .in("merchant_id", merchantIds)
        .eq("approval_status", "approved")
        .limit(10000);
      if (branchesError) {
        throw new Error(branchesError.message);
      }

      const branchRows = (branches ?? []) as Array<{
        merchant_id: string;
        city_id: string | null;
        city_name: string | null;
        governorate_name: string | null;
      }>;
      const cityIds = Array.from(
        new Set(
          branchRows
            .map((branch) => branch.city_id)
            .filter(Boolean) as string[],
        ),
      );
      const cityById = new Map<
        string,
        {
          country_ar: string | null;
          country_en: string | null;
          name_ar: string | null;
        }
      >();

      if (cityIds.length > 0) {
        const { data: cities, error: citiesError } = await service
          .from("cities")
          .select("id,country_ar,country_en,name_ar")
          .in("id", cityIds)
          .limit(10000);
        if (citiesError) {
          throw new Error(citiesError.message);
        }
        for (const city of (cities ?? []) as Array<{
          id: string;
          country_ar: string | null;
          country_en: string | null;
          name_ar: string | null;
        }>) {
          cityById.set(city.id, city);
        }
      }

      for (const branch of branchRows) {
        const city = branch.city_id ? cityById.get(branch.city_id) : null;
        if (
          locationMatchesTarget(
            {
              country: city?.country_ar ?? city?.country_en,
              governorate: branch.governorate_name,
              city: branch.city_name ?? city?.name_ar,
            },
            target,
          )
        ) {
          const userId = merchantUserByMerchantId.get(branch.merchant_id);
          if (userId) matched.add(userId);
        }
      }
    }
  }

  return Array.from(matched);
}

function sanitizeNotificationText(value: unknown, arabic = false) {
  let text = String(value ?? "").normalize("NFKC");
  text = text.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  if (arabic) {
    text = text.replace(/[\u0610-\u061A\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  }
  return text.replace(/\s+/g, " ").trim();
}

function notificationTemplateValues(payload: AnyRow | undefined) {
  const audience = ["all", "buyers", "merchants", "specific"].includes(String(payload?.audience))
    ? String(payload?.audience)
    : "all";
  return {
    name: requiredText(payload?.name, "template_name").slice(0, 100),
    audience,
    title_ar: sanitizeNotificationText(payload?.title_ar, true),
    title_en: sanitizeNotificationText(payload?.title_en),
    body_ar: sanitizeNotificationText(payload?.body_ar, true),
    body_en: sanitizeNotificationText(payload?.body_en),
    destination_id: String(payload?.destination_id ?? "buyer_orders").trim() || "buyer_orders",
    deep_link: String(payload?.deep_link ?? "saarly://buyer/orders").trim() || "saarly://buyer/orders",
    target_country_ar: sanitizeNotificationText(payload?.target_country_ar, true) || null,
    target_governorate_ar: sanitizeNotificationText(payload?.target_governorate_ar, true) || null,
    target_city_ar: sanitizeNotificationText(payload?.target_city_ar, true) || null,
    user_ids: Array.isArray(payload?.user_ids) ? payload?.user_ids.map(String).filter(Boolean).slice(0, 500) : [],
  };
}

async function listNotificationTemplates(service: ServiceClient) {
  const { data, error } = await service
    .from("admin_notification_templates")
    .select("id,name,audience,title_ar,title_en,body_ar,body_en,destination_id,deep_link,target_country_ar,target_governorate_ar,target_city_ar,user_ids,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function saveNotificationTemplate(service: ServiceClient, actorId: string, payload: AnyRow | undefined) {
  const values = { ...notificationTemplateValues(payload), created_by: actorId, updated_at: new Date().toISOString() };
  if (!values.title_ar || !values.body_ar) throw new Error("template_content_required");
  const templateId = String(payload?.template_id ?? "").trim();
  let query = templateId
    ? service.from("admin_notification_templates").update(values).eq("id", templateId)
    : service.from("admin_notification_templates").upsert(values, { onConflict: "name" });
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  await writeAudit(service, actorId, "save_notification_template", "admin_notification_templates", String(data.id), null, data as AnyRow);
  return data;
}

async function deleteNotificationTemplate(service: ServiceClient, actorId: string, id: string) {
  const before = await getBefore(service, "admin_notification_templates", id);
  const { error } = await service.from("admin_notification_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await writeAudit(service, actorId, "delete_notification_template", "admin_notification_templates", id, before, null);
  return { id, deleted: true };
}

async function sendAdminNotification(
  service: DbClient,
  auditClient: ServiceClient,
  actorId: string,
  payload: AnyRow | undefined,
) {
  const recipients = await resolveNotificationRecipients(service, payload);
  if (recipients.length === 0) {
    throw new Error("no_recipients_found");
  }

  const titleAr = requiredText(sanitizeNotificationText(payload?.title_ar, true), "title_ar");
  const titleEn = sanitizeNotificationText(payload?.title_en ?? titleAr) || titleAr;
  const bodyAr = requiredText(sanitizeNotificationText(payload?.body_ar, true), "body_ar");
  const bodyEn = sanitizeNotificationText(payload?.body_en ?? bodyAr) || bodyAr;
  const deepLink =
    String(payload?.deep_link ?? "saarly://buyer/notifications").trim() ||
    "saarly://buyer/notifications";
  const type =
    String(payload?.type ?? "admin_broadcast").trim() || "admin_broadcast";

  const rows = recipients.map((userId) => ({
    user_id: userId,
    type,
    title_ar: titleAr,
    title_en: titleEn,
    body_ar: bodyAr,
    body_en: bodyEn,
    deep_link: deepLink,
    payload: {
      source: "admin_web",
      sent_by: actorId,
      audience: payload?.audience ?? "all",
      target_country_ar:
        String(payload?.target_country_ar ?? "").trim() || null,
      target_governorate_ar:
        String(payload?.target_governorate_ar ?? "").trim() || null,
      target_city_ar: String(payload?.target_city_ar ?? "").trim() || null,
    },
    push_status: "pending",
  }));

  const { data, error } = await service
    .from("notifications")
    .insert(rows)
    .select("id, user_id");
  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    auditClient,
    actorId,
    "send_admin_notification",
    "notifications",
    "bulk",
    null,
    {
      count: rows.length,
      audience: payload?.audience ?? "all",
      target_country_ar:
        String(payload?.target_country_ar ?? "").trim() || null,
      target_governorate_ar:
        String(payload?.target_governorate_ar ?? "").trim() || null,
      target_city_ar: String(payload?.target_city_ar ?? "").trim() || null,
      title_ar: titleAr,
      deep_link: deepLink,
    },
  );

  return {
    inserted_count: data?.length ?? rows.length,
    requested_recipients: recipients.length,
    audience: payload?.audience ?? "all",
  };
}

type ReferralRewardType = "tshirt" | "monthly_subscription" | "football" | "cap" | "other";
type ReferralAudience = "buyer" | "merchant";
type ReferralRewardOption = {
  reward_type: ReferralRewardType;
  label_ar: string;
  label_en: string;
  is_active: boolean;
  display_order: number;
};

const referralRewardCatalog: Record<ReferralAudience, ReferralRewardOption[]> = {
  buyer: [
    {
      reward_type: "tshirt",
      label_ar: "قميص",
      label_en: "T-shirt",
      is_active: true,
      display_order: 0,
    },
    {
      reward_type: "football",
      label_ar: "كرة قدم",
      label_en: "Football",
      is_active: true,
      display_order: 1,
    },
    {
      reward_type: "cap",
      label_ar: "قبعة",
      label_en: "Cap",
      is_active: true,
      display_order: 2,
    },
    {
      reward_type: "other",
      label_ar: "مكافأة جديدة",
      label_en: "New reward",
      is_active: true,
      display_order: 3,
    },
  ],
  merchant: [
    {
      reward_type: "monthly_subscription",
      label_ar: "اشتراك شهري",
      label_en: "Monthly subscription",
      is_active: true,
      display_order: 0,
    },
    {
      reward_type: "tshirt",
      label_ar: "قميص",
      label_en: "T-shirt",
      is_active: true,
      display_order: 1,
    },
    {
      reward_type: "other",
      label_ar: "مكافأة جديدة",
      label_en: "New reward",
      is_active: true,
      display_order: 2,
    },
  ],
};

function defaultReferralRewards(audience: ReferralAudience) {
  return referralRewardCatalog[audience]
    .filter((reward) => reward.reward_type !== "other")
    .map((reward) => ({ ...reward }));
}

function referralRewardType(
  value: unknown,
  fallback: ReferralRewardType = "tshirt",
): ReferralRewardType {
  return value === "monthly_subscription" ||
    value === "football" ||
    value === "cap" ||
    value === "other" ||
    value === "tshirt"
    ? value
    : fallback;
}

function normalizeReferralRewards(
  value: unknown,
  audience: ReferralAudience,
) {
  const catalog = referralRewardCatalog[audience];
  const allowed = new Set(catalog.map((reward) => reward.reward_type));
  const source = Array.isArray(value) ? value : defaultReferralRewards(audience);
  const rewards = source
    .map((item, index) => {
      const raw =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as AnyRow)
          : {};
      const rewardType = referralRewardType(
        raw.reward_type,
        catalog[index]?.reward_type ?? catalog[0].reward_type,
      );
      if (!allowed.has(rewardType)) return null;
      const fallback =
        catalog.find((reward) => reward.reward_type === rewardType) ??
        catalog[0];
      return {
        reward_type: rewardType,
        label_ar: requiredRewardLabel(raw.label_ar, fallback.label_ar),
        label_en: requiredRewardLabel(raw.label_en, fallback.label_en),
        is_active: raw.is_active !== false,
        display_order: Number.isFinite(Number(raw.display_order))
          ? Number(raw.display_order)
          : index,
      } satisfies ReferralRewardOption;
    })
    .filter((reward): reward is ReferralRewardOption => reward !== null);
  const uniqueRewards = Array.from(
    new Map(rewards.map((reward) => [reward.reward_type, reward])).values(),
  ).sort((left, right) => left.display_order - right.display_order);
  const safeRewards = uniqueRewards.length > 0 ? uniqueRewards : defaultReferralRewards(audience);
  return safeRewards.some((reward) => reward.is_active)
    ? safeRewards
    : safeRewards.map((reward, index) => ({
        ...reward,
        is_active: index === 0,
      }));
}

function requiredRewardLabel(value: unknown, fallback: string) {
  const label = String(value ?? "").trim();
  return label || fallback;
}

function boundedReferralThreshold(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(100000, Math.round(parsed)));
}

async function updateReferralSettings(
  db: DbClient,
  service: ServiceClient,
  actorId: string,
  payload: AnyRow | undefined,
) {
  const buyerRewards = normalizeReferralRewards(payload?.buyer_rewards, "buyer");
  const merchantRewards = normalizeReferralRewards(
    payload?.merchant_rewards,
    "merchant",
  );
  const buyerRewardType = rewardExists(
    buyerRewards,
    referralRewardType(payload?.buyer_reward_type, "tshirt"),
  )
    ? referralRewardType(payload?.buyer_reward_type, "tshirt")
    : buyerRewards[0].reward_type;
  const merchantRewardType = rewardExists(
    merchantRewards,
    referralRewardType(payload?.merchant_reward_type, "monthly_subscription"),
  )
    ? referralRewardType(payload?.merchant_reward_type, "monthly_subscription")
    : merchantRewards[0].reward_type;
  const threshold = boundedReferralThreshold(
    payload?.target_confirmed_registrations,
  );
  const applyExisting = payload?.apply_existing !== false;
  const before = await getBefore(db, "feature_flags", "referrals_enabled");
  const previousConfig =
    before?.configuration &&
    typeof before.configuration === "object" &&
    !Array.isArray(before.configuration)
      ? (before.configuration as AnyRow)
      : {};
  const configuration = {
    ...previousConfig,
    confirmed_referrals_threshold: threshold,
    default_reward_type: buyerRewardType,
    active_buyer_reward_type: buyerRewardType,
    active_merchant_reward_type: merchantRewardType,
    buyer_rewards: buyerRewards,
    merchant_rewards: merchantRewards,
    buyer_banner_image_url:
      String(payload?.buyer_banner_image_url ?? "").trim() || null,
    merchant_banner_image_url:
      String(payload?.merchant_banner_image_url ?? "").trim() || null,
  };

  const { data, error } = await db
    .from("feature_flags")
    .update({ configuration })
    .eq("key", "referrals_enabled")
    .select("key, configuration")
    .single();
  if (error) {
    throw new Error(errorMessage(error));
  }

  let updatedReferrals = 0;
  if (applyExisting) {
    const { data: buyerReferralIds, error: buyerReferralIdError } = await db
      .from("referrals")
      .select("id, users!inner(role)")
      .eq("is_active", true)
      .eq("users.role", "buyer");
    if (buyerReferralIdError) {
      throw new Error(errorMessage(buyerReferralIdError));
    }

    const { data: merchantReferralIds, error: merchantReferralIdError } =
      await db
        .from("referrals")
        .select("id, users!inner(role)")
        .eq("is_active", true)
        .eq("users.role", "merchant");
    if (merchantReferralIdError) {
      throw new Error(errorMessage(merchantReferralIdError));
    }

    const buyerIds = ((buyerReferralIds ?? []) as AnyRow[]).map((row) =>
      String(row.id),
    );
    const merchantIds = ((merchantReferralIds ?? []) as AnyRow[]).map((row) =>
      String(row.id),
    );

    if (buyerIds.length > 0) {
      const { error: buyerReferralError } = await db
        .from("referrals")
        .update({
          reward_type: buyerRewardType,
          target_confirmed_registrations: threshold,
        })
        .in("id", buyerIds);
      if (buyerReferralError) {
        throw new Error(errorMessage(buyerReferralError));
      }
    }

    if (merchantIds.length > 0) {
      const { error: merchantReferralError } = await db
        .from("referrals")
        .update({
          reward_type: merchantRewardType,
          target_confirmed_registrations: threshold,
        })
        .in("id", merchantIds);
      if (merchantReferralError) {
        throw new Error(errorMessage(merchantReferralError));
      }
    }

    updatedReferrals = new Set([
      ...buyerIds,
      ...merchantIds,
    ]).size;
  }

  await writeAudit(
    service,
    actorId,
    "update_referral_settings",
    "feature_flags",
    "referrals_enabled",
    before,
    {
      configuration,
      apply_existing: applyExisting,
      updated_referrals: updatedReferrals,
    },
  );

  return {
    flag: data,
    buyer_reward_type: buyerRewardType,
    merchant_reward_type: merchantRewardType,
    target_confirmed_registrations: threshold,
    updated_referrals: updatedReferrals,
  };
}

function rewardExists(
  rewards: ReferralRewardOption[],
  rewardType: ReferralRewardType,
) {
  return rewards.some(
    (reward) => reward.reward_type === rewardType && reward.is_active,
  );
}

async function ensureStaffProfilesReady(service: ServiceClient) {
  const { error } = await service
    .from("admin_staff_profiles")
    .select("user_id")
    .limit(1);
  if (error) {
    const message = errorMessage(error);
    if (isDbPermissionError(message)) {
      throw new Error("service_role_access_denied");
    }
    if (
      message.toLowerCase().includes("does not exist") ||
      message.includes("42P01")
    ) {
      throw new Error("admin_staff_sql_not_applied");
    }
    throw new Error("admin_staff_sql_not_applied");
  }
}

function staffAccessLevel(value: unknown) {
  const text = String(value ?? "limited_admin");
  if (
    text === "full_admin" ||
    text === "limited_admin" ||
    text === "support_agent"
  ) {
    return text;
  }
  return "limited_admin";
}

function permissionsForAccess(accessLevel: string, rawPermissions: unknown) {
  const { audit: _audit, stores: _stores, ...permissions } = normalizePermissions(rawPermissions);
  if (accessLevel === "full_admin") {
    return { ...permissions, __full_admin: true, __limit_admin: false };
  }
  if (accessLevel === "limited_admin") {
    return { ...permissions, __limit_admin: true };
  }
  return permissions;
}

async function upsertStaffProfile(
  service: ServiceClient,
  userId: string,
  roleLabel: string,
  permissions: Record<string, boolean>,
  isActive = true,
) {
  const { error } = await service.from("admin_staff_profiles").upsert(
    {
      user_id: userId,
      role_label: roleLabel,
      permissions,
      is_active: isActive,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function upsertSupportAgent(
  service: ServiceClient,
  userId: string,
  roleLabel: string,
  permissions: Record<string, boolean>,
  isActive = true,
) {
  const { error } = await service.from("support_agents").upsert(
    {
      user_id: userId,
      is_active: isActive,
      department: roleLabel,
      permissions,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function findAuthUserByEmail(
  service: ServiceClient,
  email: string,
): Promise<AuthUserForAdmin | null> {
  const normalizedEmail = email.trim().toLowerCase();

  // Never use GoTrue listUsers here. Legacy/test Auth rows can make that
  // endpoint fail while an exact database lookup remains safe and reliable.
  const { data: directLookup, error: directLookupError } = await service.rpc(
    "admin_auth_user_lookup_by_email_as",
    { p_email: normalizedEmail },
  );

  if (directLookupError) {
    const message = String(directLookupError.message ?? "").toLowerCase();
    const functionMissing =
      message.includes("admin_auth_user_lookup_by_email_as") ||
      message.includes("pgrst202") ||
      message.includes("schema cache");

    if (functionMissing) {
      throw new Error("staff_auth_lookup_not_ready");
    }
    throw new Error(directLookupError.message);
  }

  if (!directLookup || typeof directLookup !== "object") {
    return null;
  }

  const row = directLookup as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    app_metadata:
      row.app_metadata && typeof row.app_metadata === "object"
        ? (row.app_metadata as Record<string, unknown>)
        : {},
    user_metadata:
      row.user_metadata && typeof row.user_metadata === "object"
        ? (row.user_metadata as Record<string, unknown>)
        : {},
    deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
  };
}

function staffCreationConflict(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("users_mobile_unique") ||
    normalized.includes("mobile") && normalized.includes("duplicate")
  ) {
    return "staff_mobile_already_exists";
  }
  if (
    normalized.includes("users_primary_email_unique") ||
    normalized.includes("users_recovery_email_unique") ||
    normalized.includes("email_exists") ||
    normalized.includes("email address has already been registered")
  ) {
    return "staff_email_already_exists";
  }
  return message;
}

async function createAdminStaff(
  service: ServiceClient,
  actorId: string,
  payload: AnyRow | undefined,
) {
  await ensureStaffProfilesReady(service);

  const fullName = requiredText(payload?.full_name, "full_name");
  const email = requiredText(payload?.email, "email").toLowerCase();
  const mobile = requiredText(payload?.mobile, "mobile");
  const password = requiredText(payload?.password, "password");
  const accessLevel = staffAccessLevel(payload?.access_level);
  const roleLabel = String(payload?.role_label ?? "").trim() || (accessLevel === "support_agent" ? "موظف دعم" : accessLevel === "full_admin" ? "مدير بصلاحيات كاملة" : "مدير");
  const internalRole =
    accessLevel === "support_agent" ? "support_agent" : "admin";
  const permissions = permissionsForAccess(accessLevel, payload?.permissions);

  if (password.length < 8) {
    throw new Error("password_must_be_at_least_8_chars");
  }

  const [authUser, emailLookup, mobileLookup] = await Promise.all([
    findAuthUserByEmail(service, email),
    service
      .from("users")
      .select("id, role, primary_email")
      .ilike("primary_email", email)
      .maybeSingle(),
    service
      .from("users")
      .select("id, role, mobile")
      .eq("mobile", mobile)
      .maybeSingle(),
  ]);

  if (emailLookup.error) throw new Error(emailLookup.error.message);
  if (mobileLookup.error) throw new Error(mobileLookup.error.message);

  const existingPublicByEmail = emailLookup.data as AnyRow | null;
  const existingPublicByMobile = mobileLookup.data as AnyRow | null;

  if (existingPublicByMobile && String(existingPublicByMobile.id) !== String(authUser?.id ?? "")) {
    throw new Error("staff_mobile_already_exists");
  }

  let userId = authUser?.id ?? "";
  let createdAuthUser = false;
  let repairedOrphanAuthUser = false;

  if (authUser) {
    const { data: publicById, error: publicByIdError } = await service
      .from("users")
      .select("id, role, primary_email")
      .eq("id", authUser.id)
      .maybeSingle();
    if (publicByIdError) throw new Error(publicByIdError.message);

    if (publicById) {
      const { data: staffProfile, error: staffProfileError } = await service
        .from("admin_staff_profiles")
        .select("user_id")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (staffProfileError) throw new Error(staffProfileError.message);

      if (staffProfile || ["admin", "support_agent"].includes(String(publicById.role ?? ""))) {
        throw new Error("staff_email_already_exists");
      }
      throw new Error("email_belongs_to_existing_account");
    }

    if (existingPublicByEmail && String(existingPublicByEmail.id) !== authUser.id) {
      throw new Error("email_belongs_to_existing_account");
    }

    const { error: authRepairError } = await service.auth.admin.updateUserById(
      authUser.id,
      {
        password,
        email_confirm: true,
        user_metadata: { ...(authUser.user_metadata ?? {}), full_name: fullName },
        app_metadata: { ...(authUser.app_metadata ?? {}), role: internalRole },
      },
    );
    if (authRepairError) throw new Error(authRepairError.message);
    repairedOrphanAuthUser = true;
  } else {
    if (existingPublicByEmail) {
      throw new Error("email_belongs_to_existing_account");
    }

    const { data: authData, error: authError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { role: internalRole },
      });
    if (authError || !authData.user) {
      const conflict = staffCreationConflict(
        authError?.message ?? "auth_user_not_created",
      );

      // A hidden/orphan Auth record can make createUser return email_exists
      // even after the previous lookup. Resolve it once more and repair it.
      if (conflict === "staff_email_already_exists") {
        const existingAuthUser = await findAuthUserByEmail(service, email);
        if (existingAuthUser) {
          const { data: publicById, error: publicByIdError } = await service
            .from("users")
            .select("id, role, primary_email")
            .eq("id", existingAuthUser.id)
            .maybeSingle();
          if (publicByIdError) throw new Error(publicByIdError.message);

          if (publicById) {
            const { data: existingStaff, error: existingStaffError } =
              await service
                .from("admin_staff_profiles")
                .select("user_id")
                .eq("user_id", existingAuthUser.id)
                .maybeSingle();
            if (existingStaffError) throw new Error(existingStaffError.message);
            if (
              existingStaff ||
              ["admin", "support_agent"].includes(
                String(publicById.role ?? ""),
              )
            ) {
              throw new Error("staff_email_already_exists");
            }
            throw new Error("email_belongs_to_existing_account");
          }

          const { error: authRepairError } =
            await service.auth.admin.updateUserById(existingAuthUser.id, {
              password,
              email_confirm: true,
              user_metadata: {
                ...(existingAuthUser.user_metadata ?? {}),
                full_name: fullName,
              },
              app_metadata: {
                ...(existingAuthUser.app_metadata ?? {}),
                role: internalRole,
              },
            });
          if (authRepairError) throw new Error(authRepairError.message);
          userId = existingAuthUser.id;
          repairedOrphanAuthUser = true;
        } else {
          throw new Error(conflict);
        }
      } else {
        throw new Error(conflict);
      }
    } else {
      userId = authData.user.id;
      createdAuthUser = true;
    }
  }

  try {
    const { error: userError } = await service.from("users").insert({
      id: userId,
      full_name: fullName,
      mobile,
      primary_email: email,
      recovery_email: email,
      role: internalRole,
      preferred_language: "ar",
      theme: "light",
      is_blocked: false,
    });
    if (userError) {
      throw new Error(staffCreationConflict(userError.message));
    }

    await upsertStaffProfile(service, userId, roleLabel, permissions, true);

    if (internalRole === "support_agent") {
      await upsertSupportAgent(service, userId, roleLabel, permissions, true);
    } else {
      await service.from("support_agents").delete().eq("user_id", userId);
    }

    await writeAudit(
      service,
      actorId,
      "create_admin_staff",
      "users",
      userId,
      null,
      {
        id: userId,
        email,
        full_name: fullName,
        role: internalRole,
        role_label: roleLabel,
        access_level: accessLevel,
        permissions,
        repaired_orphan_auth_user: repairedOrphanAuthUser,
      },
    );

    return {
      id: userId,
      email,
      role: internalRole,
      repaired_existing_login: repairedOrphanAuthUser,
    };
  } catch (error) {
    if (createdAuthUser) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(userId);
      if (cleanupError) {
        console.error("Failed to remove incomplete staff auth account:", cleanupError.message);
      }
    }
    throw error;
  }
}

async function updateStaffPermissions(
  service: ServiceClient,
  actorId: string,
  targetUserId: string,
  payload: AnyRow | undefined,
) {
  await ensureStaffProfilesReady(service);

  if (actorId === targetUserId && payload?.access_level !== "full_admin") {
    throw new Error("cannot_limit_your_own_admin_account");
  }

  const accessLevel = staffAccessLevel(payload?.access_level);
  const roleLabel = String(payload?.role_label ?? "").trim() || (accessLevel === "support_agent" ? "موظف دعم" : accessLevel === "full_admin" ? "مدير بصلاحيات كاملة" : "مدير");
  const internalRole =
    accessLevel === "support_agent" ? "support_agent" : "admin";
  const permissions = permissionsForAccess(accessLevel, payload?.permissions);
  const isActive = payload?.is_active !== false;

  const before = await getBefore(service, "users", targetUserId);
  if (!before) throw new Error("user_not_found");
  const authLookup = await service.auth.admin.getUserById(targetUserId);
  if (authLookup.error || !authLookup.data.user) throw new Error("auth_user_missing");
  const { error: authUpdateError } = await service.auth.admin.updateUserById(targetUserId, {
    ban_duration: isActive ? "none" : "876000h",
    app_metadata: { ...(authLookup.data.user.app_metadata ?? {}), role: internalRole },
  });
  if (authUpdateError) throw new Error(authUpdateError.message);

  const { error: userError } = await service
    .from("users")
    .update({ role: internalRole, is_blocked: !isActive })
    .eq("id", targetUserId);
  if (userError) {
    await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: before.is_blocked === true ? "876000h" : "none",
      app_metadata: { ...(authLookup.data.user.app_metadata ?? {}), role: String(before.role ?? internalRole) },
    });
    throw new Error(userError.message);
  }

  await upsertStaffProfile(
    service,
    targetUserId,
    roleLabel,
    permissions,
    isActive,
  );

  if (internalRole === "support_agent") {
    await upsertSupportAgent(
      service,
      targetUserId,
      roleLabel,
      permissions,
      isActive,
    );
  } else {
    await service.from("support_agents").delete().eq("user_id", targetUserId);
  }

  await writeAudit(
    service,
    actorId,
    "update_staff_permissions",
    "users",
    targetUserId,
    before,
    {
      id: targetUserId,
      role: internalRole,
      role_label: roleLabel,
      access_level: accessLevel,
      permissions,
      is_active: isActive,
    },
  );

  return { id: targetUserId, role: internalRole, permissions_updated: true };
}

async function setStaffActive(
  service: ServiceClient,
  actorId: string,
  targetUserId: string,
  enabled: boolean,
) {
  await ensureStaffProfilesReady(service);

  if (actorId === targetUserId && !enabled) {
    throw new Error("cannot_disable_your_own_account");
  }

  const before = await getBefore(service, "users", targetUserId);
  const authLookup = await service.auth.admin.getUserById(targetUserId);
  if (authLookup.error || !authLookup.data.user) {
    throw new Error("auth_user_missing");
  }
  const { error: authUpdateError } = await service.auth.admin.updateUserById(targetUserId, {
    ban_duration: enabled ? "none" : "876000h",
  });
  if (authUpdateError) {
    throw new Error(authUpdateError.message);
  }

  const { error: userError } = await service
    .from("users")
    .update({ is_blocked: !enabled })
    .eq("id", targetUserId);
  if (userError) {
    await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: enabled ? "876000h" : "none",
    });
    throw new Error(userError.message);
  }

  await service
    .from("admin_staff_profiles")
    .update({ is_active: enabled })
    .eq("user_id", targetUserId);
  await service
    .from("support_agents")
    .update({ is_active: enabled })
    .eq("user_id", targetUserId);

  await writeAudit(
    service,
    actorId,
    "set_staff_active",
    "users",
    targetUserId,
    before,
    {
      id: targetUserId,
      is_active: enabled,
    },
  );

  return { id: targetUserId, is_active: enabled };
}

async function removeAdminStaffAccess(
  service: ServiceClient,
  actorId: string,
  targetUserId: string,
) {
  if (actorId === targetUserId) throw new Error("cannot_remove_your_own_admin_access");

  const before = await getBefore(service, "users", targetUserId);
  const { data: merchantRows, error: merchantError } = await service
    .from("merchants")
    .select("id")
    .eq("user_id", targetUserId)
    .limit(1);
  if (merchantError) throw new Error(merchantError.message);
  const fallbackRole = (merchantRows?.length ?? 0) > 0 ? "merchant" : "buyer";

  const { error: staffDeleteError } = await service
    .from("admin_staff_profiles")
    .delete()
    .eq("user_id", targetUserId);
  if (staffDeleteError) throw new Error(staffDeleteError.message);
  const { error: supportDeleteError } = await service
    .from("support_agents")
    .delete()
    .eq("user_id", targetUserId);
  if (supportDeleteError) throw new Error(supportDeleteError.message);

  if (before) {
    const { error: userError } = await service
      .from("users")
      .update({ role: fallbackRole, is_blocked: false, updated_at: new Date().toISOString() })
      .eq("id", targetUserId);
    if (userError) throw new Error(userError.message);
  }

  const authLookup = await service.auth.admin.getUserById(targetUserId);
  if (!authLookup.error && authLookup.data.user) {
    const { error: authError } = await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: "none",
      app_metadata: { ...(authLookup.data.user.app_metadata ?? {}), role: fallbackRole },
    });
    if (authError) throw new Error(authError.message);
  }

  await writeAudit(service, actorId, "remove_admin_staff_access", "users", targetUserId, before, {
    id: targetUserId,
    fallback_role: fallbackRole,
    admin_access_removed: true,
    normal_account_preserved: true,
  });
  return { id: targetUserId, fallback_role: fallbackRole, admin_access_removed: true };
}

async function getAdminProfile(service: ServiceClient, auth: AdminAuth) {
  const { data: userRow, error: userError } = await service
    .from("users")
    .select("id, full_name, primary_email, role, is_blocked")
    .eq("id", auth.userId)
    .single();

  if (userError || !userRow) {
    throw new Error("admin_required");
  }

  const { data: staffProfile } = await service
    .from("admin_staff_profiles")
    .select("role_label, permissions, is_active")
    .eq("user_id", auth.userId)
    .maybeSingle();

  let roleLabel =
    (staffProfile?.role_label as string | null | undefined) ?? null;
  let permissions = auth.permissions;

  if (auth.role === "support_agent") {
    const { data: agentRow } = await service
      .from("support_agents")
      .select("department, permissions, is_active")
      .eq("user_id", auth.userId)
      .maybeSingle();
    roleLabel =
      roleLabel ?? (agentRow?.department as string | null | undefined) ?? null;
    permissions = {
      ...normalizePermissions(agentRow?.permissions),
      ...permissions,
    };
  }

  return {
    id: userRow.id,
    email: userRow.primary_email ?? null,
    full_name: userRow.full_name ?? null,
    role: auth.role,
    role_label: roleLabel,
    is_blocked: Boolean(userRow.is_blocked),
    permissions,
  };
}

export async function GET(req: NextRequest) {
  const service = createServiceClient();
  if (!service) {
    return jsonError("service_role_key_missing", 501);
  }

  const auth = await requireAdmin(req, service);
  if ("error" in auth) {
    return auth.error;
  }

  try {
    const profile = await getAdminProfile(service, auth);
    const url = new URL(req.url);

    if (url.searchParams.get("dashboard") === "1") {
      const dashboardSection = findSection("dashboard");
      if (!sectionIsAllowed(dashboardSection, profile)) return jsonError("permission_denied", 403);
      const [overviewResult, merchantsResult, branchesResult] = await Promise.all([
        service.from("admin_dashboard_overview").select("*").maybeSingle(),
        service.from("admin_active_merchants_readable").select("id,store_name,owner_name,approval_status,approval_status_ar,approval_status_en,created_at").eq("approval_status", "pending").order("created_at", { ascending: false }).limit(6),
        service.from("admin_branches_readable").select("id,branch_name,store_name,city_name,city_name_ar,city_name_en,approval_status,approval_status_ar,approval_status_en,created_at").eq("approval_status", "pending").order("created_at", { ascending: false }).limit(6),
      ]);
      const loadError = overviewResult.error ?? merchantsResult.error ?? branchesResult.error;
      if (loadError) return jsonError(loadError.message, 400);
      return NextResponse.json({ data: { overview: overviewResult.data ?? null, pendingMerchants: merchantsResult.data ?? [], pendingBranches: branchesResult.data ?? [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    if (url.searchParams.get("catalog") === "1") {
      const catalogSection = findSection("store-catalog");
      if (!sectionIsAllowed(catalogSection, profile)) return jsonError("permission_denied", 403);
      const merchantId = url.searchParams.get("merchant_id");
      if (merchantId) {
        const productsResult = await service.from("products")
          .select("id,merchant_id,free_name,price,unit,quantity,brand,size,color,image_url,image_urls,is_active,created_at,updated_at")
          .eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(400);
        if (productsResult.error) return jsonError(productsResult.error.message, 400);
        return NextResponse.json({ data: { products: productsResult.data ?? [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
      }
      const [storesResult, productRowsResult] = await Promise.all([
        service.from("admin_active_merchants_readable").select("id,store_name,owner_name,contact_mobile,category_name_ar,category_name_en,approval_status,approval_status_ar,approval_status_en,store_front_image_url,store_front_bucket,founder_badge_enabled,trusted_badge_enabled,manually_suspended_at,suspension_reason,created_at").order("created_at", { ascending: false }).limit(300),
        service.from("products").select("merchant_id,is_active").limit(10000),
      ]);
      const loadError = storesResult.error ?? productRowsResult.error;
      if (loadError) return jsonError(loadError.message, 400);
      return NextResponse.json({ data: { stores: storesResult.data ?? [], productRows: productRowsResult.data ?? [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const complaintContextId = url.searchParams.get("complaint_context");
    if (complaintContextId) {
      const complaintsSection = findSection("complaints");
      if (!sectionIsAllowed(complaintsSection, profile)) return jsonError("permission_denied", 403);

      const { data: complaint, error: complaintError } = await service
        .from("support_complaints")
        .select("id,admin_action")
        .eq("id", complaintContextId)
        .maybeSingle();
      if (complaintError) return jsonError(complaintError.message, 400);
      if (!complaint) return jsonError("complaint_not_found", 404);

      const adminAction =
        complaint.admin_action && typeof complaint.admin_action === "object" && !Array.isArray(complaint.admin_action)
          ? (complaint.admin_action as AnyRow)
          : {};
      let conversationId = String(adminAction.conversation_id ?? "").trim();

      if (!conversationId) {
        const { data: linkedConversation, error: linkedConversationError } = await service
          .from("chat_conversations")
          .select("id")
          .contains("metadata", { complaint_id: complaintContextId })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (linkedConversationError) return jsonError(linkedConversationError.message, 400);
        conversationId = String(linkedConversation?.id ?? "").trim();
      }

      if (!conversationId) {
        return NextResponse.json(
          { data: { conversation_id: null, messages: [] } },
          { headers: { "Cache-Control": "no-store, max-age=0" } },
        );
      }

      const { data: contextMessages, error: contextMessagesError } = await service
        .from("chat_messages")
        .select("id,conversation_id,sender_type,sender_user_id,body,metadata,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (contextMessagesError) return jsonError(contextMessagesError.message, 400);

      const senderIds = [
        ...new Set(
          (contextMessages ?? [])
            .map((item: AnyRow) => String(item.sender_user_id ?? "").trim())
            .filter(Boolean),
        ),
      ];
      const senderNames = new Map<string, string>();
      if (senderIds.length > 0) {
        const { data: senders, error: sendersError } = await service
          .from("users")
          .select("id,full_name")
          .in("id", senderIds);
        if (sendersError) return jsonError(sendersError.message, 400);
        for (const sender of senders ?? []) {
          senderNames.set(String(sender.id), String(sender.full_name ?? ""));
        }
      }

      const messages = (contextMessages ?? []).map((item: AnyRow) => ({
        ...item,
        sender_type: String(item.sender_type ?? ""),
        sender_name: item.sender_user_id
          ? senderNames.get(String(item.sender_user_id)) ?? null
          : null,
      }));

      return NextResponse.json(
        { data: { conversation_id: conversationId, messages } },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    if (url.searchParams.get("complaints") === "1") {
      const complaintsSection = findSection("complaints");
      if (!sectionIsAllowed(complaintsSection, profile)) return jsonError("permission_denied", 403);
      const [complaintsResult, messagesResult, agentsResult, labelsResult] = await Promise.all([
        service.from("admin_support_complaints_readable").select("*").order("updated_at", { ascending: false }).limit(300),
        service.from("admin_support_complaint_messages_readable").select("*").order("created_at", { ascending: true }).limit(1500),
        service.from("admin_staff_readable").select("id,full_name,primary_email,internal_role,staff_is_active,is_blocked,is_deleted").eq("internal_role", "support_agent").eq("staff_is_active", true).eq("is_blocked", false),
        service.from("admin_support_labels_readable").select("*").eq("is_active", true).order("name_ar"),
      ]);
      const loadError = complaintsResult.error ?? messagesResult.error ?? agentsResult.error ?? labelsResult.error;
      if (loadError) return jsonError(loadError.message, 400);
      return NextResponse.json({ data: { complaints: complaintsResult.data ?? [], messages: messagesResult.data ?? [], agents: agentsResult.data ?? [], labels: labelsResult.data ?? [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    if (url.searchParams.get("support") === "1") {
      const supportSection = findSection("support");
      if (!sectionIsAllowed(supportSection, profile)) return jsonError("permission_denied", 403);
      const [conversationsResult, labelsResult, agentsResult, merchantsResult, ordersResult] = await Promise.all([
        service.from("admin_support_conversations_readable").select("*").in("status", ["bot", "transferred"]).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
        service.from("admin_support_labels_readable").select("*").eq("is_active", true).order("name_ar"),
        service.from("admin_staff_readable").select("id,full_name,primary_email,internal_role,staff_is_active,is_blocked,is_deleted").eq("internal_role", "support_agent").eq("staff_is_active", true).eq("is_blocked", false),
        service.from("admin_active_merchants_readable").select("id,store_name,account_email,approval_status_ar,approval_status_en").order("store_name").limit(300),
        service.from("admin_orders_readable").select("id,buyer_name,store_name,status_ar,status_en,created_at").order("created_at", { ascending: false }).limit(300),
      ]);
      const loadError = conversationsResult.error ?? labelsResult.error ?? agentsResult.error ?? merchantsResult.error ?? ordersResult.error;
      if (loadError) return jsonError(loadError.message, 400);
      return NextResponse.json({ data: { conversations: conversationsResult.data ?? [], labels: labelsResult.data ?? [], agents: agentsResult.data ?? [], merchants: merchantsResult.data ?? [], orders: ordersResult.data ?? [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const shippingCompanyId = url.searchParams.get("shipping_company_id");
    if (shippingCompanyId) {
      const shippingSection = findSection("shipping-companies");
      if (!sectionIsAllowed(shippingSection, profile)) {
        return jsonError("permission_denied", 403);
      }

      const [companyResult, batchesResult] = await Promise.all([
        service
          .from("admin_merchant_shipping_companies_readable")
          .select("*")
          .eq("id", shippingCompanyId)
          .maybeSingle(),
        service
          .from("merchant_shipping_batches")
          .select("id,merchant_id,shipping_company_id,min_weight_kg,max_weight_kg,price,created_at,updated_at")
          .eq("shipping_company_id", shippingCompanyId)
          .order("min_weight_kg", { ascending: true }),
      ]);
      if (companyResult.error) return jsonError(companyResult.error.message, 400);
      if (!companyResult.data) return jsonError("shipping_company_not_found", 404);
      if (batchesResult.error) return jsonError(batchesResult.error.message, 400);

      const baseCompany = await service
        .from("merchant_shipping_companies")
        .select("id,merchant_id,name,is_active,created_at,updated_at")
        .eq("id", shippingCompanyId)
        .maybeSingle();
      if (baseCompany.error) return jsonError(baseCompany.error.message, 400);

      return NextResponse.json(
        {
          data: {
            company: { ...companyResult.data, ...(baseCompany.data ?? {}) },
            batches: batchesResult.data ?? [],
          },
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const sectionId = url.searchParams.get("section");
    if (sectionId) {
      const section = findSection(sectionId);
      if (section.id !== sectionId || !section.source || !sectionIsAllowed(section, profile)) {
        return jsonError("permission_denied", 403);
      }

      let request = service
        .from(section.source)
        .select("*")
        .limit(section.id === "cities" ? 1000 : 300);

      if (section.orderBy) {
        const ascending = [
          "display_order",
          "country_ar",
          "governorate_ar",
          "key",
        ].includes(section.orderBy);
        request = request.order(section.orderBy, { ascending });
      }

      const { data, error } = await request;
      if (error) {
        return jsonError(error.message, 400);
      }

      return NextResponse.json(
        { data: data ?? [] },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    if (url.searchParams.get("reports") === "1") {
      const reportsSection = findSection("reports");
      if (!sectionIsAllowed(reportsSection, profile)) {
        return jsonError("permission_denied", 403);
      }

      const results: Array<{ key: string; rows: AnyRow[]; error?: string }> = [];
      const reportClient = createUserScopedClient(accessTokenFromRequest(req) ?? "");
      for (const report of adminReportDefinitions) {
        const { data, error } = await reportClient.rpc(report.key, report.args);
        let reportRows = Array.isArray(data)
          ? (((data ?? []) as unknown) as AnyRow[])
          : data
            ? [((data as unknown) as AnyRow)]
            : [];
        let reportError = error?.message;

        if (reportRows.length === 0) {
          const fallbackRows = await fallbackAdminReport(service, report.key);
          if (fallbackRows.length > 0) {
            reportRows = fallbackRows;
            reportError = undefined;
          }
        }

        results.push({
          key: report.key,
          rows: reportRows,
          error: reportError,
        });
      }

      return NextResponse.json(
        { data: results },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    return NextResponse.json(
      { data: profile },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (profileError) {
    return jsonError(
      profileError instanceof Error
        ? profileError.message
        : String(profileError),
      403,
    );
  }
}

export async function POST(req: NextRequest) {
  const service = createServiceClient();
  if (!service) {
    return jsonError("service_role_key_missing", 501);
  }

  const auth = await requireAdmin(req, service);
  if ("error" in auth) {
    return auth.error;
  }

  const token = accessTokenFromRequest(req);
  if (!token) {
    return jsonError("missing_access_token", 401);
  }
  const adminDb = createUserScopedClient(token);

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    table?: string;
    id?: string;
    values?: AnyRow;
    payload?: AnyRow;
  };

  const action = body.action;
  const id = body.id;
  const now = new Date().toISOString();

  if (!action) {
    return jsonError("missing_action");
  }

  if (actionRequiresServiceRole(action)) {
    const serviceKeyProblem = serviceRoleKeyProblem();
    if (serviceKeyProblem) {
      return jsonError(serviceKeyProblem, 501);
    }
  }

  try {
    assertActionAllowed(auth, action, body.table);
  } catch (permissionError) {
    return jsonError(
      permissionError instanceof Error
        ? permissionError.message
        : String(permissionError),
      403,
    );
  }

  if (action === "signed_admin_file") {
    try {
      const url = await createAdminFileLink(service, body.payload?.bucket, body.payload?.path, body.payload?.fallback_bucket);
      return NextResponse.json({ data: { url } });
    } catch (fileError) {
      return jsonError(serviceActionErrorMessage(fileError), 400);
    }
  }

  if (action === "create_admin_staff") {
    try {
      const result = await createAdminStaff(service, auth.userId, body.payload);
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(serviceActionErrorMessage(staffError), 400);
    }
  }

  if (action === "update_staff_permissions") {
    try {
      const userId = requiredText(id, "user_id");
      const result = await updateStaffPermissions(
        service,
        auth.userId,
        userId,
        body.payload,
      );
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(serviceActionErrorMessage(staffError), 400);
    }
  }

  if (action === "set_staff_active") {
    try {
      const userId = requiredText(id, "user_id");
      const result = await setStaffActive(
        service,
        auth.userId,
        userId,
        body.payload?.enabled === true,
      );
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(serviceActionErrorMessage(staffError), 400);
    }
  }

  if (action === "remove_admin_staff_access") {
    try {
      const userId = requiredText(id, "user_id");
      const result = await removeAdminStaffAccess(service, auth.userId, userId);
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(serviceActionErrorMessage(staffError), 400);
    }
  }

  if (action === "list_notification_templates") {
    try {
      return NextResponse.json({ data: await listNotificationTemplates(service) });
    } catch (templateError) {
      return jsonError(serviceActionErrorMessage(templateError), 400);
    }
  }

  if (action === "save_notification_template") {
    try {
      return NextResponse.json({ data: await saveNotificationTemplate(service, auth.userId, body.payload) });
    } catch (templateError) {
      return jsonError(serviceActionErrorMessage(templateError), 400);
    }
  }

  if (action === "delete_notification_template") {
    try {
      const templateId = requiredText(id, "template_id");
      return NextResponse.json({ data: await deleteNotificationTemplate(service, auth.userId, templateId) });
    } catch (templateError) {
      return jsonError(serviceActionErrorMessage(templateError), 400);
    }
  }

  if (action === "send_admin_notification") {
    try {
      const result = await sendAdminNotification(
        adminDb,
        service,
        auth.userId,
        body.payload,
      );
      return NextResponse.json({ data: result });
    } catch (sendError) {
      return jsonError(adminDbActionErrorMessage(sendError), 400);
    }
  }

  if (action === "update_referral_settings") {
    try {
      const result = await updateReferralSettings(
        adminDb,
        service,
        auth.userId,
        body.payload,
      );
      return NextResponse.json({ data: result });
    } catch (referralError) {
      return jsonError(adminDbActionErrorMessage(referralError), 400);
    }
  }

  if (action === "upsert_support_label") {
    try {
      const { data, error } = await service.rpc("admin_upsert_support_label_as", {
        p_actor_id: auth.userId,
        p_label_id: body.payload?.label_id ?? null,
        p_name_ar: body.payload?.name_ar ?? null,
        p_name_en: body.payload?.name_en ?? null,
        p_color_hex: body.payload?.color_hex ?? "#12B76A",
        p_is_active: body.payload?.is_active !== false,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "set_support_labels") {
    try {
      const conversationId = requiredText(id, "conversation_id");
      const labelIds = Array.isArray(body.payload?.label_ids) ? body.payload?.label_ids.map(String) : [];
      const { error } = await service.rpc("admin_set_support_conversation_labels_as", { p_actor_id: auth.userId, p_conversation_id: conversationId, p_label_ids: labelIds });
      if (error) throw error;
      return NextResponse.json({ data: { conversation_id: conversationId, label_ids: labelIds } });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "convert_support_to_complaint") {
    try {
      const conversationId = requiredText(id, "conversation_id");
      const { data, error } = await service.rpc("admin_convert_support_conversation_to_complaint_as", {
        p_actor_id: auth.userId, p_conversation_id: conversationId,
        p_target_type: body.payload?.target_type ?? "other", p_merchant_id: body.payload?.merchant_id ?? null,
        p_order_id: body.payload?.order_id ?? null, p_priority: body.payload?.priority ?? "normal",
      });
      if (error) throw error;
      return NextResponse.json({ data: { complaint_id: data } });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "assign_support_conversation_admin") {
    try {
      const conversationId = requiredText(id, "conversation_id");
      const agentId = String(body.payload?.agent_id ?? auth.userId);
      const { data, error } = await service.from("chat_conversations").update({ assigned_support_agent_id: agentId, status: "transferred", transferred_at: now, updated_at: now }).eq("id", conversationId).select("*").single();
      if (error) throw error;
      await service.from("support_agents").update({ last_assigned_at: now, updated_at: now }).eq("user_id", agentId);
      return NextResponse.json({ data });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "set_merchant_badges") {
    try {
      const merchantId = requiredText(id, "merchant_id");
      const { data, error } = await service.rpc("admin_set_merchant_badges_as", {
        p_actor_id: auth.userId, p_merchant_id: merchantId,
        p_founder_badge: body.payload?.founder_badge ?? null, p_trusted_badge: body.payload?.trusted_badge ?? null,
        p_reason: body.payload?.reason ?? null, p_is_test_account: body.payload?.is_test_account ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "set_merchant_trial") {
    try {
      const merchantId = requiredText(id, "merchant_id");
      const { data, error } = await service.rpc("admin_set_merchant_trial_as", {
        p_actor_id: auth.userId, p_merchant_id: merchantId, p_trial_ends_at: body.payload?.trial_ends_at ?? null,
        p_stop_trial: body.payload?.stop_trial === true, p_reason: body.payload?.reason ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "set_support_complaint_labels") {
    try {
      const complaintId = requiredText(id, "complaint_id");
      const labelIds = Array.isArray(body.payload?.label_ids)
        ? body.payload.label_ids.map((value) => String(value)).filter(Boolean)
        : [];
      const { error } = await service.rpc("admin_set_support_complaint_labels_as", {
        p_actor_id: auth.userId,
        p_complaint_id: complaintId,
        p_label_ids: labelIds,
      });
      if (error) throw error;
      return NextResponse.json({ data: { id: complaintId, label_ids: labelIds } });
    } catch (labelError) {
      return jsonError(serviceActionErrorMessage(labelError), 400);
    }
  }

  if (action === "set_complaint_status_admin") {
    try {
      const complaintId = requiredText(id, "complaint_id");
      const complaintStatus = requiredText(body.payload?.status, "complaint_status");
      const { data, error } = await service.rpc("admin_set_support_complaint_status_as", {
        p_actor_id: auth.userId,
        p_complaint_id: complaintId,
        p_status: complaintStatus,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    } catch (statusError) {
      return jsonError(serviceActionErrorMessage(statusError), 400);
    }
  }

  if (action === "assign_complaint_admin") {
    try {
      const complaintId = requiredText(id, "complaint_id");
      const agentId = String(body.payload?.agent_id ?? auth.userId);
      const before = await getBefore(service, "support_complaints", complaintId);
      if (!before) throw new Error("complaint_not_found");
      if (["resolved", "closed"].includes(String(before.status))) throw new Error("complaint_closed");
      const { data, error } = await service.from("support_complaints").update({ assigned_support_agent_id: agentId, status: "in_support", updated_at: now }).eq("id", complaintId).select("*").single();
      if (error) throw error;
      await service.from("support_agents").update({ last_assigned_at: now, updated_at: now }).eq("user_id", agentId);
      await writeAudit(service, auth.userId, "assign_support_complaint", "support_complaints", complaintId, before, data as AnyRow);
      return NextResponse.json({ data });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "send_complaint_message_admin") {
    try {
      const complaintId = requiredText(id, "complaint_id");
      const message = requiredText(body.payload?.body, "message_body");
      if (message.length < 1) throw new Error("message_body_required");
      const { data: complaint, error: complaintError } = await service.from("support_complaints").select("id,status").eq("id", complaintId).single();
      if (complaintError || !complaint) throw complaintError ?? new Error("complaint_not_found");
      if (["resolved", "closed"].includes(String(complaint.status))) throw new Error("complaint_closed");
      const { data, error } = await service.from("support_complaint_messages").insert({ complaint_id: complaintId, sender_type: "admin", sender_user_id: auth.userId, body: message.trim(), metadata: { source: "admin_web" } }).select("*").single();
      if (error) throw error;
      await service.from("support_complaints").update({ updated_at: now }).eq("id", complaintId);
      return NextResponse.json({ data });
    } catch (specialError) { return jsonError(serviceActionErrorMessage(specialError), 400); }
  }

  if (action === "resolve_complaint_admin") {
    try {
      const complaintId = requiredText(id, "complaint_id");
      const resolution = requiredText(body.payload?.resolution, "resolution");
      if (resolution.length < 3) throw new Error("resolution_required");
      const { data: complaintBeforeResolve, error: complaintBeforeResolveError } = await service
        .from("support_complaints")
        .select("admin_action")
        .eq("id", complaintId)
        .single();
      if (complaintBeforeResolveError) throw complaintBeforeResolveError;

      const existingAdminAction =
        complaintBeforeResolve.admin_action &&
        typeof complaintBeforeResolve.admin_action === "object" &&
        !Array.isArray(complaintBeforeResolve.admin_action)
          ? (complaintBeforeResolve.admin_action as AnyRow)
          : {};
      const requestedAdminAction =
        body.payload?.admin_action &&
        typeof body.payload.admin_action === "object" &&
        !Array.isArray(body.payload.admin_action)
          ? (body.payload.admin_action as AnyRow)
          : {};

      const { data, error } = await service.rpc("admin_resolve_support_complaint_as", {
        p_actor_id: auth.userId,
        p_complaint_id: complaintId,
        p_resolution: resolution.trim(),
        p_admin_action: {
          ...existingAdminAction,
          ...requestedAdminAction,
          source: String(requestedAdminAction.source ?? "admin_web"),
        },
      });
      if (error) throw error;
      return NextResponse.json({ data });
    } catch (specialError) {
      return jsonError(serviceActionErrorMessage(specialError), 400);
    }
  }

  if (action === "delete_user_account") {
    try {
      const userId = requiredText(id, "user_id");
      const result = await adminDeleteUserAccount(
        service,
        auth.userId,
        userId,
      );
      return NextResponse.json({ data: result });
    } catch (deleteError) {
      return jsonError(serviceActionErrorMessage(deleteError), 400);
    }
  }

  if (action === "set_user_password") {
    const userId = requiredText(id, "user_id");
    const password = requiredText(body.payload?.password, "password");
    if (password.length < 8) {
      return jsonError("password_must_be_at_least_8_chars", 400);
    }

    const before = await getBefore(service, "users", userId);
    const authLookup = await service.auth.admin.getUserById(userId);
    if (authLookup.error || !authLookup.data.user) {
      return jsonError("auth_user_missing", 400);
    }
    const { error } = await service.auth.admin.updateUserById(userId, { password });
    if (error) {
      return jsonError(serviceActionErrorMessage(error), 400);
    }

    await writeAudit(
      service,
      auth.userId,
      action,
      "auth.users",
      userId,
      before,
      {
        password_updated: true,
        updated_at: new Date().toISOString(),
      },
    );
    return NextResponse.json({ data: { id: userId, password_updated: true } });
  }

  let table = body.table ?? "";
  let targetId = id ?? "";
  let values: AnyRow = {};

  if (action === "approve_merchant" || action === "reject_merchant") {
    if (!id) return jsonError("missing_id");
    table = "merchants";
    targetId = id;
    values =
      action === "approve_merchant"
        ? {
            approval_status: "approved",
            rejection_reason: null,
            last_admin_contact_at: now,
          }
        : {
            approval_status: "rejected",
            rejection_reason: String(body.payload?.reason ?? "").trim(),
            last_admin_contact_at: now,
          };
    if (action === "reject_merchant" && !values.rejection_reason) {
      return jsonError("rejection_reason_required");
    }
  } else if (action === "approve_branch" || action === "reject_branch") {
    if (!id) return jsonError("missing_id");
    table = "branches";
    targetId = id;
    values =
      action === "approve_branch"
        ? { approval_status: "approved", rejection_reason: null }
        : {
            approval_status: "rejected",
            rejection_reason: String(body.payload?.reason ?? "").trim(),
          };
    if (action === "reject_branch" && !values.rejection_reason) {
      return jsonError("rejection_reason_required");
    }
  } else if (action === "block_user" || action === "unblock_user") {
    if (!id) return jsonError("missing_id");
    table = "users";
    targetId = id;
    values = { is_blocked: action === "block_user" };
    const authLookup = await service.auth.admin.getUserById(id);
    if (!authLookup.error && authLookup.data.user) {
      const { error: authUpdateError } = await service.auth.admin.updateUserById(id, { ban_duration: action === "block_user" ? "876000h" : "none" });
      if (authUpdateError) return jsonError(serviceActionErrorMessage(authUpdateError), 400);
    }
  } else if (action === "deactivate_product") {
    if (!id) return jsonError("missing_id");
    table = "products";
    targetId = id;
    values = { is_active: false };
  } else if (action === "activate_product") {
    if (!id) return jsonError("missing_id");
    table = "products";
    targetId = id;
    values = { is_active: true };
  } else if (action === "suspend_merchant" || action === "restore_merchant") {
    if (!id) return jsonError("missing_id");
    const suspensionReason = String(
      body.payload?.reason ??
        (action === "suspend_merchant" ? "مخالفة واضحة" : "إعادة تشغيل المتجر من لوحة الإدارة"),
    ).trim();
    if (suspensionReason.length < 3) {
      return jsonError("reason_required");
    }
    table = "merchants";
    targetId = id;
    values = { suspension_reason: suspensionReason };
  } else if (action === "delete_product") {
    if (!id) return jsonError("missing_id");
    table = "products";
    targetId = id;
  } else if (action === "delete_merchant") {
    if (!id) return jsonError("missing_id");
    table = "merchants";
    targetId = id;
  } else if (action === "toggle_active") {
    if (!body.table || !id) return jsonError("missing_table_or_id");
    table = body.table;
    targetId = id;
    const toggleField = toggleFieldByTable[table];
    if (!toggleField) return jsonError("table_not_toggleable");
    values = { [toggleField]: Boolean(body.payload?.enabled) };
  } else if (action === "delete_row") {
    if (!body.table || !id) return jsonError("missing_delete_payload");
    table = body.table;
    targetId = id;
  } else if (action === "update_row") {
    if (!body.table || !id || !body.values)
      return jsonError("missing_update_payload");
    table = body.table;
    targetId = id;
    values = pickAllowed(table, body.values);
  } else if (action === "create_row") {
    if (!body.table || !body.values) return jsonError("missing_create_payload");
    table = body.table;
    values = pickAllowed(table, body.values);
  } else {
    return jsonError("unknown_action");
  }

  if (!editableFields[table]) {
    return jsonError("table_not_allowed", 403);
  }

  if ((action === "create_row" || action === "update_row") && table === "cities") {
    const locationKind = String(
      body.payload?.place_kind ??
        (String(values.governorate_ar ?? "") === "__country__"
          ? "country"
          : String(values.name_ar ?? "") === String(values.governorate_ar ?? "")
            ? "governorate"
            : "city"),
    );
    const { data, error } = await service.rpc("admin_upsert_city_location_as", {
      p_actor_id: auth.userId,
      p_id: action === "update_row" ? targetId : null,
      p_place_kind: locationKind,
      p_country_ar: values.country_ar ?? null,
      p_country_en: values.country_en ?? null,
      p_name_ar: values.name_ar ?? null,
      p_name_en: values.name_en ?? null,
      p_governorate_ar: values.governorate_ar ?? null,
      p_governorate_en: values.governorate_en ?? null,
      p_currency_code: values.currency_code ?? null,
      p_currency_name_ar: values.currency_name_ar ?? null,
      p_currency_name_en: values.currency_name_en ?? null,
      p_display_order: Number.isFinite(Number(values.display_order)) ? Math.max(0, Number(values.display_order)) : 0,
      p_is_active: values.is_active ?? true,
    });
    if (error) return jsonError(adminDbActionErrorMessage(error), 400);
    return NextResponse.json({ data });
  }

  if (action === "delete_product") {
    const before = await getBefore(service, table, targetId);
    const { error } = await service
      .from(table)
      .delete()
      .eq(idColumnByTable[table] ?? "id", targetId);
    if (error) {
      return jsonError(adminDbActionErrorMessage(error), 400);
    }
    await removeProductImages(adminDb, before);
    await writeAudit(
      service,
      auth.userId,
      action,
      table,
      targetId,
      before,
      null,
    );
    return NextResponse.json({ data: { id: targetId, deleted: true } });
  }

  if (action === "delete_merchant") {
    const before = await getBefore(service, table, targetId);
    if (!before) return jsonError("merchant_not_found", 404);
    const { data: products } = await adminDb
      .from("products")
      .select("*")
      .eq("merchant_id", targetId);
    const { data, error } = await service.rpc("admin_delete_merchant_as", {
      p_actor_id: auth.userId,
      p_merchant_id: targetId,
      p_reason: String(body.payload?.reason ?? "Deleted from Saarly Admin Web"),
    });
    if (error) {
      return jsonError(adminDbActionErrorMessage(error), 400);
    }
    const deletionResult = (data ?? { id: targetId, deleted: true }) as AnyRow;
    if (deletionResult.archived !== true) {
      await Promise.all(
        ((products ?? []) as AnyRow[]).map((product) =>
          removeProductImages(adminDb, product),
        ),
      );
      await removeMerchantImages(adminDb, before);
    }
    return NextResponse.json({ data: deletionResult });
  }

  if (action === "delete_row") {
    const before = await getBefore(service, table, targetId);
    const { error } = await service
      .from(table)
      .delete()
      .eq(idColumnByTable[table] ?? "id", targetId);
    if (error) {
      return jsonError(adminDbActionErrorMessage(error), 400);
    }
    await writeAudit(
      service,
      auth.userId,
      action,
      table,
      targetId,
      before,
      null,
    );
    return NextResponse.json({ data: { id: targetId, deleted: true } });
  }

  if (Object.keys(values).length === 0) {
    return jsonError("no_allowed_fields");
  }

  if (action === "create_row") {
    const { data, error } = await service
      .from(table)
      .insert(values)
      .select("*")
      .maybeSingle();
    if (error) {
      return jsonError(adminDbActionErrorMessage(error), 400);
    }
    const created = (data ?? values) as AnyRow;
    const idColumn = idColumnByTable[table] ?? "id";
    const createdId = String(created[idColumn] ?? created.id ?? "created");
    await writeAudit(
      service,
      auth.userId,
      action,
      table,
      createdId,
      null,
      created,
    );
    return NextResponse.json({ data: created });
  }

  const before = await getBefore(service, table, targetId);
  if (action === "suspend_merchant" || action === "restore_merchant") {
    const suspensionReason = String(values.suspension_reason ?? "").trim();
    const { data, error } = await service.rpc("admin_set_merchant_suspension_as", {
      p_actor_id: auth.userId,
      p_merchant_id: targetId,
      p_suspended: action === "suspend_merchant",
      p_reason: suspensionReason,
    });
    if (error) return jsonError(adminDbActionErrorMessage(error), 400);
    return NextResponse.json({ data: (data ?? before ?? {}) as AnyRow });
  }

  if (action === "approve_merchant" || action === "reject_merchant") {
    const approved = action === "approve_merchant";
    const reason = approved ? null : String(values.rejection_reason ?? "").trim();
    const { data, error } = await service.rpc("admin_review_merchant_registration_as", {
      p_actor_id: auth.userId,
      p_merchant_id: targetId,
      p_approved: approved,
      p_rejection_reason: reason,
    });
    if (error) return jsonError(adminDbActionErrorMessage(error), 400);

    const updated = (data ?? before ?? {}) as AnyRow;
    const eventWarnings: string[] = [];
    try {
      const decisionResult = await dispatchMerchantDecisionEvents(service, {
        merchantId: targetId,
        approved,
        reason: String(updated.rejection_reason ?? reason ?? ""),
        decidedAt: now,
      });
      eventWarnings.push(...decisionResult.warnings);
    } catch (eventError) {
      const warning =
        eventError instanceof Error
          ? eventError.message
          : "merchant_decision_event_failed";
      eventWarnings.push(warning);
      console.error(
        "Merchant decision event failed after the review was saved:",
        eventError,
      );
    }
    if (eventWarnings.length > 0) {
      console.warn("Merchant decision event warnings:", eventWarnings);
    }
    return NextResponse.json({ data: updated, warnings: eventWarnings });
  }

  if (action === "approve_branch" || action === "reject_branch") {
    const approved = action === "approve_branch";
    const reason = approved ? null : String(values.rejection_reason ?? "").trim();
    const { data, error } = await service.rpc("admin_review_branch_as", {
      p_actor_id: auth.userId,
      p_branch_id: targetId,
      p_approved: approved,
      p_rejection_reason: reason,
    });
    if (error) return jsonError(adminDbActionErrorMessage(error), 400);

    const updated = (data ?? before ?? {}) as AnyRow;
    const eventWarnings: string[] = [];
    try {
      const decisionResult = await dispatchBranchDecisionEvents(service, {
        branchId: targetId,
        approved,
        reason: String(updated.rejection_reason ?? reason ?? ""),
        decidedAt: now,
      });
      eventWarnings.push(...decisionResult.warnings);
    } catch (eventError) {
      const warning =
        eventError instanceof Error
          ? eventError.message
          : "branch_decision_event_failed";
      eventWarnings.push(warning);
      console.error(
        "Branch decision event failed after the review was saved:",
        eventError,
      );
    }
    if (eventWarnings.length > 0) {
      console.warn("Branch decision event warnings:", eventWarnings);
    }
    return NextResponse.json({ data: updated, warnings: eventWarnings });
  }

  const { data, error } = await service
    .from(table)
    .update(values)
    .eq(idColumnByTable[table] ?? "id", targetId)
    .select("*")
    .maybeSingle();

  if (error) {
    return jsonError(adminDbActionErrorMessage(error), 400);
  }

  const updated = (data ?? {
    ...(before ?? {}),
    ...values,
    [idColumnByTable[table] ?? "id"]: targetId,
  }) as AnyRow;
  await writeAudit(
    service,
    auth.userId,
    action,
    table,
    targetId,
    before,
    updated,
  );

  return NextResponse.json({ data: updated });
}
