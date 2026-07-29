"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { sections } from "@/lib/admin/sections";
import { humanizeAdminError } from "@/lib/admin/messages";

type DashboardRow = Record<string, number | string | null>;
type DashboardPayload = {
  overview: DashboardRow | null;
  pendingMerchants: DashboardRow[];
  pendingBranches: DashboardRow[];
};

const metricKeys = [
  ["users_count", { ar: "المستخدمون", en: "Users" }],
  ["merchants_count", { ar: "المتاجر", en: "Stores" }],
  ["pending_merchants_count", { ar: "متاجر معلقة", en: "Pending stores" }],
  ["pending_branches_count", { ar: "فروع معلقة", en: "Pending branches" }],
  ["awaiting_orders_count", { ar: "بانتظار التأكيد", en: "Awaiting confirmation" }],
  ["open_support_chats_count", { ar: "محادثات دعم مفتوحة", en: "Open support chats" }]
] as const;

export function DashboardPanel({ lang }: { lang: Lang }) {
  const [row, setRow] = useState<DashboardRow | null>(null);
  const [pendingMerchants, setPendingMerchants] = useState<DashboardRow[]>([]);
  const [pendingBranches, setPendingBranches] = useState<DashboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("auth_required");
      const response = await fetch(`/api/admin/action?dashboard=1&t=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: DashboardPayload; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "dashboard_load_failed");
      setRow(payload.data.overview ?? null);
      setPendingMerchants(payload.data.pendingMerchants ?? []);
      setPendingBranches(payload.data.pendingBranches ?? []);
    } catch (loadError) {
      setRow(null);
      setPendingMerchants([]);
      setPendingBranches([]);
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quickSections = useMemo(
    () =>
      sections.filter((section) =>
        ["merchant-approvals", "branch-approvals", "store-catalog", "broadcast", "orders", "support", "monetization"].includes(section.id)
      ),
    []
  );
  const operationalAlerts = useMemo(() => {
    const count = (key: string) => Number(row?.[key] ?? 0);
    const format = (value: number) => value.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
    const alerts: string[] = [];
    const pendingMerchantsCount = count("pending_merchants_count");
    const pendingBranchesCount = count("pending_branches_count");
    const awaitingOrdersCount = count("awaiting_orders_count");
    const openSupportChatsCount = count("open_support_chats_count");

    if (pendingMerchantsCount > 0) alerts.push(lang === "ar" ? `${format(pendingMerchantsCount)} متجر بانتظار الموافقة.` : `${format(pendingMerchantsCount)} stores are awaiting approval.`);
    if (pendingBranchesCount > 0) alerts.push(lang === "ar" ? `${format(pendingBranchesCount)} فرع بانتظار الموافقة.` : `${format(pendingBranchesCount)} branches are awaiting approval.`);
    if (awaitingOrdersCount > 0) alerts.push(lang === "ar" ? `${format(awaitingOrdersCount)} طلب بانتظار تأكيد المتجر.` : `${format(awaitingOrdersCount)} orders are awaiting store confirmation.`);
    if (openSupportChatsCount > 0) alerts.push(lang === "ar" ? `${format(openSupportChatsCount)} محادثة دعم مفتوحة.` : `${format(openSupportChatsCount)} support conversations are open.`);
    return alerts.length ? alerts : [lang === "ar" ? "لا توجد تنبيهات تشغيلية حرجة حالياً." : "No critical operational alerts right now."];
  }, [lang, row]);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <h1>{lang === "ar" ? "لوحة التحكم" : "Dashboard"}</h1>
          <p>{lang === "ar" ? "نظرة سريعة على ما يحتاج للانتباه اليوم." : "A quick view of what needs attention today."}</p>
        </div>
        <button className="soft-button" onClick={() => void loadDashboard()} disabled={loading}>
          <RefreshCw size={17} />{t("refresh", lang)}
        </button>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
      <div className="metric-grid">
        {metricKeys.map(([key, label]) => <article className="metric-card" key={key}><span>{label[lang]}</span><strong>{Number(row?.[key] ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</strong></article>)}
      </div>
      <div className="dashboard-grid">
        <article className="ops-card"><h2>{lang === "ar" ? "تنبيهات تشغيلية" : "Operational alerts"}</h2>{operationalAlerts.map((alert) => <div className="alert-list" key={alert}><AlertTriangle size={18}/><span>{alert}</span></div>)}</article>
        <article className="ops-card"><h2>{lang === "ar" ? "اختصارات" : "Shortcuts"}</h2><div className="shortcut-list">{quickSections.map((section) => <a href={section.href} key={section.id}><span>{section.title[lang]}</span><ArrowUpRight size={16}/></a>)}</div></article>
      </div>
      <div className="dashboard-grid">
        <MiniList title={lang === "ar" ? "متاجر بانتظار الموافقة" : "Stores awaiting approval"} rows={pendingMerchants} primaryKey="store_name" secondaryKey="owner_name" lang={lang}/>
        <MiniList title={lang === "ar" ? "فروع بانتظار الموافقة" : "Branches awaiting approval"} rows={pendingBranches} primaryKey="branch_name" secondaryKey="store_name" lang={lang}/>
      </div>
    </section>
  );
}

function MiniList({ title, rows, primaryKey, secondaryKey, lang }: { title: string; rows: DashboardRow[]; primaryKey: string; secondaryKey: string; lang: Lang }) {
  return <article className="ops-card"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">{lang === "ar" ? "لا توجد عناصر تحتاج مراجعة" : "No items require review"}</p> : null}<div className="mini-list">{rows.map((row) => <div key={String(row.id)}><strong>{String(row[primaryKey] ?? "-")}</strong><span>{String(row[secondaryKey] ?? "-")}</span></div>)}</div></article>;
}
