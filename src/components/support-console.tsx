"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Filter,
  FolderPlus,
  RefreshCw,
  Send,
  Tag,
  UserRoundCheck,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import type { AdminProfile } from "@/lib/admin/types";
import { t } from "@/lib/admin/i18n";
import { friendlyStatus, humanizeAdminError } from "@/lib/admin/messages";

type SupportLabel = { id: string; name_ar: string; name_en: string; color_hex: string };
type SupportAgent = { id: string; full_name: string | null; primary_email: string | null };
type MerchantOption = { id: string; store_name: string | null; account_email: string | null };
type OrderOption = {
  id: string;
  buyer_name: string | null;
  store_name: string | null;
  status_ar: string | null;
  status_en: string | null;
};
type Conversation = {
  id: string;
  user_id: string;
  customer_name: string | null;
  customer_mobile: string | null;
  customer_email: string | null;
  title: string | null;
  status: string;
  assigned_support_agent_id: string | null;
  assigned_agent_name: string | null;
  handled_by_ar?: string | null;
  handled_by_en?: string | null;
  last_message_at: string | null;
  created_at: string;
  labels?: SupportLabel[] | null;
};
type Message = {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_user_id: string | null;
  sender_name: string | null;
  body: string;
  created_at: string;
};
type SupportPayload = {
  conversations: Conversation[];
  labels: SupportLabel[];
  agents: SupportAgent[];
  merchants: MerchantOption[];
  orders: OrderOption[];
};
type ComplaintDraft = {
  type: "merchant" | "order" | "wrong_price" | "other";
  priority: "low" | "normal" | "high" | "urgent";
  merchantId: string;
  orderId: string;
};

const genericTitles = new Set([
  "فين طلبي ؟",
  "فين طلبي؟",
  "اين طلبي",
  "أين طلبي؟",
  "where is my order?",
  "support chat",
  "محادثة الدعم",
]);

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function meaningfulTitle(title: string | null) {
  const value = cleanText(title);
  return value && !genericTitles.has(value.toLowerCase()) ? value : "";
}

function safeName(value: unknown, lang: Lang) {
  const name = cleanText(value);
  if (!name || name === "Deleted User" || name === "مستخدم محذوف" || /^deleted_/i.test(name)) {
    return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
  }
  return name;
}

function senderLabel(message: Message, lang: Lang) {
  if (message.sender_name) return safeName(message.sender_name, lang);
  if (message.sender_type === "user") return lang === "ar" ? "العميل" : "Customer";
  if (message.sender_type === "bot") return lang === "ar" ? "المساعد الآلي" : "Assistant";
  if (message.sender_type === "support_agent") return lang === "ar" ? "موظف الدعم" : "Support agent";
  if (message.sender_type === "admin") return lang === "ar" ? "الإدارة" : "Administration";
  if (message.sender_type === "system") return lang === "ar" ? "النظام" : "System";
  return lang === "ar" ? "مستخدم محذوف" : "Deleted user";
}

function statusLabel(status: string, lang: Lang) {
  if (status === "transferred") return lang === "ar" ? "محوّلة إلى فريق الدعم" : "Transferred to support";
  if (status === "bot") return lang === "ar" ? "مع المساعد الآلي" : "With the assistant";
  return friendlyStatus(status, lang);
}

function assignedLabel(conversation: Conversation, lang: Lang) {
  const assigned = cleanText(conversation.assigned_agent_name);
  if (assigned) return safeName(assigned, lang);
  return lang === "ar" ? "لم يتم تعيين موظف دعم" : "No support agent assigned";
}

const emptyComplaint: ComplaintDraft = {
  type: "other",
  priority: "normal",
  merchantId: "",
  orderId: "",
};

export function SupportConsole({ lang, profile }: { lang: Lang; profile: AdminProfile }) {
  const [payload, setPayload] = useState<SupportPayload>({
    conversations: [],
    labels: [],
    agents: [],
    merchants: [],
    orders: [],
  });
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintDraft, setComplaintDraft] = useState<ComplaintDraft>(emptyComplaint);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("auth_required");
    return data.session.access_token;
  }

  async function postAction(body: Record<string, unknown>) {
    const token = await accessToken();
    const response = await fetch("/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "action_failed");
  }

  async function loadConversations() {
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/action?support=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; data?: SupportPayload };
      if (!response.ok || !result.data) throw new Error(result.error ?? "support_load_failed");
      setPayload(result.data);
      setSelected((current) => {
        if (!current) return null;
        return result.data?.conversations.find((item) => item.id === current.id) ?? null;
      });
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    const { data, error: loadError } = await supabase.rpc("admin_support_conversation_messages", {
      p_conversation_id: conversationId,
    });
    if (loadError) {
      setError(humanizeAdminError(loadError.message, lang));
      return;
    }
    setMessages((data ?? []) as Message[]);
    await supabase.rpc("mark_support_conversation_read", { p_conversation_id: conversationId });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  }

  async function run(name: string, task: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (runError) {
      setError(humanizeAdminError(runError, lang));
    } finally {
      setBusy(null);
    }
  }

  async function assign(agentId?: string) {
    if (!selected) return;
    await run("assign", async () => {
      const currentUserId = (await supabase.auth.getUser()).data.user?.id;
      const targetAgent = agentId || currentUserId;
      if (!targetAgent) throw new Error("auth_required");
      await postAction({
        action: "assign_support_conversation_admin",
        id: selected.id,
        payload: { agent_id: targetAgent },
      });
      setMessage(lang === "ar" ? "تم تعيين المحادثة بنجاح." : "Conversation assigned successfully.");
      await loadConversations();
    });
  }

  async function saveLabels(labelIds: string[]) {
    if (!selected) return;
    await run("labels", async () => {
      await postAction({ action: "set_support_labels", id: selected.id, payload: { label_ids: labelIds } });
      await loadConversations();
    });
  }

  async function createLabel() {
    const nameAr = window.prompt(lang === "ar" ? "اسم التصنيف بالعربي" : "Arabic label name");
    if (!nameAr?.trim()) return;
    const nameEn = window.prompt(lang === "ar" ? "اسم التصنيف بالإنجليزي" : "English label name");
    if (!nameEn?.trim()) return;
    const color = window.prompt(lang === "ar" ? "اختر لون HEX مثل #12B76A" : "Choose a HEX color such as #12B76A", "#12B76A");
    if (!color) return;
    await run("new-label", async () => {
      await postAction({
        action: "upsert_support_label",
        payload: { name_ar: nameAr.trim(), name_en: nameEn.trim(), color_hex: color.trim() },
      });
      setMessage(lang === "ar" ? "تم إنشاء التصنيف." : "Label created.");
      await loadConversations();
    });
  }

  function openComplaintDialog() {
    setComplaintDraft(emptyComplaint);
    setComplaintOpen(true);
  }

  async function convertToComplaint() {
    if (!selected) return;
    await run("complaint", async () => {
      await postAction({
        action: "convert_support_to_complaint",
        id: selected.id,
        payload: {
          target_type: complaintDraft.type,
          priority: complaintDraft.priority,
          merchant_id: complaintDraft.merchantId || null,
          order_id: complaintDraft.orderId || null,
        },
      });
      setComplaintOpen(false);
      setMessage(lang === "ar" ? "تم تحويل المحادثة إلى شكوى رسمية." : "The conversation was converted into a formal complaint.");
    });
  }

  async function closeConversation() {
    if (!selected) return;
    const reason = window.prompt(
      lang === "ar" ? "اكتب سبب إغلاق المحادثة" : "Write the reason for closing the conversation",
      lang === "ar" ? "تم حل الطلب بواسطة الدعم" : "Resolved by support",
    );
    if (!reason?.trim()) return;
    await run("close", async () => {
      const { error: rpcError } = await supabase.rpc("close_support_conversation", {
        p_conversation_id: selected.id,
        p_reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      setSelected(null);
      setMessages([]);
      await loadConversations();
    });
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    const body = reply.trim();
    setReply("");
    await run("reply", async () => {
      const { error: rpcError } = await supabase.rpc("send_support_message", {
        p_conversation_id: selected.id,
        p_body: body,
      });
      if (rpcError) throw rpcError;
      await loadMessages(selected.id);
      await loadConversations();
    });
  }

  useEffect(() => {
    void loadConversations();
    const channel = supabase
      .channel("admin-support-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => void loadConversations())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    void loadMessages(selected.id);
    const channel = supabase
      .channel(`admin-support-messages-${selected.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${selected.id}` },
        () => void loadMessages(selected.id),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return payload.conversations.filter((conversation) => {
      const matchesText =
        !needle ||
        [conversation.customer_name, conversation.customer_mobile, conversation.customer_email, meaningfulTitle(conversation.title)]
          .some((value) => cleanText(value).toLowerCase().includes(needle));
      const matchesLabel = !labelFilter || (conversation.labels ?? []).some((label) => label.id === labelFilter);
      return matchesText && matchesLabel;
    });
  }, [labelFilter, payload.conversations, search]);

  const selectedLabels = selected?.labels ?? [];

  return (
    <section className="content-panel support-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{t("supportQueue", lang)}</span>
          <h1>{lang === "ar" ? "الدعم" : "Support"}</h1>
          <p>
            {lang === "ar"
              ? "استلام المحادثات وتصنيفها وتعيينها وتحويل الحالات الرسمية إلى شكاوى."
              : "Receive, classify, assign, and convert formal cases into complaints."}
          </p>
        </div>
        <button className="soft-button" onClick={() => void loadConversations()} disabled={loading}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <div className="support-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={lang === "ar" ? "بحث باسم العميل أو الهاتف أو البريد" : "Search customer, phone, or email"}
        />
        <label>
          <Filter size={16} />
          <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
            <option value="">{lang === "ar" ? "كل التصنيفات" : "All labels"}</option>
            {payload.labels.map((label) => (
              <option value={label.id} key={label.id}>
                {lang === "ar" ? label.name_ar : label.name_en}
              </option>
            ))}
          </select>
        </label>
        <button className="soft-button" onClick={() => void createLabel()} disabled={busy === "new-label"}>
          <FolderPlus size={16} />
          {lang === "ar" ? "تصنيف جديد" : "New label"}
        </button>
      </div>

      <div className="support-grid">
        <aside className="queue-card">
          <h2>{lang === "ar" ? "المحادثات" : "Conversations"}</h2>
          {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
          {!loading && filtered.length === 0 ? <div className="empty-state">{t("noRows", lang)}</div> : null}
          <div className="queue-list">
            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                className={selected?.id === conversation.id ? "queue-item active" : "queue-item"}
                onClick={() => setSelected(conversation)}
              >
                <strong>{safeName(conversation.customer_name, lang)}</strong>
                {meaningfulTitle(conversation.title) ? <small>{meaningfulTitle(conversation.title)}</small> : null}
                <span>
                  {statusLabel(conversation.status, lang)} · {lang === "ar" ? "مسؤول المحادثة: " : "Conversation owner: "}
                  {assignedLabel(conversation, lang)}
                </span>
                <div className="support-labels">
                  {(conversation.labels ?? []).map((label) => (
                    <i key={label.id} style={{ backgroundColor: label.color_hex }}>
                      {lang === "ar" ? label.name_ar : label.name_en}
                    </i>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <article className="chat-card">
          {selected ? (
            <>
              <div className="chat-head">
                <div>
                  <strong>{safeName(selected.customer_name, lang)}</strong>
                  <span>
                    {statusLabel(selected.status, lang)} · {lang === "ar" ? "مسؤول المحادثة: " : "Conversation owner: "}
                    {assignedLabel(selected, lang)}
                  </span>
                  <small>{selected.customer_mobile || selected.customer_email || "-"}</small>
                </div>
                <div className="row-actions">
                  <button className="tiny-button" onClick={() => void assign()} disabled={busy === "assign"}>
                    <UserRoundCheck size={15} />
                    {t("assignToMe", lang)}
                  </button>
                  {profile.role === "admin" && payload.agents.length > 0 ? (
                    <select
                      className="tiny-select"
                      value={selected.assigned_support_agent_id ?? ""}
                      onChange={(event) => {
                        if (event.target.value) void assign(event.target.value);
                      }}
                      disabled={busy === "assign"}
                    >
                      <option value="">{lang === "ar" ? "تعيين موظف دعم" : "Assign support agent"}</option>
                      {payload.agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {safeName(agent.full_name || agent.primary_email, lang)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button className="tiny-button" onClick={openComplaintDialog}>
                    {lang === "ar" ? "تحويل إلى شكوى" : "Convert to complaint"}
                  </button>
                  <button className="tiny-button danger" onClick={() => void closeConversation()} disabled={busy === "close"}>
                    <XCircle size={15} />
                    {t("closeConversation", lang)}
                  </button>
                </div>
              </div>

              <div className="conversation-label-editor">
                <Tag size={16} />
                {payload.labels.length === 0 ? (
                  <span className="muted">{lang === "ar" ? "أنشئ أول تصنيف لتنظيم المحادثات." : "Create the first label to organize conversations."}</span>
                ) : null}
                {payload.labels.map((label) => {
                  const checked = selectedLabels.some((item) => item.id === label.id);
                  return (
                    <label key={label.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy === "labels"}
                        onChange={(event) => {
                          const current = selectedLabels.map((item) => item.id);
                          const next = event.target.checked
                            ? [...new Set([...current, label.id])]
                            : current.filter((id) => id !== label.id);
                          void saveLabels(next);
                        }}
                      />
                      <span style={{ borderColor: label.color_hex }}>{lang === "ar" ? label.name_ar : label.name_en}</span>
                    </label>
                  );
                })}
              </div>

              <div className="message-list">
                {messages.map((item) => (
                  <div key={item.id} className={item.sender_type === "user" ? "message-bubble user" : "message-bubble agent"}>
                    <span>{senderLabel(item, lang)}</span>
                    <p>{item.body}</p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="reply-bar">
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendReply();
                    }
                  }}
                  placeholder={t("message", lang)}
                />
                <button className="primary-button icon-button" onClick={() => void sendReply()} disabled={busy === "reply" || !reply.trim()}>
                  <Send size={18} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-chat">
              <CheckCircle2 size={36} />
              <strong>{lang === "ar" ? "اختر محادثة" : "Choose a conversation"}</strong>
              <span>{lang === "ar" ? "سيظهر اسم العميل والتعيين والتصنيفات هنا." : "Customer, assignment, and labels appear here."}</span>
            </div>
          )}
        </article>
      </div>

      {complaintOpen && selected ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setComplaintOpen(false)}>
          <div className="modal-card support-complaint-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title-row">
              <div>
                <h2>{lang === "ar" ? "تحويل المحادثة إلى شكوى" : "Convert conversation to complaint"}</h2>
                <p>{safeName(selected.customer_name, lang)}</p>
              </div>
              <button className="icon-only" onClick={() => setComplaintOpen(false)} aria-label={lang === "ar" ? "إغلاق" : "Close"}>
                <X size={18} />
              </button>
            </div>
            <div className="edit-grid">
              <label>
                {lang === "ar" ? "نوع الشكوى" : "Complaint type"}
                <select
                  value={complaintDraft.type}
                  onChange={(event) => setComplaintDraft((current) => ({ ...current, type: event.target.value as ComplaintDraft["type"] }))}
                >
                  <option value="other">{lang === "ar" ? "شكوى عامة" : "General complaint"}</option>
                  <option value="merchant">{lang === "ar" ? "شكوى على متجر" : "Complaint about a store"}</option>
                  <option value="order">{lang === "ar" ? "شكوى مرتبطة بطلب" : "Order-related complaint"}</option>
                  <option value="wrong_price">{lang === "ar" ? "سعر غير صحيح" : "Incorrect price"}</option>
                </select>
              </label>
              <label>
                {lang === "ar" ? "الأولوية" : "Priority"}
                <select
                  value={complaintDraft.priority}
                  onChange={(event) => setComplaintDraft((current) => ({ ...current, priority: event.target.value as ComplaintDraft["priority"] }))}
                >
                  <option value="low">{lang === "ar" ? "منخفضة" : "Low"}</option>
                  <option value="normal">{lang === "ar" ? "عادية" : "Normal"}</option>
                  <option value="high">{lang === "ar" ? "مرتفعة" : "High"}</option>
                  <option value="urgent">{lang === "ar" ? "عاجلة" : "Urgent"}</option>
                </select>
              </label>
              <label>
                {lang === "ar" ? "المتجر المرتبط - اختياري" : "Related store - optional"}
                <select
                  value={complaintDraft.merchantId}
                  onChange={(event) => setComplaintDraft((current) => ({ ...current, merchantId: event.target.value }))}
                >
                  <option value="">{lang === "ar" ? "بدون متجر محدد" : "No specific store"}</option>
                  {payload.merchants.map((merchant) => (
                    <option value={merchant.id} key={merchant.id}>
                      {cleanText(merchant.store_name) || merchant.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {lang === "ar" ? "الطلب المرتبط - اختياري" : "Related order - optional"}
                <select
                  value={complaintDraft.orderId}
                  onChange={(event) => setComplaintDraft((current) => ({ ...current, orderId: event.target.value }))}
                >
                  <option value="">{lang === "ar" ? "بدون طلب محدد" : "No specific order"}</option>
                  {payload.orders.map((order) => (
                    <option value={order.id} key={order.id}>
                      {`${safeName(order.buyer_name, lang)} — ${cleanText(order.store_name) || (lang === "ar" ? "عدة متاجر" : "Multiple stores")} — ${lang === "ar" ? cleanText(order.status_ar) : cleanText(order.status_en)}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setComplaintOpen(false)}>
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button className="primary-button" onClick={() => void convertToComplaint()} disabled={busy === "complaint"}>
                {busy === "complaint" ? (lang === "ar" ? "جارٍ التحويل" : "Converting") : (lang === "ar" ? "إنشاء الشكوى" : "Create complaint")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
