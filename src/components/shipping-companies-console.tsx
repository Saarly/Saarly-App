"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, PackageCheck, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { downloadExcel } from "@/lib/admin/excel";
import { formatCell } from "@/lib/admin/format";
import { humanizeAdminError } from "@/lib/admin/messages";
import type { Lang } from "@/lib/admin/i18n";

type Row = Record<string, unknown>;
type DetailPayload = { company: Row; batches: Row[] };

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function display(value: unknown, lang: Lang) {
  const normalized = text(value);
  return normalized || (lang === "ar" ? "غير مسجل" : "Not recorded");
}

function dateValue(value: unknown, lang: Lang) {
  return value ? String(formatCell(value, "date", lang)) : lang === "ar" ? "غير مسجل" : "Not recorded";
}

function money(value: unknown, lang: Lang) {
  const parsed = numberValue(value);
  if (parsed === null) return lang === "ar" ? "غير مسجل" : "Not recorded";
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function ShippingCompaniesConsole({ lang }: { lang: Lang }) {
  const [companies, setCompanies] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("auth_required");
      const response = await fetch("/api/admin/action?section=shipping-companies", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: Row[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "load_failed");
      setCompanies(payload.data ?? []);
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((company) => {
      if (status === "active" && company.is_active !== true) return false;
      if (status === "inactive" && company.is_active !== false) return false;
      if (!needle) return true;
      return [company.store_name, company.company_name, company.status_ar, company.id]
        .some((value) => text(value).toLowerCase().includes(needle));
    });
  }, [companies, query, status]);

  function exportRows() {
    const rows = filtered.map((company) => ({
      store_name: company.store_name,
      company_name: company.company_name,
      status: company.is_active ? (lang === "ar" ? "مفعلة" : "Enabled") : (lang === "ar" ? "موقوفة" : "Disabled"),
      batches_count: company.batches_count,
      created_at: company.created_at,
    }));
    const labels = lang === "ar"
      ? { store_name: "المتجر", company_name: "شركة الشحن", status: "الحالة", batches_count: "عدد الشرائح", created_at: "تاريخ الإضافة" }
      : { store_name: "Store", company_name: "Shipping company", status: "Status", batches_count: "Pricing tiers", created_at: "Created" };
    downloadExcel({
      filename: lang === "ar" ? "شركات-الشحن-سعرلي.xlsx" : "saarly-shipping-companies.xlsx",
      sheetName: lang === "ar" ? "شركات الشحن" : "Shipping companies",
      rtl: lang === "ar",
      rows,
      columns: Object.entries(labels).map(([key, label]) => ({ key, label })),
    });
  }

  return (
    <section className="content-panel shipping-companies-console">
      <div className="section-head">
        <div>
          <h1>{lang === "ar" ? "شركات الشحن" : "Shipping companies"}</h1>
          <p>
            {lang === "ar"
              ? "راجع شركات الشحن اللي أضافها كل متجر، وافتح تفاصيل شرائح الوزن والأسعار وحالة التفعيل. الصفحة للمتابعة والمراجعة فقط؛ التعديل يتم من حساب المتجر."
              : "Review each store's shipping companies, weight tiers, prices, and activation status. This page is read-only; stores manage these settings from their accounts."}
          </p>
        </div>
        <div className="section-actions">
          <button className="soft-button" type="button" onClick={exportRows} disabled={filtered.length === 0}>
            <Download size={17} />{lang === "ar" ? "تصدير" : "Export"}
          </button>
          <button className="soft-button" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} />{lang === "ar" ? "تحديث" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="shipping-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "ar" ? "ابحث بالمتجر أو شركة الشحن" : "Search store or company"} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label={lang === "ar" ? "حالة شركة الشحن" : "Shipping company status"}>
          <option value="">{lang === "ar" ? "كل الحالات" : "All statuses"}</option>
          <option value="active">{lang === "ar" ? "مفعلة" : "Enabled"}</option>
          <option value="inactive">{lang === "ar" ? "موقوفة" : "Disabled"}</option>
        </select>
        <span className="toolbar-count"><PackageCheck size={16} />{filtered.length} / {companies.length}</span>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {loading ? <div className="empty-state">{lang === "ar" ? "جار تحميل شركات الشحن..." : "Loading shipping companies..."}</div> : null}
      {!loading && filtered.length === 0 ? <div className="empty-state">{lang === "ar" ? "لا توجد شركات شحن مطابقة." : "No matching shipping companies."}</div> : null}

      {!loading && filtered.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table shipping-companies-table">
            <thead><tr>
              <th>{lang === "ar" ? "المتجر" : "Store"}</th>
              <th>{lang === "ar" ? "الشركة" : "Company"}</th>
              <th>{lang === "ar" ? "عدد الشرائح" : "Pricing tiers"}</th>
              <th>{lang === "ar" ? "الحالة" : "Status"}</th>
              <th>{lang === "ar" ? "تاريخ الإضافة" : "Created"}</th>
              <th>{lang === "ar" ? "الإجراءات" : "Actions"}</th>
            </tr></thead>
            <tbody>{filtered.map((company) => (
              <tr key={text(company.id)} className="clickable-row" onDoubleClick={() => setSelectedId(text(company.id))}>
                <td data-label={lang === "ar" ? "المتجر" : "Store"}>{display(company.store_name, lang)}</td>
                <td data-label={lang === "ar" ? "الشركة" : "Company"}>{display(company.company_name, lang)}</td>
                <td data-label={lang === "ar" ? "عدد الشرائح" : "Pricing tiers"}>{display(company.batches_count, lang)}</td>
                <td data-label={lang === "ar" ? "الحالة" : "Status"}>
                  <span className={`status-pill ${company.is_active ? "active" : "muted"}`}>
                    {company.is_active ? (lang === "ar" ? "مفعلة" : "Enabled") : (lang === "ar" ? "موقوفة" : "Disabled")}
                  </span>
                </td>
                <td data-label={lang === "ar" ? "تاريخ الإضافة" : "Created"}>{dateValue(company.created_at, lang)}</td>
                <td data-label={lang === "ar" ? "الإجراءات" : "Actions"} className="mobile-actions-cell">
                  <button className="tiny-button" type="button" onClick={() => setSelectedId(text(company.id))}>
                    <Eye size={15} />{lang === "ar" ? "عرض التفاصيل" : "View details"}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {selectedId ? <ShippingDetailsModal id={selectedId} lang={lang} onClose={() => setSelectedId(null)} /> : null}
    </section>
  );
}

function ShippingDetailsModal({ id, lang, onClose }: { id: string; lang: Lang; onClose: () => void }) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("auth_required");
        const response = await fetch(`/api/admin/action?shipping_company_id=${encodeURIComponent(id)}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json().catch(() => ({}))) as { data?: DetailPayload; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "load_failed");
        if (active) setDetail(payload.data ?? null);
      } catch (loadError) {
        if (active) setError(humanizeAdminError(loadError, lang));
      } finally {
        if (active) setLoading(false);
      }
    }
    void run();
    return () => { active = false; };
  }, [id, lang]);

  const company = detail?.company ?? {};
  const batches = detail?.batches ?? [];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card shipping-details-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close-button" onClick={onClose} aria-label={lang === "ar" ? "إغلاق" : "Close"}><X size={20} /></button>
        <h2>{lang === "ar" ? "تفاصيل شركة الشحن" : "Shipping company details"}</h2>
        {loading ? <div className="empty-state">{lang === "ar" ? "جار تحميل التفاصيل..." : "Loading details..."}</div> : null}
        {error ? <div className="alert">{error}</div> : null}
        {!loading && !error && detail ? (
          <>
            <div className="review-details-grid">
              <div className="review-detail-item"><strong>{lang === "ar" ? "المتجر" : "Store"}</strong><span>{display(company.store_name, lang)}</span></div>
              <div className="review-detail-item"><strong>{lang === "ar" ? "شركة الشحن" : "Shipping company"}</strong><span>{display(company.company_name ?? company.name, lang)}</span></div>
              <div className="review-detail-item"><strong>{lang === "ar" ? "الحالة" : "Status"}</strong><span className={`status-pill ${company.is_active ? "active" : "muted"}`}>{company.is_active ? (lang === "ar" ? "مفعلة" : "Enabled") : (lang === "ar" ? "موقوفة" : "Disabled")}</span></div>
              <div className="review-detail-item"><strong>{lang === "ar" ? "عدد الشرائح" : "Pricing tiers"}</strong><span>{batches.length}</span></div>
              <div className="review-detail-item"><strong>{lang === "ar" ? "تاريخ الإضافة" : "Created"}</strong><span>{dateValue(company.created_at, lang)}</span></div>
              <div className="review-detail-item"><strong>{lang === "ar" ? "آخر تحديث" : "Last updated"}</strong><span>{dateValue(company.updated_at, lang)}</span></div>
            </div>

            <h3>{lang === "ar" ? "شرائح الوزن والأسعار" : "Weight and price tiers"}</h3>
            {batches.length ? (
              <div className="data-table-wrap compact-table-wrap">
                <table className="data-table"><thead><tr>
                  <th>{lang === "ar" ? "أقل وزن" : "Minimum weight"}</th>
                  <th>{lang === "ar" ? "أقصى وزن" : "Maximum weight"}</th>
                  <th>{lang === "ar" ? "السعر" : "Price"}</th>
                  <th>{lang === "ar" ? "آخر تحديث" : "Last updated"}</th>
                </tr></thead><tbody>{batches.map((batch) => (
                  <tr key={text(batch.id)}>
                    <td data-label={lang === "ar" ? "أقل وزن" : "Minimum weight"}>{numberValue(batch.min_weight_kg) === null ? (lang === "ar" ? "من البداية" : "From zero") : `${money(batch.min_weight_kg, lang)} ${lang === "ar" ? "كجم" : "kg"}`}</td>
                    <td data-label={lang === "ar" ? "أقصى وزن" : "Maximum weight"}>{numberValue(batch.max_weight_kg) === null ? (lang === "ar" ? "بدون حد" : "No limit") : `${money(batch.max_weight_kg, lang)} ${lang === "ar" ? "كجم" : "kg"}`}</td>
                    <td data-label={lang === "ar" ? "السعر" : "Price"}>{money(batch.price, lang)} {lang === "ar" ? "جنيه" : "EGP"}</td>
                    <td data-label={lang === "ar" ? "آخر تحديث" : "Last updated"}>{dateValue(batch.updated_at, lang)}</td>
                  </tr>
                ))}</tbody></table>
              </div>
            ) : <div className="empty-state compact">{lang === "ar" ? "الشركة مضافة لكن لا توجد شرائح أسعار محفوظة لها." : "The company exists, but no pricing tiers are saved."}</div>}
          </>
        ) : null}
      </div>
    </div>
  );
}
