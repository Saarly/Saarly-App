"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";

type Audience = "all" | "buyers" | "merchants" | "staff" | "specific";

type UserOption = {
  id: string;
  full_name: string | null;
  mobile: string | null;
  primary_email: string | null;
  role: string;
  role_ar: string | null;
};

type RecentNotification = {
  id: string;
  type: string;
  title_ar: string;
  body_ar: string;
  push_status: string | null;
  push_error: string | null;
  created_at: string;
};

const audiences: Array<{ id: Audience; ar: string; en: string; hintAr: string; hintEn: string }> = [
  { id: "all", ar: "كل المستخدمين", en: "All users", hintAr: "عملاء ومتاجر ودعم", hintEn: "Buyers, stores, and staff" },
  { id: "buyers", ar: "العملاء فقط", en: "Buyers only", hintAr: "حسابات العملاء", hintEn: "Buyer accounts" },
  { id: "merchants", ar: "المتاجر فقط", en: "Stores only", hintAr: "أصحاب المتاجر", hintEn: "Merchant accounts" },
  { id: "staff", ar: "الفريق فقط", en: "Staff only", hintAr: "أدمن ودعم", hintEn: "Admins and support" },
  { id: "specific", ar: "مستخدم محدد", en: "Specific users", hintAr: "اختيار يدوي", hintEn: "Manual selection" }
];

export function NotificationBroadcast({ lang }: { lang: Lang }) {
  const [audience, setAudience] = useState<Audience>("all");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [deepLink, setDeepLink] = useState("saarly://buyer/notifications");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [recent, setRecent] = useState<RecentNotification[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const needle = userQuery.trim().toLowerCase();
    if (!needle) return users.slice(0, 50);
    return users
      .filter((user) =>
        [user.full_name, user.mobile, user.primary_email, user.role_ar, user.role]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      )
      .slice(0, 80);
  }, [userQuery, users]);

  async function loadUsers() {
    setLoadingUsers(true);
    const { data, error: usersError } = await supabase
      .from("admin_users_readable")
      .select("id, full_name, mobile, primary_email, role, role_ar")
      .order("created_at", { ascending: false })
      .limit(500);
    setUsers((data ?? []) as UserOption[]);
    setError(usersError?.message ?? null);
    setLoadingUsers(false);
  }

  async function loadRecent() {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title_ar, body_ar, push_status, push_error, created_at")
      .eq("type", "admin_broadcast")
      .order("created_at", { ascending: false })
      .limit(12);
    setRecent((data ?? []) as RecentNotification[]);
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
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      data?: { inserted_count?: number; requested_recipients?: number };
    };
    if (!response.ok) throw new Error(payload.error ?? "send_failed");
    return payload.data;
  }

  async function sendNotification(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await postAdminAction({
        action: "send_admin_notification",
        payload: {
          audience,
          user_ids: selectedUsers,
          title_ar: titleAr,
          title_en: titleEn || titleAr,
          body_ar: bodyAr,
          body_en: bodyEn || bodyAr,
          deep_link: deepLink,
          type: "admin_broadcast"
        }
      });

      setMessage(
        lang === "ar"
          ? `تم إنشاء ${result?.inserted_count ?? 0} إشعار. Firebase هيرسلها خلال دقيقة تقريبًا.`
          : `${result?.inserted_count ?? 0} notifications queued. Firebase should send them in about a minute.`
      );
      setTitleAr("");
      setTitleEn("");
      setBodyAr("");
      setBodyEn("");
      setSelectedUsers([]);
      await loadRecent();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  }

  function toggleUser(userId: string) {
    setSelectedUsers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  useEffect(() => {
    void loadUsers();
    void loadRecent();
  }, []);

  return (
    <section className="content-panel broadcast-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "Firebase + جرس التطبيق" : "Firebase + in-app bell"}</span>
          <h1>{lang === "ar" ? "إرسال إشعار" : "Send notification"}</h1>
          <p>
            {lang === "ar"
              ? "الإشعار يظهر داخل التطبيق، ولو جهاز المستخدم مسجل وموافق على الإشعارات هيوصل كـ Push."
              : "The notification appears in-app, and reaches Push when the user's device is registered and permissions are enabled."}
          </p>
        </div>
        <button className="soft-button" onClick={() => void loadRecent()}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error === "service_role_key_missing" ? t("serviceKeyMissing", lang) : error}</div> : null}
      {message ? <div className="success-alert"><CheckCircle2 size={18} /> {message}</div> : null}

      <div className="broadcast-grid">
        <form className="broadcast-form" onSubmit={sendNotification}>
          <div className="audience-grid">
            {audiences.map((option) => (
              <button
                type="button"
                key={option.id}
                className={audience === option.id ? "audience-card active" : "audience-card"}
                onClick={() => setAudience(option.id)}
              >
                <strong>{lang === "ar" ? option.ar : option.en}</strong>
                <span>{lang === "ar" ? option.hintAr : option.hintEn}</span>
              </button>
            ))}
          </div>

          {audience === "specific" ? (
            <div className="specific-users-panel">
              <label className="search-box">
                <Search size={18} />
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder={lang === "ar" ? "ابحث بالاسم أو الموبايل أو الإيميل" : "Search name, mobile, or email"}
                />
              </label>
              {loadingUsers ? <div className="empty-state">{t("loading", lang)}</div> : null}
              <div className="user-picker-list">
                {filteredUsers.map((user) => (
                  <label className="user-picker-row" key={user.id}>
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                    />
                    <span>
                      <strong>{user.full_name || user.primary_email || user.mobile}</strong>
                      <small>{user.role_ar || user.role} | {user.mobile || user.primary_email || "-"}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted">{lang === "ar" ? `مختار: ${selectedUsers.length}` : `Selected: ${selectedUsers.length}`}</p>
            </div>
          ) : null}

          <div className="form-split">
            <label>
              {lang === "ar" ? "عنوان الإشعار بالعربي" : "Arabic title"}
              <input value={titleAr} onChange={(event) => setTitleAr(event.target.value)} required maxLength={90} />
            </label>
            <label>
              {lang === "ar" ? "عنوان الإشعار بالإنجليزي" : "English title"}
              <input value={titleEn} onChange={(event) => setTitleEn(event.target.value)} maxLength={90} />
            </label>
          </div>

          <div className="form-split">
            <label>
              {lang === "ar" ? "نص الإشعار بالعربي" : "Arabic body"}
              <textarea value={bodyAr} onChange={(event) => setBodyAr(event.target.value)} required maxLength={240} />
            </label>
            <label>
              {lang === "ar" ? "نص الإشعار بالإنجليزي" : "English body"}
              <textarea value={bodyEn} onChange={(event) => setBodyEn(event.target.value)} maxLength={240} />
            </label>
          </div>

          <label>
            {lang === "ar" ? "يفتح فين داخل التطبيق؟" : "Open where in the app?"}
            <input dir="ltr" value={deepLink} onChange={(event) => setDeepLink(event.target.value)} required />
          </label>

          <button className="primary-button broadcast-submit" disabled={sending}>
            <Send size={18} />
            {sending ? t("loading", lang) : lang === "ar" ? "إرسال الإشعار" : "Send notification"}
          </button>
        </form>

        <aside className="recent-notifications-card">
          <div className="recent-head">
            <BellRing size={20} />
            <h2>{lang === "ar" ? "آخر إشعارات الأدمن" : "Recent admin notifications"}</h2>
          </div>
          <div className="mini-list">
            {recent.length === 0 ? <p className="muted">{t("noRows", lang)}</p> : null}
            {recent.map((notification) => (
              <div key={notification.id}>
                <strong>{notification.title_ar}</strong>
                <span>
                  {notification.push_status || "pending"}
                  {notification.push_error ? ` | ${notification.push_error}` : ""}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

