import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  createUserScopedClient,
} from "@/lib/supabase/server";

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
};

const fullAdminPermissions = {
  __full_admin: true,
  __limit_admin: false,
} satisfies Record<string, boolean>;

const editableFields: Record<string, string[]> = {
  users: ["role", "is_blocked"],
  merchants: [
    "approval_status",
    "rejection_reason",
    "last_admin_contact_at",
    "billing_preference",
  ],
  branches: ["approval_status", "rejection_reason"],
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
    "image_url",
    "target_url",
    "placement",
    "target_country_ar",
    "target_governorate_ar",
    "target_city_ar",
    "sort_order",
    "starts_at",
    "ends_at",
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
    "set_user_password",
    "delete_user_account",
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
    action === "set_staff_active"
  )
    return "staff";
  if (action === "send_admin_notification") return "broadcast";
  if (action === "update_referral_settings") return "referrals";
  if (action === "set_user_password" || action === "delete_user_account")
    return "users";
  if (
    action === "approve_merchant" ||
    action === "reject_merchant" ||
    action === "suspend_merchant" ||
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
  } else if (audience === "staff") {
    query = query.in("role", ["admin", "support_agent"]);
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
  if (!target.hasTarget || audience === "specific" || audience === "staff") {
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

  const titleAr = requiredText(payload?.title_ar, "title_ar");
  const titleEn = String(payload?.title_en ?? titleAr).trim() || titleAr;
  const bodyAr = requiredText(payload?.body_ar, "body_ar");
  const bodyEn = String(payload?.body_en ?? bodyAr).trim() || bodyAr;
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

type ReferralRewardType = "tshirt" | "monthly_subscription" | "football" | "cap";
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
      label_ar: "تيشرت",
      label_en: "T-shirt",
      is_active: true,
      display_order: 0,
    },
    {
      reward_type: "football",
      label_ar: "كورة قدم",
      label_en: "Football",
      is_active: true,
      display_order: 1,
    },
    {
      reward_type: "cap",
      label_ar: "كاب",
      label_en: "Cap",
      is_active: true,
      display_order: 2,
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
      label_ar: "تيشرت",
      label_en: "T-shirt",
      is_active: true,
      display_order: 1,
    },
  ],
};

function referralRewardType(
  value: unknown,
  fallback: ReferralRewardType = "tshirt",
): ReferralRewardType {
  return value === "monthly_subscription" ||
    value === "football" ||
    value === "cap" ||
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
  const source = Array.isArray(value) ? value : catalog;
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
  const safeRewards = uniqueRewards.length > 0 ? uniqueRewards : catalog;
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
  const permissions = normalizePermissions(rawPermissions);
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
  const roleLabel = requiredText(payload?.role_label, "role_label");
  const accessLevel = staffAccessLevel(payload?.access_level);
  const internalRole =
    accessLevel === "support_agent" ? "support_agent" : "admin";
  const permissions = permissionsForAccess(accessLevel, payload?.permissions);

  if (password.length < 8) {
    throw new Error("password_must_be_at_least_8_chars");
  }

  const { data: authData, error: authError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "auth_user_not_created");
  }

  const userId = authData.user.id;
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
      throw new Error(userError.message);
    }

    await upsertStaffProfile(service, userId, roleLabel, permissions, true);

    if (internalRole === "support_agent") {
      await upsertSupportAgent(service, userId, roleLabel, permissions, true);
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
      },
    );

    return { id: userId, email, role: internalRole };
  } catch (error) {
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
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

  const roleLabel = requiredText(payload?.role_label, "role_label");
  const accessLevel = staffAccessLevel(payload?.access_level);
  const internalRole =
    accessLevel === "support_agent" ? "support_agent" : "admin";
  const permissions = permissionsForAccess(accessLevel, payload?.permissions);
  const isActive = payload?.is_active !== false;

  const before = await getBefore(service, "users", targetUserId);
  const { error: userError } = await service
    .from("users")
    .update({ role: internalRole, is_blocked: !isActive })
    .eq("id", targetUserId);
  if (userError) {
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
  const { error: userError } = await service
    .from("users")
    .update({ is_blocked: !enabled })
    .eq("id", targetUserId);
  if (userError) {
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
    const { error } = await service.auth.admin.updateUserById(userId, {
      password,
    });
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
  } else if (action === "suspend_merchant") {
    if (!id) return jsonError("missing_id");
    table = "merchants";
    targetId = id;
    values = {
      approval_status: "rejected",
      rejection_reason: String(body.payload?.reason ?? "محتوى مخالف").trim(),
      last_admin_contact_at: now,
    };
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

  if (action === "delete_product") {
    const before = await getBefore(adminDb, table, targetId);
    const { error } = await adminDb
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
    const before = await getBefore(adminDb, table, targetId);
    const { data: products } = await adminDb
      .from("products")
      .select("*")
      .eq("merchant_id", targetId);
    const { error } = await adminDb
      .from(table)
      .delete()
      .eq(idColumnByTable[table] ?? "id", targetId);
    if (error) {
      return jsonError(adminDbActionErrorMessage(error), 400);
    }
    await Promise.all(
      ((products ?? []) as AnyRow[]).map((product) =>
        removeProductImages(adminDb, product),
      ),
    );
    await removeMerchantImages(adminDb, before);
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

  if (action === "delete_row") {
    const before = await getBefore(adminDb, table, targetId);
    const { error } = await adminDb
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
    const { data, error } = await adminDb
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

  const before = await getBefore(adminDb, table, targetId);
  const { data, error } = await adminDb
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
