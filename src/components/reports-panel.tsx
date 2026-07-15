"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { formatCell } from "@/lib/admin/format";

type ReportResult = {
  key: string;
  title: {
    ar: string;
    en: string;
  };
  rows: Record<string, unknown>[];
  error?: string;
};

const reportDefinitions = [
  {
    key: "admin_report_orders",
    title: { ar: "تقرير الطلبات", en: "Orders report" },
    args: { p_from: null, p_to: null, p_status: null, p_merchant_id: null, p_category_id: null }
  },
  {
    key: "admin_report_active_merchants",
    title: { ar: "المتاجر الأكثر نشاطا", en: "Most active stores" },
    args: { p_from: null, p_to: null, p_limit: 10 }
  },
  {
    key: "admin_report_active_categories",
    title: { ar: "الكاتجريز الأكثر طلبا", en: "Active categories" },
    args: { p_from: null, p_to: null, p_limit: 10 }
  },
  {
    key: "admin_report_top_accepted_offers",
    title: { ar: "أفضل العروض اختيارا", en: "Top accepted offers" },
    args: { p_from: null, p_to: null, p_limit: 10 }
  },
  {
    key: "admin_report_rfq_acceptance",
    title: { ar: "قبول RFQ", en: "RFQ acceptance" },
    args: { p_from: null, p_to: null }
  },
  {
    key: "admin_report_merchant_arrears",
    title: { ar: "متأخرات المتاجر", en: "Merchant arrears" },
    args: {}
  },
  {
    key: "admin_report_referrals_rewards",
    title: { ar: "الإحالات والمكافآت", en: "Referrals and rewards" },
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
        error: error?.message
      });
    }

    setReports(nextReports);
    setLoading(false);
  }

  useEffect(() => {
    void loadReports();
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
          <span className="eyebrow">{lang === "ar" ? "تقارير تشغيلية" : "Operational reports"}</span>
          <h1>{lang === "ar" ? "التقارير" : "Reports"}</h1>
          <p>
            {lang === "ar"
              ? "تقارير مباشرة من RPCs الآمنة في Supabase مع تصدير CSV."
              : "Live reports from secure Supabase RPCs with CSV export."}
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
                <span>{lang === "ar" ? `${report.rows.length} نتيجة` : `${report.rows.length} rows`}</span>
              </div>
              <button className="tiny-button" onClick={() => exportCsv(report)} disabled={report.rows.length === 0}>
                <Download size={15} />
                CSV
              </button>
            </div>
            {report.error ? <div className="alert">{report.error}</div> : null}
            <div className="mini-list">
              {report.rows.slice(0, 5).map((row, index) => {
                const summary = reportRowSummary(report.key, row, lang);
                return (
                  <div key={`${report.key}-${index}`}>
                    <strong>{summary.title}</strong>
                    <span>{summary.details}</span>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function reportRowSummary(key: string, row: Record<string, unknown>, lang: Lang) {
  const titleKeys: Record<string, string[]> = {
    admin_report_orders: ["buyer_name", "store_name", "status_ar", "id"],
    admin_report_active_merchants: ["store_name", "owner_name", "id"],
    admin_report_active_categories: ["category_name_ar", "category_name_en", "id"],
    admin_report_top_accepted_offers: ["store_name", "buyer_name", "order_id"],
    admin_report_rfq_acceptance: ["store_name", "status_ar", "id"],
    admin_report_merchant_arrears: ["store_name", "merchant_name", "id"],
    admin_report_referrals_rewards: ["referrer_email", "referrer_name", "referral_code", "id"]
  };

  const hidden = new Set(["id", "buyer_id", "merchant_id", "quote_request_id", "order_id", "referrer_user_id", "rewarded_user_id"]);
  const title =
    titleKeys[key]
      ?.map((field) => row[field])
      .find((value) => value !== null && value !== undefined && String(value).trim() !== "") ??
    Object.entries(row).find(([field, value]) => !hidden.has(field) && value)?.[1] ??
    "-";

  const detailEntries = Object.entries(row)
    .filter(([field, value]) => !hidden.has(field) && value !== null && value !== undefined && String(value).trim() !== "")
    .filter(([field]) => !titleKeys[key]?.includes(field))
    .slice(0, 4);

  return {
    title: String(title),
    details:
      detailEntries.length === 0
        ? lang === "ar"
          ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0641\u0627\u0635\u064a\u0644 \u0625\u0636\u0627\u0641\u064a\u0629"
          : "No extra details"
        : detailEntries.map(([field, value]) => `${reportFieldLabel(field, lang)}: ${formatCell(value, undefined)}`).join(" | ")
  };
}

function reportFieldLabel(field: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    buyer_name: { ar: "\u0627\u0644\u0639\u0645\u064a\u0644", en: "Buyer" },
    store_name: { ar: "\u0627\u0644\u0645\u062a\u062c\u0631", en: "Store" },
    category_name_ar: { ar: "\u0627\u0644\u0642\u0633\u0645", en: "Category" },
    category_name_en: { ar: "\u0627\u0644\u0642\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", en: "Category EN" },
    merchants_count: { ar: "\u0639\u062f\u062f \u0627\u0644\u0645\u062a\u0627\u062c\u0631", en: "Stores count" },
    orders_count: { ar: "\u0639\u062f\u062f \u0627\u0644\u0637\u0644\u0628\u0627\u062a", en: "Orders count" },
    status_ar: { ar: "\u0627\u0644\u062d\u0627\u0644\u0629", en: "Status" },
    amount: { ar: "\u0627\u0644\u0645\u0628\u0644\u063a", en: "Amount" },
    total_amount: { ar: "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a", en: "Total" },
    billing_preference: { ar: "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629", en: "Billing" },
    referral_code: { ar: "\u0643\u0648\u062f \u0627\u0644\u062f\u0639\u0648\u0629", en: "Referral code" },
    reward_type: { ar: "\u0646\u0648\u0639 \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629", en: "Reward" },
    delivery_status: { ar: "\u062d\u0627\u0644\u0629 \u0627\u0644\u062a\u0633\u0644\u064a\u0645", en: "Delivery" },
    referrer_email: { ar: "\u0625\u064a\u0645\u064a\u0644 \u0635\u0627\u062d\u0628 \u0627\u0644\u062f\u0639\u0648\u0629", en: "Referrer email" }
  };
  return labels[field]?.[lang] ?? field.split("_").join(" ");
}
