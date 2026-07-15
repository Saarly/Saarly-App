"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";

type Audience = "all" | "buyers" | "merchants" | "staff" | "specific";
type DestinationOption = {
  id: string;
  deepLink: string;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
  custom?: boolean;
};

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

const destinationOptions: DestinationOption[] = [
  {
    id: "buyer_orders",
    deepLink: "saarly://buyer/orders",
    ar: "طلبات العميل",
    en: "Buyer orders",
    hintAr: "يفتح صفحة طلبات العميل ومتابعة حالة الطلبات.",
    hintEn: "Opens the buyer orders and request status screen."
  },
  {
    id: "buyer_support",
    deepLink: "saarly://buyer/support",
    ar: "دعم العميل",
    en: "Buyer support",
    hintAr: "يفتح محادثة الدعم الخاصة بالعميل.",
    hintEn: "Opens the buyer support chat."
  },
  {
    id: "buyer_favorites",
    deepLink: "saarly://buyer/favorites",
    ar: "مفضلة العميل",
    en: "Buyer favorites",
    hintAr: "يفتح منتجات وتنبيهات المفضلة للعميل.",
    hintEn: "Opens buyer favorites and price alerts."
  },
  {
    id: "buyer_referrals",
    deepLink: "saarly://buyer/referrals",
    ar: "دعوة الأصدقاء",
    en: "Invite friends",
    hintAr: "يفتح شاشة الإحالات والمكافآت للعميل.",
    hintEn: "Opens referrals and rewards for buyers."
  },
  {
    id: "merchant_requests",
    deepLink: "saarly://merchant/requests",
    ar: "طلبات المتجر",
    en: "Store requests",
    hintAr: "يفتح طلبات العملاء الواردة للمتجر.",
    hintEn: "Opens incoming customer requests for the store."
  },
  {
    id: "merchant_rfqs",
    deepLink: "saarly://merchant/rfqs",
    ar: "طلبات التسعير",
    en: "RFQs",
    hintAr: "يفتح طلبات التسعير اليدوية عند المتجر.",
    hintEn: "Opens manual RFQs for the store."
  },
  {
    id: "merchant_products",
    deepLink: "saarly://merchant/products",
    ar: "منتجات المتجر",
    en: "Store products",
    hintAr: "يفتح إدارة المنتجات والأسعار والصور.",
    hintEn: "Opens product, price, and image management."
  },
  {
    id: "merchant_reports",
    deepLink: "saarly://merchant/reports",
    ar: "تقارير المتجر",
    en: "Store reports",
    hintAr: "يفتح المبيعات والتقييمات وملخص الأداء.",
    hintEn: "Opens sales, ratings, and performance reports."
  },
  {
    id: "merchant_billing",
    deepLink: "saarly://merchant/billing",
    ar: "اشتراكات ومدفوعات المتجر",
    en: "Store billing",
    hintAr: "يفتح حالة الاشتراك والمستحقات والمدفوعات.",
    hintEn: "Opens subscriptions, dues, and payments."
  },
  {
    id: "merchant_support",
    deepLink: "saarly://merchant/support",
    ar: "دعم المتجر",
    en: "Store support",
    hintAr: "يفتح محادثة الدعم الخاصة بالمتجر.",
    hintEn: "Opens the store support chat."
  },
  {
    id: "merchant_settings",
    deepLink: "saarly://merchant/settings",
    ar: "إعدادات المتجر",
    en: "Store settings",
    hintAr: "يفتح إعدادات الحساب والسياسات.",
    hintEn: "Opens account settings and policies."
  },
  {
    id: "custom",
    deepLink: "",
    ar: "وجهة مخصصة",
    en: "Custom destination",
    hintAr: "للمطور فقط لو محتاج رابط داخلي غير موجود في الاختيارات.",
    hintEn: "For a developer-only internal destination not listed above.",
    custom: true
  }
];

export function NotificationBroadcast({ lang }: { lang: Lang }) {
  const [audience, setAudience] = useState<Audience>("all");
  const [destinationId, setDestinationId] = useState("buyer_orders");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [deepLink, setDeepLink] = useState("saarly://buyer/orders");
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
  const selectedDestination = useMemo(
    () => destinationOptions.find((option) => option.id === destinationId) ?? destinationOptions[0],
    [destinationId]
  );

  function chooseDestination(option: DestinationOption) {
    setDestinationId(option.id);
    if (!option.custom) {
      setDeepLink(option.deepLink);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    const { data, error: usersError } = await supabase
      .from("admin_users_readable")
      .select("id, full_name, mobile, primary_email, role, role_ar")
      .order("created_at", { ascending: false })
      .limit(500);
    setUsers((data ?? []) as UserOption[]);
    setError(usersError ? humanizeAdminError(usersError.message, lang) : null);
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
      setError(humanizeAdminError(sendError, lang));
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

      {error ? <div className="alert">{humanizeAdminError(error, lang)}</div> : null}
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

          <div className="notification-destination-panel">
            <div>
              <strong>{lang === "ar" ? "يفتح فين داخل التطبيق؟" : "Open where in the app?"}</strong>
              <p className="muted">
                {lang === "ar"
                  ? "اختار المكان اللي المستخدم يروح له لما يضغط على الإشعار. مش محتاج تكتب أي لينك بنفسك."
                  : "Choose where the user goes after tapping the notification. No manual link is needed."}
              </p>
            </div>
            <div className="destination-grid">
              {destinationOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={destinationId === option.id ? "destination-card active" : "destination-card"}
                  onClick={() => chooseDestination(option)}
                >
                  <strong>{lang === "ar" ? option.ar : option.en}</strong>
                  <span>{lang === "ar" ? option.hintAr : option.hintEn}</span>
                </button>
              ))}
            </div>
            {selectedDestination.custom ? (
              <label className="destination-custom-field">
                {lang === "ar" ? "الرابط الداخلي المخصص" : "Custom internal link"}
                <input dir="ltr" value={deepLink} onChange={(event) => setDeepLink(event.target.value)} required />
              </label>
            ) : (
              <p className="selected-destination-note">
                {lang === "ar" ? "الوجهة المختارة:" : "Selected destination:"}{" "}
                <span dir="ltr">{deepLink}</span>
              </p>
            )}
          </div>

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
