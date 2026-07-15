import type { AdminProfile, SectionConfig } from "./types";

export const sections: SectionConfig[] = [
  {
    id: "dashboard",
    href: "/",
    icon: "LayoutDashboard",
    mode: "dashboard",
    title: { ar: "الرئيسية", en: "Dashboard" },
    description: { ar: "أرقام التشغيل اليومية والتنبيهات المهمة.", en: "Daily operating numbers and alerts." },
    allowedRoles: ["admin", "support_agent"]
  },
  {
    id: "merchant-approvals",
    href: "/admin/merchant-approvals",
    icon: "Store",
    mode: "table",
    source: "admin_merchants_readable",
    sourceKind: "view",
    editableTable: "merchants",
    orderBy: "created_at",
    title: { ar: "موافقات المتاجر", en: "Merchant approvals" },
    description: { ar: "مراجعة بيانات المتجر وصور المستندات وقبول أو رفض الطلب.", en: "Review merchant data and approve or reject." },
    searchKeys: ["store_name", "owner_name", "owner_mobile", "account_email", "category_name_ar"],
    actions: ["approve_merchant", "reject_merchant"],
    allowedRoles: ["admin"],
    columns: [
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "owner_name", label: { ar: "المالك", en: "Owner" } },
      { key: "owner_mobile", label: { ar: "موبايل المالك", en: "Owner mobile" } },
      { key: "category_name_ar", label: { ar: "القسم", en: "Category" } },
      { key: "approval_status_ar", label: { ar: "الحالة", en: "Status" }, tone: "status" },
      { key: "rejection_reason", label: { ar: "سبب الرفض", en: "Rejection reason" }, tone: "long" },
      { key: "created_at", label: { ar: "تاريخ التسجيل", en: "Created" }, tone: "date" }
    ]
  },
  {
    id: "branch-approvals",
    href: "/admin/branch-approvals",
    icon: "MapPin",
    mode: "table",
    source: "admin_branches_readable",
    sourceKind: "view",
    editableTable: "branches",
    orderBy: "created_at",
    title: { ar: "موافقات الفروع", en: "Branch approvals" },
    description: { ar: "مراجعة الفروع الجديدة قبل ظهورها في نتائج البحث.", en: "Review new branches before search visibility." },
    searchKeys: ["branch_name", "store_name", "city_name", "governorate_name", "manager_mobile"],
    actions: ["approve_branch", "reject_branch"],
    allowedRoles: ["admin"],
    columns: [
      { key: "branch_name", label: { ar: "الفرع", en: "Branch" } },
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "city_name", label: { ar: "المدينة", en: "City" } },
      { key: "governorate_name", label: { ar: "المحافظة", en: "Governorate" } },
      { key: "manager_mobile", label: { ar: "مسؤول الفرع", en: "Branch contact" } },
      { key: "approval_status_ar", label: { ar: "الحالة", en: "Status" }, tone: "status" },
      { key: "created_at", label: { ar: "تاريخ الإضافة", en: "Created" }, tone: "date" }
    ]
  },
  {
    id: "users",
    href: "/admin/users",
    icon: "Users",
    mode: "table",
    source: "admin_users_readable",
    sourceKind: "view",
    editableTable: "users",
    orderBy: "created_at",
    title: { ar: "المستخدمون", en: "Users" },
    description: { ar: "بحث، متابعة أدوار الحسابات، وحظر أو تفعيل المستخدمين.", en: "Search accounts, roles, and block status." },
    searchKeys: ["full_name", "mobile", "primary_email", "role_ar"],
    actions: ["block_user", "unblock_user", "set_user_password"],
    allowedRoles: ["admin"],
    columns: [
      { key: "full_name", label: { ar: "الاسم", en: "Name" } },
      { key: "mobile", label: { ar: "الموبايل", en: "Mobile" } },
      { key: "primary_email", label: { ar: "الإيميل", en: "Email" } },
      { key: "role_ar", label: { ar: "الدور", en: "Role" }, tone: "status" },
      { key: "account_status_ar", label: { ar: "الحساب", en: "Account" }, tone: "status" },
      { key: "created_at", label: { ar: "منذ", en: "Created" }, tone: "date" }
    ]
  },
  {
    id: "staff",
    href: "/admin/staff",
    icon: "Users",
    mode: "staff",
    title: { ar: "\u0627\u0644\u0641\u0631\u064a\u0642 \u0648\u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0627\u062a", en: "Team and permissions" },
    description: {
      ar: "\u0625\u0636\u0627\u0641\u0629 \u0645\u062f\u064a\u0631 \u0623\u0648 \u0645\u0648\u0638\u0641 \u062f\u0639\u0645\u060c \u0648\u0643\u062a\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u0631\u062a\u0628\u0629 \u0648\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0627\u062a.",
      en: "Add admins or support staff, set rank labels, and choose permissions."
    },
    allowedRoles: ["admin"]
  },
  {
    id: "categories",
    href: "/admin/categories",
    icon: "Tags",
    mode: "table",
    source: "categories",
    sourceKind: "table",
    editableTable: "categories",
    editableFields: ["name_ar", "name_en", "parent_id", "display_order", "is_active"],
    orderBy: "display_order",
    title: { ar: "الكاتجريز", en: "Categories" },
    description: { ar: "إدارة الشجرة الرئيسية والفرعية بأي عدد مستويات.", en: "Manage the full category tree." },
    searchKeys: ["name_ar", "name_en"],
    actions: ["edit_row", "toggle_active", "delete_row"],
    allowedRoles: ["admin"],
    columns: [
      { key: "name_ar", label: { ar: "الاسم العربي", en: "Arabic name" } },
      { key: "name_en", label: { ar: "الاسم الإنجليزي", en: "English name" } },
      { key: "parent_id", label: { ar: "الأب", en: "Parent" }, tone: "long" },
      { key: "display_order", label: { ar: "الترتيب", en: "Order" } },
      { key: "is_active", label: { ar: "مفعل", en: "Active" }, tone: "status" }
    ]
  },
  {
    id: "cities",
    href: "/admin/cities",
    icon: "Map",
    mode: "table",
    source: "cities",
    sourceKind: "table",
    editableTable: "cities",
    editableFields: ["name_ar", "name_en", "governorate_ar", "governorate_en", "is_active"],
    orderBy: "governorate_ar",
    title: { ar: "المدن والمناطق", en: "Cities and areas" },
    description: { ar: "إدارة نطاقات التشغيل والتوسع.", en: "Manage operating areas and expansion." },
    searchKeys: ["name_ar", "name_en", "governorate_ar", "governorate_en"],
    actions: ["edit_row", "toggle_active", "delete_row"],
    allowedRoles: ["admin"],
    columns: [
      { key: "governorate_ar", label: { ar: "المحافظة", en: "Governorate" } },
      { key: "name_ar", label: { ar: "المدينة", en: "City" } },
      { key: "name_en", label: { ar: "City EN", en: "City EN" } },
      { key: "is_active", label: { ar: "مفعلة", en: "Active" }, tone: "status" }
    ]
  },
  {
    id: "stores",
    href: "/admin/stores",
    icon: "Building2",
    mode: "table",
    source: "admin_merchants_readable",
    sourceKind: "view",
    orderBy: "updated_at",
    title: { ar: "إدارة المتاجر", en: "Stores" },
    description: { ar: "بيانات المتاجر، الفروع، المنتجات، وطريقة المحاسبة.", en: "Store data, branches, products, and billing." },
    searchKeys: ["store_name", "owner_name", "contact_mobile", "billing_preference_ar"],
    allowedRoles: ["admin"],
    columns: [
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "contact_mobile", label: { ar: "التواصل", en: "Contact" } },
      { key: "approval_status_ar", label: { ar: "الموافقة", en: "Approval" }, tone: "status" },
      { key: "billing_preference_ar", label: { ar: "المحاسبة", en: "Billing" }, tone: "status" },
      { key: "updated_at", label: { ar: "آخر تحديث", en: "Updated" }, tone: "date" }
    ]
  },
  {
    id: "store-catalog",
    href: "/admin/store-catalog",
    icon: "Images",
    mode: "catalog",
    title: { ar: "رقابة المتاجر والمنتجات", en: "Store and product moderation" },
    description: {
      ar: "تصفح المتاجر بصورها وافتح كل متجر لمراجعة المنتجات والصور وحذف المخالف.",
      en: "Browse stores visually, review product images, and remove violations."
    },
    allowedRoles: ["admin"]
  },
  {
    id: "orders",
    href: "/admin/orders",
    icon: "ClipboardList",
    mode: "table",
    source: "admin_orders_readable",
    sourceKind: "view",
    orderBy: "created_at",
    title: { ar: "الطلبات", en: "Orders" },
    description: { ar: "كل الطلبات وتفاصيل العرض المختار وحالة التأكيد والدفع.", en: "All orders, accepted offer, confirmation, and payment." },
    searchKeys: ["buyer_name", "buyer_mobile", "store_name", "status_ar"],
    allowedRoles: ["admin", "support_agent"],
    supportPermission: "orders",
    columns: [
      { key: "buyer_name", label: { ar: "العميل", en: "Buyer" } },
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "status_ar", label: { ar: "حالة الطلب", en: "Status" }, tone: "status" },
      { key: "payment_status", label: { ar: "الدفع", en: "Payment" }, tone: "status" },
      { key: "selected_subtotal_snapshot", label: { ar: "الإجمالي", en: "Subtotal" }, tone: "money" },
      { key: "created_at", label: { ar: "التاريخ", en: "Date" }, tone: "date" }
    ]
  },
  {
    id: "suspicious-matches",
    hidden: true,
    href: "/admin/suspicious-matches",
    icon: "SearchCheck",
    mode: "table",
    source: "admin_offer_items_readable",
    sourceKind: "view",
    orderBy: "created_at",
    title: { ar: "مطابقات مشكوك فيها", en: "Low confidence matches" },
    description: { ar: "مراجعة البنود ذات ثقة منخفضة قبل تحسين المطابقة.", en: "Review low-confidence offer items." },
    searchKeys: ["store_name", "product_name", "requested_name", "matched_name_snapshot"],
    allowedRoles: ["admin"],
    columns: [
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "requested_name", label: { ar: "المطلوب", en: "Requested" } },
      { key: "matched_name_snapshot", label: { ar: "المطابق", en: "Matched" } },
      { key: "line_total_snapshot", label: { ar: "الإجمالي", en: "Total" }, tone: "money" },
      { key: "match_confidence", label: { ar: "الثقة", en: "Confidence" }, tone: "status" }
    ]
  },
  {
    id: "ai-reads",
    href: "/admin/ai-reads",
    icon: "FileScan",
    mode: "table",
    source: "admin_product_import_batches_readable",
    sourceKind: "view",
    orderBy: "created_at",
    title: { ar: "قراءات الذكاء الاصطناعي", en: "AI reads" },
    description: { ar: "فواتير وصور/PDF/أصوات المتاجر وحالة المعالجة.", en: "Merchant files and processing status." },
    searchKeys: ["store_name", "source_ar", "status_ar"],
    allowedRoles: ["admin"],
    columns: [
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "source_ar", label: { ar: "المصدر", en: "Source" }, tone: "status" },
      { key: "status_ar", label: { ar: "الحالة", en: "Status" }, tone: "status" },
      { key: "rows_count", label: { ar: "الصفوف", en: "Rows" } },
      { key: "approved_rows_count", label: { ar: "المعتمد", en: "Approved" } },
      { key: "created_at", label: { ar: "التاريخ", en: "Date" }, tone: "date" }
    ]
  },
  {
    id: "support",
    href: "/admin/support",
    icon: "Headphones",
    mode: "support",
    title: { ar: "خدمة العملاء", en: "Support" },
    description: { ar: "طابور المحادثات المحولة من البوت والرد الفوري.", en: "Transferred bot conversations and live replies." },
    allowedRoles: ["admin", "support_agent"],
    supportPermission: "support_chats"
  },
  {
    id: "broadcast",
    href: "/admin/broadcast",
    icon: "BellRing",
    mode: "broadcast",
    title: { ar: "إرسال إشعار", en: "Send notification" },
    description: {
      ar: "إرسال إشعار يدوي يظهر في جرس التطبيق ويوصل Firebase Push للمستخدمين المختارين.",
      en: "Send a manual notification to the in-app bell and Firebase Push."
    },
    allowedRoles: ["admin"]
  },
  {
    id: "ads",
    href: "/admin/ads",
    icon: "Images",
    mode: "table",
    source: "ads_banners",
    sourceKind: "table",
    editableTable: "ads_banners",
    editableFields: ["image_url", "target_url", "placement", "sort_order", "starts_at", "ends_at", "is_active"],
    orderBy: "created_at",
    title: { ar: "\u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062a", en: "Ads" },
    description: {
      ar: "\u0625\u062f\u0627\u0631\u0629 \u0625\u0639\u0644\u0627\u0646\u0627\u062a \u0627\u0644\u062a\u0637\u0628\u064a\u0642: \u0635\u0648\u0631\u0629 \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u060c \u0644\u064a\u0646\u0643 \u0627\u0644\u0645\u0639\u0644\u0646\u060c \u0648\u0645\u064a\u0639\u0627\u062f \u0627\u0644\u0638\u0647\u0648\u0631.",
      en: "Manage in-app ad images, advertiser links, and schedules."
    },
    searchKeys: ["image_url", "target_url", "placement"],
    actions: ["edit_row", "toggle_active", "delete_row"],
    allowedRoles: ["admin"],
    columns: [
      { key: "image_url", label: { ar: "\u0635\u0648\u0631\u0629 \u0627\u0644\u0625\u0639\u0644\u0627\u0646", en: "Image" }, tone: "long" },
      { key: "target_url", label: { ar: "\u0644\u064a\u0646\u0643 \u0627\u0644\u0645\u0639\u0644\u0646", en: "Advertiser link" }, tone: "long" },
      { key: "placement", label: { ar: "\u0645\u0643\u0627\u0646 \u0627\u0644\u0638\u0647\u0648\u0631", en: "Placement" }, tone: "status" },
      { key: "sort_order", label: { ar: "\u0627\u0644\u062a\u0631\u062a\u064a\u0628", en: "Order" } },
      { key: "is_active", label: { ar: "\u0645\u0641\u0639\u0644", en: "Active" }, tone: "status" }
    ]
  },
  {
    id: "complaints",
    href: "/admin/complaints",
    icon: "MessagesSquare",
    mode: "table",
    source: "support_complaints",
    sourceKind: "table",
    orderBy: "created_at",
    title: { ar: "الشكاوى والنزاعات", en: "Complaints" },
    description: { ar: "الشكاوى المفتوحة والمصعدة وحالة الحل.", en: "Open and escalated complaints." },
    searchKeys: ["title", "body", "status", "priority", "target_type"],
    allowedRoles: ["admin", "support_agent"],
    supportPermission: "complaints",
    columns: [
      { key: "title", label: { ar: "العنوان", en: "Title" } },
      { key: "target_type", label: { ar: "النوع", en: "Type" }, tone: "status" },
      { key: "status", label: { ar: "الحالة", en: "Status" }, tone: "status" },
      { key: "priority", label: { ar: "الأولوية", en: "Priority" }, tone: "status" },
      { key: "created_at", label: { ar: "التاريخ", en: "Date" }, tone: "date" }
    ]
  },
  {
    id: "knowledge",
    href: "/admin/knowledge",
    icon: "BookOpen",
    mode: "table",
    source: "knowledge_base",
    sourceKind: "table",
    editableTable: "knowledge_base",
    editableFields: ["title_ar", "title_en", "content_ar", "content_en", "category", "is_active"],
    orderBy: "updated_at",
    title: { ar: "قاعدة معرفة البوت", en: "Bot knowledge base" },
    description: { ar: "محتوى تدريب البوت وإعادة تجهيز الـ embeddings عند التعديل.", en: "Bot training content and embedding refresh flags." },
    searchKeys: ["title_ar", "title_en", "content_ar", "category"],
    actions: ["edit_row", "toggle_active"],
    allowedRoles: ["admin", "support_agent"],
    supportPermission: "knowledge_base",
    columns: [
      { key: "title_ar", label: { ar: "العنوان", en: "Title" } },
      { key: "category", label: { ar: "التصنيف", en: "Category" }, tone: "status" },
      { key: "is_active", label: { ar: "مفعل", en: "Active" }, tone: "status" },
      { key: "needs_embedding", label: { ar: "يحتاج تجهيز", en: "Needs embedding" }, tone: "status" },
      { key: "updated_at", label: { ar: "آخر تحديث", en: "Updated" }, tone: "date" }
    ]
  },
  {
    id: "reports",
    href: "/admin/reports",
    icon: "ChartNoAxesCombined",
    mode: "reports",
    title: { ar: "التقارير", en: "Reports" },
    description: { ar: "طلبات، متاجر نشطة، كاتجريز، RFQ، وعمولات.", en: "Orders, active stores, categories, RFQ, and commissions." },
    allowedRoles: ["admin"]
  },
  {
    id: "monetization",
    href: "/admin/monetization",
    icon: "BadgeDollarSign",
    mode: "settings",
    source: "feature_flags",
    sourceKind: "table",
    editableTable: "feature_flags",
    editableFields: ["description_ar", "description_en", "is_enabled", "configuration"],
    orderBy: "key",
    title: { ar: "الاشتراكات والمدفوعات", en: "Monetization" },
    description: { ar: "Feature flags وخطط الاشتراك ومقدمي الدفع.", en: "Feature flags, plans, and payment providers." },
    searchKeys: ["key", "description_ar", "description_en"],
    actions: ["edit_row", "toggle_active"],
    allowedRoles: ["admin"]
  },
  {
    id: "payments",
    href: "/admin/payments",
    icon: "CreditCard",
    mode: "table",
    source: "admin_payment_transactions_readable",
    sourceKind: "view",
    orderBy: "created_at",
    title: { ar: "معاملات الدفع", en: "Payments" },
    description: { ar: "حالات الدفع والمراجعة والفشل عبر مقدمي الدفع.", en: "Payment statuses across providers." },
    searchKeys: ["user_name", "store_name", "provider", "status", "external_reference"],
    allowedRoles: ["admin"],
    columns: [
      { key: "user_name", label: { ar: "المستخدم", en: "User" } },
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "provider", label: { ar: "طريقة الدفع", en: "Provider" }, tone: "status" },
      { key: "amount", label: { ar: "المبلغ", en: "Amount" }, tone: "money" },
      { key: "status", label: { ar: "الحالة", en: "Status" }, tone: "status" },
      { key: "created_at", label: { ar: "التاريخ", en: "Date" }, tone: "date" }
    ]
  },
  {
    id: "referrals",
    href: "/admin/referrals",
    icon: "Gift",
    mode: "table",
    source: "admin_referral_rewards_readable",
    sourceKind: "view",
    orderBy: "created_at",
    title: { ar: "الإحالات والمكافآت", en: "Referrals and rewards" },
    description: { ar: "متابعة الأكواد، التسجيلات المؤكدة، وتسليم المكافآت.", en: "Track codes, confirmed registrations, and rewards." },
    searchKeys: ["referrer_name", "rewarded_user_name", "referral_code", "delivery_status"],
    allowedRoles: ["admin"],
    columns: [
      { key: "referrer_name", label: { ar: "صاحب الدعوة", en: "Referrer" } },
      { key: "rewarded_user_name", label: { ar: "المستحق", en: "Rewarded user" } },
      { key: "referral_code", label: { ar: "الكود", en: "Code" }, tone: "status" },
      { key: "reward_type", label: { ar: "المكافأة", en: "Reward" }, tone: "status" },
      { key: "delivery_status", label: { ar: "التسليم", en: "Delivery" }, tone: "status" },
      { key: "created_at", label: { ar: "التاريخ", en: "Date" }, tone: "date" }
    ]
  },
  {
    id: "audit",
    href: "/admin/audit",
    icon: "ShieldCheck",
    mode: "table",
    source: "admin_audit_logs_readable",
    sourceKind: "view",
    orderBy: "created_at",
    title: { ar: "سجل العمليات", en: "Audit logs" },
    description: { ar: "كل إجراء حساس يظهر هنا للمراجعة.", en: "Sensitive actions appear here for review." },
    searchKeys: ["actor_name", "actor_email", "action", "target_table", "target_id"],
    allowedRoles: ["admin"],
    columns: [
      { key: "actor_name", label: { ar: "المسؤول", en: "Actor" } },
      { key: "action", label: { ar: "الإجراء", en: "Action" }, tone: "status" },
      { key: "target_table", label: { ar: "الجدول", en: "Table" }, tone: "status" },
      { key: "target_id", label: { ar: "الهدف", en: "Target" }, tone: "long" },
      { key: "created_at", label: { ar: "التاريخ", en: "Date" }, tone: "date" }
    ]
  }
];

export function findSection(id?: string) {
  return sections.find((section) => section.id === id) ?? sections[0];
}

export function sectionIsAllowed(section: SectionConfig, profile: AdminProfile | null) {
  if (section.hidden) {
    return false;
  }
  if (!profile) {
    return false;
  }

  if (profile.role === "admin" && profile.permissions.__limit_admin !== true) {
    return true;
  }

  const permissionKey = permissionKeyForSection(section);
  if (profile.permissions[permissionKey] === true) {
    return true;
  }

  if (section.allowedRoles && !section.allowedRoles.includes(profile.role)) {
    return false;
  }

  return profile.role === "admin" && profile.permissions.__limit_admin !== true;
}

export function visibleSections(profile: AdminProfile | null) {
  return sections.filter((section) => sectionIsAllowed(section, profile));
}

function permissionKeyForSection(section: SectionConfig) {
  return section.supportPermission ?? section.id.replace(/-/g, "_");
}
