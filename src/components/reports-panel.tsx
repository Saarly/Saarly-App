"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";
import { adminValueLabel, localizedValue } from "@/lib/admin/format";
import { downloadExcel } from "@/lib/admin/excel";

type Row = Record<string, unknown>;
type ReportResult = {
  key: string;
  rows: Row[];
  error?: string;
};

type FieldDefinition = {
  key: string;
  label: { ar: string; en: string };
  kind?: "text" | "status" | "money" | "number" | "percent" | "date" | "boolean";
};

type ReportDefinition = {
  key: string;
  title: { ar: string; en: string };
  description: { ar: string; en: string };
  titleFields: string[];
  fields: FieldDefinition[];
};

const reports: ReportDefinition[] = [
  {
    key: "admin_report_orders",
    title: { ar: "الطلبات", en: "Orders" },
    description: {
      ar: "كل طلب ظاهر كسطر واحد، ومعاه العميل والمتجر والحالة والقيمة والعمولة.",
      en: "Each order is shown as one clear row with buyer, store, status, value, and commission.",
    },
    titleFields: ["buyer_name", "store_name"],
    fields: [
      { key: "store_name", label: { ar: "المتجر", en: "Store" } },
      { key: "status", label: { ar: "الحالة", en: "Status" }, kind: "status" },
      { key: "order_total", label: { ar: "قيمة الطلب", en: "Order value" }, kind: "money" },
      { key: "commission_amount", label: { ar: "العمولة", en: "Commission" }, kind: "money" },
      { key: "categories_ar", label: { ar: "الأقسام", en: "Categories" } },
      { key: "accepted_at", label: { ar: "وقت القبول", en: "Accepted" }, kind: "date" },
      { key: "confirmed_at", label: { ar: "وقت التأكيد", en: "Confirmed" }, kind: "date" },
    ],
  },
  {
    key: "admin_report_active_merchants",
    title: { ar: "المتاجر النشطة", en: "Active stores" },
    description: {
      ar: "بيوضح المتاجر اللي عليها شغل أكتر، وحجم الطلبات والمبيعات والتقييم.",
      en: "Shows the busiest stores with order volume, sales, commission, and ratings.",
    },
    titleFields: ["store_name"],
    fields: [
      { key: "category_name_ar", label: { ar: "القسم", en: "Category" } },
      { key: "confirmed_orders_count", label: { ar: "طلبات مؤكدة", en: "Confirmed orders" }, kind: "number" },
      { key: "gross_sales", label: { ar: "إجمالي المبيعات", en: "Gross sales" }, kind: "money" },
      { key: "commissions_due", label: { ar: "العمولات المستحقة", en: "Commission due" }, kind: "money" },
      { key: "average_rating", label: { ar: "متوسط التقييم", en: "Average rating" }, kind: "number" },
      { key: "last_order_at", label: { ar: "آخر طلب", en: "Last order" }, kind: "date" },
    ],
  },
  {
    key: "admin_report_active_categories",
    title: { ar: "الأقسام الأكثر طلبًا", en: "Top categories" },
    description: {
      ar: "بيعرض الأقسام اللي عليها طلبات ومبيعات أكتر عشان تعرف اتجاه الاستخدام.",
      en: "Shows the categories with the most orders and sales so you can understand demand.",
    },
    titleFields: ["category_name_ar", "category_name_en"],
    fields: [
      { key: "merchants_count", label: { ar: "عدد المتاجر", en: "Stores" }, kind: "number" },
      { key: "confirmed_orders_count", label: { ar: "طلبات مؤكدة", en: "Confirmed orders" }, kind: "number" },
      { key: "gross_sales", label: { ar: "إجمالي المبيعات", en: "Gross sales" }, kind: "money" },
      { key: "commissions_due", label: { ar: "العمولات المستحقة", en: "Commission due" }, kind: "money" },
    ],
  },
  {
    key: "admin_report_top_accepted_offers",
    title: { ar: "العروض المقبولة", en: "Accepted offers" },
    description: {
      ar: "بيوضح العروض اللي العملاء اختاروها، وترتيب العرض ونسبة التغطية والسعر.",
      en: "Shows offers chosen by buyers, including rank, coverage, price, and final order status.",
    },
    titleFields: ["store_name"],
    fields: [
      { key: "ranking", label: { ar: "ترتيب العرض", en: "Rank" }, kind: "number" },
      { key: "coverage_percentage", label: { ar: "نسبة التغطية", en: "Coverage" }, kind: "percent" },
      { key: "total_price_snapshot", label: { ar: "سعر العرض", en: "Offer price" }, kind: "money" },
      { key: "status", label: { ar: "حالة الطلب", en: "Order status" }, kind: "status" },
      { key: "accepted_at", label: { ar: "وقت القبول", en: "Accepted" }, kind: "date" },
      { key: "confirmed_at", label: { ar: "وقت التأكيد", en: "Confirmed" }, kind: "date" },
    ],
  },
  {
    key: "admin_report_rfq_acceptance",
    title: { ar: "طلبات التسعير اليدوي", en: "Manual quote requests" },
    description: {
      ar: "تابع عدد ردود المتاجر على كل طلب تسعير وهل تم قبول رد وإنشاء طلب منه.",
      en: "Track store responses to manual quote requests and whether a response became an accepted order.",
    },
    titleFields: ["status", "created_at"],
    fields: [
      { key: "status", label: { ar: "الحالة", en: "Status" }, kind: "status" },
      { key: "responses_count", label: { ar: "كل الردود", en: "All responses" }, kind: "number" },
      { key: "submitted_responses_count", label: { ar: "ردود مرسلة", en: "Submitted responses" }, kind: "number" },
      { key: "priced_responses_count", label: { ar: "ردود مسعرة", en: "Priced responses" }, kind: "number" },
      { key: "accepted_total", label: { ar: "قيمة الرد المقبول", en: "Accepted value" }, kind: "money" },
      { key: "created_at", label: { ar: "تاريخ الطلب", en: "Created" }, kind: "date" },
    ],
  },
  {
    key: "admin_report_payment_transactions",
    title: { ar: "عمليات الدفع", en: "Payment transactions" },
    description: {
      ar: "راجع كل عملية دفع وحالتها وطريقتها وهل تخص اشتراك أو عمولة أو طلب عميل.",
      en: "Review payment transactions, methods, status, and whether each payment relates to a subscription, commission, or order.",
    },
    titleFields: ["store_name", "purpose"],
    fields: [
      { key: "purpose", label: { ar: "نوع العملية", en: "Purpose" }, kind: "status" },
      { key: "provider", label: { ar: "طريقة الدفع", en: "Provider" }, kind: "status" },
      { key: "amount", label: { ar: "المبلغ", en: "Amount" }, kind: "money" },
      { key: "status", label: { ar: "الحالة", en: "Status" }, kind: "status" },
      { key: "direct_to_merchant", label: { ar: "وصل للمتجر مباشرة", en: "Direct to store" }, kind: "boolean" },
      { key: "created_at", label: { ar: "تاريخ الإنشاء", en: "Created" }, kind: "date" },
      { key: "paid_at", label: { ar: "تاريخ الدفع", en: "Paid" }, kind: "date" },
    ],
  },
  {
    key: "admin_report_commission_dues",
    title: { ar: "العمولات", en: "Commissions" },
    description: {
      ar: "بيوضح العمولة المحسوبة على كل طلب، نسبتها وحالتها وهل اتسددت ولا لسه.",
      en: "Shows the commission calculated for each order, its rate, amount, and payment status.",
    },
    titleFields: ["store_name"],
    fields: [
      { key: "category_name_ar", label: { ar: "القسم", en: "Category" } },
      { key: "base_amount", label: { ar: "قيمة الطلب الأساسية", en: "Base amount" }, kind: "money" },
      { key: "commission_rate", label: { ar: "نسبة العمولة", en: "Commission rate" }, kind: "percent" },
      { key: "commission_amount", label: { ar: "قيمة العمولة", en: "Commission amount" }, kind: "money" },
      { key: "status", label: { ar: "الحالة", en: "Status" }, kind: "status" },
      { key: "calculated_at", label: { ar: "وقت الحساب", en: "Calculated" }, kind: "date" },
    ],
  },
  {
    key: "admin_report_merchant_arrears",
    title: { ar: "حالة حسابات المتاجر", en: "Store account status" },
    description: {
      ar: "اعرف طريقة محاسبة كل متجر، اشتراكه الحالي، المبلغ المستحق وهل يقدر يستقبل طلبات جديدة.",
      en: "Review each store’s billing method, subscription, balance due, and ability to receive new work.",
    },
    titleFields: ["store_name"],
    fields: [
      { key: "billing_preference", label: { ar: "طريقة المحاسبة", en: "Billing method" }, kind: "status" },
      { key: "subscription_status", label: { ar: "حالة الاشتراك", en: "Subscription status" }, kind: "status" },
      { key: "plan_name_ar", label: { ar: "الباقة", en: "Plan" } },
      { key: "monthly_price", label: { ar: "سعر الباقة", en: "Plan price" }, kind: "money" },
      { key: "balance_due", label: { ar: "المبلغ المستحق", en: "Balance due" }, kind: "money" },
      { key: "unpaid_months", label: { ar: "شهور غير مسددة", en: "Unpaid months" }, kind: "number" },
      { key: "grace_months", label: { ar: "فترة السماح بالشهور", en: "Grace months" }, kind: "number" },
      { key: "can_receive_new_work", label: { ar: "يستقبل طلبات", en: "Receives new work" }, kind: "boolean" },
    ],
  },
  {
    key: "admin_report_referrals_rewards",
    title: { ar: "الدعوات والمكافآت", en: "Invites and rewards" },
    description: {
      ar: "تابع كود الدعوة وعدد التسجيلات المؤكدة ونوع المكافأة وحالة تسليمها.",
      en: "Track invite codes, confirmed registrations, reward type, and delivery status.",
    },
    titleFields: ["referrer_email", "referral_code"],
    fields: [
      { key: "referral_code", label: { ar: "كود الدعوة", en: "Invite code" } },
      { key: "confirmed_registrations", label: { ar: "تسجيلات مؤكدة", en: "Confirmed registrations" }, kind: "number" },
      { key: "target_confirmed_registrations", label: { ar: "الهدف", en: "Target" }, kind: "number" },
      { key: "reward_type", label: { ar: "المكافأة", en: "Reward" }, kind: "status" },
      { key: "delivery_status", label: { ar: "حالة التسليم", en: "Delivery status" }, kind: "status" },
      { key: "delivered_at", label: { ar: "وقت التسليم", en: "Delivered" }, kind: "date" },
      { key: "created_at", label: { ar: "تاريخ الدعوة", en: "Created" }, kind: "date" },
    ],
  },
];

export function ReportsPanel({ lang }: { lang: Lang }) {
  const [results, setResults] = useState<ReportResult[]>([]);
  const [selectedKey, setSelectedKey] = useState(reports[0].key);
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(10);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setResults(reports.map((report) => ({ key: report.key, rows: [], error: humanizeAdminError("auth_required", lang) })));
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/action?reports=1", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { key: string; rows: Row[]; error?: string }[];
      error?: string;
    };

    setResults(
      reports.map((report) => {
        const result = payload.data?.find((item) => item.key === report.key);
        const rawError = response.ok ? result?.error : payload.error;
        return {
          key: report.key,
          rows: result?.rows ?? [],
          error: rawError ? humanizeAdminError(rawError, lang) : undefined,
        };
      }),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const definition = reports.find((item) => item.key === selectedKey) ?? reports[0];
  const result = results.find((item) => item.key === selectedKey) ?? { key: selectedKey, rows: [] };
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return result.rows;
    return result.rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
  }, [query, result.rows]);
  const visibleRows = filteredRows.slice(0, visibleLimit);

  function selectReport(key: string) {
    setSelectedKey(key);
    setQuery("");
    setVisibleLimit(10);
  }

  function exportExcel() {
    const fields = definition.fields.filter((field) =>
      result.rows.some((row) => hasValue(localizedValue(row, field.key, lang))),
    );
    downloadExcel({
      filename: definition.key,
      sheetName: definition.title[lang],
      rtl: lang === "ar",
      rows: result.rows,
      columns: fields.map((field) => ({
        key: field.key,
        label: field.label[lang],
        value: (row: Row) =>
          formatValue(
            field,
            localizedValue(row, field.key, lang),
            row,
            lang,
          ),
      })),
    });
  }

  return (
    <section className="content-panel reports-panel-simple">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "متابعة الأرقام" : "Operational numbers"}</span>
          <h1>{lang === "ar" ? "التقارير" : "Reports"}</h1>
          <p>
            {lang === "ar"
              ? "اختار تقرير واحد من فوق عشان تتابعه من غير زحمة، وبعدها ابحث أو نزّل البيانات كاملة."
              : "Choose one report at a time for a clearer view, then search or export all of its data."}
          </p>
        </div>
        <button className="soft-button" onClick={() => void loadReports()} disabled={loading}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      <nav className="report-selector" aria-label={lang === "ar" ? "أنواع التقارير" : "Report types"}>
        {reports.map((item) => {
          const count = results.find((entry) => entry.key === item.key)?.rows.length ?? 0;
          return (
            <button key={item.key} className={selectedKey === item.key ? "active" : ""} onClick={() => selectReport(item.key)}>
              <span>{item.title[lang]}</span>
              <b>{count.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</b>
            </button>
          );
        })}
      </nav>

      <div className="tab-guide report-guide">
        <div>
          <strong>{definition.title[lang]}</strong>
          <p>{definition.description[lang]}</p>
        </div>
      </div>

      <div className="report-active-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleLimit(10);
            }}
            placeholder={lang === "ar" ? "ابحث جوه التقرير الحالي" : "Search this report"}
          />
        </label>
        <div className="report-count-summary">
          <strong>{filteredRows.length.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</strong>
          <span>{lang === "ar" ? "نتيجة مطابقة" : "matching results"}</span>
        </div>
        <button className="soft-button" onClick={exportExcel} disabled={result.rows.length === 0}>
          <Download size={17} />
          {lang === "ar" ? "تنزيل التقرير كامل" : "Download full report"}
        </button>
      </div>

      {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
      {result.error ? <div className="alert">{result.error}</div> : null}
      {!loading && !result.error && filteredRows.length === 0 ? (
        <div className="empty-state">{lang === "ar" ? "مفيش بيانات مطابقة في التقرير ده دلوقتي." : "There is no matching data in this report right now."}</div>
      ) : null}

      <div className="report-record-list">
        {visibleRows.map((row, index) => (
          <ReportRecord key={`${definition.key}-${index}`} definition={definition} row={row} lang={lang} index={index} />
        ))}
      </div>

      {visibleRows.length < filteredRows.length ? (
        <button className="soft-button report-more" onClick={() => setVisibleLimit((current) => current + 10)}>
          {lang === "ar"
            ? `عرض ١٠ نتائج كمان — ظاهر ${visibleRows.length.toLocaleString("ar-EG")} من ${filteredRows.length.toLocaleString("ar-EG")}`
            : `Show 10 more — showing ${visibleRows.length} of ${filteredRows.length}`}
        </button>
      ) : null}
    </section>
  );
}

function ReportRecord({ definition, row, lang, index }: { definition: ReportDefinition; row: Row; lang: Lang; index: number }) {
  const title = definition.titleFields
    .map((key) => localizedValue(row, key, lang))
    .find(hasValue);
  const fields = definition.fields.filter((field) => hasValue(localizedValue(row, field.key, lang)));

  return (
    <article className="report-record">
      <header>
        <span>{(index + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
        <strong>{formatTitle(title, lang)}</strong>
      </header>
      <div className="report-record-fields">
        {fields.map((field) => (
          <div key={field.key}>
            <small>{field.label[lang]}</small>
            <b>{formatValue(field, localizedValue(row, field.key, lang), row, lang)}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function formatTitle(value: unknown, lang: Lang) {
  if (!hasValue(value)) return lang === "ar" ? "سجل بدون اسم" : "Unnamed record";
  return adminValueLabel(value, lang);
}

function formatValue(field: FieldDefinition, value: unknown, row: Row, lang: Lang) {
  if (!hasValue(value)) return lang === "ar" ? "غير متوفر" : "Not provided";
  if (field.kind === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? adminValueLabel(value, lang)
      : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
  if (field.kind === "money") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return adminValueLabel(value, lang);
    const currency = String(row.currency ?? "EGP").toUpperCase();
    try {
      return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} ${currency}`;
    }
  }
  if (field.kind === "percent") {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}%` : adminValueLabel(value, lang);
  }
  if (field.kind === "number") {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toLocaleString(lang === "ar" ? "ar-EG" : "en-US") : adminValueLabel(value, lang);
  }
  if (field.kind === "boolean") {
    return Boolean(value) ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No";
  }
  if (field.kind === "status") return adminValueLabel(value, lang);
  if (Array.isArray(value)) return value.map((item) => adminValueLabel(item, lang)).join("، ");
  return adminValueLabel(value, lang);
}

