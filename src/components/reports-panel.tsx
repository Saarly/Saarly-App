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
                <span>{report.rows.length} rows</span>
              </div>
              <button className="tiny-button" onClick={() => exportCsv(report)} disabled={report.rows.length === 0}>
                <Download size={15} />
                CSV
              </button>
            </div>
            {report.error ? <div className="alert">{report.error}</div> : null}
            <div className="mini-list">
              {report.rows.slice(0, 5).map((row, index) => (
                <div key={`${report.key}-${index}`}>
                  <strong>{String(Object.values(row)[0] ?? "-")}</strong>
                  <span>{Object.entries(row).slice(1, 4).map(([key, value]) => `${key}: ${formatCell(value, undefined)}`).join(" | ")}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

