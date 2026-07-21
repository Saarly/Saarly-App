"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { friendlyStatus, humanizeAdminError } from "@/lib/admin/messages";

type ReportResult = {
  key: string;
  title: { ar: string; en: string };
  rows: Record<string, unknown>[];
  error?: string;
};

type ReportSummary = {
  title: string;
  details: string;
};

const reportDefinitions = [
  {
    key: "admin_report_orders",
    title: { ar: "تقرير الطلبات", en: "Orders report" },
    args: { p_from: null, p_to: null, p_status: null, p_merchant_id: null, p_category_id: null }
  },
  {
    key: "admin_report_active_merchants",
    title: { ar: "المتاجر الأكثر نشاطاً", en: "Most active stores" },
    args: { p_from: null, p_to: null, p_limit: 10 }
  },
  {
    key: "admin_report_active_categories",
    title: { ar: "الأقسام الأكثر طلباً", en: "Most requested categories" },
    args: { p_from: null, p_to: null, p_limit: 10 }
  },
  {
    key: "admin_report_top_accepted_offers",
    title: { ar: "العروض المختارة من المشترين", en: "Offers chosen by buyers" },
    args: { p_from: null, p_to: null, p_limit: 10 }
  },
  {
    key: "admin_report_rfq_acceptance",
    title: { ar: "طلبات تسعير يدوية", en: "Manual RFQ requests" },
    args: { p_from: null, p_to: null }
  },
  {
    key: "admin_report_merchant_arrears",
    title: { ar: "مستحقات المتاجر", en: "Store dues" },
    args: {}
  },
  {
    key: "admin_report_referrals_rewards",
    title: { ar: "الدعوات والمكافآت", en: "Invites and rewards" },
    args: {}
  }
] as const;

export function ReportsPanel({ lang }: { lang: Lang }) {
  const [reports, setReports] = useState<ReportResult[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    setLoading(true);
    const nextReports: ReportResult[] = [];

    for (const report of reportDefinitions) {
      const { data, error } = await supabase.rpc(report.key, report.args);
      nextReports.push({
        key: report.key,
        title: report.title,
        rows: Array.isArray(data) ? (data as Record<string, unknown>[]) : data ? [data as Record<string, unknown>] : [],
        error: error ? humanizeAdminError(error.message, lang) : undefined
      });
    }

    setReports(nextReports);
    setLoading(false);
  }

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportCsv(report: ReportResult) {
    const columns = Array.from(new Set(report.rows.flatMap((row) => Object.keys(row))));
    const lines = [
      columns.join(","),
      ...report.rows.map((row) =>
        columns.map((column) => JSON.stringify(String(row[column] ?? "").replace(/\n/g, " "))).join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.key}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "ملخصات الإدارة" : "Admin summaries"}</span>
          <h1>{lang === "ar" ? "التقارير" : "Reports"}</h1>
          <p>
            {lang === "ar"
              ? "����� ����� �� ������ʡ ������ѡ �������ʡ ��������ʡ ��������."
              : "Simple summaries for orders, stores, sales, dues, and invites."}
          </p>
        </div>
        <button className="soft-button" onClick={loadReports}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}

      <div className="reports-grid">
        {reports.map((report) => (
          <article className="report-card" key={report.key}>
            <div className="report-head">
              <div>
                <h2>{report.title[lang]}</h2>
                <span>{lang === "ar" ? `${report.rows.length} نتيجة` : `${report.rows.length} results`}</span>
              </div>
              <button className="tiny-button" onClick={() => exportCsv(report)} disabled={report.rows.length === 0}>
                <Download size={15} />
                {lang === "ar" ? "CSV" : "CSV"}
              </button>
            </div>
            {report.error ? <div className="alert">{report.error}</div> : null}
            <div className="report-list">
              {report.rows.slice(0, 5).map((row, index) => {
                const summary = reportRowSummary(report.key, row, lang);
                const details = splitReportDetails(summary.details, lang);
                return (
                  <section className="report-row" key={`${report.key}-${index}`}>
                    <strong className="report-row-title">{summary.title}</strong>
                    {details.length === 0 ? (
                      <span className="muted">
                        {lang === "ar" ? "لا توجد تفاصيل إضافية" : "No extra details"}
                      </span>
                    ) : (
                      <div className="report-details">
                        {details.map((detail) => (
                          <span className="report-detail" key={`${detail.label}-${detail.value}`}>
                            <b>{detail.label}</b>
                            <span>{detail.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function splitReportDetails(details: string, lang: Lang) {
  if (!details || details === "No extra details" || details.includes("لا توجد")) return [];
  return details
    .split(" | ")
    .map((part) => {
      const separator = part.indexOf(":");
      if (separator === -1) {
        return { label: lang === "ar" ? "معلومات" : "Info", value: part.trim() };
      }
      return {
        label: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim()
      };
    })
    .filter((part) => part.label && part.value);
}

function reportRowSummary(key: string, row: Record<string, unknown>, lang: Lang): ReportSummary {
  const titleKeys: Record<string, string[]> = {
    admin_report_orders: ["buyer_name", "store_name"],
    admin_report_active_merchants: ["store_name"],
    admin_report_active_categories: ["category_name_ar", "category_name_en"],
    admin_report_top_accepted_offers: ["store_name"],
    admin_report_rfq_acceptance: ["store_name", "status_ar", "status"],
    admin_report_merchant_arrears: ["store_name", "merchant_name"],
    admin_report_referrals_rewards: ["referrer_email", "referrer_name", "referral_code"]
  };

  const hidden = new Set([
    "id",
    "buyer_id",
    "merchant_id",
    "quote_request_id",
    "order_id",
    "owner_user_id",
    "category_id",
    "offer_id",
    "rfq_request_id",
    "accepted_response_id",
    "accepted_order_id",
    "accepted_merchant_id",
    "referrer_user_id",
    "rewarded_user_id",
    "referral_id",
    "referral_url",
    "category_name_en",
    "categories_en"
  ]);

  const title =
    titleKeys[key]
      ?.map((field) => row[field])
      .find((value) => value !== null && value !== undefined && String(value).trim() !== "") ??
    Object.entries(row).find(([field, value]) => !hidden.has(field) && value)?.[1] ??
    "-";

  const detailEntries = Object.entries(row)
    .filter(([field, value]) => !hidden.has(field) && value !== null && value !== undefined && String(value).trim() !== "")
    .filter(([field]) => !(field === "status" && row.status_ar))
    .filter(([field]) => !titleKeys[key]?.includes(field))
    .slice(0, 5);

  return {
    title: String(title),
    details:
      detailEntries.length === 0
        ? lang === "ar"
          ? "�� ���� ������ ������"
          : "No extra details"
        : detailEntries.map(([field, value]) => `${reportFieldLabel(field, lang)}: ${formatReportValue(field, value, lang)}`).join(" | ")
  };
}

function reportFieldLabel(field: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    buyer_name: { ar: "المشتري", en: "Buyer" },
    store_name: { ar: "المتجر", en: "Store" },
    merchant_name: { ar: "المتجر", en: "Store" },
    category_name_ar: { ar: "القسم", en: "Category" },
    categories_ar: { ar: "الأقسام", en: "Categories" },
    merchants_count: { ar: "عدد المتاجر", en: "Stores count" },
    orders_count: { ar: "عدد الطلبات", en: "Orders count" },
    status_ar: { ar: "الحالة", en: "Status" },
    status: { ar: "الحالة", en: "Status" },
    order_total: { ar: "إجمالي الطلب", en: "Order total" },
    gross_sales: { ar: "إجمالي المبيعات", en: "Gross sales" },
    commissions_due: { ar: "العمولات المستحقة", en: "Commissions due" },
    commission_amount: { ar: "العمولة", en: "Commission" },
    confirmed_orders_count: { ar: "طلبات مؤكدة", en: "Confirmed orders" },
    coverage_percentage: { ar: "نسبة تغطية الطلب", en: "Order coverage" },
    total_price_snapshot: { ar: "سعر العرض", en: "Offer price" },
    ranking: { ar: "ترتيب العرض", en: "Offer rank" },
    balance_due: { ar: "المستحق حالياً", en: "Current due" },
    unpaid_months: { ar: "أشهر غير مدفوعة", en: "Unpaid months" },
    grace_months: { ar: "فترة السماح", en: "Grace period" },
    confirmed_registrations: { ar: "تسجيلات مؤكدة", en: "Confirmed registrations" },
    target_confirmed_registrations: { ar: "الهدف المطلوب", en: "Required target" },
    referral_url: { ar: "رابط الدعوة", en: "Invite link" },
    referral_code: { ar: "كود الإحالة", en: "Referral code" },
    reward_type: { ar: "المكافأة", en: "Reward" },
    delivery_status: { ar: "التوصيل", en: "Delivery" },
    referrer_email: { ar: "بريد المُحيل", en: "Referrer email" },
    accepted_at: { ar: "تاريخ القبول", en: "Accepted at" },
    confirmed_at: { ar: "تاريخ التأكيد", en: "Confirmed at" },
    created_at: { ar: "تاريخ الإنشاء", en: "Created at" },
    last_order_at: { ar: "آخر طلب", en: "Last order" },
    average_rating: { ar: "متوسط التقييم", en: "Average rating" },
    responses_count: { ar: "الردود", en: "Responses" },
    submitted_responses_count: { ar: "ردود مقدمة", en: "Submitted responses" },
    priced_responses_count: { ar: "ردود مسعرة", en: "Priced responses" },
    accepted_total: { ar: "إجمالي المقبول", en: "Accepted total" }
  };
  return labels[field]?.[lang] ?? (lang === "ar" ? "������" : field.split("_").join(" "));
}

function formatReportValue(field: string, value: unknown, lang: Lang) {
  if (value === null || value === undefined || value === "") return "-";
  if (field.includes("status")) return friendlyStatus(value, lang);
  if (field.endsWith("_at") || field === "created_at") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    }
  }
  if (
    field.includes("total") ||
    field.includes("sales") ||
    field.includes("amount") ||
    field.includes("due") ||
    field.includes("price")
  ) {
    const amount = Number(value);
    if (Number.isFinite(amount)) {
      return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
        style: "currency",
        currency: "EGP"
      }).format(amount);
    }
  }
  if (field.includes("percentage")) {
    const number = Number(value);
    if (Number.isFinite(number)) return `${number.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}%`;
  }
  if (typeof value === "boolean") {
    return value ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "��" : "No";
  }
  if (lang === "ar" && String(value).trim().toLowerCase() === "deleted user") return "مستخدم محذوف";
  return String(value);
}
