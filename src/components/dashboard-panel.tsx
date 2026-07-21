"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { sections } from "@/lib/admin/sections";

type DashboardRow = Record<string, number | string | null>;

const metricKeys = [
  ["users_count", { ar: "����������", en: "Users" }],
  ["merchants_count", { ar: "�������", en: "Stores" }],
  ["pending_merchants_count", { ar: "����� �����", en: "Pending stores" }],
  ["pending_branches_count", { ar: "���� �����", en: "Pending branches" }],
  ["awaiting_orders_count", { ar: "����� ����� �����", en: "Awaiting confirmation" }],
  ["open_support_chats_count", { ar: "������� ��� ������", en: "Open support chats" }]
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
    const overview = await supabase.from("admin_dashboard_overview").select("*").maybeSingle();
    const merchants = await supabase
      .from("admin_merchants_readable")
      .select("id, store_name, owner_name, approval_status_ar, created_at")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(6);
    const branches = await supabase
      .from("admin_branches_readable")
      .select("id, branch_name, store_name, city_name, approval_status_ar, created_at")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(6);

    setRow((overview.data ?? null) as DashboardRow | null);
    setPendingMerchants((merchants.data ?? []) as DashboardRow[]);
    setPendingBranches((branches.data ?? []) as DashboardRow[]);
    setError(overview.error?.message ?? merchants.error?.message ?? branches.error?.message ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const quickSections = useMemo(
    () =>
      sections.filter((section) =>
        ["merchant-approvals", "branch-approvals", "store-catalog", "broadcast", "orders", "support", "monetization", "audit"].includes(section.id)
      ),
    []
  );
  const operationalAlerts = useMemo(() => {
    const count = (key: string) => Number(row?.[key] ?? 0);
    const format = (value: number) =>
      value.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
    const alerts: string[] = [];
    const pendingMerchantsCount = count("pending_merchants_count");
    const pendingBranchesCount = count("pending_branches_count");
    const awaitingOrdersCount = count("awaiting_orders_count");
    const openSupportChatsCount = count("open_support_chats_count");

    if (pendingMerchantsCount > 0) {
      alerts.push(
        lang === "ar"
          ? `${format(pendingMerchantsCount)} ���� ������� ��������.`
          : `${format(pendingMerchantsCount)} stores are waiting for approval.`
      );
    }
    if (pendingBranchesCount > 0) {
      alerts.push(
        lang === "ar"
          ? `${format(pendingBranchesCount)} ��� ������� ��������.`
          : `${format(pendingBranchesCount)} branches are waiting for approval.`
      );
    }
    if (awaitingOrdersCount > 0) {
      alerts.push(
        lang === "ar"
          ? `${format(awaitingOrdersCount)} ��� ����� ����� ������.`
          : `${format(awaitingOrdersCount)} orders are waiting for store confirmation.`
      );
    }
    if (openSupportChatsCount > 0) {
      alerts.push(
        lang === "ar"
          ? `${format(openSupportChatsCount)} ������ ��� ������.`
          : `${format(openSupportChatsCount)} support chats are open.`
      );
    }

    return alerts.length > 0
      ? alerts
      : [
          lang === "ar"
            ? "�� ���� ������� ������� ���� �����."
            : "No critical operational alerts right now."
        ];
  }, [lang, row]);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{t("connected", lang)}</span>
          <h1>{lang === "ar" ? "��������" : "Dashboard"}</h1>
          <p>{lang === "ar" ? "���� ���� ���� �� ����� ������ �����." : "A quick view of what needs attention today."}</p>
        </div>
        <button className="soft-button" onClick={loadDashboard}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}

      <div className="metric-grid">
        {metricKeys.map(([key, label]) => (
          <article className="metric-card" key={key}>
            <span>{label[lang]}</span>
            <strong>{Number(row?.[key] ?? 0).toLocaleString("ar-EG")}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-grid">
        <article className="ops-card">
          <h2>{lang === "ar" ? "������� �������" : "Operational alerts"}</h2>
          {operationalAlerts.map((alert) => (
            <div className="alert-list" key={alert}>
              <AlertTriangle size={18} />
              <span>{alert}</span>
            </div>
          ))}
        </article>

        <article className="ops-card">
          <h2>{lang === "ar" ? "��������" : "Shortcuts"}</h2>
          <div className="shortcut-list">
            {quickSections.map((section) => (
              <a href={section.href} key={section.id}>
                <span>{section.title[lang]}</span>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <MiniList
          title={lang === "ar" ? "����� ����� ��������" : "Stores awaiting approval"}
          rows={pendingMerchants}
          primaryKey="store_name"
          secondaryKey="owner_name"
        />
        <MiniList
          title={lang === "ar" ? "���� ����� ��������" : "Branches awaiting approval"}
          rows={pendingBranches}
          primaryKey="branch_name"
          secondaryKey="store_name"
        />
      </div>
    </section>
  );
}

function MiniList({
  title,
  rows,
  primaryKey,
  secondaryKey
}: {
  title: string;
  rows: DashboardRow[];
  primaryKey: string;
  secondaryKey: string;
}) {
  return (
    <article className="ops-card">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted">�� ���� ����� ����� �����</p> : null}
      <div className="mini-list">
        {rows.map((row) => (
          <div key={String(row.id)}>
            <strong>{String(row[primaryKey] ?? "-")}</strong>
            <span>{String(row[secondaryKey] ?? "-")}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
