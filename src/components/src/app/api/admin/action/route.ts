import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createUserScopedClient } from "@/lib/supabase/server";

type AnyRow = Record<string, unknown>;

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
  support_agents: "is_active"
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    return { error: jsonError("missing_access_token", 401) };
  }

  const userClient = createUserScopedClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return { error: jsonError("invalid_access_token", 401) };
  }

  const { data: profile, error: profileError } = await userClient
    .from("users")
    .select("id, role, is_blocked")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin" || profile.is_blocked) {
    return { error: jsonError("admin_required", 403) };
  }

  return { userId: userData.user.id };
}

async function getBefore(service: NonNullable<ReturnType<typeof createServiceClient>>, table: string, id: string) {
  const { data } = await service.from(table).select("*").eq("id", id).maybeSingle();
  return data as AnyRow | null;
}

async function writeAudit(
  service: NonNullable<ReturnType<typeof createServiceClient>>,
  actorId: string,
  action: string,
  table: string,
  targetId: string,
  oldData: AnyRow | null,
  newData: AnyRow | null
) {
  await service.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_table: table,
    target_id: targetId,
    old_data: oldData,
    new_data: newData
  });
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
  service: NonNullable<ReturnType<typeof createServiceClient>>,
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
  service: NonNullable<ReturnType<typeof createServiceClient>>,
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
  service: NonNullable<ReturnType<typeof createServiceClient>>,
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
  service: NonNullable<ReturnType<typeof createServiceClient>>,
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

export async function POST(req: NextRequest) {
  const service = createServiceClient();
  if (!service) {
    return jsonError("service_role_key_missing", 501);
  }

  const auth = await requireAdmin(req);
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

  if (action === "send_admin_notification") {
    try {
      const result = await sendAdminNotification(service, auth.userId, body.payload);
      return NextResponse.json({ data: result });
    } catch (sendError) {
      return jsonError(sendError instanceof Error ? sendError.message : String(sendError), 400);
    }
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
    const { error } = await service.from(table).delete().eq("id", targetId);
    if (error) {
      return jsonError(error.message, 400);
    }
    await removeProductImages(service, before);
    await writeAudit(service, auth.userId, action, table, targetId, before, null);
    return NextResponse.json({ data: { id: targetId, deleted: true } });
  }

  if (action === "delete_merchant") {
    const before = await getBefore(service, table, targetId);
    const { data: products } = await service.from("products").select("*").eq("merchant_id", targetId);
    const { error } = await service.from(table).delete().eq("id", targetId);
    if (error) {
      return jsonError(error.message, 400);
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
      return jsonError(error.message, 400);
    }
    await writeAudit(service, auth.userId, action, table, String((data as AnyRow).id), null, data as AnyRow);
    return NextResponse.json({ data });
  }

  const before = await getBefore(service, table, targetId);
  const { data, error } = await service.from(table).update(values).eq("id", targetId).select("*").single();

  if (error) {
    return jsonError(error.message, 400);
  }

  await writeAudit(service, auth.userId, action, table, targetId, before, data as AnyRow);
  return NextResponse.json({ data });
}
