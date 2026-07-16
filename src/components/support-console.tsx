"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, Send, UserRoundCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { friendlyStatus } from "@/lib/admin/messages";

type Conversation = {
  id: string;
  user_id: string;
  title: string | null;
  status: string;
  assigned_support_agent_id: string | null;
  last_message_at: string | null;
  created_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_user_id: string | null;
  body: string;
  created_at: string;
};

function senderLabel(senderType: string, lang: Lang) {
  if (senderType === "user") return lang === "ar" ? "العميل" : "Customer";
  if (senderType === "bot") return lang === "ar" ? "البوت" : "Bot";
  if (senderType === "support_agent") return lang === "ar" ? "خدمة العملاء" : "Support";
  if (senderType === "system") return lang === "ar" ? "النظام" : "System";
  return senderType;
}

function supportStatusLabel(status: string, lang: Lang) {
  if (status === "transferred") return lang === "ar" ? "محولة لخدمة العملاء" : "Transferred to support";
  if (status === "bot") return lang === "ar" ? "مع البوت" : "With bot";
  return friendlyStatus(status, lang);
}

export function SupportConsole({ lang }: { lang: Lang }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadConversations() {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("chat_conversations")
      .select("id, user_id, title, status, assigned_support_agent_id, last_message_at, created_at")
      .in("status", ["transferred", "bot"])
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(60);

    setConversations((data ?? []) as Conversation[]);
    setError(loadError?.message ?? null);
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    const { data, error: loadError } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, sender_type, sender_user_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    setMessages((data ?? []) as Message[]);
    setError(loadError?.message ?? null);
    await supabase.rpc("mark_support_conversation_read", { p_conversation_id: conversationId });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  }

  async function assignToMe() {
    if (!selected) return;
    const { error: rpcError } = await supabase.rpc("assign_support_conversation", {
      p_conversation_id: selected.id,
      p_agent_id: null
    });
    setError(rpcError?.message ?? null);
    await loadConversations();
  }

  async function closeConversation() {
    if (!selected) return;
    const { error: rpcError } = await supabase.rpc("close_support_conversation", {
      p_conversation_id: selected.id,
      p_reason: "admin_console_closed"
    });
    setError(rpcError?.message ?? null);
    setSelected(null);
    setMessages([]);
    await loadConversations();
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    const body = reply.trim();
    setReply("");
    const { error: rpcError } = await supabase.rpc("send_support_message", {
      p_conversation_id: selected.id,
      p_body: body
    });
    setError(rpcError?.message ?? null);
    await loadMessages(selected.id);
    await loadConversations();
  }

  useEffect(() => {
    void loadConversations();

    const channel = supabase
      .channel("admin-support-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        () => void loadConversations()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    void loadMessages(selected.id);

    const channel = supabase
      .channel(`admin-support-messages-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${selected.id}`
        },
        () => void loadMessages(selected.id)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected?.id]);

  return (
    <section className="content-panel support-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{t("supportQueue", lang)}</span>
          <h1>{lang === "ar" ? "خدمة العملاء" : "Support"}</h1>
          <p>
            {lang === "ar"
              ? "استلام المحادثات المحولة من البوت والرد عليها مباشرة داخل التطبيق."
              : "Pick up bot transfers and reply directly into the app."}
          </p>
        </div>
        <button className="soft-button" onClick={loadConversations}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="support-grid">
        <aside className="queue-card">
          <h2>{lang === "ar" ? "المحادثات" : "Conversations"}</h2>
          {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
          {!loading && conversations.length === 0 ? <div className="empty-state">{t("noRows", lang)}</div> : null}
          <div className="queue-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={selected?.id === conversation.id ? "queue-item active" : "queue-item"}
                onClick={() => setSelected(conversation)}
              >
                <strong>{conversation.title || (lang === "ar" ? "محادثة دعم" : "Support chat")}</strong>
                <span>{supportStatusLabel(conversation.status, lang)}</span>
              </button>
            ))}
          </div>
        </aside>

        <article className="chat-card">
          {selected ? (
            <>
              <div className="chat-head">
                <div>
                  <strong>{selected.title || (lang === "ar" ? "محادثة دعم" : "Support chat")}</strong>
                  <span>{supportStatusLabel(selected.status, lang)}</span>
                </div>
                <div className="row-actions">
                  <button className="tiny-button" onClick={assignToMe}>
                    <UserRoundCheck size={15} />
                    {t("assignToMe", lang)}
                  </button>
                  <button className="tiny-button danger" onClick={closeConversation}>
                    <XCircle size={15} />
                    {t("closeConversation", lang)}
                  </button>
                </div>
              </div>
              <div className="message-list">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.sender_type === "user" ? "message-bubble user" : "message-bubble agent"}
                  >
                    <span>{senderLabel(message.sender_type, lang)}</span>
                    <p>{message.body}</p>
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
                <button className="primary-button icon-button" onClick={sendReply}>
                  <Send size={18} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-chat">
              <CheckCircle2 size={36} />
              <strong>{lang === "ar" ? "اختار محادثة من الطابور" : "Choose a conversation"}</strong>
              <span>{lang === "ar" ? "الرد يصل للعميل عبر Realtime." : "Replies arrive through Realtime."}</span>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
