"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Filter,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Tag,
  Trash2,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import type { AdminProfile } from "@/lib/admin/types";
import { adminValueLabel, formatCell } from "@/lib/admin/format";
import { humanizeAdminError } from "@/lib/admin/messages";

type Row = Record<string, unknown>;
type SupportLabel = {
  id: string;
  name_ar: string;
  name_en: string;
  color_hex: string;
};
type ComplaintPayload = {
  complaints: Row[];
  messages: Row[];
  agents: Row[];
  labels: SupportLabel[];
};
type ComplaintContextPayload = {
  conversation_id: string | null;
  messages: Row[];
};

const statusLabels: Record<string, { ar: string; en: string }> = {
  open: { ar: "مفتوحة", en: "Open" },
  in_support: { ar: "قيد المعالجة", en: "In progress" },
  escalated: { ar: "مصعّدة", en: "Escalated" },
  resolved: { ar: "تم الحل", en: "Resolved" },
  closed: { ar: "مغلقة", en: "Closed" },
};

const priorityLabels: Record<string, { ar: string; en: string }> = {
  low: { ar: "منخفضة", en: "Low" },
  normal: { ar: "عادية", en: "Normal" },
  high: { ar: "مرتفعة", en: "High" },
  urgent: { ar: "عاجلة", en: "Urgent" },
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeDisplayText(value: unknown) {
  return text(value)
    .replace(/not[_\s-]?provided/gi, " ")
    .replace(/\b(?:undefined|null|n\/a)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMissingValue(value: unknown) {
  return !sanitizeDisplayText(value);
}

function displayText(value: unknown, lang: Lang, fallback?: string) {
  const sanitized = sanitizeDisplayText(value);
  if (!sanitized) return fallback ?? (lang === "ar" ? "غير متوفر" : "Not provided");
  return adminValueLabel(sanitized, lang);
}

function friendlyName(value: unknown, lang: Lang) {
  const name = sanitizeDisplayText(value);
  if (isMissingValue(value)) {
    return lang === "ar" ? "الاسم غير متوفر" : "Name not provided";
  }
  if (name === "Deleted User" || /^deleted_/i.test(name)) {
    return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
  }
  return name;
}

function rowLabels(row: Row): SupportLabel[] {
  return Array.isArray(row.labels) ? (row.labels as SupportLabel[]) : [];
}

function senderLabel(item: Row, lang: Lang) {
  const name = sanitizeDisplayText(item.sender_name);
  if (name) return friendlyName(name, lang);
  const senderType = text(item.sender_type);
  if (senderType === "user") return lang === "ar" ? "العميل" : "Customer";
  if (senderType === "bot") return lang === "ar" ? "المساعد الآلي" : "Automated assistant";
  if (senderType === "system") return lang === "ar" ? "النظام" : "System";
  if (senderType === "support_agent") return lang === "ar" ? "موظف الدعم" : "Support agent";
  if (senderType === "admin") return lang === "ar" ? "الإدارة" : "Administration";
  return lang === "ar" ? "مرسل غير معروف" : "Unknown sender";
}

function isStaffMessage(item: Row) {
  return ["admin", "support_agent"].includes(text(item.sender_type));
}

export function ComplaintsConsole({
  lang,
  profile,
}: {
  lang: Lang;
  profile?: AdminProfile;
}) {
  const [data, setData] = useState<ComplaintPayload>({
    complaints: [],
    messages: [],
    agents: [],
    labels: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("all");
  const [labelFilter, setLabelFilter] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [context, setContext] = useState<ComplaintContextPayload>({
    conversation_id: null,
    messages: [],
  });
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const canChooseAgent = profile?.role === "admin" && data.agents.length > 0;

  const accessToken = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) throw new Error("auth_required");
    return session.session.access_token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/action?complaints=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: ComplaintPayload;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "load_failed");
      }
      const normalized: ComplaintPayload = {
        complaints: payload.data.complaints ?? [],
        messages: payload.data.messages ?? [],
        agents: payload.data.agents ?? [],
        labels: payload.data.labels ?? [],
      };
      setData(normalized);
      setSelectedId((current) => {
        if (current && normalized.complaints.some((item) => text(item.id) === current)) {
          return current;
        }
        return text(normalized.complaints[0]?.id) || null;
      });
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoading(false);
    }
  }, [accessToken, lang]);

  async function action(actionName: string, id: string, payload: Row = {}) {
    setBusy(actionName);
    setError(null);
    setMessage(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: actionName, id, payload }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "action_failed");
      setMessage(lang === "ar" ? "تم حفظ التحديث بنجاح." : "Update saved successfully.");
      await load();
      return true;
    } catch (actionError) {
      setError(humanizeAdminError(actionError, lang));
      return false;
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.complaints.filter((item) => {
      const itemStatus = text(item.status);
      const statusMatch =
        status === "all" ||
        (status === "active" && !["resolved", "closed"].includes(itemStatus)) ||
        itemStatus === status;
      const priorityMatch = priority === "all" || text(item.priority) === priority;
      const labelMatch = !labelFilter || rowLabels(item).some((label) => label.id === labelFilter);
      const searchMatch =
        !needle ||
        [
          item.reporter_name,
          item.reporter_mobile,
          item.store_name,
          item.title,
          item.body,
          item.target_type,
        ].some((value) => text(value).toLowerCase().includes(needle));
      return statusMatch && priorityMatch && labelMatch && searchMatch;
    });
  }, [data.complaints, labelFilter, priority, query, status]);

  const selected =
    data.complaints.find((item) => text(item.id) === selectedId) ?? filtered[0] ?? null;
  const selectedMessages = selected
    ? data.messages.filter((item) => text(item.complaint_id) === text(selected.id))
    : [];
  const selectedLabels = selected ? rowLabels(selected) : [];
  const closed = selected ? ["resolved", "closed"].includes(text(selected.status)) : false;

  useEffect(() => {
    const complaintId = text(selected?.id);
    if (!complaintId) {
      setContext({ conversation_id: null, messages: [] });
      setContextError(null);
      setContextLoading(false);
      return;
    }

    const controller = new AbortController();
    setContext({ conversation_id: null, messages: [] });
    setContextLoading(true);
    setContextError(null);
    void (async () => {
      try {
        const token = await accessToken();
        const response = await fetch(
          `/api/admin/action?complaint_context=${encodeURIComponent(complaintId)}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          data?: ComplaintContextPayload;
          error?: string;
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "complaint_context_load_failed");
        }
        setContext({
          conversation_id: payload.data.conversation_id ?? null,
          messages: payload.data.messages ?? [],
        });
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setContext({ conversation_id: null, messages: [] });
        setContextError(humanizeAdminError(loadError, lang));
      } finally {
        if (!controller.signal.aborted) setContextLoading(false);
      }
    })();

    return () => controller.abort();
  }, [accessToken, selected?.id, lang]);

  const customerContextMessages = context.messages.filter(
    (item) => text(item.sender_type) === "user",
  );
  const botContextMessages = context.messages.filter(
    (item) => text(item.sender_type) === "bot",
  );
  const systemContextMessages = context.messages.filter(
    (item) => text(item.sender_type) === "system",
  );
  const supportContextMessages = context.messages.filter((item) =>
    ["support_agent", "admin"].includes(text(item.sender_type)),
  );
  const selectedAdminAction =
    selected?.admin_action &&
    typeof selected.admin_action === "object" &&
    !Array.isArray(selected.admin_action)
      ? (selected.admin_action as Row)
      : {};
  const convertedFromSupport = Boolean(
    context.conversation_id ||
      text(selectedAdminAction.conversation_id) ||
      text(selectedAdminAction.source) === "support_conversation",
  );

  function renderMessageGroup({
    title,
    description,
    items,
    emptyText,
    className,
  }: {
    title: string;
    description: string;
    items: Row[];
    emptyText: string;
    className: string;
  }) {
    return (
      <section className={`complaint-message-group ${className}`}>
        <div className="complaint-message-group-head">
          <div>
            <strong>{title}</strong>
            <small>{description}</small>
          </div>
          <span>{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="complaint-message-group-empty">{emptyText}</div>
        ) : (
          <div className="complaint-message-list">
            {items.map((item) => (
              <article
                className={isStaffMessage(item) ? "complaint-message staff" : "complaint-message customer"}
                key={text(item.id)}
              >
                <strong>{senderLabel(item, lang)}</strong>
                <p>{text(item.body)}</p>
                <small>{formatCell(item.created_at, "date", lang)}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    const body = reply.trim();
    setReply("");
    await action("send_complaint_message_admin", text(selected.id), { body });
  }

  async function resolveComplaint() {
    if (!selected) return;
    const resolution = window.prompt(
      lang === "ar" ? "اكتب ملخص الحل والإجراء النهائي" : "Write the final resolution and action",
    );
    if (!resolution || resolution.trim().length < 3) return;
    const ok = await action("resolve_complaint_admin", text(selected.id), {
      resolution,
      admin_action: { source: "admin_web" },
    });
    if (ok) setStatus("resolved");
  }

  async function assign(agentId?: string) {
    if (!selected) return;
    const targetId = agentId || profile?.id;
    if (!targetId) {
      setError(
        lang === "ar"
          ? "تعذر تحديد موظف الدعم. حدّث الصفحة ثم حاول مرة أخرى."
          : "Could not determine the support agent. Refresh the page and try again.",
      );
      return;
    }
    await action("assign_complaint_admin", text(selected.id), { agent_id: targetId });
  }

  async function saveLabels(labelIds: string[]) {
    if (!selected) return;
    await action("set_support_complaint_labels", text(selected.id), { label_ids: labelIds });
  }

  async function updateStatus(nextStatus: string) {
    if (!selected || nextStatus === text(selected.status)) return;
    await action("set_complaint_status_admin", text(selected.id), { status: nextStatus });
  }

  async function saveLabel(label?: SupportLabel) {
    if (profile?.role !== "admin") return;
    const nameAr = window.prompt(
      lang === "ar" ? "اسم التصنيف بالعربية" : "Arabic label name",
      label?.name_ar ?? "",
    );
    if (!nameAr?.trim()) return;
    const nameEn = window.prompt(
      lang === "ar" ? "اسم التصنيف بالإنجليزية" : "English label name",
      label?.name_en ?? "",
    );
    if (!nameEn?.trim()) return;
    const colorHex = window.prompt(
      lang === "ar" ? "لون التصنيف بصيغة HEX" : "Label HEX color",
      label?.color_hex ?? "#12B76A",
    );
    if (!colorHex?.trim()) return;
    await action("upsert_support_label", label?.id ?? "new", {
      label_id: label?.id ?? null,
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      color_hex: colorHex.trim(),
      is_active: true,
    });
  }

  async function deleteLabel(label: SupportLabel) {
    if (profile?.role !== "admin") return;
    const confirmed = window.confirm(
      lang === "ar"
        ? `حذف التصنيف «${label.name_ar}» من القوائم؟`
        : `Remove the “${label.name_en}” label from the lists?`,
    );
    if (!confirmed) return;
    await action("upsert_support_label", label.id, {
      label_id: label.id,
      name_ar: label.name_ar,
      name_en: label.name_en,
      color_hex: label.color_hex,
      is_active: false,
    });
  }

  return (
    <section className="content-panel complaints-console">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "إدارة النزاعات" : "Case management"}</span>
          <h1>{lang === "ar" ? "الشكاوى الرسمية" : "Formal complaints"}</h1>
          <p>
            {lang === "ar"
              ? "راجع سياق العميل والبوت والدعم قبل التصعيد، وبعدها تابع رسائل الشكوى وإجراءات الحل بشكل منظم."
              : "Review the customer, bot, and pre-escalation support context, then manage formal complaint messages and resolution actions in a clear structure."}
          </p>
        </div>
        <button className="soft-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={17} />
          {lang === "ar" ? "تحديث" : "Refresh"}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <div className="complaints-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={lang === "ar" ? "ابحث بالعميل أو المتجر أو نص الشكوى" : "Search customer, store, or complaint text"}
          />
        </label>
        <label className="compact-field">
          <Filter size={16} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{lang === "ar" ? "الجارية" : "Active cases"}</option>
            <option value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option value={key} key={key}>{label[lang]}</option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="all">{lang === "ar" ? "كل الأولويات" : "All priorities"}</option>
            {Object.entries(priorityLabels).map(([key, label]) => (
              <option value={key} key={key}>{label[lang]}</option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          <Tag size={16} />
          <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
            <option value="">{lang === "ar" ? "كل التصنيفات" : "All labels"}</option>
            {data.labels.map((label) => (
              <option value={label.id} key={label.id}>
                {lang === "ar" ? label.name_ar : label.name_en}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="complaint-label-manager">
        <div className="complaint-label-manager-head">
          <div>
            <strong>{lang === "ar" ? "تصنيفات الدعم" : "Support labels"}</strong>
            <small>{lang === "ar" ? "نفس التصنيفات المستخدمة في صفحة الدعم." : "The same labels used on the support page."}</small>
          </div>
          {profile?.role === "admin" ? (
            <button className="tiny-button" onClick={() => void saveLabel()} disabled={busy === "upsert_support_label"}>
              <Plus size={15} />
              {lang === "ar" ? "إضافة تصنيف" : "Add label"}
            </button>
          ) : null}
        </div>
        <div className="complaint-label-manager-list">
          {data.labels.map((label) => (
            <div className="managed-support-label" key={label.id} style={{ borderColor: label.color_hex }}>
              <span style={{ backgroundColor: label.color_hex }} />
              <b>{lang === "ar" ? label.name_ar : label.name_en}</b>
              {profile?.role === "admin" ? (
                <div>
                  <button type="button" title={lang === "ar" ? "تعديل" : "Edit"} onClick={() => void saveLabel(label)} disabled={busy === "upsert_support_label"}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" title={lang === "ar" ? "حذف" : "Delete"} onClick={() => void deleteLabel(label)} disabled={busy === "upsert_support_label"}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {data.labels.length === 0 ? <span className="muted">{lang === "ar" ? "لا توجد تصنيفات مفعلة." : "No active labels."}</span> : null}
        </div>
      </div>

      <div className="complaints-layout">
        <aside className="complaints-list">
          {loading ? <div className="empty-state">{lang === "ar" ? "جار التحميل..." : "Loading..."}</div> : null}
          {!loading && filtered.length === 0 ? (
            <div className="empty-state">{lang === "ar" ? "لا توجد شكاوى مطابقة." : "No matching complaints."}</div>
          ) : null}
          {filtered.map((item) => {
            const itemStatus = text(item.status);
            const itemPriority = text(item.priority);
            return (
              <button
                key={text(item.id)}
                className={text(selected?.id) === text(item.id) ? "complaint-card active" : "complaint-card"}
                onClick={() => setSelectedId(text(item.id))}
              >
                <div className="complaint-card-head">
                  <strong>{friendlyName(item.reporter_name, lang)}</strong>
                  <span className={`status-pill ${itemPriority === "urgent" || itemPriority === "high" ? "danger" : "muted"}`}>
                    {priorityLabels[itemPriority]?.[lang] ?? adminValueLabel(itemPriority, lang)}
                  </span>
                </div>
                {!isMissingValue(item.reporter_mobile) ? <span>{displayText(item.reporter_mobile, lang)}</span> : null}
                {!isMissingValue(item.store_name) ? <small>{displayText(item.store_name, lang)}</small> : null}
                <small>{statusLabels[itemStatus]?.[lang] ?? adminValueLabel(itemStatus, lang)}</small>
                <div className="support-labels">
                  {rowLabels(item).map((label) => (
                    <i key={label.id} style={{ backgroundColor: label.color_hex }}>
                      {lang === "ar" ? label.name_ar : label.name_en}
                    </i>
                  ))}
                </div>
              </button>
            );
          })}
        </aside>

        <main className="complaint-thread">
          {!selected ? (
            <div className="empty-state">
              <MessageSquareText size={34} />
              {lang === "ar" ? "اختر شكوى لعرض تفاصيلها." : "Choose a complaint to view details."}
            </div>
          ) : (
            <>
              <div className="complaint-thread-head">
                <div>
                  <h2>{lang === "ar" ? "تفاصيل الشكوى" : "Complaint details"}</h2>
                  <p><bdi>{friendlyName(selected.reporter_name, lang)}</bdi> · <bdi>{displayText(selected.reporter_mobile, lang)}</bdi></p>
                  <small>
                    {lang === "ar" ? "مسؤول الشكوى: " : "Complaint owner: "}
                    {!isMissingValue(selected.assigned_agent_name)
                      ? <bdi>{friendlyName(selected.assigned_agent_name, lang)}</bdi>
                      : lang === "ar"
                        ? "لم يتم تعيين موظف دعم"
                        : "No support agent assigned"}
                  </small>
                </div>
                <div className="row-actions complaint-head-actions">
                  <label className="complaint-status-control">
                    <span>{lang === "ar" ? "تحديث الحالة" : "Update status"}</span>
                    <select
                      value={text(selected.status)}
                      onChange={(event) => void updateStatus(event.target.value)}
                      disabled={busy === "set_complaint_status_admin"}
                    >
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <option value={key} key={key}>{label[lang]}</option>
                      ))}
                    </select>
                  </label>
                  {!closed ? (
                    <button className="tiny-button" onClick={() => void assign()} disabled={busy === "assign_complaint_admin"}>
                      <UserCheck size={15} />
                      {lang === "ar" ? "استلام الشكوى" : "Assign to me"}
                    </button>
                  ) : null}
                  {!closed && canChooseAgent ? (
                    <select
                      className="tiny-select"
                      value={text(selected.assigned_support_agent_id)}
                      onChange={(event) => {
                        if (event.target.value) void assign(event.target.value);
                      }}
                      disabled={busy === "assign_complaint_admin"}
                    >
                      <option value="">{lang === "ar" ? "تعيين موظف دعم" : "Assign support agent"}</option>
                      {data.agents.map((agent) => (
                        <option value={text(agent.id)} key={text(agent.id)}>
                          {friendlyName(agent.full_name || agent.primary_email, lang)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!closed ? (
                    <button className="tiny-button success" onClick={() => void resolveComplaint()} disabled={busy === "resolve_complaint_admin"}>
                      <CheckCircle2 size={15} />
                      {lang === "ar" ? "تسجيل الحل" : "Record resolution"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="conversation-label-editor complaint-label-editor">
                <Tag size={16} />
                {data.labels.length === 0 ? (
                  <span className="muted">{lang === "ar" ? "لا توجد تصنيفات مفعلة." : "No active labels."}</span>
                ) : null}
                {data.labels.map((label) => {
                  const checked = selectedLabels.some((item) => item.id === label.id);
                  return (
                    <label key={label.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy === "set_support_complaint_labels"}
                        onChange={(event) => {
                          const current = selectedLabels.map((item) => item.id);
                          const next = event.target.checked
                            ? [...new Set([...current, label.id])]
                            : current.filter((id) => id !== label.id);
                          void saveLabels(next);
                        }}
                      />
                      <span style={{ borderColor: label.color_hex }}>
                        {lang === "ar" ? label.name_ar : label.name_en}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="complaint-summary-grid">
                <div><strong>{lang === "ar" ? "الحالة" : "Status"}</strong><span>{statusLabels[text(selected.status)]?.[lang] ?? adminValueLabel(selected.status, lang)}</span></div>
                <div><strong>{lang === "ar" ? "الأولوية" : "Priority"}</strong><span>{priorityLabels[text(selected.priority)]?.[lang] ?? adminValueLabel(selected.priority, lang)}</span></div>
                <div><strong>{lang === "ar" ? "المتجر" : "Store"}</strong><span>{displayText(selected.store_name, lang)}</span></div>
                <div><strong>{lang === "ar" ? "آخر تحديث" : "Updated"}</strong><span>{formatCell(selected.updated_at, "date", lang)}</span></div>
              </div>

              <article className="complaint-origin">
                <strong>{lang === "ar" ? "موضوع الشكوى" : "Complaint subject"}</strong>
                <h3>{displayText(selected.title, lang)}</h3>
                {contextLoading ? (
                  <p>
                    {lang === "ar"
                      ? "بنجمع سياق المحادثة الأصلي عشان نعرض كل رسالة في القسم الصحيح بدل ما يظهر الكلام كله متجمع."
                      : "Loading the original conversation so every message can be shown in the correct section instead of as one combined block."}
                  </p>
                ) : convertedFromSupport ? (
                  <p>
                    {lang === "ar"
                      ? "الشكوى دي اتحولت من محادثة دعم. هتلاقي تحت رسائل العميل، ورسائل البوت، ورسائل النظام والتحويل، وردود الدعم قبل التصعيد، وبعدها رسائل الشكوى الرسمية؛ كل جزء منفصل ومرتب بالتاريخ."
                      : "This complaint was converted from a support conversation. Customer messages, bot messages, system and transfer events, pre-escalation support replies, and formal complaint messages are shown below in separate chronological sections."}
                  </p>
                ) : (
                  <p>{text(selected.body)}</p>
                )}
              </article>

              {contextError ? <div className="alert">{contextError}</div> : null}
              {contextLoading ? (
                <div className="complaint-context-loading">
                  {lang === "ar" ? "جاري تحميل سياق المحادثة قبل الشكوى..." : "Loading the conversation context before the complaint..."}
                </div>
              ) : null}

              <div className="complaint-context-sections">
                {convertedFromSupport || contextLoading || contextError ? (
                  <>
                    {renderMessageGroup({
                      title: lang === "ar" ? "رسائل العميل قبل الشكوى" : "Customer messages before the complaint",
                      description:
                        lang === "ar"
                          ? "كل الرسائل اللي كتبها العميل في محادثة الدعم قبل تحويلها لشكوى."
                          : "Messages sent by the customer in the support conversation before escalation.",
                      items: customerContextMessages,
                      emptyText:
                        lang === "ar"
                          ? "مفيش رسائل عميل محفوظة قبل الشكوى."
                          : "No customer messages were saved before the complaint.",
                      className: "customer-context",
                    })}

                    {renderMessageGroup({
                      title: lang === "ar" ? "رسائل البوت" : "Bot messages",
                      description:
                        lang === "ar"
                          ? "الردود اللي بعتها المساعد الآلي للعميل قبل ما المحادثة تتحول لموظف دعم."
                          : "Replies sent by the automated assistant before the conversation was transferred to support.",
                      items: botContextMessages,
                      emptyText:
                        lang === "ar"
                          ? "مفيش رسائل بوت مرتبطة بالمحادثة."
                          : "No bot messages are linked to this conversation.",
                      className: "bot-context",
                    })}

                    {renderMessageGroup({
                      title: lang === "ar" ? "رسائل النظام والتحويل" : "System and transfer messages",
                      description:
                        lang === "ar"
                          ? "تنبيهات النظام اللي بتوضح مراحل المحادثة، زي طلب التحويل أو انتظار خدمة العملاء."
                          : "System events that explain the conversation flow, such as transfer requests or waiting notices.",
                      items: systemContextMessages,
                      emptyText:
                        lang === "ar"
                          ? "مفيش رسائل نظام مرتبطة بالمحادثة."
                          : "No system messages are linked to this conversation.",
                      className: "system-context",
                    })}

                    {renderMessageGroup({
                      title: lang === "ar" ? "ردود الدعم قبل تحويلها لشكوى" : "Support replies before escalation",
                      description:
                        lang === "ar"
                          ? "الردود اللي كتبها موظفو الدعم في المحادثة العادية قبل إنشاء الشكوى الرسمية."
                          : "Replies sent by support staff in the original support conversation before the formal complaint was created.",
                      items: supportContextMessages,
                      emptyText:
                        lang === "ar"
                          ? "مفيش ردود دعم محفوظة قبل تحويل المحادثة لشكوى."
                          : "No support replies were saved before escalation.",
                      className: "support-context",
                    })}
                  </>
                ) : null}

                {renderMessageGroup({
                  title: lang === "ar" ? "رسائل الشكوى الرسمية" : "Formal complaint messages",
                  description:
                    lang === "ar"
                      ? "كل الرسائل والإجراءات اللي اتسجلت بعد إنشاء الشكوى الرسمية."
                      : "Messages and recorded actions added after the formal complaint was created.",
                  items: selectedMessages,
                  emptyText:
                    lang === "ar"
                      ? "لسه مفيش رسائل اتبعتت داخل الشكوى الرسمية."
                      : "No messages have been sent in the formal complaint yet.",
                  className: "formal-context",
                })}
              </div>

              {!closed ? (
                <div className="complaint-reply-box">
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={lang === "ar" ? "اكتب ردًا واضحًا للمستخدم..." : "Write a clear reply to the user..."}
                  />
                  <button
                    className="primary-button"
                    onClick={() => void sendReply()}
                    disabled={!reply.trim() || busy === "send_complaint_message_admin"}
                  >
                    <Send size={17} />
                    {lang === "ar" ? "إرسال الرد" : "Send reply"}
                  </button>
                </div>
              ) : (
                <div className="success-banner">
                  <UserCheck size={17} />
                  {lang === "ar" ? "تم إغلاق هذه الشكوى بعد تسجيل الحل." : "This complaint is closed with a recorded resolution."}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
