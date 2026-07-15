import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createUserScopedClient } from "@/lib/supabase/server";

type AnyRow = Record<string, unknown>;
type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;
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
  __limit_admin: false
} satisfies Record<string, boolean>;

const editableFields: Record<string, string[]> = {
  users: ["role", "is_blocked"],
  merchants: ["approval_status", "rejection_reason", "last_admin_contact_at", "billing_preference"],
  branches: ["approval_status", "rejection_reason"],
  products: ["free_name", "price", "unit", "quantity", "brand", "size", "color", "image_url", "image_urls", "is_active"],
  categories: ["name_ar", "name_en", "parent_id", "display_order", "is_active"],
  cities: ["name_ar", "name_en", "governorate_ar", "governorate_en", "is_active"],
  feature_flags: ["description_ar", "description_en", "is_enabled", "configuration"],
  knowledge_base: ["title_ar", "title_en", "content_ar", "content_en", "category", "is_active", "needs_embedding"],
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
    "sort_order"
  ],
  payment_settings: [
    "provider",
    "is_enabled",
    "configuration",
    "webhook_secret_name",
    "webhook_signature_header",
    "is_direct_to_merchant_supported"
  ],
  ads_banners: ["image_url", "target_url", "placement", "sort_order", "starts_at", "ends_at", "is_active"],
  support_agents: ["department", "permissions", "is_active"],
  referral_rewards: ["delivery_status", "delivered_at", "notes"]
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
  support_agents: "is_active"
};

const idColumnByTable: Record<string, string> = {
  feature_flags: "key"
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const raw = error as Record<string, unknown>;
    const parts = [raw.message, raw.details, raw.hint, raw.code]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
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
  return normalized.includes("permission denied") || normalized.includes("42501");
}

function adminActionErrorMessage(error: unknown) {
  const message = errorMessage(error);
  return isDbPermissionError(message) ? "service_role_key_invalid" : message;
}

function requiredText(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${field}_required`);
  }
  return text;
}

function pickAllowed(table: string, values: AnyRow) {
  const allowed = new Set(editableFields[table] ?? []);
  return Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
}

function normalizePermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, enabled]) => [key, enabled === true]));
}

function authFromProfile(value: unknown): AdminAuth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const profile = value as AnyRow;
  const role = profile.role === "admin" || profile.role === "support_agent" ? profile.role : null;
  const userId = typeof profile.id === "string" ? profile.id : "";
  if (!role || !userId || profile.is_blocked === true) {
    return null;
  }
  return {
    userId,
    role,
    permissions: normalizePermissions(profile.permissions)
  };
}

function trustedRoleFromAuthUser(user: AuthUserForAdmin): AdminAuth["role"] | null {
  const role = String(
    user.app_metadata?.role ??
      user.app_metadata?.app_role ??
      user.app_metadata?.user_role ??
      ""
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
  existingProfile: AnyRow | null
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
      is_blocked: false
    })
    .select("id, role, is_blocked")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AnyRow;
}

function permissionKeyFor(action: string, table?: string) {
  if (action === "create_admin_staff" || action === "update_staff_permissions" || action === "set_staff_active") return "staff";
  if (action === "send_admin_notification") return "broadcast";
  if (action === "set_user_password") return "users";
  if (action === "approve_merchant" || action === "reject_merchant" || action === "suspend_merchant" || action === "delete_merchant") return "merchant_approvals";
  if (action === "approve_branch" || action === "reject_branch") return "branch_approvals";
  if (action === "block_user" || action === "unblock_user") return "users";
  if (action === "deactivate_product" || action === "activate_product" || action === "delete_product") return "store_catalog";

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
    referral_rewards: "referrals"
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
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    return { error: jsonError("missing_access_token", 401) };
  }

  try {
    const userScopedClient = createUserScopedClient(token);
    const { data: rpcProfile } = await userScopedClient.rpc("admin_web_my_profile");
    const rpcAuth = authFromProfile(rpcProfile);
    if (rpcAuth) {
      return rpcAuth;
    }
  } catch {
    // Fall back to the service-role based path below for older databases.
  }

  const { data: userData, error: userError } = await service.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: jsonError("invalid_access_token", 401) };
  }

  const authUser = userData.user as AuthUserForAdmin;
  const authEmail = String(authUser.email ?? "").trim().toLowerCase();

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

  let role = (profile?.role === "admin" || profile?.role === "support_agent"
    ? profile.role
    : null) as AdminAuth["role"] | null;

  const staffPermissions = normalizePermissions(staffProfile?.permissions);
  if (!role && staffProfile?.is_active !== false && Object.values(staffPermissions).some(Boolean)) {
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

  if (staffProfile?.is_active === false && !(role === "admin" && permissions.__limit_admin !== true)) {
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
      ...permissions
    };
  }

  return { userId: String(profile?.id ?? permissionUserId), role, permissions };
}

async function getBefore(service: ServiceClient, table: string, id: string) {
  const idColumn = idColumnByTable[table] ?? "id";
  const { data } = await service.from(table).select("*").eq(idColumn, id).maybeSingle();
  return data as AnyRow | null;
}

async function writeAudit(
  service: ServiceClient,
  actorId: string,
  action: string,
  table: string,
  targetId: string,
  oldData: AnyRow | null,
  newData: AnyRow | null
) {
  const { error } = await service.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_table: table,
    target_id: targetId,
    old_data: oldData,
    new_data: newData
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
    const marker = url.pathname.includes(publicMarker) ? publicMarker : signedMarker;
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function removeProductImages(
  service: ServiceClient,
  product: AnyRow | null
) {
  const rawImages = [
    product?.image_url,
    ...(Array.isArray(product?.image_urls) ? product?.image_urls ?? [] : [])
  ];
  const paths = Array.from(
    new Set(rawImages.map((value) => storagePathFromValue(value, "product-images")).filter(Boolean) as string[])
  );
  if (paths.length > 0) {
    await service.storage.from("product-images").remove(paths);
  }
}

async function removeMerchantImages(
  service: ServiceClient,
  merchant: AnyRow | null
) {
  const storefrontPath = storagePathFromValue(merchant?.store_front_image_url, "storefront-photos");
  const ownerIdPath = storagePathFromValue(merchant?.owner_id_image_url, "merchant-ids");
  const commercialPath = storagePathFromValue(merchant?.commercial_register_url, "commercial-registers");

  if (storefrontPath) await service.storage.from("storefront-photos").remove([storefrontPath]);
  if (ownerIdPath) await service.storage.from("merchant-ids").remove([ownerIdPath]);
  if (commercialPath) await service.storage.from("commercial-registers").remove([commercialPath]);
}

async function resolveNotificationRecipients(
  service: ServiceClient,
  payload: AnyRow | undefined
) {
  const audience = String(payload?.audience ?? "all");
  const userIds = Array.isArray(payload?.user_ids) ? payload?.user_ids.map(String).filter(Boolean) : [];

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

  return Array.from(new Set(((data ?? []) as Array<{ id: string }>).map((row) => row.id)));
}

async function sendAdminNotification(
  service: ServiceClient,
  actorId: string,
  payload: AnyRow | undefined
) {
  const recipients = await resolveNotificationRecipients(service, payload);
  if (recipients.length === 0) {
    throw new Error("no_recipients_found");
  }

  const titleAr = requiredText(payload?.title_ar, "title_ar");
  const titleEn = String(payload?.title_en ?? titleAr).trim() || titleAr;
  const bodyAr = requiredText(payload?.body_ar, "body_ar");
  const bodyEn = String(payload?.body_en ?? bodyAr).trim() || bodyAr;
  const deepLink = String(payload?.deep_link ?? "saarly://buyer/notifications").trim() || "saarly://buyer/notifications";
  const type = String(payload?.type ?? "admin_broadcast").trim() || "admin_broadcast";

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
      audience: payload?.audience ?? "all"
    },
    push_status: "pending"
  }));

  const { data, error } = await service.from("notifications").insert(rows).select("id, user_id");
  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(service, actorId, "send_admin_notification", "notifications", "bulk", null, {
    count: rows.length,
    audience: payload?.audience ?? "all",
    title_ar: titleAr,
    deep_link: deepLink
  });

  return {
    inserted_count: data?.length ?? rows.length,
    requested_recipients: recipients.length,
    audience: payload?.audience ?? "all"
  };
}

async function ensureStaffProfilesReady(service: ServiceClient) {
  const { error } = await service.from("admin_staff_profiles").select("user_id").limit(1);
  if (error) {
    throw new Error("admin_staff_sql_not_applied");
  }
}

function staffAccessLevel(value: unknown) {
  const text = String(value ?? "limited_admin");
  if (text === "full_admin" || text === "limited_admin" || text === "support_agent") {
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
  isActive = true
) {
  const { error } = await service.from("admin_staff_profiles").upsert(
    {
      user_id: userId,
      role_label: roleLabel,
      permissions,
      is_active: isActive
    },
    { onConflict: "user_id" }
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
  isActive = true
) {
  const { error } = await service.from("support_agents").upsert(
    {
      user_id: userId,
      is_active: isActive,
      department: roleLabel,
      permissions
    },
    { onConflict: "user_id" }
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function createAdminStaff(service: ServiceClient, actorId: string, payload: AnyRow | undefined) {
  await ensureStaffProfilesReady(service);

  const fullName = requiredText(payload?.full_name, "full_name");
  const email = requiredText(payload?.email, "email").toLowerCase();
  const mobile = requiredText(payload?.mobile, "mobile");
  const password = requiredText(payload?.password, "password");
  const roleLabel = requiredText(payload?.role_label, "role_label");
  const accessLevel = staffAccessLevel(payload?.access_level);
  const internalRole = accessLevel === "support_agent" ? "support_agent" : "admin";
  const permissions = permissionsForAccess(accessLevel, payload?.permissions);

  if (password.length < 8) {
    throw new Error("password_must_be_at_least_8_chars");
  }

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
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
      is_blocked: false
    });
    if (userError) {
      throw new Error(userError.message);
    }

    await upsertStaffProfile(service, userId, roleLabel, permissions, true);

    if (internalRole === "support_agent") {
      await upsertSupportAgent(service, userId, roleLabel, permissions, true);
    }

    await writeAudit(service, actorId, "create_admin_staff", "users", userId, null, {
      id: userId,
      email,
      full_name: fullName,
      role: internalRole,
      role_label: roleLabel,
      access_level: accessLevel,
      permissions
    });

    return { id: userId, email, role: internalRole };
  } catch (error) {
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
    throw error;
  }
}

async function updateStaffPermissions(service: ServiceClient, actorId: string, targetUserId: string, payload: AnyRow | undefined) {
  await ensureStaffProfilesReady(service);

  if (actorId === targetUserId && payload?.access_level !== "full_admin") {
    throw new Error("cannot_limit_your_own_admin_account");
  }

  const roleLabel = requiredText(payload?.role_label, "role_label");
  const accessLevel = staffAccessLevel(payload?.access_level);
  const internalRole = accessLevel === "support_agent" ? "support_agent" : "admin";
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

  await upsertStaffProfile(service, targetUserId, roleLabel, permissions, isActive);

  if (internalRole === "support_agent") {
    await upsertSupportAgent(service, targetUserId, roleLabel, permissions, isActive);
  } else {
    await service.from("support_agents").delete().eq("user_id", targetUserId);
  }

  await writeAudit(service, actorId, "update_staff_permissions", "users", targetUserId, before, {
    id: targetUserId,
    role: internalRole,
    role_label: roleLabel,
    access_level: accessLevel,
    permissions,
    is_active: isActive
  });

  return { id: targetUserId, role: internalRole, permissions_updated: true };
}

async function setStaffActive(service: ServiceClient, actorId: string, targetUserId: string, enabled: boolean) {
  await ensureStaffProfilesReady(service);

  if (actorId === targetUserId && !enabled) {
    throw new Error("cannot_disable_your_own_account");
  }

  const before = await getBefore(service, "users", targetUserId);
  const { error: userError } = await service.from("users").update({ is_blocked: !enabled }).eq("id", targetUserId);
  if (userError) {
    throw new Error(userError.message);
  }

  await service.from("admin_staff_profiles").update({ is_active: enabled }).eq("user_id", targetUserId);
  await service.from("support_agents").update({ is_active: enabled }).eq("user_id", targetUserId);

  await writeAudit(service, actorId, "set_staff_active", "users", targetUserId, before, {
    id: targetUserId,
    is_active: enabled
  });

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

  let roleLabel = (staffProfile?.role_label as string | null | undefined) ?? null;
  let permissions = auth.permissions;

  if (auth.role === "support_agent") {
    const { data: agentRow } = await service
      .from("support_agents")
      .select("department, permissions, is_active")
      .eq("user_id", auth.userId)
      .maybeSingle();
    roleLabel = roleLabel ?? ((agentRow?.department as string | null | undefined) ?? null);
    permissions = {
      ...normalizePermissions(agentRow?.permissions),
      ...permissions
    };
  }

  return {
    id: userRow.id,
    email: userRow.primary_email ?? null,
    full_name: userRow.full_name ?? null,
    role: auth.role,
    role_label: roleLabel,
    is_blocked: Boolean(userRow.is_blocked),
    permissions
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
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (profileError) {
    return jsonError(profileError instanceof Error ? profileError.message : String(profileError), 403);
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

  try {
    assertActionAllowed(auth, action, body.table);
  } catch (permissionError) {
    return jsonError(permissionError instanceof Error ? permissionError.message : String(permissionError), 403);
  }

  if (action === "create_admin_staff") {
    try {
      const result = await createAdminStaff(service, auth.userId, body.payload);
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(adminActionErrorMessage(staffError), 400);
    }
  }

  if (action === "update_staff_permissions") {
    try {
      const userId = requiredText(id, "user_id");
      const result = await updateStaffPermissions(service, auth.userId, userId, body.payload);
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(adminActionErrorMessage(staffError), 400);
    }
  }

  if (action === "set_staff_active") {
    try {
      const userId = requiredText(id, "user_id");
      const result = await setStaffActive(service, auth.userId, userId, body.payload?.enabled === true);
      return NextResponse.json({ data: result });
    } catch (staffError) {
      return jsonError(adminActionErrorMessage(staffError), 400);
    }
  }

  if (action === "send_admin_notification") {
    try {
      const result = await sendAdminNotification(service, auth.userId, body.payload);
      return NextResponse.json({ data: result });
    } catch (sendError) {
      return jsonError(adminActionErrorMessage(sendError), 400);
    }
  }

  if (action === "set_user_password") {
    const userId = requiredText(id, "user_id");
    const password = requiredText(body.payload?.password, "password");
    if (password.length < 8) {
      return jsonError("password_must_be_at_least_8_chars", 400);
    }

    const before = await getBefore(service, "users", userId);
    const { error } = await service.auth.admin.updateUserById(userId, { password });
    if (error) {
      return jsonError(adminActionErrorMessage(error), 400);
    }

    await writeAudit(service, auth.userId, action, "auth.users", userId, before, {
      password_updated: true,
      updated_at: new Date().toISOString()
    });
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
        ? { approval_status: "approved", rejection_reason: null, last_admin_contact_at: now }
        : {
            approval_status: "rejected",
            rejection_reason: String(body.payload?.reason ?? "").trim(),
            last_admin_contact_at: now
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
        : { approval_status: "rejected", rejection_reason: String(body.payload?.reason ?? "").trim() };
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
      last_admin_contact_at: now
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
  } else if (action === "update_row") {
    if (!body.table || !id || !body.values) return jsonError("missing_update_payload");
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
    const before = await getBefore(service, table, targetId);
    const { error } = await service.from(table).delete().eq(idColumnByTable[table] ?? "id", targetId);
    if (error) {
      return jsonError(adminActionErrorMessage(error), 400);
    }
    await removeProductImages(service, before);
    await writeAudit(service, auth.userId, action, table, targetId, before, null);
    return NextResponse.json({ data: { id: targetId, deleted: true } });
  }

  if (action === "delete_merchant") {
    const before = await getBefore(service, table, targetId);
    const { data: products } = await service.from("products").select("*").eq("merchant_id", targetId);
    const { error } = await service.from(table).delete().eq(idColumnByTable[table] ?? "id", targetId);
    if (error) {
      return jsonError(adminActionErrorMessage(error), 400);
    }
    await Promise.all(((products ?? []) as AnyRow[]).map((product) => removeProductImages(service, product)));
    await removeMerchantImages(service, before);
    await writeAudit(service, auth.userId, action, table, targetId, before, null);
    return NextResponse.json({ data: { id: targetId, deleted: true } });
  }

  if (Object.keys(values).length === 0) {
    return jsonError("no_allowed_fields");
  }

  if (action === "create_row") {
    const { data, error } = await service.from(table).insert(values).select("*").single();
    if (error) {
      return jsonError(adminActionErrorMessage(error), 400);
    }
    const idColumn = idColumnByTable[table] ?? "id";
    await writeAudit(service, auth.userId, action, table, String((data as AnyRow)[idColumn]), null, data as AnyRow);
    return NextResponse.json({ data });
  }

  const before = await getBefore(service, table, targetId);
  const { data, error } = await service.from(table).update(values).eq(idColumnByTable[table] ?? "id", targetId).select("*").single();

  if (error) {
    return jsonError(adminActionErrorMessage(error), 400);
  }

  await writeAudit(service, auth.userId, action, table, targetId, before, data as AnyRow);
  return NextResponse.json({ data });
}
