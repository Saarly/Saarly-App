"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Filter, MessageSquareText, RefreshCw, Search, Send, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { formatCell } from "@/lib/admin/format";
import { humanizeAdminError } from "@/lib/admin/messages";

type Row = Record<string, unknown>;
type ComplaintPayload = { complaints: Row[]; messages: Row[]; agents: Row[] };

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

export function ComplaintsConsole({ lang }: { lang: Lang }) {
  const [data, setData] = useState<ComplaintPayload>({ complaints: [], messages: [], agents: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("all");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      const payload = (await response.json().catch(() => ({}))) as { data?: ComplaintPayload; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "load_failed");
      setData(payload.data);
      setSelectedId((current) => current ?? (text(payload.data?.complaints?.[0]?.id) || null));
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: actionName, id, payload }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "action_failed");
      setMessage(lang === "ar" ? "تم حفظ التحديث." : "Update saved.");
      await load();
    } catch (actionError) {
      setError(humanizeAdminError(actionError, lang));
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
      const searchMatch =
        !needle ||
        [item.reporter_name, item.reporter_mobile, item.store_name, item.title, item.body, item.target_type]
          .some((value) => text(value).toLowerCase().includes(needle));
      return statusMatch && priorityMatch && searchMatch;
    });
  }, [data.complaints, priority, query, status]);

  const selected = data.complaints.find((item) => text(item.id) === selectedId) ?? filtered[0] ?? null;
  const selectedMessages = selected
    ? data.messages.filter((item) => text(item.complaint_id) === text(selected.id))
    : [];
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
    await action("resolve_complaint_admin", text(selected.id), { resolution, admin_action: { source: "admin_web" } });
  }

  return (
    <section className="content-panel complaints-console">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "إدارة النزاعات" : "Case management"}</span>
          <h1>{lang === "ar" ? "الشكاوى الرسمية" : "Formal complaints"}</h1>
          <p>
            {lang === "ar"
              ? "تابع الشكوى والمحادثة والتعيين والحل من نفس المكان، مع توثيق كل إجراء."
              : "Track the complaint, conversation, assignment, and resolution in one place with a clear audit trail."}
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "ar" ? "ابحث بالعميل أو المتجر أو العنوان" : "Search customer, store, or title"} />
        </label>
        <label className="compact-field">
          <Filter size={16} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{lang === "ar" ? "الجارية" : "Active cases"}</option>
            <option value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</option>
            {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label[lang]}</option>)}
          </select>
        </label>
        <label className="compact-field">
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="all">{lang === "ar" ? "كل الأولويات" : "All priorities"}</option>
            {Object.entries(priorityLabels).map(([key, label]) => <option value={key} key={key}>{label[lang]}</option>)}
          </select>
        </label>
      </div>

      <div className="complaints-layout">
        <aside className="complaints-list">
          {loading ? <div className="empty-state">{lang === "ar" ? "جار التحميل..." : "Loading..."}</div> : null}
          {!loading && filtered.length === 0 ? <div className="empty-state">{lang === "ar" ? "لا توجد شكاوى مطابقة." : "No matching complaints."}</div> : null}
          {filtered.map((item) => {
            const itemStatus = text(item.status);
            const itemPriority = text(item.priority);
            return (
              <button key={text(item.id)} className={text(selected?.id) === text(item.id) ? "complaint-card active" : "complaint-card"} onClick={() => setSelectedId(text(item.id))}>
                <div className="complaint-card-head">
                  <strong>{text(item.title) || (lang === "ar" ? "شكوى بدون عنوان" : "Untitled complaint")}</strong>
                  <span className={`status-pill ${itemPriority === "urgent" ? "danger" : itemPriority === "high" ? "pending" : "muted"}`}>
                    {priorityLabels[itemPriority]?.[lang] ?? itemPriority}
                  </span>
                </div>
                <span>{friendlyName(item.reporter_name, lang)}{text(item.store_name) ? ` · ${text(item.store_name)}` : ""}</span>
                <small>{statusLabels[itemStatus]?.[lang] ?? itemStatus} · {formatCell(item.updated_at ?? item.created_at, "date", lang)}</small>
              </button>
            );
          })}
        </aside>

        <main className="complaint-detail">
          {!selected ? (
            <div className="empty-state">{lang === "ar" ? "اختر شكوى لعرض تفاصيلها." : "Select a complaint to view details."}</div>
          ) : (
            <>
              <div className="complaint-detail-head">
                <div>
                  <span className="eyebrow">{statusLabels[text(selected.status)]?.[lang] ?? text(selected.status)}</span>
                  <h2>{text(selected.title)}</h2>
                  <p>{friendlyName(selected.reporter_name, lang)} · {text(selected.reporter_mobile) || (lang === "ar" ? "رقم غير متوفر" : "No phone")}</p>
                  {text(selected.store_name) ? <p>{lang === "ar" ? "المتجر: " : "Store: "}{text(selected.store_name)}</p> : null}
                </div>
                <div className="complaint-actions">
                  <label>
                    <span>{lang === "ar" ? "تعيين إلى" : "Assign to"}</span>
                    <select
                      value={text(selected.assigned_support_agent_id)}
                      disabled={closed || busy === "assign_complaint_admin"}
                      onChange={(event) => void action("assign_complaint_admin", text(selected.id), { agent_id: event.target.value })}
                    >
                      <option value="">{lang === "ar" ? "اختر موظف دعم" : "Choose support agent"}</option>
                      {data.agents.map((agent) => <option value={text(agent.id)} key={text(agent.id)}>{friendlyName(agent.full_name, lang)}</option>)}
                    </select>
                  </label>
                  {!closed ? (
                    <button className="primary-button compact" onClick={() => void resolveComplaint()} disabled={busy === "resolve_complaint_admin"}>
                      <CheckCircle2 size={17} />
                      {lang === "ar" ? "تسجيل الحل" : "Resolve case"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="complaint-context-card">
                <MessageSquareText size={20} />
                <div>
                  <strong>{lang === "ar" ? "وصف الشكوى" : "Complaint description"}</strong>
                  <p>{text(selected.body) || "-"}</p>
                  {text(selected.resolution_summary) ? <p><b>{lang === "ar" ? "الحل: " : "Resolution: "}</b>{text(selected.resolution_summary)}</p> : null}
                </div>
              </div>

              <div className="complaint-message-list">
                {selectedMessages.map((item) => {
                  const senderType = text(item.sender_type);
                  const mine = ["admin", "support_agent"].includes(senderType);
                  return (
                    <article className={mine ? "complaint-message staff" : "complaint-message customer"} key={text(item.id)}>
                      <strong>{mine ? friendlyName(item.sender_name, lang) || (lang === "ar" ? "الإدارة" : "Administration") : friendlyName(item.sender_name, lang)}</strong>
                      <p>{text(item.body)}</p>
                      <small>{formatCell(item.created_at, "date", lang)}</small>
                    </article>
                  );
                })}
              </div>

              {!closed ? (
                <div className="complaint-reply-box">
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder={lang === "ar" ? "اكتب ردًا واضحًا للمستخدم..." : "Write a clear reply to the user..."} />
                  <button className="primary-button" onClick={() => void sendReply()} disabled={!reply.trim() || busy === "send_complaint_message_admin"}>
                    <Send size={17} />
                    {lang === "ar" ? "إرسال الرد" : "Send reply"}
                  </button>
                </div>
              ) : (
                <div className="success-banner"><UserCheck size={17} />{lang === "ar" ? "تم إغلاق هذه الشكوى بعد تسجيل الحل." : "This complaint is closed with a recorded resolution."}</div>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
