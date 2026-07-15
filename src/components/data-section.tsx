"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t, tr } from "@/lib/admin/i18n";
import type { SectionConfig } from "@/lib/admin/types";
import { coerceFormValue, fieldIsBoolean, fieldIsLongText, formatCell, rowMatches } from "@/lib/admin/format";

type Row = Record<string, unknown>;

export function DataSection({ section, lang }: { section: SectionConfig; lang: Lang }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});

  const filteredRows = useMemo(() => {
    let result = rows.filter((row) => rowMatches(row, section.searchKeys, query));
    if (section.id === "suspicious-matches") {
      result = result.filter((row) => {
        const confidence = Number(row.match_confidence);
        return !Number.isFinite(confidence) || confidence < 0.75;
      });
    }
    if (section.id === "categories") {
      result = sortCategoryRows(result);
    }
    return result;
  }, [query, rows, section.id, section.searchKeys]);

  async function loadRows() {
    if (!section.source) return;
    setLoading(true);
    setError(null);

    let request = supabase.from(section.source).select("*").limit(100);
    if (section.orderBy) {
      const ascending = ["display_order", "governorate_ar", "key"].includes(section.orderBy);
      request = request.order(section.orderBy, { ascending });
    }

    const { data, error: loadError } = await request;
    setRows((data ?? []) as Row[]);
    setError(loadError?.message ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  function startEdit(row: Row | "new") {
    const nextValues: Record<string, string | boolean> = {};
    for (const field of section.editableFields ?? []) {
      const value = row === "new" ? null : row[field];
      if (fieldIsBoolean(field)) {
        nextValues[field] = Boolean(value);
      } else if (value && typeof value === "object") {
        nextValues[field] = JSON.stringify(value, null, 2);
      } else {
        nextValues[field] = value === null || value === undefined ? "" : String(value);
      }
    }
    setFormValues(nextValues);
    setEditing(row);
  }

  async function postAdminAction(body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("auth_required");

    const response = await fetch("/api/admin/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "action_failed");
    }
  }

  async function runRowAction(action: string, row: Row) {
    try {
      const id = rowIdFor(section, row);
      if (!id) return;

      if (action.includes("reject")) {
        const reason = window.prompt(t("reason", lang));
        if (!reason) return;
        await postAdminAction({ action, id, payload: { reason } });
      } else if (action === "toggle_active") {
        const table = section.editableTable;
        if (!table) return;
        const field = table === "feature_flags" || table === "payment_settings" ? "is_enabled" : "is_active";
        await postAdminAction({
          action,
          table,
          id,
          payload: { enabled: !Boolean(row[field]) }
        });
      } else if (action === "edit_row") {
        startEdit(row);
        return;
      } else if (action === "set_user_password") {
        const password = window.prompt(lang === "ar" ? "\u0627\u0643\u062a\u0628 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629 \u0644\u0644\u0645\u0633\u062a\u062e\u062f\u0645" : "Enter a new password for this user");
        if (!password) return;
        if (password.length < 8) {
          window.alert(lang === "ar" ? "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0627\u0632\u0645 \u062a\u0643\u0648\u0646 8 \u062d\u0631\u0648\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644." : "Password must be at least 8 characters.");
          return;
        }
        const confirmPassword = window.prompt(lang === "ar" ? "\u0627\u0643\u062a\u0628 \u0646\u0641\u0633 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0644\u062a\u0623\u0643\u064a\u062f" : "Confirm the new password");
        if (password !== confirmPassword) {
          window.alert(lang === "ar" ? "\u0643\u0644\u0645\u062a\u064a \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0634 \u0645\u062a\u0637\u0627\u0628\u0642\u064a\u0646." : "Passwords do not match.");
          return;
        }
        await postAdminAction({ action, id, payload: { password } });
      } else {
        await postAdminAction({ action, id });
      }

      await loadRows();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

  async function saveEdit() {
    if (!section.editableTable || !section.editableFields) return;
    setError(null);

    try {
      const values = Object.fromEntries(
        section.editableFields.map((field) => [field, coerceFormValue(field, formValues[field] ?? "")])
      );

      if (editing === "new") {
        await postAdminAction({
          action: "create_row",
          table: section.editableTable,
          values
        });
      } else if (editing && typeof editing === "object") {
        await postAdminAction({
          action: "update_row",
          table: section.editableTable,
          id: rowIdFor(section, editing),
          values
        });
      }

      setEditing(null);
      await loadRows();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  const canCreate = Boolean(section.editableTable && section.editableFields?.length);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{t("connected", lang)}</span>
          <h1>{tr(section.title, lang)}</h1>
          <p>{tr(section.description, lang)}</p>
        </div>
        <div className="section-actions">
          {canCreate ? (
            <button className="soft-button" onClick={() => startEdit("new")}>
              <Plus size={17} />
              {lang === "ar" ? "إضافة" : "Add"}
            </button>
          ) : null}
          <button className="soft-button" onClick={loadRows}>
            <RefreshCw size={17} />
            {t("refresh", lang)}
          </button>
        </div>
      </div>

      <div className="table-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search", lang)} />
        </label>
        <span className="toolbar-count">
          <SlidersHorizontal size={16} />
          {filteredRows.length} / {rows.length}
        </span>
      </div>

      {error ? <div className="alert">{error === "service_role_key_missing" ? t("serviceKeyMissing", lang) : error}</div> : null}
      {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}

      {!loading && filteredRows.length === 0 ? <div className="empty-state">{t("noRows", lang)}</div> : null}

      {!loading && section.id === "categories" && filteredRows.length > 0 ? (
        <div className="category-tree">
          {filteredRows.map((row) => {
            const depth = categoryDepth(row, rows);
            const isMain = !row.parent_id;
            return (
              <article
                className={isMain ? "category-card main" : "category-card child"}
                style={{ marginInlineStart: `${Math.min(depth, 4) * 22}px` }}
                key={rowIdFor(section, row)}
              >
                <div>
                  <strong>{String((lang === "ar" ? row.name_ar : row.name_en) ?? row.name_ar ?? row.name_en ?? "-")}</strong>
                  <span>
                    {isMain
                      ? lang === "ar"
                        ? "\u0642\u0633\u0645 \u0631\u0626\u064a\u0633\u064a"
                        : "Main category"
                      : lang === "ar"
                        ? "\u0642\u0633\u0645 \u0641\u0631\u0639\u064a"
                        : "Subcategory"}
                  </span>
                </div>
                <div className="row-actions">
                  <span className={row.is_active ? "status-pill active" : "status-pill muted"}>
                    {row.is_active ? (lang === "ar" ? "\u0645\u0641\u0639\u0644" : "Active") : lang === "ar" ? "\u0645\u062a\u0648\u0642\u0641" : "Inactive"}
                  </span>
                  {section.actions?.map((action) => (
                    <button key={action} className="tiny-button" onClick={() => void runRowAction(action, row)}>
                      {actionLabel(action, lang)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && section.id !== "categories" && filteredRows.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {(section.columns ?? []).map((column) => (
                  <th key={column.key}>{tr(column.label, lang)}</th>
                ))}
                {section.actions?.length ? <th>{lang === "ar" ? "إجراءات" : "Actions"}</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={rowIdFor(section, row) || JSON.stringify(row)}>
                  {(section.columns ?? []).map((column) => (
                    <td key={column.key} className={column.tone ? `cell-${column.tone}` : undefined}>
                      {formatCell(row[column.key], column.tone)}
                    </td>
                  ))}
                  {section.actions?.length ? (
                    <td>
                      <div className="row-actions">
                        {section.actions.map((action) => (
                          <button key={action} className="tiny-button" onClick={() => void runRowAction(action, row)}>
                            {actionLabel(action, lang)}
                          </button>
                        ))}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editing ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>{editing === "new" ? (lang === "ar" ? "إضافة سجل" : "Add row") : lang === "ar" ? "تعديل سريع" : "Quick edit"}</h2>
            <div className="edit-grid">
              {(section.editableFields ?? []).map((field) => (
                <label key={field}>
                  {fieldLabel(field, lang)}
                  {fieldIsBoolean(field) ? (
                    <input
                      type="checkbox"
                      checked={Boolean(formValues[field])}
                      onChange={(event) => setFormValues((current) => ({ ...current, [field]: event.target.checked }))}
                    />
                  ) : fieldIsLongText(field) ? (
                    <textarea
                      dir="auto"
                      value={String(formValues[field] ?? "")}
                      onChange={(event) => setFormValues((current) => ({ ...current, [field]: event.target.value }))}
                    />
                  ) : (
                    <input
                      dir="auto"
                      value={String(formValues[field] ?? "")}
                      onChange={(event) => setFormValues((current) => ({ ...current, [field]: event.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setEditing(null)}>
                {t("cancel", lang)}
              </button>
              <button className="primary-button" onClick={() => void saveEdit()}>
                {t("save", lang)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function rowIdFor(section: SectionConfig, row: Row) {
  return String(row[section.rowIdKey ?? "id"] ?? "");
}

function sortCategoryRows(rows: Row[]) {
  const byParent = new Map<string, Row[]>();
  const roots: Row[] = [];

  for (const row of rows) {
    const parentId = String(row.parent_id ?? "");
    if (!parentId) {
      roots.push(row);
      continue;
    }
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(row);
    byParent.set(parentId, siblings);
  }

  const sortByOrder = (a: Row, b: Row) =>
    Number(a.display_order ?? 0) - Number(b.display_order ?? 0) ||
    String(a.name_ar ?? a.name_en ?? "").localeCompare(String(b.name_ar ?? b.name_en ?? ""));

  roots.sort(sortByOrder);
  for (const siblings of byParent.values()) siblings.sort(sortByOrder);

  const result: Row[] = [];
  const visit = (row: Row) => {
    result.push(row);
    for (const child of byParent.get(String(row.id ?? "")) ?? []) visit(child);
  };
  roots.forEach(visit);
  for (const row of rows) if (!result.includes(row)) result.push(row);
  return result;
}

function categoryDepth(row: Row, rows: Row[]) {
  const byId = new Map(rows.map((item) => [String(item.id ?? ""), item]));
  let depth = 0;
  let parentId = String(row.parent_id ?? "");

  while (parentId && byId.has(parentId) && depth < 8) {
    depth += 1;
    parentId = String(byId.get(parentId)?.parent_id ?? "");
  }
  return depth;
}

function fieldLabel(field: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    name_ar: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064a", en: "Arabic name" },
    name_en: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", en: "English name" },
    parent_id: { ar: "\u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0631\u0626\u064a\u0633\u064a", en: "Parent category" },
    display_order: { ar: "\u0627\u0644\u062a\u0631\u062a\u064a\u0628", en: "Display order" },
    is_active: { ar: "\u0645\u0641\u0639\u0644", en: "Active" },
    governorate_ar: { ar: "\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064a", en: "Arabic governorate" },
    governorate_en: { ar: "\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", en: "English governorate" },
    description_ar: { ar: "\u0627\u0644\u0648\u0635\u0641 \u0628\u0627\u0644\u0639\u0631\u0628\u064a", en: "Arabic description" },
    description_en: { ar: "\u0627\u0644\u0648\u0635\u0641 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", en: "English description" },
    configuration: { ar: "\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0645\u062a\u0642\u062f\u0645\u0629", en: "Advanced settings" },
    title_ar: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0627\u0644\u0639\u0631\u0628\u064a", en: "Arabic title" },
    title_en: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", en: "English title" },
    content_ar: { ar: "\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0628\u0627\u0644\u0639\u0631\u0628\u064a", en: "Arabic content" },
    content_en: { ar: "\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", en: "English content" },
    category: { ar: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641", en: "Category" },
    monthly_price: { ar: "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0634\u0647\u0631\u064a", en: "Monthly price" },
    features: { ar: "\u0627\u0644\u0645\u0645\u064a\u0632\u0627\u062a", en: "Features" },
    billing_period_months: { ar: "\u0645\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629 \u0628\u0627\u0644\u0634\u0647\u0648\u0631", en: "Billing period months" },
    grace_months: { ar: "\u0645\u0647\u0644\u0629 \u0627\u0644\u0633\u0645\u0627\u062d \u0628\u0627\u0644\u0634\u0647\u0648\u0631", en: "Grace months" },
    sort_order: { ar: "\u0627\u0644\u062a\u0631\u062a\u064a\u0628", en: "Sort order" },
    provider: { ar: "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639", en: "Payment provider" },
    is_enabled: { ar: "\u0645\u0641\u0639\u0644", en: "Enabled" },
    webhook_secret_name: { ar: "\u0627\u0633\u0645 \u0633\u0631 \u0627\u0644\u0648\u064a\u0628 \u0647\u0648\u0643", en: "Webhook secret name" },
    webhook_signature_header: { ar: "\u0647\u064a\u062f\u0631 \u062a\u0648\u0642\u064a\u0639 \u0627\u0644\u062f\u0641\u0639", en: "Signature header" },
    is_direct_to_merchant_supported: { ar: "\u064a\u062f\u0639\u0645 \u0627\u0644\u062f\u0641\u0639 \u0644\u0644\u0645\u062a\u062c\u0631 \u0645\u0628\u0627\u0634\u0631\u0629", en: "Direct to merchant" },
    image_url: { ar: "\u0631\u0627\u0628\u0637 \u0635\u0648\u0631\u0629 \u0627\u0644\u0625\u0639\u0644\u0627\u0646", en: "Image URL" },
    target_url: { ar: "\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0639\u0644\u0646", en: "Advertiser link" },
    placement: { ar: "\u0645\u0643\u0627\u0646 \u0627\u0644\u0638\u0647\u0648\u0631", en: "Placement" },
    starts_at: { ar: "\u064a\u0628\u062f\u0623 \u0645\u0646", en: "Starts at" },
    ends_at: { ar: "\u064a\u0646\u062a\u0647\u064a \u0641\u064a", en: "Ends at" },
    department: { ar: "\u0627\u0644\u0642\u0633\u0645", en: "Department" },
    permissions: { ar: "\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u0645\u0648\u0638\u0641", en: "Permissions" },
    needs_embedding: { ar: "\u064a\u062d\u062a\u0627\u062c \u062a\u062c\u0647\u064a\u0632 \u0644\u0644\u0628\u0648\u062a", en: "Needs bot indexing" },
    delivery_status: { ar: "\u062d\u0627\u0644\u0629 \u0627\u0644\u062a\u0633\u0644\u064a\u0645", en: "Delivery status" },
    delivered_at: { ar: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0633\u0644\u064a\u0645", en: "Delivered at" },
    notes: { ar: "\u0645\u0644\u0627\u062d\u0638\u0627\u062a", en: "Notes" },
    role: { ar: "\u0627\u0644\u062f\u0648\u0631", en: "Role" },
    is_blocked: { ar: "\u0645\u062d\u0638\u0648\u0631", en: "Blocked" },
    approval_status: { ar: "\u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629", en: "Approval status" },
    rejection_reason: { ar: "\u0633\u0628\u0628 \u0627\u0644\u0631\u0641\u0636", en: "Rejection reason" },
    billing_preference: { ar: "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629", en: "Billing preference" }
  };
  return labels[field]?.[lang] ?? field;
}

function actionLabel(action: string, lang: Lang) {
  if (action === "set_user_password") {
    return lang === "ar" ? "\u062a\u0639\u064a\u064a\u0646 \u0628\u0627\u0633\u0648\u0631\u062f" : "Set password";
  }
  const labels: Record<string, { ar: string; en: string }> = {
    approve_merchant: { ar: "قبول", en: "Approve" },
    reject_merchant: { ar: "رفض", en: "Reject" },
    approve_branch: { ar: "قبول", en: "Approve" },
    reject_branch: { ar: "رفض", en: "Reject" },
    block_user: { ar: "حظر", en: "Block" },
    unblock_user: { ar: "تفعيل", en: "Unblock" },
    toggle_active: { ar: "تبديل الحالة", en: "Toggle" },
    edit_row: { ar: "تعديل", en: "Edit" }
  };
  return labels[action]?.[lang] ?? action;
}
