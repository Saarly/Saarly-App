"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t, tr } from "@/lib/admin/i18n";
import type { SectionConfig } from "@/lib/admin/types";
import {
  coerceFormValue,
  fieldIsBoolean,
  fieldIsLongText,
  formatCell,
  rowMatches,
} from "@/lib/admin/format";
import { humanizeAdminError } from "@/lib/admin/messages";

type Row = Record<string, unknown>;
const DEFAULT_COUNTRY_AR = "مصر";
const DEFAULT_COUNTRY_EN = "Egypt";
const COUNTRY_MARKER = "__country__";

export function DataSection({
  section,
  lang,
}: {
  section: SectionConfig;
  lang: Lang;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [reviewingDetails, setReviewingDetails] = useState<Row | null>(null);
  const [formValues, setFormValues] = useState<
    Record<string, string | boolean>
  >({});
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(
    new Set(),
  );
  const [locationRows, setLocationRows] = useState<Row[]>([]);

  const filteredRows = useMemo(() => {
    let result = rows.filter((row) =>
      rowMatches(row, section.searchKeys, query),
    );
    if (section.id === "suspicious-matches") {
      result = result.filter((row) => {
        const confidence = Number(row.match_confidence);
        return !Number.isFinite(confidence) || confidence < 0.75;
      });
    }
    if (section.id === "categories") {
      result = sortCategoryRows(result);
    }
    if (section.id === "cities") {
      result = result.sort((a, b) => {
        const country = String(a.country_ar ?? "").localeCompare(
          String(b.country_ar ?? ""),
        );
        if (country) return country;
        const gov = String(a.governorate_ar ?? "").localeCompare(
          String(b.governorate_ar ?? ""),
        );
        return (
          gov || String(a.name_ar ?? "").localeCompare(String(b.name_ar ?? ""))
        );
      });
    }
    return result;
  }, [query, rows, section.id, section.searchKeys]);

  const adCountries = useMemo(() => {
    return Array.from(
      new Set(
        locationRows
          .map((row) => String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [locationRows]);

  const adGovernorates = useMemo(() => {
    const selectedCountry = String(formValues.target_country_ar ?? "").trim();
    return Array.from(
      new Set(
        locationRows
          .filter((row) => !isCountryMarker(row))
          .filter(
            (row) =>
              !selectedCountry ||
              String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() ===
                selectedCountry,
          )
          .map((row) => String(row.governorate_ar ?? "").trim())
          .filter((value) => value && value !== COUNTRY_MARKER),
      ),
    ).sort();
  }, [formValues.target_country_ar, locationRows]);

  const adCities = useMemo(() => {
    const selectedCountry = String(formValues.target_country_ar ?? "").trim();
    const selectedGovernorate = String(
      formValues.target_governorate_ar ?? "",
    ).trim();
    return Array.from(
      new Set(
        locationRows
          .filter((row) => !isCountryMarker(row) && !isGovernorateMarker(row))
          .filter(
            (row) =>
              !selectedCountry ||
              String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() ===
                selectedCountry,
          )
          .filter(
            (row) =>
              !selectedGovernorate ||
              String(row.governorate_ar ?? "").trim() === selectedGovernorate,
          )
          .map((row) => String(row.name_ar ?? "").trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [
    formValues.target_country_ar,
    formValues.target_governorate_ar,
    locationRows,
  ]);

  async function loadRows() {
    if (!section.source) return;
    setLoading(true);
    setError(null);

    let request = supabase
      .from(section.source)
      .select("*")
      .limit(section.id === "cities" ? 1000 : 100);
    if (section.orderBy) {
      const ascending = [
        "display_order",
        "country_ar",
        "governorate_ar",
        "key",
      ].includes(section.orderBy);
      request = request.order(section.orderBy, { ascending });
    }

    const { data, error: loadError } = await request;
    setRows((data ?? []) as Row[]);
    setError(loadError ? humanizeAdminError(loadError.message, lang) : null);
    setLoading(false);
  }

  async function loadLocationOptions() {
    const { data } = await supabase
      .from("cities")
      .select("country_ar,governorate_ar,name_ar")
      .order("country_ar", { ascending: true })
      .order("governorate_ar", { ascending: true })
      .order("name_ar", { ascending: true })
      .limit(500);
    setLocationRows((data ?? []) as Row[]);
  }

  useEffect(() => {
    void loadRows();
    if (section.id === "ads") {
      void loadLocationOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  function startEdit(row: Row | "new") {
    const nextValues: Record<string, string | boolean> = {};
    for (const field of section.editableFields ?? []) {
      const value = row === "new" ? null : row[field];
      if (fieldIsBoolean(field)) {
        nextValues[field] = row === "new" ? true : Boolean(value);
      } else if (fieldIsDateTime(field)) {
        nextValues[field] =
          value === null || value === undefined ? "" : toDateTimeLocal(value);
      } else if (value && typeof value === "object") {
        nextValues[field] = JSON.stringify(value, null, 2);
      } else {
        nextValues[field] =
          value === null || value === undefined ? "" : String(value);
      }
    }
    if (section.id === "categories") {
      nextValues.category_kind =
        row === "new" || !nextValues.parent_id ? "main" : "child";
      nextValues.display_order = nextValues.display_order || "0";
    }
    if (section.id === "cities") {
      nextValues.place_kind =
        row === "new"
          ? "country"
          : isCountryMarker(row)
            ? "country"
            : isGovernorateMarker(row)
              ? "governorate"
              : "city";
      nextValues.country_ar = nextValues.country_ar || DEFAULT_COUNTRY_AR;
      nextValues.country_en = nextValues.country_en || DEFAULT_COUNTRY_EN;
      nextValues.display_order = nextValues.display_order || "0";
    }
    if (section.id === "ads") {
      nextValues.placement = nextValues.placement || "buyer_home_top";
      nextValues.sort_order = nextValues.sort_order || "0";
      nextValues.target_country_ar = nextValues.target_country_ar || "";
      nextValues.target_governorate_ar = nextValues.target_governorate_ar || "";
      nextValues.target_city_ar = nextValues.target_city_ar || "";
    }
    if (section.id === "content-moderation") {
      nextValues.language = nextValues.language || "mixed";
      nextValues.match_type = nextValues.match_type || "contains";
      nextValues.category = nextValues.category || "general";
      nextValues.severity = nextValues.severity || "block";
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
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "action_failed");
    }
  }

  async function runRowAction(action: string, row: Row) {
    try {
      const id = rowIdFor(section, row);
      if (!id) return;

      if (action === "review_details") {
        setReviewingDetails(row);
        return;
      }

      if (action.includes("reject")) {
        const reason = window.prompt(t("reason", lang));
        if (!reason) return;
        await postAdminAction({ action, id, payload: { reason } });
      } else if (action === "toggle_active") {
        const table = section.editableTable;
        if (!table) return;
        const field =
          table === "feature_flags" || table === "payment_settings"
            ? "is_enabled"
            : "is_active";
        await postAdminAction({
          action,
          table,
          id,
          payload: { enabled: !Boolean(row[field]) },
        });
      } else if (action === "edit_row") {
        startEdit(row);
        return;
      } else if (action === "delete_row") {
        const table = section.editableTable;
        if (!table) return;
        const title = String(
          row.name_ar ?? row.title_ar ?? row.store_name ?? row.id ?? "",
        );
        const ok = window.confirm(
          lang === "ar"
            ? `\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 ${title || "\u0647\u0630\u0627 \u0627\u0644\u0639\u0646\u0635\u0631"}\u061f`
            : `Delete ${title || "this item"}?`,
        );
        if (!ok) return;
        await postAdminAction({ action, table, id });
      } else if (action === "delete_user_account") {
        const title = String(
          row.full_name ?? row.primary_email ?? row.mobile ?? row.id ?? "",
        );
        const ok = window.confirm(
          lang === "ar"
            ? `سيتم حذف دخول الحساب ومسح بياناته الشخصية وملفاته التابعة فقط. هل تريد حذف ${title || "هذا الحساب"}؟`
            : `This removes sign-in, personal data, and only this account's files. Delete ${title || "this account"}?`,
        );
        if (!ok) return;
        await postAdminAction({ action, id });
      } else if (action === "set_user_password") {
        const password = window.prompt(
          lang === "ar"
            ? "\u0627\u0643\u062a\u0628 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629 \u0644\u0644\u0645\u0633\u062a\u062e\u062f\u0645"
            : "Enter a new password for this user",
        );
        if (!password) return;
        if (password.length < 8) {
          window.alert(
            lang === "ar"
              ? "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0627\u0632\u0645 \u062a\u0643\u0648\u0646 8 \u062d\u0631\u0648\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644."
              : "Password must be at least 8 characters.",
          );
          return;
        }
        const confirmPassword = window.prompt(
          lang === "ar"
            ? "\u0627\u0643\u062a\u0628 \u0646\u0641\u0633 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0644\u062a\u0623\u0643\u064a\u062f"
            : "Confirm the new password",
        );
        if (password !== confirmPassword) {
          window.alert(
            lang === "ar"
              ? "\u0643\u0644\u0645\u062a\u064a \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0634 \u0645\u062a\u0637\u0627\u0628\u0642\u064a\u0646."
              : "Passwords do not match.",
          );
          return;
        }
        await postAdminAction({ action, id, payload: { password } });
      } else {
        await postAdminAction({ action, id });
      }

      await loadRows();
    } catch (actionError) {
      setError(humanizeAdminError(actionError, lang));
    }
  }

  async function saveEdit() {
    if (!section.editableTable || !section.editableFields) return;
    setError(null);

    try {
      const values = Object.fromEntries(
        section.editableFields.map((field) => [
          field,
          coerceEditableFormValue(field, formValues[field] ?? ""),
        ]),
      );

      if (section.id === "categories") {
        values.name_en = values.name_en || values.name_ar;
        values.parent_id = values.parent_id || null;
      }

      if (section.id === "cities") {
        values.country_ar = values.country_ar || DEFAULT_COUNTRY_AR;
        values.country_en =
          values.country_en || values.country_ar || DEFAULT_COUNTRY_EN;
        if (String(formValues.place_kind ?? "city") === "country") {
          values.country_ar = String(values.country_ar ?? "").trim();
          if (!values.country_ar) {
            throw new Error("country_required");
          }
          values.country_en = String(
            values.country_en || values.country_ar,
          ).trim();
          values.name_ar = values.country_ar;
          values.name_en = values.country_en;
          values.governorate_ar = COUNTRY_MARKER;
          values.governorate_en = COUNTRY_MARKER;
          values.currency_code = String(
            values.currency_code || "EGP",
          ).trim().toUpperCase();
          values.currency_name_ar = String(
            values.currency_name_ar || "جنيه مصري",
          ).trim();
          values.currency_name_en = String(
            values.currency_name_en || values.currency_code,
          ).trim();
          values.is_active = false;
        } else if (String(formValues.place_kind ?? "city") === "governorate") {
          values.governorate_ar = values.governorate_ar || values.name_ar;
          values.name_ar = values.governorate_ar;
          values.governorate_en =
            values.governorate_en || values.governorate_ar;
          values.name_en = values.governorate_en;
        }
        values.name_en = values.name_en || values.name_ar;
        values.governorate_en = values.governorate_en || values.governorate_ar;
      }

      if (editing === "new") {
        await postAdminAction({
          action: "create_row",
          table: section.editableTable,
          values,
        });
      } else if (editing && typeof editing === "object") {
        await postAdminAction({
          action: "update_row",
          table: section.editableTable,
          id: rowIdFor(section, editing),
          values,
        });
      }

      setEditing(null);
      await loadRows();
    } catch (saveError) {
      setError(humanizeAdminError(saveError, lang));
    }
  }

  const canCreate = Boolean(
    section.editableTable && section.editableFields?.length,
  );

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
              {section.id === "cities"
                ? lang === "ar"
                  ? "إضافة بلد أو محافظة أو مدينة"
                  : "Add country, governorate, or city"
                : lang === "ar"
                  ? "إضافة"
                  : "Add"}
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
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search", lang)}
          />
        </label>
        <span className="toolbar-count">
          <SlidersHorizontal size={16} />
          {filteredRows.length} / {rows.length}
        </span>
      </div>

      {error ? (
        <div className="alert">{humanizeAdminError(error, lang)}</div>
      ) : null}
      {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}

      {!loading && filteredRows.length === 0 ? (
        <div className="empty-state">{t("noRows", lang)}</div>
      ) : null}

      {!loading && section.id === "categories" && filteredRows.length > 0 ? (
        <div className="category-tree">
          {filteredRows.map((row) => {
            const depth = categoryDepth(row, rows);
            const isMain = !row.parent_id;
            const group = { governorateRow: null as Row | null };
            return (
              <article
                className={
                  isMain ? "category-card main" : "category-card child"
                }
                style={{ marginInlineStart: `${Math.min(depth, 4) * 22}px` }}
                key={rowIdFor(section, row)}
              >
                <div>
                  <strong>
                    {String(
                      (lang === "ar" ? row.name_ar : row.name_en) ??
                        row.name_ar ??
                        row.name_en ??
                        "-",
                    )}
                  </strong>
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
                  <span
                    className={
                      row.is_active ? "status-pill active" : "status-pill muted"
                    }
                  >
                    {row.is_active
                      ? lang === "ar"
                        ? "\u0645\u0641\u0639\u0644"
                        : "Active"
                      : lang === "ar"
                        ? "\u0645\u062a\u0648\u0642\u0641"
                        : "Inactive"}
                  </span>
                  {section.actions?.map((action) => (
                    <button
                      key={action}
                      className="tiny-button"
                      onClick={() => void runRowAction(action, row)}
                    >
                      {actionLabel(action, lang)}
                    </button>
                  ))}
                </div>
                {group.governorateRow ? (
                  <div className="row-actions">
                    <span
                      className={
                        group.governorateRow.is_active
                          ? "status-pill active"
                          : "status-pill muted"
                      }
                    >
                      {group.governorateRow.is_active
                        ? lang === "ar"
                          ? "مفعلة"
                          : "Active"
                        : lang === "ar"
                          ? "متوقفة"
                          : "Inactive"}
                    </span>
                    {section.actions?.map((action) => (
                      <button
                        key={action}
                        className="tiny-button"
                        onClick={() =>
                          void runRowAction(action, group.governorateRow!)
                        }
                      >
                        {actionLabel(action, lang)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && section.id === "cities" && filteredRows.length > 0 ? (
        <div className="category-tree">
          {groupLocationRows(filteredRows).map((country) => {
            const isCollapsed = collapsedCountries.has(country.country);
            const cityCount = country.governorates.reduce(
              (total, group) => total + group.cities.length,
              0,
            );
            return (
              <div className="location-country" key={country.country}>
                <button
                  type="button"
                  className="category-card country-toggle"
                  onClick={() =>
                    setCollapsedCountries((current) => {
                      const next = new Set(current);
                      if (next.has(country.country)) {
                        next.delete(country.country);
                      } else {
                        next.add(country.country);
                      }
                      return next;
                    })
                  }
                >
                  {isCollapsed ? (
                    <ChevronLeft size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                  <span>
                    <strong>{country.country}</strong>
                    <small>
                      {lang === "ar"
                        ? `${country.governorates.length} محافظة - ${cityCount} مدينة`
                        : `${country.governorates.length} governorates - ${cityCount} cities`}
                    </small>
                  </span>
                </button>
                {country.countryRow ? (
                  <div className="row-actions country-header-actions">
                    {section.actions
                      ?.filter((action) => action !== "toggle_active")
                      .map((action) => (
                        <button
                          key={action}
                          className="tiny-button"
                          onClick={() =>
                            void runRowAction(action, country.countryRow!)
                          }
                        >
                          {actionLabel(action, lang)}
                        </button>
                      ))}
                  </div>
                ) : null}

                {!isCollapsed
                  ? country.governorates.map((group) => (
                      <div
                        className="location-governorate"
                        key={`${country.country}-${group.governorate}`}
                      >
                        <article
                          className="category-card main"
                          style={{ marginInlineStart: "22px" }}
                        >
                          <div>
                            <strong>{group.governorate}</strong>
                            {group.governorateRow ? (
                              <div className="row-actions category-header-actions">
                                <span
                                  className={
                                    group.governorateRow.is_active
                                      ? "status-pill active"
                                      : "status-pill muted"
                                  }
                                >
                                  {group.governorateRow.is_active
                                    ? lang === "ar"
                                      ? "مفعلة"
                                      : "Active"
                                    : lang === "ar"
                                      ? "متوقفة"
                                      : "Inactive"}
                                </span>
                                {section.actions?.map((action) => (
                                  <button
                                    key={action}
                                    className="tiny-button"
                                    onClick={() =>
                                      void runRowAction(
                                        action,
                                        group.governorateRow!,
                                      )
                                    }
                                  >
                                    {actionLabel(action, lang)}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <span>
                              {lang === "ar"
                                ? `${group.cities.length} مدينة`
                                : `${group.cities.length} cities`}
                            </span>
                          </div>
                        </article>
                        {group.cities.map((row) => (
                          <article
                            className="category-card child"
                            style={{ marginInlineStart: "44px" }}
                            key={rowIdFor(section, row)}
                          >
                            <div>
                              <strong>
                                {String(
                                  (lang === "ar" ? row.name_ar : row.name_en) ??
                                    row.name_ar ??
                                    row.name_en ??
                                    "-",
                                )}
                              </strong>
                              <span>
                                {row.is_active
                                  ? lang === "ar"
                                    ? "مفعلة"
                                    : "Active"
                                  : lang === "ar"
                                    ? "متوقفة"
                                    : "Inactive"}
                              </span>
                            </div>
                            <div className="row-actions">
                              {section.actions?.map((action) => (
                                <button
                                  key={action}
                                  className="tiny-button"
                                  onClick={() => void runRowAction(action, row)}
                                >
                                  {actionLabel(action, lang)}
                                </button>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ))
                  : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading &&
      !["categories", "cities"].includes(section.id) &&
      filteredRows.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {(section.columns ?? []).map((column) => (
                  <th key={column.key}>{tr(column.label, lang)}</th>
                ))}
                {section.actions?.length ? (
                  <th>{lang === "ar" ? "إجراءات" : "Actions"}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={rowIdFor(section, row) || JSON.stringify(row)}>
                  {(section.columns ?? []).map((column) => (
                    <td
                      key={column.key}
                      className={
                        column.tone ? `cell-${column.tone}` : undefined
                      }
                    >
                      {formatCell(row[column.key], column.tone, lang)}
                    </td>
                  ))}
                  {section.actions?.length ? (
                    <td>
                      <div className="row-actions">
                        {section.actions.map((action) => (
                          <button
                            key={action}
                            className="tiny-button"
                            onClick={() => void runRowAction(action, row)}
                          >
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
            <h2>
              {editing === "new"
                ? lang === "ar"
                  ? "إضافة سجل"
                  : "Add row"
                : lang === "ar"
                  ? "تعديل سريع"
                  : "Quick edit"}
            </h2>
            <div className="edit-grid">
              {section.id === "categories" ? (
                <CategoryEditorV2
                  lang={lang}
                  rows={rows}
                  editing={editing}
                  formValues={formValues}
                  setFormValues={setFormValues}
                />
              ) : section.id === "cities" ? (
                <CityEditorV2
                  lang={lang}
                  rows={rows}
                  formValues={formValues}
                  setFormValues={setFormValues}
                />
              ) : (
                (section.editableFields ?? []).map((field) => (
                  <label key={field}>
                    {fieldLabel(field, lang)}
                    {fieldIsBoolean(field) ? (
                      <input
                        type="checkbox"
                        checked={Boolean(formValues[field])}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field]: event.target.checked,
                          }))
                        }
                      />
                    ) : section.id === "ads" && field === "placement" ? (
                      <select
                        value={String(formValues[field] ?? "buyer_home_top")}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      >
                        <option value="buyer_home_top">
                          {lang === "ar"
                            ? "\u0648\u0627\u062c\u0647\u0629 \u0627\u0644\u0639\u0645\u064a\u0644 - \u0623\u0633\u0641\u0644 \u0643\u0627\u0631\u062a \u0633\u0639\u0631\u0644\u064a"
                            : "Buyer home - below Saarly card"}
                        </option>
                      </select>
                    ) : section.id === "ads" &&
                      field === "target_country_ar" ? (
                      <select
                        value={String(formValues[field] ?? "")}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            target_country_ar: event.target.value,
                            target_governorate_ar: "",
                            target_city_ar: "",
                          }))
                        }
                      >
                        <option value="">
                          {lang === "ar" ? "كل البلاد" : "All countries"}
                        </option>
                        {adCountries.map((country) => (
                          <option value={country} key={country}>
                            {country}
                          </option>
                        ))}
                      </select>
                    ) : section.id === "ads" &&
                      field === "target_governorate_ar" ? (
                      <select
                        value={String(formValues[field] ?? "")}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            target_governorate_ar: event.target.value,
                            target_city_ar: "",
                          }))
                        }
                      >
                        <option value="">
                          {lang === "ar" ? "كل المحافظات" : "All governorates"}
                        </option>
                        {adGovernorates.map((governorate) => (
                          <option value={governorate} key={governorate}>
                            {governorate}
                          </option>
                        ))}
                      </select>
                    ) : section.id === "ads" && field === "target_city_ar" ? (
                      <select
                        value={String(formValues[field] ?? "")}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            target_city_ar: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {lang === "ar" ? "كل المدن" : "All cities"}
                        </option>
                        {adCities.map((city) => (
                          <option value={city} key={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    ) : section.id === "content-moderation" &&
                      contentModerationSelectOptions(field, lang) ? (
                      <select
                        value={String(
                          formValues[field] ??
                            contentModerationSelectOptions(field, lang)?.[0]
                              ?.value ??
                            "",
                        )}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      >
                        {contentModerationSelectOptions(field, lang)?.map(
                          (option) => (
                            <option value={option.value} key={option.value}>
                              {option.label}
                            </option>
                          ),
                        )}
                      </select>
                    ) : fieldIsLongText(field) ? (
                      <textarea
                        dir="auto"
                        value={String(formValues[field] ?? "")}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <input
                        dir="auto"
                        type={
                          fieldIsDateTime(field) ? "datetime-local" : undefined
                        }
                        value={String(formValues[field] ?? "")}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setEditing(null)}>
                {t("cancel", lang)}
              </button>
              <button
                className="primary-button"
                onClick={() => void saveEdit()}
              >
                {t("save", lang)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewingDetails ? (
        <ReviewDetailsModal
          lang={lang}
          section={section}
          row={reviewingDetails}
          onClose={() => setReviewingDetails(null)}
        />
      ) : null}
    </section>
  );
}

function rowIdFor(section: SectionConfig, row: Row) {
  return String(row[section.rowIdKey ?? "id"] ?? "");
}

function fieldIsDateTime(field: string) {
  return ["starts_at", "ends_at", "delivered_at"].includes(field);
}

function toDateTimeLocal(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function coerceEditableFormValue(field: string, value: string | boolean) {
  if (!fieldIsDateTime(field)) {
    return coerceFormValue(field, value);
  }
  const text = typeof value === "boolean" ? "" : value.trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function contentModerationSelectOptions(field: string, lang: Lang) {
  const options: Record<string, { value: string; ar: string; en: string }[]> = {
    language: [
      { value: "mixed", ar: "أي لغة", en: "Any language" },
      { value: "arabic", ar: "عربي", en: "Arabic" },
      {
        value: "latin",
        ar: "إنجليزي أو حروف لاتينية",
        en: "English or Latin letters",
      },
    ],
    match_type: [
      { value: "contains", ar: "لو ظهرت داخل الكلام", en: "Appears anywhere" },
      { value: "word", ar: "كلمة مستقلة", en: "Whole word" },
      { value: "exact", ar: "النص مطابق بالضبط", en: "Exact match" },
    ],
    category: [
      { value: "general", ar: "عام", en: "General" },
      { value: "profanity", ar: "شتائم", en: "Profanity" },
      { value: "sexual", ar: "محتوى جنسي", en: "Sexual content" },
      { value: "abuse", ar: "إساءة أو تنمر", en: "Abuse" },
      { value: "scam", ar: "احتيال أو روابط مشبوهة", en: "Scam" },
    ],
    severity: [
      { value: "block", ar: "منع النشر أو الإرسال", en: "Block" },
      { value: "review", ar: "للمراجعة لاحقا", en: "Review later" },
    ],
  };
  return options[field]?.map((option) => ({
    value: option.value,
    label: option[lang],
  }));
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
    String(a.name_ar ?? a.name_en ?? "").localeCompare(
      String(b.name_ar ?? b.name_en ?? ""),
    );

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

function groupLocationRows(rows: Row[]) {
  const countries = new Map<
    string,
    {
      countryRow: Row | null;
      governorates: Map<string, { governorateRow: Row | null; cities: Row[] }>;
    }
  >();
  for (const row of rows) {
    const country =
      String(row.country_ar ?? row.country_en ?? DEFAULT_COUNTRY_AR).trim() ||
      DEFAULT_COUNTRY_AR;
    const countryGroup = countries.get(country) ?? {
      countryRow: null,
      governorates: new Map<
        string,
        { governorateRow: Row | null; cities: Row[] }
      >(),
    };
    if (isCountryMarker(row)) {
      countryGroup.countryRow = row;
      countries.set(country, countryGroup);
      continue;
    }
    const governorate = String(row.governorate_ar ?? row.governorate_en ?? "-");
    const group = countryGroup.governorates.get(governorate) ?? {
      governorateRow: null,
      cities: [],
    };
    if (isGovernorateMarker(row)) {
      group.governorateRow = row;
    } else {
      group.cities.push(row);
    }
    countryGroup.governorates.set(governorate, group);
    countries.set(country, countryGroup);
  }

  return Array.from(countries.entries())
    .map(([country, group]) => ({
      country,
      countryRow: group.countryRow,
      order: Number(group.countryRow?.display_order ?? 0),
      governorates: Array.from(group.governorates.entries())
        .map(([governorate, governorateGroup]) => ({
          governorate,
          governorateRow: governorateGroup.governorateRow,
          order: Number(governorateGroup.governorateRow?.display_order ?? 0),
          cities: governorateGroup.cities.sort(
            (a, b) =>
              Number(a.display_order ?? 0) - Number(b.display_order ?? 0) ||
              String(a.name_ar ?? "").localeCompare(String(b.name_ar ?? "")),
          ),
        }))
        .sort(
          (a, b) =>
            a.order - b.order || a.governorate.localeCompare(b.governorate),
        ),
    }))
    .sort((a, b) => a.order - b.order || a.country.localeCompare(b.country));
}

function isCountryMarker(row: Row) {
  return (
    String(row.governorate_en ?? "").trim() === COUNTRY_MARKER ||
    String(row.governorate_ar ?? "").trim() === COUNTRY_MARKER
  );
}

function isGovernorateMarker(row: Row) {
  const nameAr = String(row.name_ar ?? "").trim();
  const nameEn = String(row.name_en ?? "")
    .trim()
    .toLowerCase();
  const governorateAr = String(row.governorate_ar ?? "").trim();
  const governorateEn = String(row.governorate_en ?? "")
    .trim()
    .toLowerCase();
  return (
    Boolean(nameAr) &&
    nameAr === governorateAr &&
    (!nameEn || nameEn === governorateEn)
  );
}

function CategoryEditorV2({
  lang,
  rows,
  editing,
  formValues,
  setFormValues,
}: {
  lang: Lang;
  rows: Row[];
  editing: Row | "new" | null;
  formValues: Record<string, string | boolean>;
  setFormValues: Dispatch<SetStateAction<Record<string, string | boolean>>>;
}) {
  const currentId =
    editing && editing !== "new" ? String(editing.id ?? "") : "";
  const roots = rows.filter(
    (row) => !row.parent_id && String(row.id ?? "") !== currentId,
  );
  const categoryKind = String(
    formValues.category_kind ?? (formValues.parent_id ? "child" : "main"),
  );

  return (
    <>
      <label>
        {lang === "ar"
          ? "\u0646\u0648\u0639 \u0627\u0644\u0642\u0633\u0645"
          : "Category type"}
        <select
          value={categoryKind}
          onChange={(event) => {
            const nextKind = event.target.value;
            setFormValues((current) => ({
              ...current,
              category_kind: nextKind,
              parent_id: nextKind === "main" ? "" : String(roots[0]?.id ?? ""),
            }));
          }}
        >
          <option value="main">
            {lang === "ar"
              ? "\u0642\u0633\u0645 \u0631\u0626\u064a\u0633\u064a"
              : "Main category"}
          </option>
          <option value="child">
            {lang === "ar"
              ? "\u0642\u0633\u0645 \u0641\u0631\u0639\u064a"
              : "Subcategory"}
          </option>
        </select>
      </label>

      {categoryKind === "child" ? (
        <label>
          {lang === "ar"
            ? "\u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0631\u0626\u064a\u0633\u064a \u0627\u0644\u062a\u0627\u0628\u0639 \u0644\u0647"
            : "Parent category"}
          <select
            value={String(formValues.parent_id ?? "")}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                parent_id: event.target.value,
              }))
            }
            required
          >
            <option value="" disabled>
              {lang === "ar"
                ? "\u0627\u062e\u062a\u0631 \u0642\u0633\u0645 \u0631\u0626\u064a\u0633\u064a"
                : "Choose a main category"}
            </option>
            {roots.map((row) => (
              <option value={String(row.id)} key={String(row.id)}>
                {String(
                  (lang === "ar" ? row.name_ar : row.name_en) ??
                    row.name_ar ??
                    "-",
                )}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        {lang === "ar"
          ? "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645"
          : "Category name"}
        <input
          dir="auto"
          value={String(formValues.name_ar ?? "")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              name_ar: event.target.value,
            }))
          }
          required
        />
      </label>

      {lang === "en" ? (
        <label>
          English name
          <input
            dir="auto"
            value={String(formValues.name_en ?? "")}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                name_en: event.target.value,
              }))
            }
          />
        </label>
      ) : null}

      <label>
        {lang === "ar" ? "\u0627\u0644\u062a\u0631\u062a\u064a\u0628" : "Order"}
        <input
          dir="ltr"
          type="number"
          min="0"
          value={String(formValues.display_order ?? "0")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              display_order: event.target.value,
            }))
          }
        />
      </label>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(formValues.is_active)}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              is_active: event.target.checked,
            }))
          }
        />
        <span>{lang === "ar" ? "\u0645\u0641\u0639\u0644" : "Active"}</span>
      </label>
    </>
  );
}

function CategoryEditor({
  lang,
  rows,
  editing,
  formValues,
  setFormValues,
}: {
  lang: Lang;
  rows: Row[];
  editing: Row | "new" | null;
  formValues: Record<string, string | boolean>;
  setFormValues: Dispatch<SetStateAction<Record<string, string | boolean>>>;
}) {
  const currentId =
    editing && editing !== "new" ? String(editing.id ?? "") : "";
  const roots = rows.filter(
    (row) => !row.parent_id && String(row.id ?? "") !== currentId,
  );

  return (
    <>
      <label>
        {lang === "ar" ? "اسم القسم" : "Category name"}
        <input
          dir="auto"
          value={String(formValues.name_ar ?? "")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              name_ar: event.target.value,
            }))
          }
        />
      </label>
      {lang === "en" ? (
        <label>
          English name
          <input
            dir="auto"
            value={String(formValues.name_en ?? "")}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                name_en: event.target.value,
              }))
            }
          />
        </label>
      ) : null}
      <label>
        {lang === "ar" ? "نوع القسم" : "Category type"}
        <select
          value={String(formValues.parent_id ?? "")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              parent_id: event.target.value,
            }))
          }
        >
          <option value="">
            {lang === "ar" ? "قسم رئيسي" : "Main category"}
          </option>
          {roots.map((row) => (
            <option value={String(row.id)} key={String(row.id)}>
              {String(
                (lang === "ar" ? row.name_ar : row.name_en) ??
                  row.name_ar ??
                  "-",
              )}
            </option>
          ))}
        </select>
      </label>
      <label>
        {lang === "ar" ? "الترتيب" : "Order"}
        <input
          dir="ltr"
          type="number"
          min="0"
          value={String(formValues.display_order ?? "0")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              display_order: event.target.value,
            }))
          }
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(formValues.is_active)}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              is_active: event.target.checked,
            }))
          }
        />
        <span>{lang === "ar" ? "مفعل" : "Active"}</span>
      </label>
    </>
  );
}

function CityEditorV2({
  lang,
  rows,
  formValues,
  setFormValues,
}: {
  lang: Lang;
  rows: Row[];
  formValues: Record<string, string | boolean>;
  setFormValues: Dispatch<SetStateAction<Record<string, string | boolean>>>;
}) {
  const countries = Array.from(
    new Set(
      rows
        .map((row) => String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim())
        .filter(Boolean),
    ),
  ).sort();
  const placeKind = String(formValues.place_kind ?? "city");
  const countryOptions = countries.includes(DEFAULT_COUNTRY_AR)
    ? [
        DEFAULT_COUNTRY_AR,
        ...countries.filter((country) => country !== DEFAULT_COUNTRY_AR),
      ]
    : countries.length > 0
      ? countries
      : [DEFAULT_COUNTRY_AR];
  const defaultCountry = countryOptions[0] || DEFAULT_COUNTRY_AR;
  const selectedCountry = String(
    formValues.country_ar || (placeKind === "country" ? "" : defaultCountry),
  );
  const governorates = Array.from(
    new Set(
      rows
        .filter(
          (row) =>
            !isCountryMarker(row) &&
            String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() ===
              selectedCountry,
        )
        .map((row) => String(row.governorate_ar ?? "").trim())
        .filter(Boolean),
    ),
  ).sort();
  return (
    <>
      <label>
        {lang === "ar"
          ? "\u0646\u0648\u0639 \u0627\u0644\u0625\u0636\u0627\u0641\u0629"
          : "Entry type"}
        <select
          value={placeKind}
          onChange={(event) => {
            const nextKind = event.target.value;
            setFormValues((current) => ({
              ...current,
              place_kind: nextKind,
              country_ar:
                nextKind === "country"
                  ? String(current.country_ar ?? "")
                  : String(current.country_ar || defaultCountry),
              governorate_ar:
                nextKind === "city"
                  ? String(current.governorate_ar || governorates[0] || "")
                  : "",
              name_ar:
                nextKind === "governorate" || nextKind === "country"
                  ? ""
                  : String(current.name_ar ?? ""),
            }));
          }}
        >
          <option value="country">{lang === "ar" ? "بلد" : "Country"}</option>
          <option value="governorate">
            {lang === "ar"
              ? "\u0645\u062d\u0627\u0641\u0638\u0629"
              : "Governorate"}
          </option>
          <option value="city">
            {lang === "ar" ? "\u0645\u062f\u064a\u0646\u0629" : "City"}
          </option>
        </select>
      </label>

      <label>
        {lang === "ar" ? "البلد" : "Country"}
        {placeKind === "country" ? (
          <input
            dir="auto"
            value={selectedCountry}
            onChange={(event) => {
              const country = event.target.value;
              setFormValues((current) => ({
                ...current,
                country_ar: country,
                country_en: String(
                  current.country_en || country || DEFAULT_COUNTRY_EN,
                ),
                governorate_ar: "",
              }));
            }}
            required
          />
        ) : (
          <select
            value={selectedCountry}
            onChange={(event) => {
              const country = event.target.value;
              setFormValues((current) => ({
                ...current,
                country_ar: country,
                country_en: String(
                  current.country_en || country || DEFAULT_COUNTRY_EN,
                ),
                governorate_ar: "",
              }));
            }}
            required
          >
            {countryOptions.map((country) => (
              <option value={country} key={country}>
                {country}
              </option>
            ))}
          </select>
        )}
      </label>

      {placeKind === "country" ? (
        <>
          <label>
            {lang === "ar" ? "كود العملة" : "Currency code"}
            <input
              dir="ltr"
              value={String(formValues.currency_code ?? "EGP")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  currency_code: event.target.value.toUpperCase(),
                }))
              }
              placeholder="EGP"
              required
            />
          </label>
          <label>
            {lang === "ar" ? "اسم العملة بالعربي" : "Arabic currency name"}
            <input
              dir="auto"
              value={String(formValues.currency_name_ar ?? "جنيه مصري")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  currency_name_ar: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            {lang === "ar" ? "اسم العملة بالإنجليزي" : "English currency name"}
            <input
              dir="auto"
              value={String(formValues.currency_name_en ?? "Egyptian pound")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  currency_name_en: event.target.value,
                }))
              }
              required
            />
          </label>
        </>
      ) : null}

      {placeKind === "country" ? null : placeKind === "governorate" ? (
        <label>
          {lang === "ar"
            ? "\u0627\u0633\u0645 \u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629"
            : "Governorate name"}
          <input
            dir="auto"
            value={String(formValues.governorate_ar ?? "")}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                governorate_ar: event.target.value,
              }))
            }
            required
          />
        </label>
      ) : (
        <>
          <label>
            {lang === "ar"
              ? "\u062a\u0627\u0628\u0639\u0629 \u0644\u0623\u064a \u0645\u062d\u0627\u0641\u0638\u0629\u061f"
              : "Parent governorate"}
            <select
              value={String(formValues.governorate_ar ?? "")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  governorate_ar: event.target.value,
                }))
              }
              required
            >
              <option value="" disabled>
                {lang === "ar"
                  ? "\u0627\u062e\u062a\u0631 \u0645\u062d\u0627\u0641\u0638\u0629"
                  : "Choose a governorate"}
              </option>
              {governorates.map((governorate) => (
                <option value={governorate} key={governorate}>
                  {governorate}
                </option>
              ))}
            </select>
          </label>
          <label>
            {lang === "ar"
              ? "\u0627\u0633\u0645 \u0627\u0644\u0645\u062f\u064a\u0646\u0629"
              : "City name"}
            <input
              dir="auto"
              value={String(formValues.name_ar ?? "")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  name_ar: event.target.value,
                }))
              }
              required
            />
          </label>
        </>
      )}

      {lang === "en" ? (
        <>
          <label>
            Country EN
            <input
              dir="auto"
              value={String(formValues.country_en ?? "")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  country_en: event.target.value,
                }))
              }
            />
          </label>
          {placeKind !== "country" ? (
            <label>
              Governorate EN
              <input
                dir="auto"
                value={String(formValues.governorate_en ?? "")}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    governorate_en: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
          {placeKind === "city" ? (
            <label>
              City EN
              <input
                dir="auto"
                value={String(formValues.name_en ?? "")}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    name_en: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
        </>
      ) : null}

      <label>
        {lang === "ar" ? "الترتيب" : "Order"}
        <input
          dir="ltr"
          type="number"
          min="0"
          value={String(formValues.display_order ?? "0")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              display_order: event.target.value,
            }))
          }
        />
      </label>

      {placeKind !== "country" ? (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(formValues.is_active)}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                is_active: event.target.checked,
              }))
            }
          />
          <span>
            {lang === "ar" ? "\u0645\u0641\u0639\u0644\u0629" : "Active"}
          </span>
        </label>
      ) : null}
    </>
  );
}

function CityEditor({
  lang,
  rows,
  formValues,
  setFormValues,
}: {
  lang: Lang;
  rows: Row[];
  formValues: Record<string, string | boolean>;
  setFormValues: Dispatch<SetStateAction<Record<string, string | boolean>>>;
}) {
  const governorates = Array.from(
    new Set(
      rows.map((row) => String(row.governorate_ar ?? "")).filter(Boolean),
    ),
  ).sort();

  return (
    <>
      <label>
        {lang === "ar" ? "المحافظة" : "Governorate"}
        <input
          list="governorates-list"
          dir="auto"
          value={String(formValues.governorate_ar ?? "")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              governorate_ar: event.target.value,
            }))
          }
        />
        <datalist id="governorates-list">
          {governorates.map((governorate) => (
            <option value={governorate} key={governorate} />
          ))}
        </datalist>
      </label>
      <label>
        {lang === "ar" ? "اسم المدينة" : "City name"}
        <input
          dir="auto"
          value={String(formValues.name_ar ?? "")}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              name_ar: event.target.value,
            }))
          }
        />
      </label>
      {lang === "en" ? (
        <>
          <label>
            Governorate EN
            <input
              dir="auto"
              value={String(formValues.governorate_en ?? "")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  governorate_en: event.target.value,
                }))
              }
            />
          </label>
          <label>
            City EN
            <input
              dir="auto"
              value={String(formValues.name_en ?? "")}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  name_en: event.target.value,
                }))
              }
            />
          </label>
        </>
      ) : null}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(formValues.is_active)}
          onChange={(event) =>
            setFormValues((current) => ({
              ...current,
              is_active: event.target.checked,
            }))
          }
        />
        <span>{lang === "ar" ? "مفعلة" : "Active"}</span>
      </label>
    </>
  );
}

function fieldLabel(field: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    name_ar: {
      ar: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064a",
      en: "Arabic name",
    },
    name_en: {
      ar: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
      en: "English name",
    },
    parent_id: {
      ar: "\u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0631\u0626\u064a\u0633\u064a",
      en: "Parent category",
    },
    display_order: {
      ar: "\u0627\u0644\u062a\u0631\u062a\u064a\u0628",
      en: "Display order",
    },
    is_active: { ar: "\u0645\u0641\u0639\u0644", en: "Active" },
    country_ar: { ar: "البلد", en: "Country" },
    country_en: { ar: "البلد بالإنجليزي", en: "English country" },
    currency_code: { ar: "كود العملة", en: "Currency code" },
    currency_name_ar: { ar: "اسم العملة بالعربي", en: "Arabic currency name" },
    currency_name_en: {
      ar: "اسم العملة بالإنجليزي",
      en: "English currency name",
    },
    governorate_ar: {
      ar: "\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064a",
      en: "Arabic governorate",
    },
    governorate_en: {
      ar: "\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
      en: "English governorate",
    },
    description_ar: {
      ar: "\u0627\u0644\u0648\u0635\u0641 \u0628\u0627\u0644\u0639\u0631\u0628\u064a",
      en: "Arabic description",
    },
    description_en: {
      ar: "\u0627\u0644\u0648\u0635\u0641 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
      en: "English description",
    },
    configuration: {
      ar: "\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0645\u062a\u0642\u062f\u0645\u0629",
      en: "Advanced settings",
    },
    title_ar: {
      ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0627\u0644\u0639\u0631\u0628\u064a",
      en: "Arabic title",
    },
    title_en: {
      ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
      en: "English title",
    },
    content_ar: {
      ar: "\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0628\u0627\u0644\u0639\u0631\u0628\u064a",
      en: "Arabic content",
    },
    content_en: {
      ar: "\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
      en: "English content",
    },
    category: {
      ar: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641",
      en: "Category",
    },
    monthly_price: {
      ar: "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0634\u0647\u0631\u064a",
      en: "Monthly price",
    },
    features: {
      ar: "\u0627\u0644\u0645\u0645\u064a\u0632\u0627\u062a",
      en: "Features",
    },
    billing_period_months: {
      ar: "\u0645\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629 \u0628\u0627\u0644\u0634\u0647\u0648\u0631",
      en: "Billing period months",
    },
    grace_months: {
      ar: "\u0645\u0647\u0644\u0629 \u0627\u0644\u0633\u0645\u0627\u062d \u0628\u0627\u0644\u0634\u0647\u0648\u0631",
      en: "Grace months",
    },
    sort_order: {
      ar: "\u0627\u0644\u062a\u0631\u062a\u064a\u0628",
      en: "Sort order",
    },
    provider: {
      ar: "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639",
      en: "Payment provider",
    },
    is_enabled: { ar: "\u0645\u0641\u0639\u0644", en: "Enabled" },
    webhook_secret_name: {
      ar: "\u0627\u0633\u0645 \u0633\u0631 \u0627\u0644\u0648\u064a\u0628 \u0647\u0648\u0643",
      en: "Webhook secret name",
    },
    webhook_signature_header: {
      ar: "\u0647\u064a\u062f\u0631 \u062a\u0648\u0642\u064a\u0639 \u0627\u0644\u062f\u0641\u0639",
      en: "Signature header",
    },
    is_direct_to_merchant_supported: {
      ar: "\u064a\u062f\u0639\u0645 \u0627\u0644\u062f\u0641\u0639 \u0644\u0644\u0645\u062a\u062c\u0631 \u0645\u0628\u0627\u0634\u0631\u0629",
      en: "Direct to merchant",
    },
    image_url: {
      ar: "\u0631\u0627\u0628\u0637 \u0635\u0648\u0631\u0629 \u0627\u0644\u0625\u0639\u0644\u0627\u0646",
      en: "Image URL",
    },
    target_url: {
      ar: "\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0639\u0644\u0646",
      en: "Advertiser link",
    },
    placement: {
      ar: "\u0645\u0643\u0627\u0646 \u0627\u0644\u0638\u0647\u0648\u0631",
      en: "Placement",
    },
    target_country_ar: { ar: "يظهر في بلد", en: "Target country" },
    target_governorate_ar: { ar: "يظهر في محافظة", en: "Target governorate" },
    target_city_ar: { ar: "يظهر في مدينة", en: "Target city" },
    starts_at: { ar: "\u064a\u0628\u062f\u0623 \u0645\u0646", en: "Starts at" },
    ends_at: {
      ar: "\u064a\u0646\u062a\u0647\u064a \u0641\u064a",
      en: "Ends at",
    },
    department: { ar: "\u0627\u0644\u0642\u0633\u0645", en: "Department" },
    permissions: {
      ar: "\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u0645\u0648\u0638\u0641",
      en: "Permissions",
    },
    term: { ar: "الكلمة أو العبارة", en: "Term or phrase" },
    language: { ar: "اللغة", en: "Language" },
    match_type: { ar: "طريقة الفحص", en: "Match type" },
    severity: { ar: "الإجراء", en: "Action" },
    needs_embedding: {
      ar: "\u064a\u062d\u062a\u0627\u062c \u062a\u062c\u0647\u064a\u0632 \u0644\u0644\u0628\u0648\u062a",
      en: "Needs bot indexing",
    },
    delivery_status: {
      ar: "\u062d\u0627\u0644\u0629 \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
      en: "Delivery status",
    },
    delivered_at: {
      ar: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
      en: "Delivered at",
    },
    notes: { ar: "\u0645\u0644\u0627\u062d\u0638\u0627\u062a", en: "Notes" },
    role: { ar: "\u0627\u0644\u062f\u0648\u0631", en: "Role" },
    is_blocked: { ar: "\u0645\u062d\u0638\u0648\u0631", en: "Blocked" },
    approval_status: {
      ar: "\u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629",
      en: "Approval status",
    },
    rejection_reason: {
      ar: "\u0633\u0628\u0628 \u0627\u0644\u0631\u0641\u0636",
      en: "Rejection reason",
    },
    billing_preference: {
      ar: "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629",
      en: "Billing preference",
    },
  };
  return labels[field]?.[lang] ?? field;
}

function actionLabel(action: string, lang: Lang) {
  if (action === "set_user_password") {
    return lang === "ar"
      ? "\u062a\u0639\u064a\u064a\u0646 \u0628\u0627\u0633\u0648\u0631\u062f"
      : "Set password";
  }
  if (action === "delete_row") {
    return lang === "ar" ? "\u062d\u0630\u0641" : "Delete";
  }
  if (action === "delete_user_account") {
    return lang === "ar" ? "حذف الحساب" : "Delete account";
  }
  const labels: Record<string, { ar: string; en: string }> = {
    review_details: { ar: "مراجعة التفاصيل", en: "Review details" },
    approve_merchant: { ar: "قبول", en: "Approve" },
    reject_merchant: { ar: "رفض", en: "Reject" },
    approve_branch: { ar: "قبول", en: "Approve" },
    reject_branch: { ar: "رفض", en: "Reject" },
    block_user: { ar: "حظر", en: "Block" },
    unblock_user: { ar: "فك الحظر", en: "Unblock" },
    toggle_active: { ar: "تغيير الحالة", en: "Toggle" },
    edit_row: { ar: "تعديل", en: "Edit" },
  };
  return labels[action]?.[lang] ?? action;
}

function ReviewDetailsModal({
  lang,
  section,
  row,
  onClose,
}: {
  lang: Lang;
  section: SectionConfig;
  row: Row;
  onClose: () => void;
}) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(true);

  useEffect(() => {
    async function loadImages() {
      const urls: Record<string, string> = {};
      const fields = [
        "owner_id_image_url",
        "store_front_image_url",
        "commercial_register_url",
        "front_image_url",
      ];
      
      for (const field of fields) {
        const val = row[field];
        if (typeof val === "string" && val.trim()) {
          const trimmed = val.trim();
          if (/^https?:\/\//i.test(trimmed)) {
            urls[field] = trimmed;
            continue;
          }
          const bucket = field === "store_front_image_url" || field === "front_image_url" ? "storefront-photos" : "merchant-documents";
          let path = trimmed.startsWith("storage://")
            ? trimmed.replace("storage://", "").split("/").slice(1).join("/")
            : trimmed.replace(/^\/+/, "");
          if (path.startsWith(`${bucket}/`)) {
            path = path.slice(bucket.length + 1);
          }
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
          if (data?.signedUrl) {
            urls[field] = data.signedUrl;
          } else {
            urls[field] = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl ?? "";
          }
        }
      }
      setImageUrls(urls);
      setLoadingImages(false);
    }
    void loadImages();
  }, [row]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
        <h2>{lang === "ar" ? "تفاصيل إضافية" : "Additional details"}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
          {Object.entries(row).map(([key, value]) => {
            if (!value || typeof value === "object" || key.endsWith("_url") || key === "id") return null;
            return (
              <div key={key}>
                <strong style={{ display: "block", fontSize: "0.85rem", opacity: 0.7, marginBottom: "4px" }}>
                  {fieldLabel(key, lang)}
                </strong>
                <div>{String(value)}</div>
              </div>
            );
          })}
        </div>
        
        {loadingImages ? (
          <div style={{ marginTop: "24px" }}>{t("loading", lang)}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "24px" }}>
            {["store_front_image_url", "front_image_url", "owner_id_image_url", "commercial_register_url"].map((field) => {
              const url = imageUrls[field];
              if (!url) return null;
              return (
                <div key={field} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <strong style={{ fontSize: "0.85rem", opacity: 0.7 }}>{fieldLabel(field, lang)}</strong>
                  <a href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={field} style={{ width: "100%", height: "200px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
                  </a>
                </div>
              );
            })}
          </div>
        )}
        <div className="modal-actions" style={{ marginTop: "32px" }}>
          <button className="ghost-button" onClick={onClose}>{t("cancel", lang)}</button>
        </div>
      </div>
    </div>
  );
}
