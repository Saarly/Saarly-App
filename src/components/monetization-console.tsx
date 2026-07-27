"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Ban,
  Check,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  Mail,
  Percent,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  Wallet,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";

type Row = Record<string, unknown>;

type MonetizationData = {
  actorTime: string;
  warnings: string[];
  summary: Row;
  flags: Row[];
  paymentSettings: Row[];
  plans: Row[];
  discounts: Row[];
  manualMethods: Row[];
  manualRequests: Row[];
  transactions: Row[];
  merchants: Row[];
  subscriptions: Row[];
  commissions: Row[];
  settlements: Row[];
  documents: Row[];
  branches: Row[];
  reminderSettings: Row[];
  expirationEvents: Row[];
  badges: Row[];
  audit: Row[];
};

type DraftPlan = {
  id: string;
  plan_code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  monthly_price: string;
  old_price: string;
  currency: string;
  duration_days: string;
  grace_months: string;
  features_ar: string;
  features_en: string;
  sort_order: string;
  is_active: boolean;
};

type DraftDiscount = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  discount_percent: string;
  usage_limit: string;
  priority: string;
  applies_to: string;
  starts_at: string;
  ends_at: string;
  plan_ids: string;
  merchant_ids: string;
  is_active: boolean;
};

type DraftMethod = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  provider: string;
  account_label: string;
  account_number: string;
  account_holder_name: string;
  instructions_ar: string;
  instructions_en: string;
  allowed_mime_types: string;
  max_file_size_bytes: string;
  sort_order: string;
  is_active: boolean;
};

type DraftGateway = {
  provider: string;
  display_name_ar: string;
  display_name_en: string;
  gateway_environment: string;
  secret_reference: string;
  webhook_url: string;
  webhook_secret_name: string;
  webhook_signature_header: string;
  supported_currencies: string;
  supported_methods: string;
  is_direct_to_merchant_supported: boolean;
  is_enabled: boolean;
};

type FilePreview = {
  url: string;
  title: string;
  subtitle: string;
  mime: string;
  isImage: boolean;
  isPdf: boolean;
};

type StoreDocumentPreview = {
  merchantId: string;
  storeName: string;
  storeDocuments: Row[];
  branches: { branch: Row; documents: Row[] }[];
  extraBranchDocuments: Row[];
};

const emptyPlan: DraftPlan = {
  id: "",
  plan_code: "",
  name_ar: "",
  name_en: "",
  description_ar: "",
  description_en: "",
  monthly_price: "",
  old_price: "",
  currency: "EGP",
  duration_days: "30",
  grace_months: "1",
  features_ar: "",
  features_en: "",
  sort_order: "0",
  is_active: false
};

const emptyDiscount: DraftDiscount = {
  id: "",
  code: "",
  name_ar: "",
  name_en: "",
  discount_percent: "",
  usage_limit: "",
  priority: "0",
  applies_to: "both",
  starts_at: "",
  ends_at: "",
  plan_ids: "",
  merchant_ids: "",
  is_active: false
};

const emptyMethod: DraftMethod = {
  id: "",
  code: "",
  name_ar: "",
  name_en: "",
  provider: "",
  account_label: "",
  account_number: "",
  account_holder_name: "",
  instructions_ar: "",
  instructions_en: "",
  allowed_mime_types: "image/jpeg,image/png,application/pdf",
  max_file_size_bytes: "5242880",
  sort_order: "0",
  is_active: true
};

const emptyGateway: DraftGateway = {
  provider: "wallet",
  display_name_ar: "",
  display_name_en: "",
  gateway_environment: "test",
  secret_reference: "",
  webhook_url: "",
  webhook_secret_name: "",
  webhook_signature_header: "",
  supported_currencies: "EGP",
  supported_methods: "",
  is_direct_to_merchant_supported: false,
  is_enabled: false
};

const featureFlagLabels: Record<string, { ar: string; en: string; hintAr: string; hintEn: string }> = {
  monetization_enabled: {
    ar: "النظام المالي",
    en: "Monetization",
    hintAr: "عند الإيقاف تختفي واجهات الدفع ولا يتم إيقاف أي متجر بسبب الاشتراكات.",
    hintEn: "When disabled, payment UI is hidden and stores are not blocked for billing."
  },
  monetization_enforcement_enabled: {
    ar: "تطبيق الإيقاف المالي",
    en: "Billing enforcement",
    hintAr: "يفعل الإيقاف عند انتهاء الاشتراك أو تجاوز الرصيد بعد فترة السماح.",
    hintEn: "Blocks receiving orders when billing rules require it."
  },
  merchant_monthly_subscription_enabled: {
    ar: "اشتراكات المتاجر",
    en: "Store subscriptions",
    hintAr: "يسمح بإدارة الاشتراكات من بوابة المتاجر فقط.",
    hintEn: "Enables subscriptions through the merchant portal only."
  },
  merchant_commission_enabled: {
    ar: "العمولة",
    en: "Commission",
    hintAr: "يسجل مستحقات سعرلي على الطلبات المؤكدة حسب النسبة.",
    hintEn: "Records Saarly dues on confirmed orders."
  },
  merchant_can_choose_billing_model: {
    ar: "اختيار طريقة المحاسبة",
    en: "Billing choice",
    hintAr: "يسمح للمتجر بالاختيار بين اشتراك أو عمولة من بوابة المتاجر.",
    hintEn: "Lets merchants choose subscription or commission in the portal."
  },
  manual_payments_enabled: {
    ar: "التحويل اليدوي",
    en: "Manual payment",
    hintAr: "إظهار طرق التحويل وإثبات الدفع في بوابة المتاجر.",
    hintEn: "Shows transfer methods and proof upload in the portal."
  },
  electronic_payments_enabled: {
    ar: "الدفع الإلكتروني",
    en: "Electronic payment",
    hintAr: "إظهار الدفع الإلكتروني بعد ضبط بوابة دفع واجتياز الاختبار.",
    hintEn: "Shows electronic payment after gateway setup passes."
  },
  billing_grace_enabled: {
    ar: "فترة السماح",
    en: "Grace period",
    hintAr: "يعطي المتجر مدة قصيرة قبل الإيقاف حسب الإعداد.",
    hintEn: "Gives stores a short grace period before blocking."
  },
  receiving_orders_during_grace_enabled: {
    ar: "الطلبات أثناء السماح",
    en: "Orders during grace",
    hintAr: "يحدد هل يستقبل المتجر طلبات أثناء فترة السماح.",
    hintEn: "Controls whether stores receive orders during grace."
  },
  billing_reminders_enabled: {
    ar: "تنبيهات البريد",
    en: "Email reminders",
    hintAr: "يرسل تنبيهات قبل الانتهاء وبعده بدون تكرار بعد النجاح.",
    hintEn: "Sends reminders without duplicates after success."
  },
  founder_counting_started: {
    ar: "عد المؤسسين",
    en: "Founder count",
    hintAr: "يبدأ عد أول مئة متجر مرة واحدة فقط.",
    hintEn: "Starts the first 100 stores counter once."
  },
  founder_free_trial_enabled: {
    ar: "فترة المؤسسين",
    en: "Founder trial",
    hintAr: "يسمح بمنح فترة المؤسسين عند تفعيل النظام.",
    hintEn: "Allows founder trial grants when enabled."
  }
};

const labels = {
  ar: {
    loadError: "تعذر تحميل بيانات النظام المالي.",
    refresh: "تحديث",
    export: "تصدير",
    from: "من",
    to: "إلى",
    save: "حفظ",
    cancel: "إلغاء",
    edit: "تعديل",
    newPlan: "باقة جديدة",
    newDiscount: "خصم جديد",
    newMethod: "طريقة تحويل جديدة",
    enabled: "مفعّل",
    disabled: "موقوف",
    approve: "قبول",
    reject: "رفض",
    viewProof: "عرض الإثبات",
    viewFile: "عرض الملف",
    storeFiles: "ملفات المتجر",
    openFile: "فتح الملف",
    close: "إغلاق",
    changePlan: "تغيير الباقة",
    reasonPrompt: "اكتب السبب",
    confirmApprove: "هل تريد قبول هذا الطلب؟",
    confirmReject: "هل تريد رفض هذا الطلب؟",
    noData: "لا توجد بيانات الآن.",
    noStoreDocuments: "لا توجد ملفات مرفوعة لهذا الجزء.",
    done: "تم تنفيذ العملية.",
    paymentApproved: "تم قبول الدفع وتفعيل الباقة المختارة.",
    planUpdated: "تم تغيير الباقة وحساب المبلغ من جديد.",
    paymentRejected: "تم رفض طلب الدفع.",
    pending: "بانتظار المراجعة",
    active: "نشط",
    inactive: "غير نشط",
    startFounder: "بدء عد المؤسسين",
    test: "تجربة الربط",
    settle: "تسوية",
    retry: "إعادة محاولة",
    grant: "منح",
    revoke: "سحب"
  },
  en: {
    loadError: "Could not load monetization data.",
    refresh: "Refresh",
    export: "Export",
    from: "From",
    to: "To",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    newPlan: "New plan",
    newDiscount: "New discount",
    newMethod: "New transfer method",
    enabled: "Enabled",
    disabled: "Disabled",
    approve: "Approve",
    reject: "Reject",
    viewProof: "View proof",
    viewFile: "View file",
    storeFiles: "Store files",
    openFile: "Open file",
    close: "Close",
    changePlan: "Change plan",
    reasonPrompt: "Write the reason",
    confirmApprove: "Approve this request?",
    confirmReject: "Reject this request?",
    noData: "No data yet.",
    noStoreDocuments: "No uploaded files for this part.",
    done: "Action completed.",
    paymentApproved: "Payment approved and the selected plan is now active.",
    planUpdated: "Plan changed and the amount was recalculated.",
    paymentRejected: "Payment request rejected.",
    pending: "Pending review",
    active: "Active",
    inactive: "Inactive",
    startFounder: "Start founder count",
    test: "Test",
    settle: "Settle",
    retry: "Retry",
    grant: "Grant",
    revoke: "Revoke"
  }
};

const tabs = [
  { id: "summary", icon: ShieldCheck, ar: "الملخص", en: "Summary" },
  { id: "manual", icon: Wallet, ar: "التحويلات", en: "Manual payments" },
  { id: "electronic", icon: CreditCard, ar: "الإلكتروني", en: "Electronic" },
  { id: "plans", icon: Percent, ar: "الباقات والخصومات", en: "Plans and discounts" },
  { id: "methods", icon: ToggleLeft, ar: "طرق الدفع", en: "Payment setup" },
  { id: "founders", icon: Sparkles, ar: "المؤسسون والمتاجر", en: "Founders and stores" },
  { id: "commissions", icon: Flag, ar: "العمولات", en: "Commissions" },
  { id: "emails", icon: Mail, ar: "البريد والتقارير", en: "Emails and reports" }
] as const;

const valueLabels: Record<string, { ar: string; en: string }> = {
  submitted: { ar: "بانتظار المراجعة", en: "Waiting for review" },
  under_review: { ar: "قيد المراجعة", en: "Under review" },
  approved: { ar: "مقبول", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
  pending: { ar: "بانتظار المراجعة", en: "Pending" },
  active: { ar: "نشط", en: "Active" },
  inactive: { ar: "غير نشط", en: "Inactive" },
  trialing: { ar: "فترة تجريبية", en: "Trial period" },
  past_due: { ar: "في فترة السماح", en: "In grace period" },
  suspended: { ar: "موقوف", en: "Suspended" },
  succeeded: { ar: "ناجح", en: "Succeeded" },
  failed: { ar: "فشل", en: "Failed" },
  paid: { ar: "مدفوع", en: "Paid" },
  refunded: { ar: "تم الاسترداد", en: "Refunded" },
  not_configured: { ar: "لم تكتمل بياناتها", en: "Not set up" },
  configured: { ar: "بياناتها محفوظة", en: "Saved" },
  connected: { ar: "جاهزة", en: "Ready" },
  test: { ar: "تجربة", en: "Test" },
  production: { ar: "تشغيل فعلي", en: "Live" },
  monthly_subscription: { ar: "اشتراك شهري", en: "Monthly subscription" },
  commission: { ar: "عمولة", en: "Commission" },
  catalog: { ar: "أسعار من الكتالوج", en: "Catalog prices" },
  manual_quote: { ar: "تسعير يدوي", en: "Manual quote" },
  first_subscription: { ar: "أول اشتراك", en: "First subscription" },
  renewal: { ar: "تجديد", en: "Renewal" },
  both: { ar: "الاتنين", en: "Both" },
  visa: { ar: "بطاقات بنكية", en: "Cards" },
  wallet: { ar: "محافظ إلكترونية", en: "Wallets" },
  vodafone_cash: { ar: "فودافون كاش", en: "Vodafone Cash" },
  meeza: { ar: "ميزة", en: "Meeza" },
  store_owner_id_front: { ar: "بطاقة صاحب المتجر - الوجه الأمامي", en: "Store owner ID - front" },
  store_owner_id_back: { ar: "بطاقة صاحب المتجر - الوجه الخلفي", en: "Store owner ID - back" },
  branch_manager_id_front: { ar: "بطاقة مدير الفرع - الوجه الأمامي", en: "Branch manager ID - front" },
  branch_manager_id_back: { ar: "بطاقة مدير الفرع - الوجه الخلفي", en: "Branch manager ID - back" },
  store_front: { ar: "صورة واجهة المتجر", en: "Storefront photo" },
  branch_front: { ar: "صورة واجهة الفرع", en: "Branch front photo" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  subscription_expiring: { ar: "الاشتراك قرب ينتهي", en: "Subscription ending soon" },
  subscription_expired: { ar: "الاشتراك انتهى", en: "Subscription expired" },
  grace_period_started: { ar: "بدأت فترة السماح", en: "Grace period started" },
  grace_period_ended: { ar: "انتهت فترة السماح", en: "Grace period ended" }
};

function displayValue(key: string, row: Row, lang: Lang) {
  const value = row[key];
  if (key.includes("amount") || key === "base_amount" || key === "final_amount") {
    return money(value, row.currency, lang);
  }
  if (key === "webhook_signature_valid") {
    if (value === null || value === undefined) {
      return lang === "ar" ? "لم يصل تأكيد بعد" : "No confirmation yet";
    }
    return value ? (lang === "ar" ? "تأكيد سليم" : "Confirmed") : (lang === "ar" ? "تأكيد غير سليم" : "Not confirmed");
  }
  if (key === "kind") {
    return documentKindLabel(value, lang);
  }
  if (typeof value === "string" && valueLabels[value]) {
    return valueLabels[value][lang];
  }
  return cell(value, lang);
}

function documentKindLabel(value: unknown, lang: Lang) {
  const raw = String(value ?? "");
  return valueLabels[raw]?.[lang] ?? (lang === "ar" ? "مستند متجر" : "Store document");
}

function planOptionLabel(plan: Row, lang: Lang) {
  const name = cell(lang === "ar" ? plan.name_ar : plan.name_en, lang);
  return `${name} - ${money(plan.monthly_price, plan.currency, lang)}`;
}

function featureFlagLabel(key: unknown, lang: Lang) {
  const safeKey = String(key ?? "");
  return featureFlagLabels[safeKey]?.[lang] ?? (lang === "ar" ? "إعداد إضافي" : prettifyCode(safeKey));
}

function prettifyCode(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cell(value: unknown, lang: Lang) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? labels[lang].enabled : labels[lang].disabled;
  if (typeof value === "number") return value.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
  if (typeof value === "string") {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(value) && !Number.isNaN(date.getTime())) {
      return date.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
    }
    if (valueLabels[value]) return valueLabels[value][lang];
    return value;
  }
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

function money(value: unknown, currency: unknown, lang: Lang) {
  const amount = Number(value ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${safeAmount.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} ${currencyLabel(currency, lang)}`;
}

function currencyLabel(currency: unknown, lang: Lang) {
  const code = typeof currency === "string" ? currency.toUpperCase() : "EGP";
  if (lang === "ar") {
    if (code === "EGP") return "جنيه مصري";
    if (code === "USD") return "دولار";
    if (code === "SAR") return "ريال سعودي";
    return "عملة غير متاحة";
  }
  if (code === "EGP") return "Egyptian pound";
  if (code === "USD") return "US dollar";
  if (code === "SAR") return "Saudi riyal";
  return "Unavailable currency";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function hasProofFile(row: Row) {
  return Boolean(row.proof_storage_path || row.storage_path);
}

function previewTitle(table: string, row: Row, lang: Lang) {
  if (table === "manual_payment_requests") {
    const storeName = asString(row.store_name);
    return storeName
      ? lang === "ar" ? `إثبات دفع ${storeName}` : `${storeName} payment proof`
      : lang === "ar" ? "إثبات الدفع" : "Payment proof";
  }
  return documentKindLabel(row.kind, lang);
}

function previewSubtitle(table: string, row: Row, lang: Lang) {
  const parts = [
    asString(row.store_name),
    asString(row.branch_name),
    table === "manual_payment_requests" ? money(row.final_amount, row.currency, lang) : asString(row.manager_name)
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : (lang === "ar" ? "ملف مرفوع للمراجعة" : "Uploaded file for review");
}

function isImageFile(url: string, mime: string) {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(url.split("?")[0]);
}

function isPdfFile(url: string, mime: string) {
  return mime === "application/pdf" || /\.pdf$/i.test(url.split("?")[0]);
}

function isActiveStatus(status: unknown) {
  return ["active", "trialing", "approved", "succeeded", "paid"].includes(String(status));
}

function csvEscape(value: unknown) {
  return `"${cell(value, "en").replace(/"/g, '""')}"`;
}

function downloadCsv(name: string, rows: Row[]) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 30);
  const content = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function planDraftFrom(row: Row): DraftPlan {
  return {
    id: asString(row.id),
    plan_code: asString(row.plan_code),
    name_ar: asString(row.name_ar),
    name_en: asString(row.name_en),
    description_ar: asString(row.description_ar),
    description_en: asString(row.description_en),
    monthly_price: String(row.monthly_price ?? ""),
    old_price: String(row.old_price ?? ""),
    currency: asString(row.currency) || "EGP",
    duration_days: String(row.duration_days ?? "30"),
    grace_months: String(row.grace_months ?? "1"),
    features_ar: Array.isArray(row.features_ar) ? row.features_ar.join("\n") : "",
    features_en: Array.isArray(row.features_en) ? row.features_en.join("\n") : "",
    sort_order: String(row.sort_order ?? "0"),
    is_active: Boolean(row.is_active)
  };
}

function discountDraftFrom(row: Row): DraftDiscount {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name_ar: asString(row.name_ar),
    name_en: asString(row.name_en),
    discount_percent: String(row.discount_percent ?? ""),
    usage_limit: String(row.usage_limit ?? ""),
    priority: String(row.priority ?? "0"),
    applies_to: asString(row.applies_to) || "both",
    starts_at: asString(row.starts_at).slice(0, 10),
    ends_at: asString(row.ends_at).slice(0, 10),
    plan_ids: Array.isArray(row.plan_ids) ? row.plan_ids.join(",") : "",
    merchant_ids: Array.isArray(row.merchant_ids) ? row.merchant_ids.join(",") : "",
    is_active: Boolean(row.is_active)
  };
}

function methodDraftFrom(row: Row): DraftMethod {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name_ar: asString(row.name_ar),
    name_en: asString(row.name_en),
    provider: asString(row.provider),
    account_label: asString(row.account_label),
    account_number: asString(row.account_number),
    account_holder_name: asString(row.account_holder_name),
    instructions_ar: asString(row.instructions_ar),
    instructions_en: asString(row.instructions_en),
    allowed_mime_types: Array.isArray(row.allowed_mime_types) ? row.allowed_mime_types.join(",") : "",
    max_file_size_bytes: String(row.max_file_size_bytes ?? "5242880"),
    sort_order: String(row.sort_order ?? "0"),
    is_active: Boolean(row.is_active)
  };
}

function TabGuide({
  lang,
  title,
  ar,
  en,
  icon
}: {
  lang: Lang;
  title: string;
  ar: string;
  en: string;
  icon: ReactNode;
}) {
  return (
    <div className="tab-guide">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p dir="auto">{lang === "ar" ? ar : en}</p>
      </div>
    </div>
  );
}

function gatewayDraftFrom(row: Row): DraftGateway {
  return {
    provider: asString(row.provider) || "wallet",
    display_name_ar: asString(row.display_name_ar),
    display_name_en: asString(row.display_name_en),
    gateway_environment: asString(row.gateway_environment) || "test",
    secret_reference: asString(row.secret_reference),
    webhook_url: asString(row.webhook_url),
    webhook_secret_name: asString(row.webhook_secret_name),
    webhook_signature_header: asString(row.webhook_signature_header) === "x-saarly-signature" ? "" : asString(row.webhook_signature_header),
    supported_currencies: Array.isArray(row.supported_currencies) ? row.supported_currencies.join(",") : "EGP",
    supported_methods: Array.isArray(row.supported_methods) ? row.supported_methods.join(",") : "",
    is_direct_to_merchant_supported: Boolean(row.is_direct_to_merchant_supported),
    is_enabled: Boolean(row.is_enabled)
  };
}

export function MonetizationConsole({ lang }: { lang: Lang }) {
  const [data, setData] = useState<MonetizationData | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("summary");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<DraftPlan>(emptyPlan);
  const [discountDraft, setDiscountDraft] = useState<DraftDiscount>(emptyDiscount);
  const [methodDraft, setMethodDraft] = useState<DraftMethod>(emptyMethod);
  const [gatewayDraft, setGatewayDraft] = useState<DraftGateway>(emptyGateway);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [documentPreviewMerchantId, setDocumentPreviewMerchantId] = useState<string | null>(null);

  const l = labels[lang];

  async function token() {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("auth_required");
    return accessToken;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await token();
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/admin/monetization?${params.toString()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: MonetizationData; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "load_failed");
      setData(payload.data);
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang) || l.loadError);
    } finally {
      setLoading(false);
    }
  }

  async function post(action: string, payload: Row, successMessage = l.done) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const accessToken = await token();
      const response = await fetch("/api/admin/monetization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ action, payload })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "action_failed");
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(humanizeAdminError(actionError, lang));
    } finally {
      setBusy(null);
    }
  }

  async function openProof(table: string, row: Row) {
    const accessToken = await token();
    const params = new URLSearchParams({ proofTable: table, proofId: asString(row.id) });
    const response = await fetch(`/api/admin/monetization?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: { url?: string }; error?: string };
    if (!response.ok || !payload.data?.url) {
      setError(humanizeAdminError(payload.error ?? "signed_link_failed", lang));
      return;
    }
    const mime = asString(row.proof_mime_type ?? row.mime_type);
    setFilePreview({
      url: payload.data.url,
      title: previewTitle(table, row, lang),
      subtitle: previewSubtitle(table, row, lang),
      mime,
      isImage: isImageFile(payload.data.url, mime),
      isPdf: isPdfFile(payload.data.url, mime)
    });
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!data || !needle) return data;
    const match = (row: Row) => JSON.stringify(row).toLowerCase().includes(needle);
    return {
      ...data,
      manualRequests: data.manualRequests.filter(match),
      transactions: data.transactions.filter(match),
      merchants: data.merchants.filter(match),
      documents: data.documents.filter(match),
      commissions: data.commissions.filter(match),
      expirationEvents: data.expirationEvents.filter(match)
    };
  }, [data, query]);

  const documentPreview = useMemo<StoreDocumentPreview | null>(() => {
    if (!documentPreviewMerchantId || !data) return null;
    const merchant = data.merchants.find((item) => asString(item.id) === documentPreviewMerchantId);
    const documents = data.documents.filter((item) => asString(item.merchant_id) === documentPreviewMerchantId);
    const storeDocuments = documents.filter((item) => !asString(item.branch_id));
    const storeBranches = data.branches.filter((item) => asString(item.merchant_id) === documentPreviewMerchantId);
    const branchIds = new Set(storeBranches.map((branch) => asString(branch.id)));
    const branches = storeBranches.map((branch) => ({
      branch,
      documents: documents.filter((item) => asString(item.branch_id) === asString(branch.id))
    }));

    return {
      merchantId: documentPreviewMerchantId,
      storeName: asString(merchant?.store_name) || asString(documents.find((item) => asString(item.store_name))?.store_name) || "-",
      storeDocuments,
      branches,
      extraBranchDocuments: documents.filter((item) => {
        const branchId = asString(item.branch_id);
        return Boolean(branchId) && !branchIds.has(branchId);
      })
    };
  }, [documentPreviewMerchantId, data]);

  function flagEnabled(key: string) {
    return Boolean(data?.flags.find((flag) => flag.key === key)?.is_enabled);
  }

  const metricCards: [string, string, unknown, string][] = [
    ["المتاجر المؤسسة", "Founders", filtered?.summary.foundersCount, "founderRemaining"],
    ["اشتراكات نشطة", "Active subscriptions", filtered?.summary.activeSubscriptions, "activeSubscriptions"],
    ["طلبات تحويل معلقة", "Pending manual payments", filtered?.summary.pendingManualPayments, "pendingManualPayments"],
    ["دفع إلكتروني ناجح", "Electronic success", filtered?.summary.electronicSucceeded, "electronicSucceeded"],
    ["إيراد الاشتراكات", "Subscription revenue", filtered?.summary.subscriptionRevenue, "subscriptionRevenue"],
    ["عمولات غير مسددة", "Unpaid commissions", filtered?.summary.commissionsUnpaid, "commissionsUnpaid"],
    ["متاجر في السماح", "Grace stores", filtered?.summary.graceSubscriptions, "graceSubscriptions"],
  ];

  if (loading && !data) {
    return (
      <section className="content-panel">
        <div className="empty-state">{lang === "ar" ? "جار تحميل النظام المالي..." : "Loading monetization..."}</div>
      </section>
    );
  }

  return (
    <section className="content-panel monetization-console">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "النظام المالي النهائي" : "Final monetization system"}</span>
          <h1>{lang === "ar" ? "الاشتراكات والدفع والعمولات" : "Subscriptions, payments, and commissions"}</h1>
          <p>
            {lang === "ar"
              ? "كل القرارات المهمة بتتم من مكان آمن بعد التأكد من صلاحية الحساب، ومفيش بيانات حساسة بتظهر في المتصفح."
              : "Important actions are checked securely before they are saved, and private payment details are never shown in the browser."}
          </p>
        </div>
        <div className="section-actions">
          <label className="compact-field">
            <span>{l.from}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="compact-field">
            <span>{l.to}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="soft-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} />
            {l.refresh}
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {message ? <div className="success-alert"><Check size={18} />{message}</div> : null}
      {filtered?.warnings?.length ? (
        <div className="alert">
          {lang === "ar"
            ? "في جزء من البيانات محتاج مراجعة، لكن باقي الصفحة شغالة."
            : "Some data needs attention, but the rest of the page is available."}
        </div>
      ) : null}

      <div className="metric-grid">
        {metricCards.map(([ar, en, value, key]) => (
          <article className="metric-card" key={String(key)}>
            <span>{lang === "ar" ? ar : en}</span>
            <strong>
              {String(key).includes("Revenue") || String(key).includes("commissions")
                ? money(value, "EGP", lang)
                : asNumber(value).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
            </strong>
          </article>
        ))}
      </div>

      <div className="monetization-tabs">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <Icon size={18} />
              {lang === "ar" ? item.ar : item.en}
            </button>
          );
        })}
      </div>

      <div className="table-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={lang === "ar" ? "بحث داخل القسم الحالي" : "Search current data"}
        />
        <button className="soft-button" onClick={() => filtered && downloadCsv(`saarly-${tab}`, rowsForTab(tab, filtered))}>
          <Download size={17} />
          {l.export}
        </button>
      </div>

      {filtered ? (
        <>
          {tab === "summary" ? renderSummary() : null}
          {tab === "manual" ? renderManualPayments() : null}
          {tab === "electronic" ? renderElectronicPayments() : null}
          {tab === "plans" ? renderPlansAndDiscounts() : null}
          {tab === "methods" ? renderMethodsAndGateway() : null}
          {tab === "founders" ? renderFoundersAndMerchants() : null}
          {tab === "commissions" ? renderCommissions() : null}
          {tab === "emails" ? renderEmailsAndReports() : null}
        </>
      ) : null}
      {filePreview ? <FilePreviewModal lang={lang} preview={filePreview} onClose={() => setFilePreview(null)} /> : null}
      {documentPreview ? (
        <StoreDocumentsModal
          lang={lang}
          preview={documentPreview}
          onClose={() => setDocumentPreviewMerchantId(null)}
          onOpen={(row) => void openProof("merchant_documents", row)}
          onApprove={(row) => void post("review_document", { id: row.id, approved: true })}
          onReject={(row) => {
            const reason = window.prompt(l.reasonPrompt);
            if (reason) void post("review_document", { id: row.id, approved: false, reason });
          }}
        />
      ) : null}
    </section>
  );

  function renderSummary() {
    return (
      <div className="monetization-grid two">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "يعني إيه الملخص؟" : "What this tab does"}
          ar="هنا بتشوف الصورة الكبيرة بسرعة: النظام شغال ولا لأ، كام اشتراك نشط، كام تحويل مستني مراجعة، والعمولات اللي لسه متسدّدتش."
          en="This is the quick health check for monetization: active subscriptions, pending transfers, grace, suspensions, and unpaid commission."
          icon={<ShieldCheck size={20} />}
        />
        <article className="content-panel inner-panel">
          <div className="panel-title-row">
            <h2>{lang === "ar" ? "مفاتيح التشغيل العامة" : "General switches"}</h2>
            <span className={flagEnabled("monetization_enabled") ? "status-pill active" : "status-pill expired"}>
              {flagEnabled("monetization_enabled") ? l.enabled : l.disabled}
            </span>
          </div>
          <div className="feature-list">
            {Object.entries(featureFlagLabels).map(([key, label]) => {
              const enabled = flagEnabled(key);
              return (
                <div className="feature-row" key={key}>
                  <div>
                    <strong>{lang === "ar" ? label.ar : label.en}</strong>
                    <span>{lang === "ar" ? label.hintAr : label.hintEn}</span>
                  </div>
                  <button
                    className={enabled ? "primary-button compact" : "soft-button compact"}
                    disabled={busy === "set_feature_flag"}
                    onClick={() => void post("set_feature_flag", { key, enabled: !enabled })}
                  >
                    {enabled ? l.enabled : l.disabled}
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <article className="content-panel inner-panel">
          <h2>{lang === "ar" ? "حالة طرق الدفع" : "Payment availability"}</h2>
          <div className="payment-mode-grid">
            <button
              className={flagEnabled("manual_payments_enabled") ? "primary-button" : "soft-button"}
              disabled={busy === "save_payment_modes"}
              onClick={() =>
                void post("save_payment_modes", {
                  manual_enabled: !flagEnabled("manual_payments_enabled"),
                  electronic_enabled: flagEnabled("electronic_payments_enabled")
                })
              }
            >
              <Wallet size={18} />
              {lang === "ar" ? "التحويل اليدوي" : "Manual payment"}
            </button>
            <button
              className={flagEnabled("electronic_payments_enabled") ? "primary-button" : "soft-button"}
              disabled={busy === "save_payment_modes"}
              onClick={() =>
                void post("save_payment_modes", {
                  manual_enabled: flagEnabled("manual_payments_enabled"),
                  electronic_enabled: !flagEnabled("electronic_payments_enabled")
                })
              }
            >
              <CreditCard size={18} />
              {lang === "ar" ? "الدفع الإلكتروني" : "Electronic payment"}
            </button>
          </div>
          <div className="mini-table">
            {filtered?.flags.filter((flag) => featureFlagLabels[asString(flag.key)]).slice(0, 12).map((flag) => (
              <div key={asString(flag.key)}>
                <span>{featureFlagLabel(flag.key, lang)}</span>
                <strong>{cell(flag.updated_at, lang)}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    );
  }

  function renderManualPayments() {
    const requests = filtered?.manualRequests ?? [];
    const planOptions = (filtered?.plans ?? []).filter(
      (plan) => Boolean(plan.is_active) || requests.some((request) => asString(request.plan_id) === asString(plan.id))
    );
    return (
      <article className="content-panel inner-panel">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "إزاي تستخدم التحويلات؟" : "How to use manual payments"}
          ar="هنا بتراجع إثباتات دفع الاشتراكات اللي المتاجر رفعتها من بوابة المتاجر. لو المتجر اختار باقة ودفع مبلغ باقة تانية، غيّر الباقة من نفس الصف قبل القبول. بعدها افتح الإثبات واقبل أو ارفض مع سبب واضح."
          en="Review subscription proof uploaded from the merchant portal. If a store picked one plan but paid for another, change the plan in the same row before approval. Then open the proof and approve or reject with a clear reason."
          icon={<Wallet size={20} />}
        />
        <div className="panel-title-row">
          <h2>{lang === "ar" ? "طلبات التحويل اليدوي" : "Manual payment requests"}</h2>
          <span className="status-pill">{requests.length}</span>
        </div>
        <DataTable
          rows={requests}
          lang={lang}
          empty={l.noData}
          columns={[
            ["store_name", lang === "ar" ? "المتجر" : "Store"],
            ["merchant_email", lang === "ar" ? "البريد" : "Email"],
            [lang === "ar" ? "plan_name_ar" : "plan_name_en", lang === "ar" ? "الباقة" : "Plan"],
            ["final_amount", lang === "ar" ? "المبلغ" : "Amount"],
            ["status", lang === "ar" ? "الحالة" : "Status"],
            ["created_at", lang === "ar" ? "التاريخ" : "Date"]
          ]}
          renderActions={(row) => (
            <>
              <select
                className="tiny-select"
                aria-label={l.changePlan}
                value={asString(row.plan_id)}
                disabled={!["submitted", "under_review"].includes(String(row.status)) || Boolean(busy)}
                onChange={(event) => {
                  const planId = event.target.value;
                  if (planId && planId !== asString(row.plan_id)) {
                    void post("update_manual_payment_plan", { id: row.id, plan_id: planId }, l.planUpdated);
                  }
                }}
              >
                <option value="">{l.changePlan}</option>
                {planOptions.map((plan) => (
                  <option key={asString(plan.id)} value={asString(plan.id)}>
                    {planOptionLabel(plan, lang)}
                  </option>
                ))}
              </select>
              <button className="tiny-button" disabled={!hasProofFile(row)} onClick={() => void openProof("manual_payment_requests", row)}>
                <Eye size={15} />
                {l.viewProof}
              </button>
              <button
                className="tiny-button"
                disabled={!hasProofFile(row) || !["submitted", "under_review"].includes(String(row.status)) || Boolean(busy)}
                onClick={() => {
                  if (window.confirm(l.confirmApprove)) {
                    void post("review_manual_payment", { id: row.id, approved: true }, l.paymentApproved);
                  }
                }}
              >
                <Check size={15} />
                {l.approve}
              </button>
              <button
                className="tiny-button danger"
                disabled={!["submitted", "under_review"].includes(String(row.status)) || Boolean(busy)}
                onClick={() => {
                  const reason = window.prompt(l.reasonPrompt);
                  if (reason && window.confirm(l.confirmReject)) {
                    void post("review_manual_payment", { id: row.id, approved: false, reason }, l.paymentRejected);
                  }
                }}
              >
                <X size={15} />
                {l.reject}
              </button>
            </>
          )}
        />
      </article>
    );
  }

  function renderElectronicPayments() {
    const transactions = filtered?.transactions ?? [];
    return (
      <article className="content-panel inner-panel">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "إزاي تتابع الدفع الإلكتروني؟" : "How to track electronic payments"}
          ar="دي متابعة للمدفوعات الإلكترونية. حالة النجاح أو الفشل بتتسجل من شركة الدفع بعد ما العملية تخلص، مش بمجرد إن العميل يشوف صفحة نجاح."
          en="Track electronic payments here. Success or failure is saved only after the payment company confirms the result."
          icon={<CreditCard size={20} />}
        />
        <div className="panel-title-row">
          <h2>{lang === "ar" ? "المعاملات الإلكترونية" : "Electronic transactions"}</h2>
          <span className="status-pill">{transactions.length}</span>
        </div>
        <DataTable
          rows={transactions}
          lang={lang}
          empty={l.noData}
          columns={[
            ["provider", lang === "ar" ? "المزوّد" : "Provider"],
            ["store_name", lang === "ar" ? "المتجر" : "Store"],
            [lang === "ar" ? "plan_name_ar" : "plan_name_en", lang === "ar" ? "الباقة" : "Plan"],
            ["amount", lang === "ar" ? "المبلغ" : "Amount"],
            ["status", lang === "ar" ? "الحالة" : "Status"],
            ["webhook_signature_valid", lang === "ar" ? "تأكيد شركة الدفع" : "Payment confirmation"],
            ["processed_at", lang === "ar" ? "وقت التسجيل" : "Saved at"]
          ]}
          renderActions={(row) => (
            <>
              <button className="tiny-button" onClick={() => void post("retry_transaction", { id: row.id })}>
                <RefreshCw size={15} />
                {l.retry}
              </button>
              <button className="tiny-button danger" onClick={() => void post("refund_transaction", { id: row.id })}>
                <Ban size={15} />
                {lang === "ar" ? "استرداد" : "Refund"}
              </button>
            </>
          )}
        />
      </article>
    );
  }

  function renderPlansAndDiscounts() {
    return (
      <div className="monetization-grid two">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "الباقات والخصومات بتتظبط منين؟" : "How plans and discounts work"}
          ar="هنا بتضيف أو تعدل الباقات والخصومات اللي هتظهر في بوابة المتاجر بس. التطبيق نفسه يعرض الحالة فقط ومش بيبيع اشتراكات."
          en="Create and edit plans and discounts shown in the merchant portal only. The mobile app only shows account status."
          icon={<Percent size={20} />}
        />
        <article className="content-panel inner-panel">
          <div className="panel-title-row">
            <h2>{lang === "ar" ? "الباقات" : "Plans"}</h2>
            <button className="soft-button" onClick={() => setPlanDraft(emptyPlan)}>
              {l.newPlan}
            </button>
          </div>
          <PlanForm />
          <div className="cards-list">
            {(filtered?.plans ?? []).map((plan) => (
              <div className="compact-card" key={asString(plan.id)}>
                <div>
                  <strong>{cell(lang === "ar" ? plan.name_ar : plan.name_en, lang)}</strong>
                  <span>{money(plan.monthly_price, plan.currency, lang)} · {cell(plan.duration_days, lang)} {lang === "ar" ? "يوم" : "days"}</span>
                </div>
                <div className="row-actions">
                  <span className={Boolean(plan.is_active) ? "status-pill active" : "status-pill muted"}>
                    {Boolean(plan.is_active) ? l.active : l.inactive}
                  </span>
                  <button className="tiny-button" onClick={() => setPlanDraft(planDraftFrom(plan))}>
                    {l.edit}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="content-panel inner-panel">
          <div className="panel-title-row">
            <h2>{lang === "ar" ? "الخصومات" : "Discounts"}</h2>
            <button className="soft-button" onClick={() => setDiscountDraft(emptyDiscount)}>
              {l.newDiscount}
            </button>
          </div>
          <DiscountForm />
          <div className="cards-list">
            {(filtered?.discounts ?? []).map((discount) => (
              <div className="compact-card" key={asString(discount.id)}>
                <div>
                  <strong>{cell(lang === "ar" ? discount.name_ar : discount.name_en, lang)}</strong>
                  <span>{cell(discount.discount_percent, lang)}% · {cell(discount.applies_to, lang)}</span>
                </div>
                <button className="tiny-button" onClick={() => setDiscountDraft(discountDraftFrom(discount))}>
                  {l.edit}
                </button>
              </div>
            ))}
          </div>
        </article>
      </div>
    );
  }

  function renderMethodsAndGateway() {
    return (
      <div className="monetization-grid two">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "طرق الدفع بتتظبط إزاي؟" : "How payment methods are configured"}
          ar="هنا بتحدد للمتاجر طرق الدفع اللي يقدروا يستخدموها من بوابة المتاجر. التحويل اليدوي بيحتاج رقم حساب وتعليمات، والدفع الإلكتروني بيحتاج بيانات الربط اللي بتديها شركة الدفع. متكتبش أي رقم سري هنا؛ اكتب بس اسم البيانات المحفوظة في المكان الآمن."
          en="Choose the payment methods merchants can use in the merchant portal. Manual transfer needs account details and instructions. Online payment needs the connection details from the payment company. Do not type any private secret here; enter only the saved connection name."
          icon={<ToggleLeft size={20} />}
        />
        <article className="content-panel inner-panel">
          <div className="panel-title-row">
            <h2>{lang === "ar" ? "طرق التحويل اليدوي" : "Manual transfer methods"}</h2>
            <button className="soft-button" onClick={() => setMethodDraft(emptyMethod)}>
              {l.newMethod}
            </button>
          </div>
          <MethodForm />
          <div className="cards-list">
            {(filtered?.manualMethods ?? []).map((method) => (
              <div className="compact-card" key={asString(method.id)}>
                <div>
                  <strong>{cell(lang === "ar" ? method.name_ar : method.name_en, lang)}</strong>
                  <span>{cell(method.account_label, lang)} · {cell(method.account_number, lang)}</span>
                </div>
                <div className="row-actions">
                  <span className={Boolean(method.is_active) ? "status-pill active" : "status-pill muted"}>
                    {Boolean(method.is_active) ? l.active : l.inactive}
                  </span>
                  <button className="tiny-button" onClick={() => setMethodDraft(methodDraftFrom(method))}>
                    {l.edit}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="content-panel inner-panel">
          <div className="panel-title-row">
            <div>
              <h2>{lang === "ar" ? "بوابات الدفع الإلكتروني" : "Payment gateways"}</h2>
              <p>
                {lang === "ar"
                  ? "اكتب الاسم اللي هيظهر للمتاجر وبيانات الربط اللي شركة الدفع هتبعتهالك. لو البوابة مش جاهزة بالكامل، هتفضل غير مفعلة عشان ما يظهرش دفع مش شغال."
                  : "Enter the name merchants will see and the connection details from the payment company. If the gateway is not fully ready, it stays off so merchants do not see a broken payment option."}
              </p>
            </div>
            <button className="soft-button" onClick={() => setGatewayDraft(emptyGateway)}>
              {lang === "ar" ? "بوابة جديدة" : "New gateway"}
            </button>
          </div>
          <GatewayForm />
          <div className="cards-list">
            {(filtered?.paymentSettings ?? []).map((gateway) => (
              <div className="compact-card gateway-card" key={asString(gateway.id)}>
                <div>
                  <strong>{cell(lang === "ar" ? gateway.display_name_ar ?? gateway.provider : gateway.display_name_en ?? gateway.provider, lang)}</strong>
                  <span>
                    {displayValue("gateway_environment", gateway, lang)} · {displayValue("config_status", gateway, lang)} ·{" "}
                    {Boolean(gateway.is_connected) ? (lang === "ar" ? "متصل" : "Connected") : (lang === "ar" ? "غير متصل" : "Not connected")}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="tiny-button" onClick={() => setGatewayDraft(gatewayDraftFrom(gateway))}>
                    {l.edit}
                  </button>
                  <button className="tiny-button" onClick={() => void post("test_gateway", { provider: gateway.provider })}>
                    {l.test}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    );
  }

  function renderFoundersAndMerchants() {
    return (
      <article className="content-panel inner-panel">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "المؤسسين والمتاجر" : "Founders and store controls"}
          ar="هنا بتبدأ عد أول مئة متجر مرة واحدة، وبتحدد حسابات الاختبار، وتعدل فترة السماح أو طريقة المحاسبة لأي متجر بسبب واضح."
          en="Start the first 100 store count once, mark test accounts, and adjust trial or billing settings with a clear reason."
          icon={<Sparkles size={20} />}
        />
        <div className="panel-title-row">
          <div>
            <h2>{lang === "ar" ? "المؤسسون وحسابات الاختبار" : "Founders and merchant settings"}</h2>
            <p>{lang === "ar" ? "تعديل أي حالة حساسة يحتاج سببًا واضحًا، وكل حركة تظهر في سجل الإدارة." : "Sensitive changes require a reason and are audit logged."}</p>
          </div>
          <button
            className="primary-button compact"
            disabled={flagEnabled("founder_counting_started")}
            onClick={() => void post("set_feature_flag", { key: "founder_counting_started", enabled: true, configuration: { started_at: new Date().toISOString(), founder_limit: 100 } })}
          >
            <Sparkles size={17} />
            {l.startFounder}
          </button>
        </div>
        <DataTable
          rows={filtered?.merchants ?? []}
          lang={lang}
          empty={l.noData}
          columns={[
            ["store_name", lang === "ar" ? "المتجر" : "Store"],
            ["merchant_email", lang === "ar" ? "البريد" : "Email"],
            ["billing_preference", lang === "ar" ? "طريقة المحاسبة" : "Billing"],
            ["founder_number", lang === "ar" ? "رقم المؤسس" : "Founder #"],
            ["free_trial_ends_at", lang === "ar" ? "نهاية الفترة" : "Trial ends"],
            ["founder_badge_enabled", lang === "ar" ? "شارة مؤسس" : "Founder badge"],
            ["trusted_badge_enabled", lang === "ar" ? "شارة موثوق" : "Trusted badge"],
            ["is_test_account", lang === "ar" ? "حساب اختبار" : "Test account"]
          ]}
          renderActions={(row) => (
            <>
              <button className="tiny-button" onClick={() => void post("set_merchant_badges", { merchant_id: row.id, is_test_account: !Boolean(row.is_test_account) })}>
                {Boolean(row.is_test_account) ? (lang === "ar" ? "إلغاء الاختبار" : "Unset test") : (lang === "ar" ? "حساب اختبار" : "Set test")}
              </button>
              <button className="tiny-button" onClick={() => toggleFounderBadge(row)}>
                <Sparkles size={15} />
                {Boolean(row.founder_badge_enabled) ? (lang === "ar" ? "سحب شارة المؤسس" : "Remove founder badge") : (lang === "ar" ? "منح شارة المؤسس" : "Grant founder badge")}
              </button>
              <button className="tiny-button" onClick={() => toggleTrustedBadge(row)}>
                <BadgeCheck size={15} />
                {Boolean(row.trusted_badge_enabled) ? (lang === "ar" ? "سحب شارة موثوق" : "Remove trusted badge") : (lang === "ar" ? "منح شارة موثوق" : "Grant trusted badge")}
              </button>
              <button className="tiny-button" onClick={() => adjustTrial(row)}>
                {lang === "ar" ? "تعديل الفترة" : "Adjust trial"}
              </button>
              <button className="tiny-button danger" disabled={Boolean(row.free_trial_stopped_at)} onClick={() => stopTrial(row)}>
                {lang === "ar" ? "إيقاف الفترة" : "Stop trial"}
              </button>
            </>
          )}
        />
      </article>
    );
  }

  function renderDocuments() {
    return (
      <article className="content-panel inner-panel">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "المستندات دي بتاعة إيه؟" : "What these documents are"}
          ar="دي مستندات مراجعة المتجر والفروع، مش إثبات دفع الاشتراك. هنا بتوافق أو ترفض كل ملف مرفوع لوحده: صورة واجهة، بطاقة صاحب المتجر، أو بطاقة مدير الفرع. قبول الملفات المطلوبة يساعدك تقبل المتجر أو الفرع من موافقات المتاجر، والرفض بيحتاج سبب واضح عشان المتجر يعرف يصلح إيه."
          en="These are store and branch review documents, not subscription payment proof. Here you approve or reject each uploaded file separately: storefront photo, store owner ID, or branch manager ID. Approved required files help you approve the store or branch from store approvals, and rejection needs a clear reason."
          icon={<FileText size={20} />}
        />
        <h2>{lang === "ar" ? "مراجعة مستندات المتاجر والفروع" : "Merchant and branch document review"}</h2>
        <p>{lang === "ar" ? "زر ملفات المتجر يفتح كل ملفات المتجر وفروعه في كارت واحد فوق الصفحة. لو الملف قديم أو تجريبي ومش مرفوع فعلياً هتظهر رسالة توضح السبب." : "Store files opens all store and branch files in one card over the page. If a record is old or test data without a real upload, a clear message will appear."}</p>
        <DataTable
          rows={filtered?.documents ?? []}
          lang={lang}
          empty={l.noData}
          columns={[
            ["store_name", lang === "ar" ? "المتجر" : "Store"],
            ["branch_name", lang === "ar" ? "الفرع" : "Branch"],
            ["manager_name", lang === "ar" ? "اسم المسؤول" : "Responsible person"],
            ["kind", lang === "ar" ? "نوع المستند" : "Document"],
            ["status", lang === "ar" ? "الحالة" : "Status"],
            ["reviewed_at", lang === "ar" ? "آخر مراجعة" : "Reviewed"]
          ]}
          renderActions={(row) => (
            <>
              <button className="tiny-button" onClick={() => setDocumentPreviewMerchantId(asString(row.merchant_id))}>
                <FileText size={15} />
                {l.storeFiles}
              </button>
              <button className="tiny-button" disabled={!hasProofFile(row)} onClick={() => void openProof("merchant_documents", row)}>
                <Eye size={15} />
                {l.viewFile}
              </button>
              <button className="tiny-button" disabled={row.status === "approved"} onClick={() => void post("review_document", { id: row.id, approved: true })}>
                {l.approve}
              </button>
              <button
                className="tiny-button danger"
                disabled={row.status === "rejected"}
                onClick={() => {
                  const reason = window.prompt(l.reasonPrompt);
                  if (reason) void post("review_document", { id: row.id, approved: false, reason });
                }}
              >
                {l.reject}
              </button>
            </>
          )}
        />
      </article>
    );
  }

  function renderCommissions() {
    return (
      <div className="monetization-grid two">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "العمولات" : "Commissions"}
          ar="هنا بتشوف عمولة سعرلي على الطلبات، وتعمل تسوية يدويًا لما المتجر يسدد. النظام يمنع تسوية نفس العمولة مرتين."
          en="Review Saarly commission on orders and manually settle paid dues. The system prevents double settlement."
          icon={<Flag size={20} />}
        />
        <article className="content-panel inner-panel">
          <h2>{lang === "ar" ? "العمولات" : "Commissions"}</h2>
          <DataTable
            rows={filtered?.commissions ?? []}
            lang={lang}
            empty={l.noData}
            columns={[
              ["store_name", lang === "ar" ? "المتجر" : "Store"],
              ["order_id", lang === "ar" ? "الطلب" : "Order"],
              ["base_amount", lang === "ar" ? "قيمة الطلب" : "Order value"],
              ["commission_rate", lang === "ar" ? "النسبة" : "Rate"],
              ["commission_amount", lang === "ar" ? "العمولة" : "Amount"],
              ["status", lang === "ar" ? "الحالة" : "Status"]
            ]}
            renderActions={(row) => (
              <button className="tiny-button" disabled={Boolean(row.settlement_id)} onClick={() => settleOneCommission(row)}>
                {l.settle}
              </button>
            )}
          />
        </article>
        <article className="content-panel inner-panel">
          <h2>{lang === "ar" ? "تسويات العمولة" : "Commission settlements"}</h2>
          <DataTable
            rows={filtered?.settlements ?? []}
            lang={lang}
            empty={l.noData}
            columns={[
              ["store_name", lang === "ar" ? "المتجر" : "Store"],
              ["requested_amount", lang === "ar" ? "المطلوب" : "Requested"],
              ["approved_amount", lang === "ar" ? "المقبول" : "Approved"],
              ["status", lang === "ar" ? "الحالة" : "Status"],
              ["created_at", lang === "ar" ? "التاريخ" : "Date"]
            ]}
            renderActions={(row) =>
              hasProofFile(row) ? (
                <button className="tiny-button" onClick={() => void openProof("merchant_commission_settlements", row)}>
                  {l.viewProof}
                </button>
              ) : null
            }
          />
        </article>
      </div>
    );
  }

  function renderEmailsAndReports() {
    return (
      <div className="monetization-grid two">
        <TabGuide
          lang={lang}
          title={lang === "ar" ? "البريد والتقارير" : "Emails and reports"}
          ar="من هنا تتابع رسائل التذكير والانتهاء، وتصدّر تقارير الاشتراكات والدفع والعمولات. الرسالة الناجحة لا تُرسل مرة أخرى."
          en="Track reminder and expiration emails, and export payment, subscription, and commission reports. Successful emails are not duplicated."
          icon={<Mail size={20} />}
        />
        <article className="content-panel inner-panel">
          <h2>{lang === "ar" ? "تنبيهات الانتهاء والبريد" : "Expiration and email"}</h2>
          <DataTable
            rows={filtered?.expirationEvents ?? []}
            lang={lang}
            empty={l.noData}
            columns={[
              ["store_name", lang === "ar" ? "المتجر" : "Store"],
              ["event_type", lang === "ar" ? "الحدث" : "Event"],
              ["scheduled_for", lang === "ar" ? "الموعد" : "Scheduled"],
              ["email_status", lang === "ar" ? "حالة البريد" : "Email status"],
              ["email_attempts", lang === "ar" ? "المحاولات" : "Attempts"],
              ["email_failure_reason", lang === "ar" ? "سبب الفشل" : "Failure reason"],
              ["sent_at", lang === "ar" ? "تم الإرسال" : "Sent"],
              ["channel", lang === "ar" ? "القناة" : "Channel"]
            ]}
            renderActions={(row) => (
              <button
                className="tiny-button"
                disabled={Boolean(row.sent_at) || row.email_status === "sending"}
                onClick={() => void post("retry_expiration_email", { id: row.id })}
              >
                {l.retry}
              </button>
            )}
          />
        </article>
        <article className="content-panel inner-panel">
          <h2>{lang === "ar" ? "تصدير التقارير" : "Reports export"}</h2>
          <div className="report-export-grid">
            {[
              ["manual-payments", lang === "ar" ? "طلبات التحويل" : "Manual payments", filtered?.manualRequests ?? []],
              ["electronic-payments", lang === "ar" ? "الدفع الإلكتروني" : "Electronic payments", filtered?.transactions ?? []],
              ["subscriptions", lang === "ar" ? "الاشتراكات" : "Subscriptions", filtered?.subscriptions ?? []],
              ["commissions", lang === "ar" ? "العمولات" : "Commissions", filtered?.commissions ?? []],
              ["stores", lang === "ar" ? "المتاجر" : "Stores", filtered?.merchants ?? []],
              ["emails", lang === "ar" ? "البريد" : "Emails", filtered?.expirationEvents ?? []]
            ].map(([name, label, rows]) => (
              <button className="soft-button" key={String(name)} onClick={() => downloadCsv(String(name), rows as Row[])}>
                <Download size={17} />
                {String(label)}
              </button>
            ))}
          </div>
        </article>
      </div>
    );
  }

  function PlanForm() {
    return (
      <div className="form-grid dense">
        <input placeholder={lang === "ar" ? "كود الباقة" : "Plan code"} value={planDraft.plan_code} onChange={(event) => setPlanDraft({ ...planDraft, plan_code: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم عربي" : "Arabic name"} value={planDraft.name_ar} onChange={(event) => setPlanDraft({ ...planDraft, name_ar: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم إنجليزي" : "English name"} value={planDraft.name_en} onChange={(event) => setPlanDraft({ ...planDraft, name_en: event.target.value })} />
        <input placeholder={lang === "ar" ? "السعر الحالي" : "Current price"} value={planDraft.monthly_price} onChange={(event) => setPlanDraft({ ...planDraft, monthly_price: event.target.value })} />
        <input placeholder={lang === "ar" ? "السعر القديم" : "Old price"} value={planDraft.old_price} onChange={(event) => setPlanDraft({ ...planDraft, old_price: event.target.value })} />
        <select value={planDraft.currency} onChange={(event) => setPlanDraft({ ...planDraft, currency: event.target.value })}>
          <option value="EGP">{lang === "ar" ? "جنيه مصري" : "Egyptian pound"}</option>
          <option value="USD">{lang === "ar" ? "دولار" : "US dollar"}</option>
          <option value="SAR">{lang === "ar" ? "ريال سعودي" : "Saudi riyal"}</option>
        </select>
        <input placeholder={lang === "ar" ? "المدة بالأيام" : "Duration days"} value={planDraft.duration_days} onChange={(event) => setPlanDraft({ ...planDraft, duration_days: event.target.value })} />
        <input placeholder={lang === "ar" ? "السماح بالشهور" : "Grace months"} value={planDraft.grace_months} onChange={(event) => setPlanDraft({ ...planDraft, grace_months: event.target.value })} />
        <textarea placeholder={lang === "ar" ? "المزايا بالعربية، كل ميزة في سطر" : "Arabic features, one per line"} value={planDraft.features_ar} onChange={(event) => setPlanDraft({ ...planDraft, features_ar: event.target.value })} />
        <textarea placeholder={lang === "ar" ? "المزايا بالإنجليزية، كل ميزة في سطر" : "English features, one per line"} value={planDraft.features_en} onChange={(event) => setPlanDraft({ ...planDraft, features_en: event.target.value })} />
        <label className="checkbox-field">
          <input type="checkbox" checked={planDraft.is_active} onChange={(event) => setPlanDraft({ ...planDraft, is_active: event.target.checked })} />
          <span>{lang === "ar" ? "الباقة نشطة" : "Plan active"}</span>
        </label>
        <button className="primary-button" disabled={busy === "save_plan"} onClick={() => void post("save_plan", planDraft)}>
          <Save size={17} />
          {l.save}
        </button>
      </div>
    );
  }

  function DiscountForm() {
    return (
      <div className="form-grid dense">
        <input placeholder={lang === "ar" ? "كود الخصم" : "Discount code"} value={discountDraft.code} onChange={(event) => setDiscountDraft({ ...discountDraft, code: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم عربي" : "Arabic name"} value={discountDraft.name_ar} onChange={(event) => setDiscountDraft({ ...discountDraft, name_ar: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم إنجليزي" : "English name"} value={discountDraft.name_en} onChange={(event) => setDiscountDraft({ ...discountDraft, name_en: event.target.value })} />
        <input placeholder={lang === "ar" ? "نسبة الخصم" : "Discount percent"} value={discountDraft.discount_percent} onChange={(event) => setDiscountDraft({ ...discountDraft, discount_percent: event.target.value })} />
        <input placeholder={lang === "ar" ? "حد الاستخدام" : "Usage limit"} value={discountDraft.usage_limit} onChange={(event) => setDiscountDraft({ ...discountDraft, usage_limit: event.target.value })} />
        <select value={discountDraft.applies_to} onChange={(event) => setDiscountDraft({ ...discountDraft, applies_to: event.target.value })}>
          <option value="first_subscription">{lang === "ar" ? "أول اشتراك" : "First subscription"}</option>
          <option value="renewal">{lang === "ar" ? "تجديد" : "Renewal"}</option>
          <option value="both">{lang === "ar" ? "الاثنان" : "Both"}</option>
        </select>
        <input type="date" value={discountDraft.starts_at} onChange={(event) => setDiscountDraft({ ...discountDraft, starts_at: event.target.value })} />
        <input type="date" value={discountDraft.ends_at} onChange={(event) => setDiscountDraft({ ...discountDraft, ends_at: event.target.value })} />
        <textarea placeholder={lang === "ar" ? "اتركه فارغًا لو الخصم على كل الباقات" : "Leave empty to apply to all plans"} value={discountDraft.plan_ids} onChange={(event) => setDiscountDraft({ ...discountDraft, plan_ids: event.target.value })} />
        <textarea placeholder={lang === "ar" ? "اتركه فارغًا لو الخصم على كل المتاجر" : "Leave empty to apply to all stores"} value={discountDraft.merchant_ids} onChange={(event) => setDiscountDraft({ ...discountDraft, merchant_ids: event.target.value })} />
        <label className="checkbox-field">
          <input type="checkbox" checked={discountDraft.is_active} onChange={(event) => setDiscountDraft({ ...discountDraft, is_active: event.target.checked })} />
          <span>{lang === "ar" ? "الخصم نشط" : "Discount active"}</span>
        </label>
        <button className="primary-button" disabled={busy === "save_discount"} onClick={() => void post("save_discount", discountDraft)}>
          <Save size={17} />
          {l.save}
        </button>
      </div>
    );
  }

  function MethodForm() {
    return (
      <div className="form-grid dense">
        <input placeholder={lang === "ar" ? "الكود" : "Code"} value={methodDraft.code} onChange={(event) => setMethodDraft({ ...methodDraft, code: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم عربي" : "Arabic name"} value={methodDraft.name_ar} onChange={(event) => setMethodDraft({ ...methodDraft, name_ar: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم إنجليزي" : "English name"} value={methodDraft.name_en} onChange={(event) => setMethodDraft({ ...methodDraft, name_en: event.target.value })} />
        <select value={methodDraft.provider} onChange={(event) => setMethodDraft({ ...methodDraft, provider: event.target.value })}>
          <option value="">{lang === "ar" ? "بدون مزوّد إلكتروني" : "No electronic provider"}</option>
          <option value="wallet">{lang === "ar" ? "محفظة" : "Wallet"}</option>
          <option value="vodafone_cash">{lang === "ar" ? "فودافون كاش" : "Vodafone Cash"}</option>
          <option value="meeza">{lang === "ar" ? "ميزة" : "Meeza"}</option>
        </select>
        <input placeholder={lang === "ar" ? "اسم الحساب" : "Account label"} value={methodDraft.account_label} onChange={(event) => setMethodDraft({ ...methodDraft, account_label: event.target.value })} />
        <input placeholder={lang === "ar" ? "رقم الحساب" : "Account number"} value={methodDraft.account_number} onChange={(event) => setMethodDraft({ ...methodDraft, account_number: event.target.value })} />
        <input placeholder={lang === "ar" ? "صاحب الحساب" : "Account holder"} value={methodDraft.account_holder_name} onChange={(event) => setMethodDraft({ ...methodDraft, account_holder_name: event.target.value })} />
        <textarea placeholder={lang === "ar" ? "تعليمات عربية" : "Arabic instructions"} value={methodDraft.instructions_ar} onChange={(event) => setMethodDraft({ ...methodDraft, instructions_ar: event.target.value })} />
        <textarea placeholder={lang === "ar" ? "تعليمات إنجليزية" : "English instructions"} value={methodDraft.instructions_en} onChange={(event) => setMethodDraft({ ...methodDraft, instructions_en: event.target.value })} />
        <label className="checkbox-field">
          <input type="checkbox" checked={methodDraft.is_active} onChange={(event) => setMethodDraft({ ...methodDraft, is_active: event.target.checked })} />
          <span>{lang === "ar" ? "الطريقة نشطة" : "Method active"}</span>
        </label>
        <button className="primary-button" disabled={busy === "save_manual_method"} onClick={() => void post("save_manual_method", methodDraft)}>
          <Save size={17} />
          {l.save}
        </button>
      </div>
    );
  }

  function GatewayForm() {
    return (
      <div className="form-grid dense">
        <select value={gatewayDraft.provider} onChange={(event) => setGatewayDraft({ ...gatewayDraft, provider: event.target.value })}>
          <option value="visa">{lang === "ar" ? "بطاقات بنكية" : "Cards"}</option>
          <option value="wallet">{lang === "ar" ? "محفظة إلكترونية" : "Wallet"}</option>
          <option value="vodafone_cash">{lang === "ar" ? "فودافون كاش" : "Vodafone Cash"}</option>
          <option value="meeza">{lang === "ar" ? "ميزة" : "Meeza"}</option>
        </select>
        <select value={gatewayDraft.gateway_environment} onChange={(event) => setGatewayDraft({ ...gatewayDraft, gateway_environment: event.target.value })}>
          <option value="test">{lang === "ar" ? "تجربة" : "Test"}</option>
          <option value="production">{lang === "ar" ? "تشغيل فعلي" : "Live"}</option>
        </select>
        <input placeholder={lang === "ar" ? "اسم البوابة بالعربي" : "Gateway name in Arabic"} value={gatewayDraft.display_name_ar} onChange={(event) => setGatewayDraft({ ...gatewayDraft, display_name_ar: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم البوابة بالإنجليزي" : "Gateway name in English"} value={gatewayDraft.display_name_en} onChange={(event) => setGatewayDraft({ ...gatewayDraft, display_name_en: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم بيانات الربط المحفوظة" : "Saved connection name"} value={gatewayDraft.secret_reference} onChange={(event) => setGatewayDraft({ ...gatewayDraft, secret_reference: event.target.value })} />
        <input placeholder={lang === "ar" ? "رابط رد شركة الدفع بعد العملية" : "Payment company return link"} value={gatewayDraft.webhook_url} onChange={(event) => setGatewayDraft({ ...gatewayDraft, webhook_url: event.target.value })} />
        <input placeholder={lang === "ar" ? "اسم مفتاح تأكيد شركة الدفع" : "Confirmation key name"} value={gatewayDraft.webhook_secret_name} onChange={(event) => setGatewayDraft({ ...gatewayDraft, webhook_secret_name: event.target.value })} />
        <select value={gatewayDraft.supported_currencies.split(",")[0] || "EGP"} onChange={(event) => setGatewayDraft({ ...gatewayDraft, supported_currencies: event.target.value })}>
          <option value="EGP">{lang === "ar" ? "جنيه مصري" : "Egyptian pound"}</option>
          <option value="USD">{lang === "ar" ? "دولار" : "US dollar"}</option>
          <option value="SAR">{lang === "ar" ? "ريال سعودي" : "Saudi riyal"}</option>
        </select>
        <label className="checkbox-field">
          <input type="checkbox" checked={gatewayDraft.is_direct_to_merchant_supported} onChange={(event) => setGatewayDraft({ ...gatewayDraft, is_direct_to_merchant_supported: event.target.checked })} />
          <span>{lang === "ar" ? "الفلوس تروح للمتجر مباشرة" : "Money goes directly to the store"}</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={gatewayDraft.is_enabled} onChange={(event) => setGatewayDraft({ ...gatewayDraft, is_enabled: event.target.checked })} />
          <span>{lang === "ar" ? "فعلها لما تكون جاهزة" : "Enable when ready"}</span>
        </label>
        <div className="form-actions-row">
          <button className="primary-button" disabled={busy === "save_gateway"} onClick={() => void post("save_gateway", gatewayDraft)}>
            <Save size={17} />
            {l.save}
          </button>
          <button className="soft-button" disabled={busy === "test_gateway"} onClick={() => void post("test_gateway", { provider: gatewayDraft.provider })}>
            {l.test}
          </button>
        </div>
      </div>
    );
  }

  function toggleFounderBadge(row: Row) {
    void post("set_merchant_badges", {
      merchant_id: row.id,
      founder_badge: !Boolean(row.founder_badge_enabled),
    });
  }

  function toggleTrustedBadge(row: Row) {
    const enabling = !Boolean(row.trusted_badge_enabled);
    const reason = enabling
      ? window.prompt(lang === "ar" ? "اكتب سبب منح شارة موثوق" : "Reason for granting the trusted badge")
      : null;
    if (enabling && (!reason || reason.trim().length < 3)) return;
    void post("set_merchant_badges", { merchant_id: row.id, trusted_badge: enabling, reason });
  }

  function adjustTrial(row: Row) {
    const value = window.prompt(
      lang === "ar" ? "اكتب تاريخ نهاية الفترة بصيغة 2026-08-01" : "Enter the trial end date, for example 2026-08-01",
      asString(row.free_trial_ends_at).slice(0, 10),
    );
    if (!value) return;
    const reason = window.prompt(lang === "ar" ? "سبب تعديل الفترة (اختياري)" : "Reason for changing the trial (optional)") ?? "";
    void post("set_merchant_trial", { merchant_id: row.id, trial_ends_at: value, stop_trial: false, reason });
  }

  function stopTrial(row: Row) {
    const reason = window.prompt(lang === "ar" ? "اكتب سبب إيقاف الفترة التجريبية" : "Reason for stopping the trial");
    if (!reason || reason.trim().length < 3) return;
    void post("set_merchant_trial", { merchant_id: row.id, stop_trial: true, reason });
  }

  function settleOneCommission(row: Row) {
    const reason = window.prompt(l.reasonPrompt);
    if (!reason) return;
    void post("settle_commissions", { commission_ids: [row.id], reason, currency: "EGP" });
  }
}

function rowsForTab(tab: string, data: MonetizationData) {
  if (tab === "manual") return data.manualRequests;
  if (tab === "electronic") return data.transactions;
  if (tab === "plans") return [...data.plans, ...data.discounts];
  if (tab === "methods") return [...data.manualMethods, ...data.paymentSettings];
  if (tab === "founders") return data.merchants;
  if (tab === "commissions") return [...data.commissions, ...data.settlements];
  if (tab === "emails") return data.expirationEvents;
  return [data.summary];
}

function FilePreviewModal({
  lang,
  preview,
  onClose
}: {
  lang: Lang;
  preview: FilePreview;
  onClose: () => void;
}) {
  const l = labels[lang];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card proof-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-title-row">
          <div>
            <h2>{preview.title}</h2>
            <p>{preview.subtitle}</p>
          </div>
          <button className="tiny-button" onClick={onClose}>
            <X size={15} />
            {l.close}
          </button>
        </div>
        <div className="proof-preview-frame">
          {preview.isImage ? (
            <img src={preview.url} alt={preview.title} />
          ) : preview.isPdf ? (
            <iframe title={preview.title} src={preview.url} />
          ) : (
            <div className="empty-state">
              {lang === "ar" ? "الملف جاهز للفتح في تبويب جديد." : "The file is ready to open in a new tab."}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <a className="soft-button" href={preview.url} target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            {l.openFile}
          </a>
          <button className="primary-button compact" onClick={onClose}>
            {l.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function StoreDocumentsModal({
  lang,
  preview,
  onClose,
  onOpen,
  onApprove,
  onReject
}: {
  lang: Lang;
  preview: StoreDocumentPreview;
  onClose: () => void;
  onOpen: (row: Row) => void;
  onApprove: (row: Row) => void;
  onReject: (row: Row) => void;
}) {
  const l = labels[lang];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card store-documents-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-title-row">
          <div>
            <h2>{lang === "ar" ? "مستندات المتجر" : "Store documents"}</h2>
            <p>{preview.storeName}</p>
          </div>
          <button className="tiny-button" onClick={onClose}>
            <X size={15} />
            {l.close}
          </button>
        </div>

        <DocumentFilesSection
          title={lang === "ar" ? "ملفات المتجر الأساسية" : "Main store files"}
          rows={preview.storeDocuments}
          lang={lang}
          empty={l.noStoreDocuments}
          onOpen={onOpen}
          onApprove={onApprove}
          onReject={onReject}
        />

        <div className="document-branch-list">
          {preview.branches.map(({ branch, documents }) => (
            <DocumentFilesSection
              key={asString(branch.id)}
              title={`${lang === "ar" ? "فرع" : "Branch"}: ${cell(branch.name, lang)}`}
              rows={documents}
              lang={lang}
              empty={l.noStoreDocuments}
              onOpen={onOpen}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
          {preview.extraBranchDocuments.length ? (
            <DocumentFilesSection
              title={lang === "ar" ? "ملفات فروع غير مرتبطة بسجل فرع ظاهر" : "Branch files without a visible branch record"}
              rows={preview.extraBranchDocuments}
              lang={lang}
              empty={l.noStoreDocuments}
              onOpen={onOpen}
              onApprove={onApprove}
              onReject={onReject}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DocumentFilesSection({
  title,
  rows,
  lang,
  empty,
  onOpen,
  onApprove,
  onReject
}: {
  title: string;
  rows: Row[];
  lang: Lang;
  empty: string;
  onOpen: (row: Row) => void;
  onApprove: (row: Row) => void;
  onReject: (row: Row) => void;
}) {
  const l = labels[lang];
  return (
    <section className="document-group">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="document-file-list">
          {rows.map((row, index) => (
            <div className="document-file-row" key={asString(row.id) || `${title}-${index}`}>
              <div>
                <strong>{documentKindLabel(row.kind, lang)}</strong>
                <span>
                  {displayValue("status", row, lang)}
                  {asString(row.manager_name) ? ` · ${asString(row.manager_name)}` : ""}
                </span>
              </div>
              <div className="row-actions">
                <button className="tiny-button" disabled={!hasProofFile(row)} onClick={() => onOpen(row)}>
                  <Eye size={15} />
                  {l.viewFile}
                </button>
                <button className="tiny-button" disabled={row.status === "approved"} onClick={() => onApprove(row)}>
                  <Check size={15} />
                  {l.approve}
                </button>
                <button className="tiny-button danger" disabled={row.status === "rejected"} onClick={() => onReject(row)}>
                  <X size={15} />
                  {l.reject}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">{empty}</div>
      )}
    </section>
  );
}

function DataTable({
  rows,
  columns,
  lang,
  empty,
  renderActions
}: {
  rows: Row[];
  columns: [string, string][];
  lang: Lang;
  empty: string;
  renderActions?: (row: Row) => ReactNode;
}) {
  if (!rows.length) {
    return <div className="empty-state">{empty}</div>;
  }
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column[0]}>{column[1]}</th>
            ))}
            {renderActions ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={asString(row.id) || String(index)}>
              {columns.map(([key]) => (
                <td key={key}>
                  <span className={isActiveStatus(row[key]) ? "cell-status active" : key === "status" ? "cell-status" : undefined}>
                    {displayValue(key, row, lang)}
                  </span>
                </td>
              ))}
              {renderActions ? <td><div className="row-actions">{renderActions(row)}</div></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
