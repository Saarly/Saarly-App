import type { ColumnConfig } from "./types";

type CellLang = "ar" | "en";
type Localized = { ar: string; en: string };

const labels: Record<string, Localized> = {
  ar: { ar: "العربية", en: "Arabic" },
  en: { ar: "الإنجليزية", en: "English" },
  light: { ar: "فاتح", en: "Light" },
  dark: { ar: "داكن", en: "Dark" },
  draft: { ar: "مسودة", en: "Draft" },
  processing: { ar: "قيد المعالجة", en: "Processing" },
  needs_review: { ar: "يحتاج مراجعة", en: "Needs review" },
  approved: { ar: "مقبول", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  failed: { ar: "فشل", en: "Failed" },
  error: { ar: "حدثت مشكلة", en: "Error" },
  pending: { ar: "قيد الانتظار", en: "Pending" },
  submitted: { ar: "تم الإرسال للمراجعة", en: "Submitted" },
  under_review: { ar: "قيد المراجعة", en: "Under review" },
  succeeded: { ar: "ناجح", en: "Succeeded" },
  completed: { ar: "مكتمل", en: "Completed" },
  confirmed: { ar: "مؤكد", en: "Confirmed" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
  cancelled_by_merchant: { ar: "ملغي من المتجر", en: "Cancelled by store" },
  cancelled_by_buyer: { ar: "ملغي من العميل", en: "Cancelled by buyer" },
  active: { ar: "مفعّل", en: "Active" },
  inactive: { ar: "متوقف", en: "Inactive" },
  disabled: { ar: "متوقف", en: "Disabled" },
  enabled: { ar: "مفعّل", en: "Enabled" },
  open: { ar: "مفتوحة", en: "Open" },
  closed: { ar: "مغلقة", en: "Closed" },
  resolved: { ar: "تم الحل", en: "Resolved" },
  escalated: { ar: "مصعّدة للإدارة", en: "Escalated" },
  transferred: { ar: "محوّلة للدعم", en: "Transferred to support" },
  bot: { ar: "مع المساعد الآلي", en: "With the assistant" },
  in_support: { ar: "قيد المعالجة لدى الدعم", en: "Handled by support" },
  current: { ar: "منتظم", en: "Current" },
  past_due: { ar: "في فترة السماح", en: "Past due" },
  suspended: { ar: "موقوف", en: "Suspended" },
  paid: { ar: "مدفوع", en: "Paid" },
  refunded: { ar: "تم الاسترداد", en: "Refunded" },
  due: { ar: "مستحق", en: "Due" },
  overdue: { ar: "متأخر", en: "Overdue" },
  not_required: { ar: "لا يحتاج دفعًا داخل التطبيق", en: "No in-app payment required" },
  awaiting_confirmation: { ar: "بانتظار تأكيد المتجر", en: "Waiting for store confirmation" },
  expired_unconfirmed: { ar: "انتهى بدون تأكيد", en: "Expired without confirmation" },
  expired: { ar: "منتهي", en: "Expired" },
  trialing: { ar: "فترة تجريبية", en: "Trial period" },
  pre_launch_access: { ar: "دخول ما قبل الإطلاق", en: "Pre-launch access" },
  free_trial: { ar: "فترة مجانية", en: "Free trial" },
  subscription_active: { ar: "اشتراك مفعّل", en: "Active subscription" },
  commission_active: { ar: "نظام العمولة مفعّل", en: "Commission active" },
  grace_period: { ar: "فترة سماح", en: "Grace period" },
  monthly_subscription: { ar: "اشتراك شهري", en: "Monthly subscription" },
  subscription: { ar: "اشتراك متجر", en: "Store subscription" },
  commission: { ar: "عمولة على المبيعات", en: "Sales commission" },
  charge: { ar: "مبلغ مطلوب", en: "Charge" },
  payment: { ar: "دفعة", en: "Payment" },
  credit: { ar: "رصيد مضاف", en: "Credit" },
  adjustment: { ar: "تسوية", en: "Adjustment" },
  buyer: { ar: "عميل", en: "Buyer" },
  merchant: { ar: "متجر", en: "Merchant" },
  admin: { ar: "مدير", en: "Administrator" },
  support_agent: { ar: "موظف دعم", en: "Support agent" },
  guest: { ar: "ضيف", en: "Guest" },
  user: { ar: "مستخدم", en: "User" },
  system: { ar: "النظام", en: "System" },
  manual: { ar: "إدخال يدوي", en: "Manual input" },
  image: { ar: "صورة", en: "Image" },
  pdf: { ar: "ملف مستند", en: "PDF document" },
  voice: { ar: "تسجيل صوتي", en: "Voice recording" },
  excel: { ar: "جدول بيانات", en: "Spreadsheet" },
  uploaded: { ar: "تم الرفع", en: "Uploaded" },
  pending_review: { ar: "بانتظار المراجعة", en: "Pending review" },
  buyer_quote: { ar: "طلب عميل", en: "Buyer request" },
  merchant_import: { ar: "استيراد منتجات متجر", en: "Store product import" },
  product: { ar: "منتج", en: "Product" },
  search: { ar: "بحث محفوظ", en: "Saved search" },
  undecided: { ar: "لم يقرر بعد", en: "Undecided" },
  included: { ar: "مشمولة", en: "Included" },
  deferred: { ar: "مؤجلة", en: "Deferred" },
  catalog: { ar: "أسعار الكتالوج", en: "Catalog pricing" },
  manual_quote: { ar: "تسعير يدوي", en: "Manual quote" },
  single_merchant: { ar: "متجر واحد", en: "Single store" },
  split_merchants: { ar: "عدة متاجر", en: "Multiple stores" },
  accepted: { ar: "تم القبول", en: "Accepted" },
  withdrawn: { ar: "تم السحب", en: "Withdrawn" },
  waiting: { ar: "قيد الانتظار", en: "Waiting" },
  partially_confirmed: { ar: "مؤكد جزئيًا", en: "Partially confirmed" },
  fully_confirmed: { ar: "مؤكد بالكامل", en: "Fully confirmed" },
  partially_purchased: { ar: "تم شراء جزء", en: "Partially purchased" },
  closed_without_purchase: { ar: "أغلق بدون شراء", en: "Closed without purchase" },
  not_configured: { ar: "غير مجهزة", en: "Not configured" },
  configured: { ar: "بياناتها محفوظة", en: "Configured" },
  connected: { ar: "جاهزة", en: "Connected" },
  test: { ar: "تجريبي", en: "Test" },
  production: { ar: "تشغيل فعلي", en: "Live" },
  visa: { ar: "بطاقات بنكية", en: "Bank cards" },
  wallet: { ar: "محافظ إلكترونية", en: "Digital wallets" },
  vodafone_cash: { ar: "فودافون كاش", en: "Vodafone Cash" },
  meeza: { ar: "ميزة", en: "Meeza" },
  fixed: { ar: "سعر ثابت", en: "Fixed" },
  by_governorate: { ar: "حسب المحافظة", en: "By governorate" },
  by_weight: { ar: "حسب الوزن", en: "By weight" },
  zone: { ar: "حسب المنطقة", en: "By zone" },
  weight: { ar: "حسب الوزن", en: "By weight" },
  flat: { ar: "سعر ثابت", en: "Flat rate" },
  broadcast: { ar: "إرسال عام", en: "Broadcast" },
  direct: { ar: "إرسال مباشر", en: "Direct" },
  android: { ar: "أندرويد", en: "Android" },
  ios: { ar: "آيفون", en: "iOS" },
  web: { ar: "الموقع", en: "Web" },
  first_subscription: { ar: "أول اشتراك", en: "First subscription" },
  renewal: { ar: "التجديد", en: "Renewal" },
  both: { ar: "الاثنان", en: "Both" },
  tshirt: { ar: "تيشيرت", en: "T-shirt" },
  football: { ar: "كرة قدم", en: "Football" },
  cap: { ar: "قبعة", en: "Cap" },
  other: { ar: "أخرى", en: "Other" },
  delivered: { ar: "تم التسليم", en: "Delivered" },
  low: { ar: "منخفضة", en: "Low" },
  normal: { ar: "عادية", en: "Normal" },
  high: { ar: "مرتفعة", en: "High" },
  urgent: { ar: "عاجلة", en: "Urgent" },
  order: { ar: "طلب", en: "Order" },
  wrong_price: { ar: "سعر غير صحيح", en: "Incorrect price" },
  price_changed: { ar: "تغير السعر", en: "Price changed" },
  out_of_stock: { ar: "غير متوفر", en: "Out of stock" },
  all: { ar: "الكل", en: "All" },
  buyer_home_top: { ar: "واجهة العميل", en: "Buyer home" },
  buyer_referrals_top: { ar: "دعوة صديق للعملاء", en: "Buyer referrals" },
  merchant_referrals_top: { ar: "دعوة صديق للمتاجر", en: "Store referrals" },
  merchant_settings_top: { ar: "أعلى إعدادات المتجر", en: "Store settings" },
  account: { ar: "الحساب", en: "Account" },
  location: { ar: "الموقع", en: "Location" },
  buyer_requests: { ar: "طلبات العملاء", en: "Buyer requests" },
  orders: { ar: "الطلبات", en: "Orders" },
  favorites: { ar: "المفضلة والتنبيهات", en: "Favorites and alerts" },
  notifications: { ar: "الإشعارات", en: "Notifications" },
  merchant_registration: { ar: "تسجيل المتاجر", en: "Store registration" },
  merchant_branches: { ar: "فروع المتاجر", en: "Store branches" },
  merchant_catalog: { ar: "منتجات المتاجر", en: "Store catalog" },
  merchant_staff: { ar: "فريق المتجر", en: "Store team" },
  billing: { ar: "الاشتراكات والمدفوعات", en: "Billing and payments" },
  referrals: { ar: "الإحالات والمكافآت", en: "Referrals and rewards" },
  support: { ar: "الدعم", en: "Support" },
  privacy: { ar: "الخصوصية", en: "Privacy" },
  safety: { ar: "الأمان", en: "Safety" },
  badges: { ar: "شارات المتاجر", en: "Store badges" },
  arabic: { ar: "العربية", en: "Arabic" },
  english: { ar: "الإنجليزية", en: "English" },
  mixed: { ar: "مختلطة", en: "Mixed" },
  contains: { ar: "يحتوي على", en: "Contains" },
  exact: { ar: "مطابقة كاملة", en: "Exact match" },
  starts_with: { ar: "يبدأ بـ", en: "Starts with" },
  block: { ar: "منع", en: "Block" },
  warn: { ar: "تحذير", en: "Warn" },
  general: { ar: "عام", en: "General" },
  not_provided: { ar: "غير متوفر", en: "Not provided" },
  unassigned: { ar: "غير معين", en: "Unassigned" },
  store_owner_id_front: { ar: "هوية صاحب المتجر - الأمام", en: "Store owner ID - front" },
  store_owner_id_back: { ar: "هوية صاحب المتجر - الخلف", en: "Store owner ID - back" },
  store_front: { ar: "واجهة المتجر", en: "Storefront" },
  commercial_register: { ar: "السجل التجاري", en: "Commercial register" },
  branch_manager_id_front: { ar: "هوية مدير الفرع - الأمام", en: "Branch manager ID - front" },
  branch_manager_id_back: { ar: "هوية مدير الفرع - الخلف", en: "Branch manager ID - back" },
  branch_front: { ar: "واجهة الفرع", en: "Branch storefront" },
  activate_product: { ar: "إظهار منتج", en: "Show product" },
  ai_analysis_started: { ar: "بدء قراءة الملف", en: "Started file reading" },
  ai_analysis_completed: { ar: "اكتمال قراءة الملف", en: "Completed file reading" },
  ai_analysis_failed: { ar: "فشل قراءة الملف", en: "File reading failed" },
  approve_branch: { ar: "قبول فرع", en: "Approved branch" },
  approve_merchant: { ar: "قبول متجر", en: "Approved store" },
  approve_merchant_registration: { ar: "قبول تسجيل متجر", en: "Approved store registration" },
  assign_support_complaint: { ar: "تعيين شكوى لموظف دعم", en: "Assigned complaint to support" },
  assign_support_conversation: { ar: "تعيين محادثة لموظف دعم", en: "Assigned conversation to support" },
  block_user: { ar: "حظر مستخدم", en: "Blocked user" },
  close_support_conversation: { ar: "إغلاق محادثة دعم", en: "Closed support conversation" },
  create_admin_staff: { ar: "إضافة موظف إدارة", en: "Added admin staff" },
  create_row: { ar: "إضافة سجل", en: "Created record" },
  deactivate_product: { ar: "إخفاء منتج", en: "Hid product" },
  delete_product: { ar: "حذف منتج", en: "Deleted product" },
  delete_row: { ar: "حذف سجل", en: "Deleted record" },
  delete_user_account: { ar: "حذف حساب مستخدم", en: "Deleted user account" },
  reject_merchant_registration: { ar: "رفض تسجيل متجر", en: "Rejected store registration" },
  resolve_support_complaint: { ar: "حل شكوى دعم", en: "Resolved support complaint" },
  send_admin_notification: { ar: "إرسال إشعار إداري", en: "Sent admin notification" },
  set_feature_flag: { ar: "تعديل إعداد تشغيل", en: "Changed operating setting" },
  set_staff_active: { ar: "تعديل حالة موظف", en: "Changed staff status" },
  suspend_merchant: { ar: "إيقاف متجر", en: "Suspended store" },
  system_expire_unconfirmed_orders: { ar: "إنهاء الطلبات غير المؤكدة", en: "Expired unconfirmed orders" },
  test_payment_gateway: { ar: "فحص طريقة الدفع", en: "Checked payment method" },
  toggle_active: { ar: "تعديل حالة التشغيل", en: "Changed active status" },
  unblock_user: { ar: "فك حظر مستخدم", en: "Unblocked user" },
  update_merchant_badges: { ar: "تعديل شارات متجر", en: "Updated store badges" },
  update_referral_settings: { ar: "تعديل إعدادات الدعوات", en: "Updated invitation settings" },
  update_row: { ar: "تعديل سجل", en: "Updated record" },
  update_staff_permissions: { ar: "تعديل صلاحيات موظف", en: "Updated staff permissions" },
  ads_banners: { ar: "الإعلانات", en: "Ads" },
  ai_analysis_requests: { ar: "قراءات الملفات", en: "File readings" },
  branches: { ar: "الفروع", en: "Branches" },
  categories: { ar: "الأقسام", en: "Categories" },
  chat_conversations: { ar: "محادثات الدعم", en: "Support conversations" },
  cities: { ar: "المدن والمناطق", en: "Cities and areas" },
  feature_flags: { ar: "إعدادات التشغيل", en: "Operating settings" },
  knowledge_base: { ar: "معرفة المساعد الآلي", en: "Assistant knowledge" },
  merchants: { ar: "المتاجر", en: "Stores" },
  payment_settings: { ar: "إعدادات الدفع", en: "Payment settings" },
  products: { ar: "المنتجات", en: "Products" },
  support_complaints: { ar: "الشكاوى", en: "Complaints" },
  users: { ar: "المستخدمون", en: "Users" },
  admin_suspicious_match_threshold: { ar: "حد مراجعة التطابق", en: "Match review threshold" },
  ads: { ar: "الإعلانات", en: "Ads" },
  automatic_payment_enabled: { ar: "الدفع التلقائي", en: "Automatic payments" },
  buyer_in_app_payment_enabled: { ar: "دفع العميل داخل التطبيق", en: "Buyer in-app payments" },
  commission_mode_enabled: { ar: "نظام العمولة", en: "Commission billing" },
  commissions: { ar: "احتساب العمولات", en: "Commission calculation" },
  electronic_payments: { ar: "الدفع الإلكتروني", en: "Electronic payments" },
  electronic_payments_enabled: { ar: "تشغيل الدفع الإلكتروني", en: "Electronic payments enabled" },
  founder_counting_started: { ar: "عد المؤسسين", en: "Founder counting" },
  grace_period_enabled: { ar: "فترة السماح", en: "Grace period" },
  manual_payment_enabled: { ar: "التحويل اليدوي", en: "Manual payments" },
  manual_payments_enabled: { ar: "تشغيل التحويل اليدوي", en: "Manual payments enabled" },
  merchant_can_choose_billing_model: { ar: "اختيار المتجر لطريقة المحاسبة", en: "Store billing choice" },
  merchant_commission_enabled: { ar: "محاسبة المتاجر بالعمولة", en: "Store commission billing" },
  merchant_monthly_subscription_enabled: { ar: "اشتراكات المتاجر", en: "Store subscriptions" },
  monetization_enabled: { ar: "النظام المالي", en: "Financial system" },
  monetization_enforcement_enabled: { ar: "تطبيق قواعد المحاسبة", en: "Billing rules enforcement" },
  monthly_subscriptions: { ar: "الاشتراكات الشهرية", en: "Monthly subscriptions" },
  price_alerts: { ar: "تنبيهات الأسعار", en: "Price alerts" },
  referrals_enabled: { ar: "تشغيل الدعوات والمكافآت", en: "Invitations and rewards enabled" },
  "مستخدم محذوف": { ar: "مستخدم محذوف", en: "Deleted user" },
};

export function localizedValue(row: Record<string, unknown>, key: string, lang: CellLang) {
  if (lang === "en" && key.endsWith("_ar")) {
    const alternate = `${key.slice(0, -3)}_en`;
    if (row[alternate] !== null && row[alternate] !== undefined && row[alternate] !== "") {
      return row[alternate];
    }
  }
  if (lang === "ar" && key.endsWith("_en")) {
    const alternate = `${key.slice(0, -3)}_ar`;
    if (row[alternate] !== null && row[alternate] !== undefined && row[alternate] !== "") {
      return row[alternate];
    }
  }
  return row[key];
}

export function adminValueLabel(value: unknown, lang: CellLang) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  const direct = labels[normalized.toLowerCase()];
  if (direct) return direct[lang];

  if (/^deleted_[0-9a-f-]+@deleted\.saarly\.app$/i.test(normalized)) {
    return lang === "ar" ? "حساب محذوف" : "Deleted account";
  }
  if (/^deleted_[0-9a-f-]+$/i.test(normalized) || normalized === "Deleted User") {
    return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
  }

  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(normalized)) {
    if (lang === "ar") return "قيمة غير معروفة";
    return normalized
      .split("_")
      .join(" ")
      .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
  }
  return normalized;
}

export function formatCell(value: unknown, tone: ColumnConfig["tone"], lang: CellLang = "ar") {
  if (value === null || value === undefined || value === "") return "-";

  if (tone === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? adminValueLabel(value, lang)
      : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  }

  if (tone === "money") {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
          style: "currency",
          currency: "EGP",
        }).format(amount)
      : adminValueLabel(value, lang);
  }

  if (tone === "json" || typeof value === "object") {
    return lang === "ar" ? "إعدادات محفوظة" : "Saved settings";
  }
  if (typeof value === "boolean") {
    return value ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No";
  }

  return adminValueLabel(value, lang);
}

export function rowMatches(row: Record<string, unknown>, keys: string[] | undefined, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const targets = keys && keys.length > 0 ? keys : Object.keys(row);
  return targets.some((key) => String(row[key] ?? "").toLowerCase().includes(normalized));
}

export function coerceFormValue(key: string, value: string | boolean) {
  if (typeof value === "boolean") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (["display_order", "sort_order", "grace_months", "billing_period_months"].includes(key)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (["monthly_price"].includes(key)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (["configuration", "features", "permissions", "admin_action"].includes(key)) {
    return JSON.parse(trimmed || "{}") as unknown;
  }
  return trimmed;
}

export function fieldIsBoolean(key: string) {
  return key.startsWith("is_") || key === "needs_embedding";
}

export function fieldIsLongText(key: string) {
  return key.includes("content") || key.includes("description") || key === "configuration" || key === "features";
}
