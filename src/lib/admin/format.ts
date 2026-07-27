import type { ColumnConfig } from "./types";

type CellLang = "ar" | "en";

type Localized = { ar: string; en: string };

const labels: Record<string, Localized> = {
  transferred: { ar: "محوّلة للدعم", en: "Transferred to support" },
  bot: { ar: "مع المساعد الآلي", en: "With the assistant" },
  open: { ar: "مفتوحة", en: "Open" },
  in_support: { ar: "قيد المعالجة لدى الدعم", en: "Being handled by support" },
  escalated: { ar: "مصعّدة للإدارة", en: "Escalated to administration" },
  resolved: { ar: "تم الحل", en: "Resolved" },
  closed: { ar: "مغلقة", en: "Closed" },
  active: { ar: "مفعّل", en: "Active" },
  inactive: { ar: "متوقف", en: "Inactive" },
  approved: { ar: "مقبول", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  pending: { ar: "قيد الانتظار", en: "Pending" },
  processing: { ar: "قيد المعالجة", en: "Processing" },
  needs_review: { ar: "يحتاج مراجعة", en: "Needs review" },
  failed: { ar: "فشل", en: "Failed" },
  skipped: { ar: "لم يُرسل", en: "Not sent" },
  sent: { ar: "تم الإرسال", en: "Sent" },
  confirmed: { ar: "مؤكد", en: "Confirmed" },
  completed: { ar: "مكتمل", en: "Completed" },
  awaiting_confirmation: { ar: "في انتظار تأكيد المتجر", en: "Waiting for store confirmation" },
  expired_unconfirmed: { ar: "انتهى بدون تأكيد", en: "Expired without confirmation" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
  cancelled_by_merchant: { ar: "ملغي من المتجر", en: "Cancelled by store" },
  cancelled_by_buyer: { ar: "ملغي من العميل", en: "Cancelled by buyer" },
  not_required: { ar: "غير مطلوب", en: "Not required" },
  paid: { ar: "مدفوع", en: "Paid" },
  refunded: { ar: "مسترد", en: "Refunded" },
  due: { ar: "مستحق", en: "Due" },
  overdue: { ar: "متأخر", en: "Overdue" },
  buyer: { ar: "عميل", en: "Buyer" },
  merchant: { ar: "متجر", en: "Merchant" },
  admin: { ar: "مدير", en: "Administrator" },
  support_agent: { ar: "موظف دعم", en: "Support agent" },
  guest: { ar: "ضيف", en: "Guest" },
  manual: { ar: "إدخال يدوي", en: "Manual input" },
  image: { ar: "صورة", en: "Image" },
  pdf: { ar: "ملف PDF", en: "PDF" },
  voice: { ar: "تسجيل صوتي", en: "Voice" },
  buyer_quote: { ar: "طلب مشتري", en: "Buyer request" },
  merchant_import: { ar: "استيراد منتجات متجر", en: "Merchant product import" },
  low: { ar: "منخفضة", en: "Low" },
  normal: { ar: "عادية", en: "Normal" },
  high: { ar: "مرتفعة", en: "High" },
  urgent: { ar: "عاجلة", en: "Urgent" },
  order: { ar: "طلب", en: "Order" },
  wrong_price: { ar: "سعر غير صحيح", en: "Incorrect price" },
  other: { ar: "أخرى", en: "Other" },
  all: { ar: "الكل", en: "All" },
  buyer_home_top: { ar: "واجهة العميل", en: "Buyer home" },
  buyer_referrals_top: { ar: "دعوة صديق للعملاء", en: "Buyer referrals" },
  merchant_referrals_top: { ar: "دعوة صديق للمتاجر", en: "Merchant referrals" },
  merchant_settings_top: { ar: "أعلى إعدادات المتجر", en: "Merchant settings top" },
  account: { ar: "الحساب", en: "Account" },
  location: { ar: "الموقع", en: "Location" },
  buyer_requests: { ar: "طلبات العملاء", en: "Buyer requests" },
  orders: { ar: "الطلبات", en: "Orders" },
  favorites: { ar: "المفضلة والتنبيهات", en: "Favorites and alerts" },
  notifications: { ar: "الإشعارات", en: "Notifications" },
  merchant_registration: { ar: "تسجيل المتاجر", en: "Merchant registration" },
  merchant_branches: { ar: "فروع المتاجر", en: "Merchant branches" },
  merchant_catalog: { ar: "منتجات المتاجر", en: "Merchant catalog" },
  merchant_staff: { ar: "فريق المتجر", en: "Merchant staff" },
  billing: { ar: "الاشتراكات والمدفوعات", en: "Billing and payments" },
  referrals: { ar: "الإحالات والمكافآت", en: "Referrals and rewards" },
  support: { ar: "الدعم", en: "Support" },
  privacy: { ar: "الخصوصية", en: "Privacy" },
  safety: { ar: "الأمان", en: "Safety" },
  badges: { ar: "شارات المتاجر", en: "Store badges" },
  arabic: { ar: "العربية", en: "Arabic" },
  english: { ar: "الإنجليزية", en: "English" },
  mixed: { ar: "مختلطة", en: "Mixed" },
  not_provided: { ar: "غير متوفر", en: "Not provided" },
  "مستخدم محذوف": { ar: "مستخدم محذوف", en: "Deleted user" },
  unassigned: { ar: "غير معين", en: "Unassigned" },
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

function prettifyTechnicalValue(text: string, lang: CellLang) {
  const normalized = text.trim();
  const direct = labels[normalized.toLowerCase()];
  if (direct) return direct[lang];

  if (/^deleted_[0-9a-f-]+@deleted\.saarly\.app$/i.test(normalized)) {
    return lang === "ar" ? "حساب محذوف" : "Deleted account";
  }
  if (/^deleted_[0-9a-f-]+$/i.test(normalized)) {
    return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
  }
  if (normalized === "Deleted User") {
    return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
  }

  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(normalized)) {
    const readable = normalized.split("_").join(" ");
    return lang === "en"
      ? readable.replace(/\b\w/g, (letter: string) => letter.toUpperCase())
      : normalized;
  }
  return normalized;
}

export function formatCell(value: unknown, tone: ColumnConfig["tone"], lang: CellLang = "ar") {
  if (value === null || value === undefined || value === "") return "-";

  if (tone === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
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
      : String(value);
  }

  if (tone === "json" || typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No";

  return prettifyTechnicalValue(String(value), lang);
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
