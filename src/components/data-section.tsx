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
  ImageUp,
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
  localizedValue,
  rowMatches,
} from "@/lib/admin/format";
import { humanizeAdminError } from "@/lib/admin/messages";

type Row = Record<string, unknown>;
const DEFAULT_COUNTRY_AR = "مصر";
const DEFAULT_COUNTRY_EN = "Egypt";
const COUNTRY_MARKER = "__country__";
const AD_PLACEMENTS = [
  {
    value: "buyer_home_top",
    ar: "إعلانات واجهة العميل",
    en: "Buyer home ads",
    descriptionAr: "الإعلانات العادية التي تظهر في واجهة العميل ويمكن ربطها بموقع أو صفحة خارجية.",
    descriptionEn: "Regular ads shown on the buyer home screen and can open an external link.",
  },
  {
    value: "buyer_referrals_top",
    ar: "دعوة صديق - العملاء",
    en: "Buyer invite ads",
    descriptionAr: "إعلان منفصل يظهر في صفحة دعوة الأصدقاء عند العملاء ولا يفتح أي رابط عند الضغط.",
    descriptionEn: "Separate ad shown on the buyer invite screen and does not open a link.",
  },
  {
    value: "merchant_referrals_top",
    ar: "دعوة صديق - المتاجر",
    en: "Store invite ads",
    descriptionAr: "إعلان منفصل مخصص لدعوات المتاجر، جاهز للإدارة عند إضافة مكانه في التطبيق.",
    descriptionEn: "Separate ad for store invites, ready for the app screen when it is added.",
  },
  {
    value: "merchant_settings_top",
    ar: "أعلى إعدادات المتجر",
    en: "Store settings top ad",
    descriptionAr: "الكارت الذي يظهر أول صفحة إعدادات المتجر للتعريف بإمكانية الإعلان في واجهة العملاء، ولا يفتح أي رابط.",
    descriptionEn: "The ad shown at the top of store settings to promote buyer-facing ads, without opening a link.",
  },
];

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
  const [uploadingAdImage, setUploadingAdImage] = useState(false);
  const [adTabs, setAdTabs] = useState<Record<string, string>>({});
  const [adClock, setAdClock] = useState(() => Date.now());

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

  const adGroups = useMemo(() => {
    const knownPlacements = new Set(AD_PLACEMENTS.map((item) => item.value));
    const grouped = AD_PLACEMENTS.map((placement) => ({
      ...placement,
      rows: filteredRows.filter(
        (row) => String(row.placement ?? "buyer_home_top") === placement.value,
      ),
    }));
    const otherRows = filteredRows.filter(
      (row) => !knownPlacements.has(String(row.placement ?? "")),
    );
    if (otherRows.length > 0) {
      grouped.push({
        value: "__other__",
        ar: "إعلانات غير مصنفة",
        en: "Other ads",
        descriptionAr: "إعلانات قديمة أو بمكان ظهور غير معروف. راجع مكان الظهور قبل استخدامها.",
        descriptionEn: "Old ads or ads with unknown placement. Review placement before using them.",
        rows: otherRows,
      });
    }
    return grouped;
  }, [filteredRows]);

  async function loadRows() {
    if (!section.source) return;
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setRows([]);
      setError(humanizeAdminError("auth_required", lang));
      setLoading(false);
      return;
    }

    const response = await fetch(`/api/admin/action?section=${encodeURIComponent(section.id)}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: Row[];
      error?: string;
    };

    setRows((payload.data ?? []) as Row[]);
    setError(response.ok ? null : humanizeAdminError(payload.error ?? "load_failed", lang));
    setLoading(false);
  }

  async function loadLocationOptions() {
    const { data } = await supabase
      .from("cities")
      .select("country_ar,country_en,governorate_ar,governorate_en,name_ar,name_en")
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

  useEffect(() => {
    if (section.id !== "ads") return;
    const timer = window.setInterval(() => setAdClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [section.id]);

  function startEdit(
    row: Row | "new",
    defaults: Record<string, string | boolean> = {},
  ) {
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
      nextValues.country_en =
        row === "new" && nextValues.place_kind === "country"
          ? ""
          : nextValues.country_en || DEFAULT_COUNTRY_EN;
      nextValues.display_order = nextValues.display_order || "0";
    }
    if (section.id === "ads") {
      nextValues.placement = nextValues.placement || "buyer_home_top";
      nextValues.admin_name = nextValues.admin_name || "";
      nextValues.sort_order = nextValues.sort_order || "0";
      nextValues.target_country_ar = nextValues.target_country_ar || "";
      nextValues.target_governorate_ar = nextValues.target_governorate_ar || "";
      nextValues.target_city_ar = nextValues.target_city_ar || "";
      nextValues.ad_ongoing =
        row === "new"
          ? true
          : typeof row.is_ongoing === "boolean"
            ? row.is_ongoing
            : !Boolean(row.starts_at || row.ends_at);
      nextValues.ad_saved_starts_at =
        row === "new"
          ? ""
          : toDateTimeLocal(row.saved_starts_at ?? row.starts_at);
      nextValues.ad_saved_ends_at =
        row === "new"
          ? ""
          : toDateTimeLocal(row.saved_ends_at ?? row.ends_at);
      if (nextValues.ad_ongoing) {
        nextValues.starts_at = "";
        nextValues.ends_at = "";
      }
    }
    if (section.id === "content-moderation") {
      nextValues.language = nextValues.language || "mixed";
      nextValues.match_type = nextValues.match_type || "contains";
      nextValues.category = nextValues.category || "general";
      nextValues.severity = nextValues.severity || "block";
    }
    if (row === "new") {
      Object.assign(nextValues, defaults);
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
      warnings?: string[];
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "action_failed");
    }
    if (payload.warnings?.includes("email_send_failed")) {
      setError(
        lang === "ar"
          ? "تم حفظ القرار وإرسال إشعار التطبيق، لكن تعذر إرسال البريد لأن مزود البريد غير مُعد أو رفض الرسالة."
          : "The decision and app notification were saved, but email delivery failed because the email provider is not configured or rejected the message.",
      );
    }
    return payload;
  }

  async function uploadAdBannerImage(file: File | null) {
    if (!file) return;
    setUploadingAdImage(true);
    setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `ads/${Date.now()}-${safeName || "banner.jpg"}`;
      const { error: uploadError } = await supabase.storage
        .from("banners")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("banners").getPublicUrl(path);
      setFormValues((current) => ({
        ...current,
        image_url: data.publicUrl,
      }));
    } catch (uploadError) {
      setError(humanizeAdminError(uploadError, lang));
    } finally {
      setUploadingAdImage(false);
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
          row.admin_name ??
            row.name_ar ??
            row.title_ar ??
            row.store_name ??
            row.id ??
            "",
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

      if (section.id === "ads") {
        const ongoing = Boolean(formValues.ad_ongoing);
        const active = Boolean(formValues.is_active);
        values.is_ongoing = ongoing;
        if (ongoing) {
          values.starts_at = null;
          values.ends_at = null;
        } else {
          const startsAt = String(formValues.starts_at ?? "").trim();
          const endsAt = String(formValues.ends_at ?? "").trim();
          if (!startsAt && !endsAt && !active) {
            values.starts_at = null;
            values.ends_at = null;
          } else {
            if (!startsAt || !endsAt) {
              throw new Error("ad_schedule_required");
            }
            const startsDate = new Date(startsAt);
            const endsDate = new Date(endsAt);
            if (
              Number.isNaN(startsDate.getTime()) ||
              Number.isNaN(endsDate.getTime()) ||
              endsDate.getTime() <= startsDate.getTime()
            ) {
              throw new Error("ad_end_must_be_after_start");
            }
            values.starts_at = startsDate.toISOString();
            values.ends_at = endsDate.toISOString();
          }
        }
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
          payload: section.id === "cities" ? { place_kind: String(formValues.place_kind ?? "city") } : undefined,
        });
      } else if (editing && typeof editing === "object") {
        await postAdminAction({
          action: "update_row",
          table: section.editableTable,
          id: rowIdFor(section, editing),
          values,
          payload: section.id === "cities" ? { place_kind: String(formValues.place_kind ?? "city") } : undefined,
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
                : section.id === "ads"
                  ? lang === "ar"
                    ? "إضافة إعلان"
                    : "Add ad"
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

      {!loading && section.id !== "ads" && filteredRows.length === 0 ? (
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
                  {section.actions?.filter((action) => actionShouldShow(action, row)).map((action) => (
                    <button
                      key={action}
                      className="tiny-button"
                      onClick={() => void runRowAction(action, row)}
                    >
                      {actionLabel(action, lang, row)}
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
                        {actionLabel(action, lang, group.governorateRow!)}
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
          {groupLocationRows(filteredRows, lang).map((country) => {
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
                          {actionLabel(action, lang, country.countryRow!)}
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
                                    {actionLabel(action, lang, group.governorateRow!)}
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
                                  {actionLabel(action, lang, row)}
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

      {!loading && section.id === "ads" ? (
        <div className="ads-placement-grid" data-ad-clock={adClock}>
          {adGroups.map((group) => (
            <article className="ads-placement-card" key={group.value}>
              <div className="ads-placement-head">
                <div>
                  <strong>{lang === "ar" ? group.ar : group.en}</strong>
                  <span>
                    {lang === "ar" ? group.descriptionAr : group.descriptionEn}
                  </span>
                </div>
                <span className="status-pill active">
                  {lang === "ar" ? `${group.rows.length} إعلان` : `${group.rows.length} ads`}
                </span>
              </div>

              <div className="ads-status-tabs">
                {[
                  { key: "running", ar: "شغالة", en: "Running" },
                  { key: "scheduled", ar: "مجدولة", en: "Scheduled" },
                  { key: "ended", ar: "منتهية", en: "Ended" },
                  { key: "inactive", ar: "متوقفة", en: "Inactive" },
                  { key: "all", ar: "الكل", en: "All" },
                ].map((tab) => (
                  <button type="button" key={tab.key} className={(adTabs[group.value] ?? "running") === tab.key ? "active" : ""} onClick={() => setAdTabs((current) => ({ ...current, [group.value]: tab.key }))}>
                    {tab[lang]}
                    <small>{group.rows.filter((row) => tab.key === "all" || adLifecycleKey(row) === tab.key).length}</small>
                  </button>
                ))}
              </div>

              {group.value !== "__other__" ? (
                <button
                  className="soft-button ads-placement-add"
                  onClick={() =>
                    startEdit("new", {
                      placement: group.value,
                    })
                  }
                >
                  <Plus size={16} />
                  {lang === "ar" ? "إضافة إعلان هنا" : "Add ad here"}
                </button>
              ) : null}

              <div className="ads-placement-list">
                {group.rows.filter((row) => (adTabs[group.value] ?? "running") === "all" || adLifecycleKey(row) === (adTabs[group.value] ?? "running")).length === 0 ? (
                  <div className="empty-state compact">
                    {lang === "ar"
                      ? "لا توجد إعلانات في هذا المكان حاليًا"
                      : "No ads in this placement yet"}
                  </div>
                ) : (
                  group.rows.filter((row) => (adTabs[group.value] ?? "running") === "all" || adLifecycleKey(row) === (adTabs[group.value] ?? "running")).map((row) => (
                    <div
                      className="ad-admin-item"
                      key={rowIdFor(section, row) || JSON.stringify(row)}
                    >
                      {String(row.image_url ?? "").trim() ? (
                        <img
                          className="ad-admin-thumb"
                          src={String(row.image_url ?? "").trim()}
                          alt={adAdminName(row, lang)}
                        />
                      ) : (
                        <div className="ad-admin-thumb empty">
                          <ImageUp size={18} />
                        </div>
                      )}
                      <div className="ad-admin-info">
                        <strong>{adAdminName(row, lang)}</strong>
                        <span>{adTargetSummary(row, lang, locationRows)}</span>
                        <span>{adScheduleSummary(row, lang)}</span>
                        <span>
                          {lang === "ar" ? "الترتيب" : "Order"}:{" "}
                          {String(row.sort_order ?? 0)}
                        </span>
                      </div>
                      <div className="ad-admin-actions">
                        <span className={`status-pill ${adStatus(row).tone}`}>
                          {adStatus(row)[lang]}
                        </span>
                        <div className="row-actions">
                          {section.actions?.map((action) => (
                            <button
                              key={action}
                              className="tiny-button"
                              onClick={() => void runRowAction(action, row)}
                            >
                              {actionLabel(action, lang, row)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading &&
      !["categories", "cities", "ads"].includes(section.id) &&
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
                      {formatSectionCell(
                        section,
                        column.key,
                        localizedValue(row, column.key, lang),
                        column.tone,
                        lang,
                      )}
                    </td>
                  ))}
                  {section.actions?.length ? (
                    <td>
                      <div className="row-actions">
                        {section.actions.filter((action) => actionShouldShow(action, row)).map((action) => (
                          <button
                            key={action}
                            className="tiny-button"
                            onClick={() => void runRowAction(action, row)}
                          >
                            {actionLabel(action, lang, row)}
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
                <>
                  {section.id === "ads" ? (
                    <label className="ongoing-ad-option">
                      <span>
                        <strong>{lang === "ar" ? "إعلان مستمر" : "Ongoing ad"}</strong>
                        <small>
                          {lang === "ar"
                            ? "عند إزالة العلامة يتوقف الإعلان فورًا وينتقل إلى متوقفة. لجدولته اختر تاريخ بداية مستقبليًا وتاريخ نهاية ثم فعّله."
                            : "Clearing this option stops the ad immediately. To schedule it, choose a future start and end date, then activate it."}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(formValues.ad_ongoing)}
                        onChange={(event) =>
                          setFormValues((current) => {
                            const ongoing = event.target.checked;
                            if (ongoing) {
                              return {
                                ...current,
                                ad_ongoing: true,
                                ad_saved_starts_at:
                                  String(current.starts_at ?? "") ||
                                  String(current.ad_saved_starts_at ?? ""),
                                ad_saved_ends_at:
                                  String(current.ends_at ?? "") ||
                                  String(current.ad_saved_ends_at ?? ""),
                                starts_at: "",
                                ends_at: "",
                              };
                            }
                            return {
                              ...current,
                              ad_ongoing: false,
                              is_active: false,
                              starts_at: String(
                                current.ad_saved_starts_at ?? "",
                              ),
                              ends_at: String(
                                current.ad_saved_ends_at ?? "",
                              ),
                            };
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {(section.editableFields ?? []).map((field) => (
                  <label key={field}>
                    {fieldLabel(field, lang, section)}
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
                    ) : section.id === "ads" && field === "image_url" ? (
                      <>
                        <div className="referral-banner-upload">
                          <input
                            dir="ltr"
                            value={String(formValues[field] ?? "")}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                            placeholder="https://..."
                          />
                          <span className="tiny-button">
                            <ImageUp size={14} />
                            {uploadingAdImage
                              ? lang === "ar"
                                ? "جاري الرفع"
                                : "Uploading"
                              : lang === "ar"
                                ? "رفع صورة"
                                : "Upload"}
                            <input
                              aria-label={fieldLabel(field, lang, section)}
                              disabled={uploadingAdImage}
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void uploadAdBannerImage(
                                  event.target.files?.[0] ?? null,
                                );
                                event.currentTarget.value = "";
                              }}
                            />
                          </span>
                        </div>
                        {String(formValues[field] ?? "").trim() ? (
                          <img
                            className="ad-banner-preview"
                            src={String(formValues[field] ?? "").trim()}
                            alt={fieldLabel(field, lang, section)}
                          />
                        ) : null}
                      </>
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
                        {AD_PLACEMENTS.map((placement) => (
                          <option value={placement.value} key={placement.value}>
                            {lang === "ar" ? placement.ar : placement.en}
                          </option>
                        ))}
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
                            {localizedLocationOption(locationRows, "country_ar", "country_en", country, lang)}
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
                            {localizedLocationOption(locationRows, "governorate_ar", "governorate_en", governorate, lang)}
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
                            {localizedLocationOption(locationRows, "name_ar", "name_en", city, lang)}
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
                        disabled={section.id === "ads" && Boolean(formValues.ad_ongoing) && ["starts_at", "ends_at"].includes(field)}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
                </>
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

function adPlacementLabel(value: string, lang: Lang) {
  const placement = AD_PLACEMENTS.find((item) => item.value === value);
  return placement ? (lang === "ar" ? placement.ar : placement.en) : value;
}

function adAdminName(row: Row, lang: Lang) {
  const name = String(row.admin_name ?? "").trim();
  if (name) return name;
  const placement = adPlacementLabel(
    String(row.placement ?? "buyer_home_top"),
    lang,
  );
  return lang === "ar" ? `${placement} بدون اسم` : `Unnamed ${placement}`;
}


function localizedLocationOption(
  locations: Row[],
  arabicKey: string,
  englishKey: string,
  value: string,
  lang: Lang,
) {
  if (!value || lang === "ar") return value;
  const match = locations.find((row) => String(row[arabicKey] ?? "").trim() === value);
  return String(match?.[englishKey] ?? value).trim() || value;
}

function adTargetSummary(row: Row, lang: Lang, locations: Row[]) {
  const cityAr = String(row.target_city_ar ?? "").trim();
  const governorateAr = String(row.target_governorate_ar ?? "").trim();
  const countryAr = String(row.target_country_ar ?? "").trim();
  const city = localizedLocationOption(locations, "name_ar", "name_en", cityAr, lang);
  const governorate = localizedLocationOption(locations, "governorate_ar", "governorate_en", governorateAr, lang);
  const country = localizedLocationOption(locations, "country_ar", "country_en", countryAr, lang);
  const parts = [city, governorate, country].filter(Boolean);
  if (parts.length === 0) {
    return lang === "ar" ? "يظهر في كل الأماكن" : "Shown everywhere";
  }
  return lang === "ar"
    ? `يظهر في ${parts.join(" - ")}`
    : `Shown in ${parts.join(" - ")}`;
}

function adScheduleSummary(row: Row, lang: Lang) {
  if (row.is_ongoing === true) {
    return lang === "ar" ? "مستمر بدون نهاية" : "Ongoing without an end date";
  }
  const startsAt = row.starts_at ? formatCell(row.starts_at, "date", lang) : "";
  const endsAt = row.ends_at ? formatCell(row.ends_at, "date", lang) : "";
  if (startsAt && endsAt) {
    return lang === "ar"
      ? `من ${startsAt} إلى ${endsAt}`
      : `From ${startsAt} to ${endsAt}`;
  }
  if (startsAt) {
    return lang === "ar" ? `يبدأ من ${startsAt}` : `Starts ${startsAt}`;
  }
  if (endsAt) {
    return lang === "ar" ? `ينتهي في ${endsAt}` : `Ends ${endsAt}`;
  }
  return lang === "ar" ? "بدون موعد محدد" : "No schedule set";
}

function adLifecycleKey(row: Row) {
  const now = Date.now();
  if (row.is_active === true && row.is_ongoing === true) return "running";
  const startsAt = row.starts_at ? new Date(String(row.starts_at)).getTime() : null;
  const endsAt = row.ends_at ? new Date(String(row.ends_at)).getTime() : null;
  if (row.is_active !== true) return "inactive";
  if (endsAt && Number.isFinite(endsAt) && endsAt <= now) return "ended";
  if (startsAt && Number.isFinite(startsAt) && startsAt > now) return "scheduled";
  return "running";
}

function adStatus(row: Row) {
  const key = adLifecycleKey(row);
  if (key === "ended") return { ar: "منتهي", en: "Ended", tone: "expired" };
  if (key === "scheduled") return { ar: "مجدول", en: "Scheduled", tone: "pending" };
  if (key === "running") return { ar: row.is_ongoing === true ? "مستمر بدون نهاية" : "شغال", en: row.is_ongoing === true ? "Ongoing" : "Running", tone: "active" };
  return { ar: "متوقف", en: "Inactive", tone: "muted" };
}

function formatSectionCell(
  section: SectionConfig,
  key: string,
  value: unknown,
  tone: Parameters<typeof formatCell>[1],
  lang: Lang,
) {
  if (section.id === "ads" && key === "placement") {
    return adPlacementLabel(String(value ?? ""), lang);
  }
  if (key === "is_active" || key === "is_enabled") {
    return value === true
      ? lang === "ar" ? "مفعّل" : "Active"
      : lang === "ar" ? "متوقف" : "Inactive";
  }
  if (key === "is_blocked") {
    return value === true
      ? lang === "ar" ? "محظور" : "Blocked"
      : lang === "ar" ? "غير محظور" : "Not blocked";
  }
  if (key === "needs_embedding") {
    return value === true
      ? lang === "ar" ? "يحتاج تحديث" : "Update needed"
      : lang === "ar" ? "محدّث" : "Up to date";
  }
  if (key === "error_code" && value) {
    return lang === "ar"
      ? "حدثت مشكلة أثناء المعالجة"
      : "A processing issue occurred";
  }
  return formatCell(value, tone, lang);
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

function groupLocationRows(rows: Row[], lang: Lang) {
  const countries = new Map<
    string,
    {
      countryRow: Row | null;
      governorates: Map<string, { governorateRow: Row | null; cities: Row[] }>;
    }
  >();
  for (const row of rows) {
    const country =
      String(
        (lang === "en" ? row.country_en : row.country_ar) ??
          row.country_ar ??
          row.country_en ??
          (lang === "en" ? DEFAULT_COUNTRY_EN : DEFAULT_COUNTRY_AR),
      ).trim() || (lang === "en" ? DEFAULT_COUNTRY_EN : DEFAULT_COUNTRY_AR);
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
    const governorate = String(
      (lang === "en" ? row.governorate_en : row.governorate_ar) ??
        row.governorate_ar ??
        row.governorate_en ??
        "-",
    );
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
              String((lang === "en" ? a.name_en : a.name_ar) ?? a.name_ar ?? "").localeCompare(
                String((lang === "en" ? b.name_en : b.name_ar) ?? b.name_ar ?? ""),
              ),
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
          English category name
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
          English category name
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
  const countryEnglishByArabic = new Map(
    rows
      .filter((row) => String(row.country_ar ?? "").trim())
      .map((row) => [
        String(row.country_ar ?? "").trim(),
        String(row.country_en ?? row.country_ar ?? "").trim(),
      ]),
  );
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
                country_en:
                  !current.country_en || current.country_en === DEFAULT_COUNTRY_EN
                    ? country
                    : String(current.country_en),
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
                country_en:
                  countryEnglishByArabic.get(country) || country,
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
            {lang === "ar" ? "اختصار العملة" : "Currency abbreviation"}
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
              onChange={(event) => {
                const governorate = event.target.value;
                const matchingRow = rows.find(
                  (row) =>
                    String(row.country_ar ?? "").trim() === selectedCountry &&
                    String(row.governorate_ar ?? "").trim() === governorate,
                );
                setFormValues((current) => ({
                  ...current,
                  governorate_ar: governorate,
                  governorate_en: String(matchingRow?.governorate_en ?? governorate),
                }));
              }}
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
            English country name
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
              English governorate name
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
              English city name
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
            English governorate name
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
            English city name
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

function fieldLabel(field: string, lang: Lang, section?: SectionConfig) {
  const sectionLabel = section?.columns?.find((column) => column.key === field)?.label;
  if (sectionLabel) return sectionLabel[lang];

  const labels: Record<string, { ar: string; en: string }> = {
    store_name: { ar: "اسم المتجر", en: "Store name" },
    branch_name: { ar: "اسم الفرع", en: "Branch name" },
    owner_name: { ar: "اسم المالك", en: "Owner name" },
    owner_mobile: { ar: "رقم هاتف المالك", en: "Owner mobile" },
    account_email: { ar: "بريد الحساب", en: "Account email" },
    contact_mobile: { ar: "رقم التواصل", en: "Contact mobile" },
    category_name_ar: { ar: "القسم", en: "Category" },
    category_name_en: { ar: "القسم بالإنجليزي", en: "English category" },
    approval_status_ar: { ar: "حالة الموافقة", en: "Approval status" },
    billing_preference_ar: { ar: "طريقة المحاسبة", en: "Billing preference" },
    status_ar: { ar: "الحالة", en: "Status" },
    city_name: { ar: "المدينة", en: "City" },
    governorate_name: { ar: "المحافظة", en: "Governorate" },
    manager_mobile: { ar: "رقم الفرع", en: "Branch contact" },
    address: { ar: "العنوان", en: "Address" },
    branch_address: { ar: "عنوان الفرع", en: "Branch address" },
    street_address: { ar: "عنوان الشارع", en: "Street address" },
    area_name: { ar: "المنطقة", en: "Area" },
    latitude: { ar: "خط العرض", en: "Latitude" },
    longitude: { ar: "خط الطول", en: "Longitude" },
    is_delivery_available: { ar: "التوصيل متاح", en: "Delivery available" },
    delivery_available: { ar: "التوصيل متاح", en: "Delivery available" },
    supports_delivery: { ar: "يدعم التوصيل", en: "Supports delivery" },
    delivery_fee: { ar: "رسوم التوصيل", en: "Delivery fee" },
    delivery_radius_km: { ar: "نطاق التوصيل بالكيلومتر", en: "Delivery radius" },
    delivery_notes: { ar: "ملاحظات التوصيل", en: "Delivery notes" },
    working_hours: { ar: "مواعيد العمل", en: "Working hours" },
    opening_hours: { ar: "مواعيد العمل", en: "Opening hours" },
    commercial_register_number: { ar: "رقم السجل التجاري", en: "Commercial register number" },
    tax_number: { ar: "الرقم الضريبي", en: "Tax number" },
    full_name: { ar: "اسم المستخدم", en: "User name" },
    mobile: { ar: "رقم الهاتف", en: "Mobile" },
    primary_email: { ar: "البريد الإلكتروني", en: "Email" },
    role_ar: { ar: "الصلاحية", en: "Role" },
    account_status_ar: { ar: "حالة الحساب", en: "Account status" },
    company_name: { ar: "اسم الشركة", en: "Company name" },
    batches_count: { ar: "عدد الدفعات", en: "Batches count" },
    buyer_name: { ar: "اسم العميل", en: "Buyer name" },
    buyer_mobile: { ar: "رقم العميل", en: "Buyer mobile" },
    payment_status: { ar: "حالة الدفع", en: "Payment status" },
    selected_subtotal_snapshot: { ar: "المجموع الفرعي", en: "Subtotal" },
    user_name: { ar: "اسم المستخدم", en: "User name" },
    amount: { ar: "المبلغ", en: "Amount" },
    reporter_name: { ar: "مقدم الشكوى", en: "Reporter" },
    reporter_mobile: { ar: "هاتف مقدم الشكوى", en: "Reporter mobile" },
    target_type: { ar: "نوع الشكوى", en: "Complaint type" },
    priority: { ar: "الأولوية", en: "Priority" },
    body: { ar: "التفاصيل", en: "Details" },
    error_code: { ar: "تفاصيل المشكلة", en: "Issue details" },
    reading_type_ar: { ar: "نوع القراءة", en: "Reading type" },
    source_ar: { ar: "المصدر", en: "Source" },
    confidence: { ar: "نسبة التأكد", en: "Confidence" },
    store_front_image_url: { ar: "صورة واجهة المتجر", en: "Storefront photo" },
    front_image_url: { ar: "صورة الواجهة", en: "Front photo" },
    owner_id_image_url: { ar: "صورة هوية المالك", en: "Owner ID photo" },
    commercial_register_url: { ar: "السجل التجاري", en: "Commercial register" },
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
    currency_code: { ar: "اختصار العملة", en: "Currency abbreviation" },
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
      ar: "اسم بيانات تأكيد الدفع",
      en: "Payment confirmation key",
    },
    webhook_signature_header: {
      ar: "اسم حقل تأكيد الدفع",
      en: "Confirmation field name",
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
      ar: "يحتاج تحديث المساعد",
      en: "Assistant update needed",
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
    created_at: { ar: "تاريخ الإنشاء", en: "Created at" },
    updated_at: { ar: "آخر تحديث", en: "Updated at" },
  };
  return labels[field]?.[lang] ?? (lang === "ar" ? "معلومة إضافية" : field.split("_").join(" "));
}

function actionShouldShow(action: string, row: Row) {
  if (row.is_deleted === true) {
    return false;
  }
  if (action === "block_user") return row.is_blocked !== true;
  if (action === "unblock_user") return row.is_blocked === true;
  return true;
}

function actionLabel(action: string, lang: Lang, row?: Row) {
  if (action === "set_user_password") {
    return lang === "ar"
      ? "تعيين كلمة مرور"
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
    toggle_active: row?.is_active === true
      ? { ar: "إيقاف", en: "Disable" }
      : { ar: "تشغيل", en: "Enable" },
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

  const documentSpecs = useMemo(() => {
    if (section.id === "merchant-approvals") {
      return [
        { key: "store_front_image_url", bucketKey: "store_front_bucket", fallbackBucket: "storefront-photos", ar: "واجهة المتجر", en: "Storefront" },
        { key: "owner_id_front_image_url", bucketKey: "owner_id_front_bucket", fallbackBucket: "merchant-ids", ar: "هوية المالك - الوجه الأمامي", en: "Owner ID - front" },
        { key: "owner_id_back_image_url", bucketKey: "owner_id_back_bucket", fallbackBucket: "merchant-ids", ar: "هوية المالك - الوجه الخلفي", en: "Owner ID - back" },
        { key: "commercial_register_url", bucketKey: "commercial_register_bucket", fallbackBucket: "commercial-registers", ar: "السجل التجاري", en: "Commercial register", optional: true },
      ];
    }
    return [
      { key: "front_image_url", fallbackBucket: "storefront-photos", ar: "واجهة الفرع", en: "Branch storefront" },
      { key: "manager_id_front_image_url", bucketKey: "manager_id_front_bucket", fallbackBucket: "merchant-ids", ar: "هوية مدير الفرع - الوجه الأمامي", en: "Branch manager ID - front" },
      { key: "manager_id_back_image_url", bucketKey: "manager_id_back_bucket", fallbackBucket: "merchant-ids", ar: "هوية مدير الفرع - الوجه الخلفي", en: "Branch manager ID - back" },
      {
        key: "commercial_register_url",
        bucketKey: "commercial_register_bucket",
        fallbackBucket: "commercial-registers",
        ar: row.uses_parent_commercial_register === false ? "السجل التجاري المستقل للفرع" : "السجل التجاري للمتجر الرئيسي",
        en: row.uses_parent_commercial_register === false ? "Branch commercial register" : "Main store commercial register",
        optional: true,
      },
    ];
  }, [row, section.id]);

  useEffect(() => {
    async function resolveUrl(path: unknown, bucket: unknown, fallbackBucket: string) {
      if (typeof path !== "string" || !path.trim()) return "";
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return "";
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "signed_admin_file",
          payload: {
            bucket: String(bucket ?? ""),
            path,
            fallback_bucket: fallbackBucket,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { url?: string };
      };
      return response.ok ? String(payload.data?.url ?? "") : "";
    }

    async function loadImages() {
      setLoadingImages(true);
      const entries = await Promise.all(
        documentSpecs.map(async (spec) => {
          const bucket = spec.bucketKey ? row[spec.bucketKey] : null;
          const url = await resolveUrl(row[spec.key], bucket, spec.fallbackBucket);
          return [spec.key, url] as const;
        }),
      );
      setImageUrls(Object.fromEntries(entries));
      setLoadingImages(false);
    }
    void loadImages();
  }, [documentSpecs, row]);

  const detailItems = reviewDetailItems(section.id, row, lang);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card review-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{lang === "ar" ? "مراجعة بيانات ومستندات الطلب" : "Review application details and documents"}</h2>
        <p className="muted">
          {lang === "ar"
            ? "الصور والمستندات معروضة للمراجعة داخل صفحة الموافقة، ولا توجد خطوة اعتماد منفصلة لها."
            : "Images and documents are reviewed here and do not require a separate approval step."}
        </p>
        <div className="review-details-grid">
          {detailItems.map((item) => (
            <div key={item.key} className="review-detail-item">
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
          ))}
        </div>

        <h3 className="review-documents-title">{lang === "ar" ? "الصور والمستندات" : "Images and documents"}</h3>
        {loadingImages ? (
          <div className="empty-state">{t("loading", lang)}</div>
        ) : (
          <div className="review-documents-grid">
            {documentSpecs.map((spec) => {
              const url = imageUrls[spec.key];
              const label = lang === "ar" ? spec.ar : spec.en;
              return (
                <article className="review-document-card" key={spec.key}>
                  <strong>{label}</strong>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={label} />
                      <span>{lang === "ar" ? "فتح بالحجم الكامل" : "Open full size"}</span>
                    </a>
                  ) : (
                    <div className="missing-document">
                      <ImageUp size={28} />
                      <span>
                        {spec.optional
                          ? lang === "ar" ? "غير مرفوع أو غير مطلوب" : "Not uploaded or not required"
                          : lang === "ar" ? "لم يتم رفع هذه الصورة" : "This image was not uploaded"}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>{lang === "ar" ? "إغلاق" : "Close"}</button>
        </div>
      </div>
    </div>
  );
}

function reviewDetailItems(sectionId: string, row: Row, lang: Lang) {
  const date = (value: unknown) => formatCell(value, "date", lang);
  const yesNo = (value: unknown) =>
    Boolean(value) ? (lang === "ar" ? "نعم" : "Yes") : (lang === "ar" ? "لا" : "No");
  const pick = (arKey: string, enKey: string, fallback?: string) =>
    String((lang === "ar" ? row[arKey] : row[enKey]) ?? row[arKey] ?? row[enKey] ?? fallback ?? "-");

  if (sectionId === "merchant-approvals") {
    return [
      { key: "store_name", label: lang === "ar" ? "اسم المتجر" : "Store name", value: String(row.store_name ?? "-") },
      { key: "owner_name", label: lang === "ar" ? "اسم المالك" : "Owner name", value: String(row.owner_name ?? "-") },
      { key: "owner_mobile", label: lang === "ar" ? "رقم المالك" : "Owner mobile", value: String(row.owner_mobile ?? "-") },
      { key: "manager_name", label: lang === "ar" ? "اسم المدير" : "Manager name", value: String(row.manager_name ?? "-") },
      { key: "manager_mobile", label: lang === "ar" ? "رقم المدير" : "Manager mobile", value: String(row.manager_mobile ?? "-") },
      { key: "contact_mobile", label: lang === "ar" ? "رقم التواصل" : "Contact mobile", value: String(row.contact_mobile ?? "-") },
      { key: "account_email", label: lang === "ar" ? "البريد الإلكتروني" : "Email", value: String(row.account_email ?? "-") },
      { key: "category", label: lang === "ar" ? "القسم" : "Category", value: pick("category_name_ar", "category_name_en") },
      { key: "approval", label: lang === "ar" ? "حالة الطلب" : "Application status", value: pick("approval_status_ar", "approval_status_en", String(row.approval_status ?? "-")) },
      { key: "billing", label: lang === "ar" ? "طريقة المحاسبة" : "Billing method", value: pick("billing_preference_ar", "billing_preference_en", lang === "ar" ? "لم تحدد" : "Not selected") },
      { key: "test", label: lang === "ar" ? "حساب اختبار" : "Test account", value: yesNo(row.is_test_account) },
      ...(row.rejection_reason ? [{ key: "reason", label: lang === "ar" ? "سبب الرفض" : "Rejection reason", value: String(row.rejection_reason) }] : []),
      { key: "created", label: lang === "ar" ? "تاريخ التقديم" : "Submitted", value: String(date(row.created_at)) },
      { key: "updated", label: lang === "ar" ? "آخر تحديث" : "Last updated", value: String(date(row.updated_at)) },
    ];
  }

  return [
    { key: "branch_name", label: lang === "ar" ? "اسم الفرع" : "Branch name", value: String(row.branch_name ?? "-") },
    { key: "store_name", label: lang === "ar" ? "المتجر الرئيسي" : "Main store", value: String(row.store_name ?? "-") },
    { key: "manager_name", label: lang === "ar" ? "مدير الفرع" : "Branch manager", value: String(row.manager_name ?? "-") },
    { key: "manager_mobile", label: lang === "ar" ? "رقم مدير الفرع" : "Manager mobile", value: String(row.manager_mobile ?? "-") },
    { key: "country", label: lang === "ar" ? "البلد" : "Country", value: pick("country_ar", "country_en") },
    { key: "governorate", label: lang === "ar" ? "المحافظة" : "Governorate", value: pick("governorate_ar", "governorate_en", String(row.governorate_name ?? "-")) },
    { key: "city", label: lang === "ar" ? "المدينة" : "City", value: pick("city_name_ar", "city_name_en", String(row.city_name ?? "-")) },
    { key: "approval", label: lang === "ar" ? "حالة الطلب" : "Application status", value: pick("approval_status_ar", "approval_status_en", String(row.approval_status ?? "-")) },
    {
      key: "register_source",
      label: lang === "ar" ? "السجل التجاري" : "Commercial registration",
      value: row.uses_parent_commercial_register === false
        ? lang === "ar" ? "سجل مستقل لهذا الفرع" : "Separate register for this branch"
        : lang === "ar" ? "يستخدم سجل المتجر الرئيسي" : "Uses the main store register",
    },
    ...(row.rejection_reason ? [{ key: "reason", label: lang === "ar" ? "سبب الرفض" : "Rejection reason", value: String(row.rejection_reason) }] : []),
    { key: "created", label: lang === "ar" ? "تاريخ التقديم" : "Submitted", value: String(date(row.created_at)) },
    { key: "updated", label: lang === "ar" ? "آخر تحديث" : "Last updated", value: String(date(row.updated_at)) },
  ];
}

function shouldShowDetailValue(key: string, value: unknown, row: Row) {
  if (detailHiddenFields.has(key) || key === "id" || key.endsWith("_id") || key.endsWith("_url")) {
    return false;
  }
  if (key.endsWith("_en") && row[key.replace(/_en$/, "_ar")] !== null && row[key.replace(/_en$/, "_ar")] !== undefined) {
    return false;
  }
  if ((key === "approval_status" && row.approval_status_ar) || (key === "status" && row.status_ar)) {
    return false;
  }
  if (value === null || value === undefined || value === "") {
    return false;
  }
  return typeof value !== "object";
}

function textLooksBroken(text: string) {
  return text.includes("\uFFFD");
}

const detailHiddenFields = new Set([
  "auth_user_id",
  "owner_user_id",
  "created_by",
  "updated_by",
  "deleted_at",
  "metadata",
  "raw_user_meta_data",
  "raw_app_meta_data",
]);
