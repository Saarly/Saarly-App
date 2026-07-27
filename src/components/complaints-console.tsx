"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Filter,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Tag,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import type { AdminProfile } from "@/lib/admin/types";
import { formatCell } from "@/lib/admin/format";
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

function friendlyName(value: unknown, lang: Lang) {
  const name = text(value);
  if (!name || name === "Deleted User" || /^deleted_/i.test(name)) {
    return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
  }
  return name;
}

function rowLabels(row: Row): SupportLabel[] {
  return Array.isArray(row.labels) ? (row.labels as SupportLabel[]) : [];
}

export function ComplaintsConsole({
  lang,
  profile,
}: {
  lang: Lang;
  profile: AdminProfile;
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

  const canChooseAgent = profile.role === "admin" && data.agents.length > 0;

  async function accessToken() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) throw new Error("auth_required");
    return session.session.access_token;
  }

  async function load() {
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
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const targetId = agentId || profile.id;
    await action("assign_complaint_admin", text(selected.id), { agent_id: targetId });
  }

  async function saveLabels(labelIds: string[]) {
    if (!selected) return;
    await action("set_support_complaint_labels", text(selected.id), { label_ids: labelIds });
  }

  return (
    <section className="content-panel complaints-console">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "إدارة النزاعات" : "Case management"}</span>
          <h1>{lang === "ar" ? "الشكاوى الرسمية" : "Formal complaints"}</h1>
          <p>
            {lang === "ar"
              ? "تابع الشكوى والمحادثة والتعيين والتصنيفات والحل من نفس المكان."
              : "Track the complaint, conversation, assignment, labels, and resolution in one place."}
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
            placeholder={lang === "ar" ? "ابحث بالعميل أو المتجر أو العنوان" : "Search customer, store, or title"}
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
                  <strong>{text(item.title) || (lang === "ar" ? "شكوى بدون عنوان" : "Untitled complaint")}</strong>
                  <span className={`status-pill ${itemPriority === "urgent" || itemPriority === "high" ? "danger" : "muted"}`}>
                    {priorityLabels[itemPriority]?.[lang] ?? itemPriority}
                  </span>
                </div>
                <span>{friendlyName(item.reporter_name, lang)}</span>
                {text(item.store_name) ? <small>{text(item.store_name)}</small> : null}
                <small>{statusLabels[itemStatus]?.[lang] ?? itemStatus}</small>
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
                  <h2>{text(selected.title)}</h2>
                  <p>{friendlyName(selected.reporter_name, lang)} · {text(selected.reporter_mobile) || "-"}</p>
                  <small>
                    {lang === "ar" ? "مسؤول الشكوى: " : "Complaint owner: "}
                    {text(selected.assigned_agent_name)
                      ? friendlyName(selected.assigned_agent_name, lang)
                      : lang === "ar"
                        ? "لم يتم تعيين موظف دعم"
                        : "No support agent assigned"}
                  </small>
                </div>
                <div className="row-actions">
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
                <div><strong>{lang === "ar" ? "الحالة" : "Status"}</strong><span>{statusLabels[text(selected.status)]?.[lang] ?? text(selected.status)}</span></div>
                <div><strong>{lang === "ar" ? "الأولوية" : "Priority"}</strong><span>{priorityLabels[text(selected.priority)]?.[lang] ?? text(selected.priority)}</span></div>
                <div><strong>{lang === "ar" ? "المتجر" : "Store"}</strong><span>{text(selected.store_name) || "-"}</span></div>
                <div><strong>{lang === "ar" ? "آخر تحديث" : "Updated"}</strong><span>{formatCell(selected.updated_at, "date", lang)}</span></div>
              </div>

              <article className="complaint-origin">
                <strong>{lang === "ar" ? "نص الشكوى" : "Complaint details"}</strong>
                <p>{text(selected.body)}</p>
              </article>

              <div className="complaint-messages">
                {selectedMessages.map((item) => {
                  const mine = ["admin", "support_agent"].includes(text(item.sender_type));
                  return (
                    <article className={mine ? "complaint-message staff" : "complaint-message user"} key={text(item.id)}>
                      <strong>
                        {friendlyName(item.sender_name, lang) ||
                          (mine ? (lang === "ar" ? "فريق الدعم" : "Support team") : (lang === "ar" ? "العميل" : "Customer"))}
                      </strong>
                      <p>{text(item.body)}</p>
                      <small>{formatCell(item.created_at, "date", lang)}</small>
                    </article>
                  );
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
