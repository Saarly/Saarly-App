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
      const id = String(row.id ?? "");
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
      } else if (editing && "id" in editing) {
        await postAdminAction({
          action: "update_row",
          table: section.editableTable,
          id: String(editing.id),
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

      {!loading && filteredRows.length > 0 ? (
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
                <tr key={String(row.id ?? JSON.stringify(row))}>
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
                  {field}
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

function actionLabel(action: string, lang: Lang) {
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

