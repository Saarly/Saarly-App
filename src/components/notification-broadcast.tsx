"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";

type Audience = "all" | "buyers" | "merchants" | "specific";
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
  role_en?: string | null;
};

type RecentNotification = {
  id: string;
  type: string;
  title_ar: string;
  title_en?: string | null;
  body_ar: string;
  body_en?: string | null;
  push_status: string | null;
  push_error: string | null;
  created_at: string;
};
type LocationRow = {
  country_ar: string | null;
  country_en?: string | null;
  governorate_ar: string | null;
  governorate_en?: string | null;
  name_ar: string | null;
  name_en?: string | null;
  is_active?: boolean | null;
};

const DEFAULT_COUNTRY_AR = "مصر";
const COUNTRY_MARKER = "__country__";

const audiences: Array<{
  id: Audience;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
}> = [
  {
    id: "all",
    ar: "كل المستخدمين",
    en: "All users",
    hintAr: "العملاء والمتاجر",
    hintEn: "Buyers and merchants",
  },
  {
    id: "buyers",
    ar: "العملاء فقط",
    en: "Buyers only",
    hintAr: "حسابات العملاء",
    hintEn: "Buyer accounts",
  },
  {
    id: "merchants",
    ar: "المتاجر فقط",
    en: "Stores only",
    hintAr: "حسابات المتاجر",
    hintEn: "Merchant accounts",
  },
  {
    id: "specific",
    ar: "مستخدمون محددون",
    en: "Specific users",
    hintAr: "اختيار يدوي",
    hintEn: "Manual selection",
  },
];

const destinationOptions: DestinationOption[] = [
  {
    id: "buyer_orders",
    deepLink: "saarly://buyer/orders",
    ar: "طلبات العميل",
    en: "Buyer orders",
    hintAr: "يفتح شاشة طلبات العميل وحالة كل طلب.",
    hintEn: "Opens the buyer orders and request status screen.",
  },
  {
    id: "buyer_support",
    deepLink: "saarly://buyer/support",
    ar: "دعم العميل",
    en: "Buyer support",
    hintAr: "يفتح محادثة دعم العميل.",
    hintEn: "Opens the buyer support chat.",
  },
  {
    id: "buyer_favorites",
    deepLink: "saarly://buyer/favorites",
    ar: "مفضلة العميل",
    en: "Buyer favorites",
    hintAr: "يفتح المفضلة وتنبيهات الأسعار.",
    hintEn: "Opens buyer favorites and price alerts.",
  },
  {
    id: "buyer_referrals",
    deepLink: "saarly://buyer/referrals",
    ar: "دعوة الأصدقاء",
    en: "Invite friends",
    hintAr: "يفتح الدعوات والمكافآت للعملاء.",
    hintEn: "Opens referrals and rewards for buyers.",
  },
  {
    id: "merchant_requests",
    deepLink: "saarly://merchant/requests",
    ar: "طلبات المتجر",
    en: "Store requests",
    hintAr: "يفتح طلبات العملاء الواردة للمتجر.",
    hintEn: "Opens incoming customer requests for the store.",
  },
  {
    id: "merchant_rfqs",
    deepLink: "saarly://merchant/rfqs",
    ar: "طلبات التسعير",
    en: "Quote requests",
    hintAr: "يفتح طلبات التسعير اليدوية للمتجر.",
    hintEn: "Opens manual quote requests for the store.",
  },
  {
    id: "merchant_products",
    deepLink: "saarly://merchant/products",
    ar: "منتجات المتجر",
    en: "Store products",
    hintAr: "يفتح إدارة المنتجات والأسعار والصور.",
    hintEn: "Opens product, price, and image management.",
  },
  {
    id: "merchant_reports",
    deepLink: "saarly://merchant/reports",
    ar: "تقارير المتجر",
    en: "Store reports",
    hintAr: "يفتح تقارير المبيعات والتقييمات والأداء.",
    hintEn: "Opens sales, ratings, and performance reports.",
  },
  {
    id: "merchant_billing",
    deepLink: "saarly://merchant/billing",
    ar: "اشتراكات ومدفوعات المتجر",
    en: "Store billing",
    hintAr: "يفتح الاشتراكات والمستحقات والمدفوعات.",
    hintEn: "Opens subscriptions, dues, and payments.",
  },
  {
    id: "merchant_support",
    deepLink: "saarly://merchant/support",
    ar: "دعم المتجر",
    en: "Store support",
    hintAr: "يفتح محادثة دعم المتجر.",
    hintEn: "Opens the store support chat.",
  },
  {
    id: "merchant_settings",
    deepLink: "saarly://merchant/settings",
    ar: "إعدادات المتجر",
    en: "Store settings",
    hintAr: "يفتح إعدادات الحساب والسياسات.",
    hintEn: "Opens account settings and policies.",
  },
  {
    id: "custom",
    deepLink: "",
    ar: "وجهة مخصصة",
    en: "Custom destination",
    hintAr: "لوجهة داخلية غير موجودة في القائمة.",
    hintEn: "For an internal destination not listed above.",
    custom: true,
  },
];

function friendlyPushResult(status: string | null, error: string | null, lang: Lang) {
  const raw = `${status ?? "pending"} ${error ?? ""}`.toLowerCase();
  if (raw.includes("no active fcm") || raw.includes("skipped")) {
    return lang === "ar" ? "حُفظ داخل التطبيق، ولا يوجد جهاز نشط لاستقبال التنبيه حالياً." : "Saved in the app; no active device is currently available for notification delivery.";
  }
  if (raw.includes("404") || raw.includes("failed") || raw.includes("error")) {
    return lang === "ar" ? "حُفظ داخل التطبيق، وتعذر إرسال التنبيه للهاتف." : "Saved in the app, but phone notification delivery was unsuccessful.";
  }
  if (raw.includes("sent") || raw.includes("success")) {
    return lang === "ar" ? "تم الإرسال داخل التطبيق وإلى الهاتف." : "Delivered in the app and to the phone.";
  }
  return lang === "ar" ? "قيد تجهيز الإرسال." : "Delivery is being processed.";
}

export function NotificationBroadcast({ lang }: { lang: Lang }) {
  const [audience, setAudience] = useState<Audience>("all");
  const [destinationId, setDestinationId] = useState("buyer_orders");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [deepLink, setDeepLink] = useState("saarly://buyer/orders");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [locationRows, setLocationRows] = useState<LocationRow[]>([]);
  const [targetCountry, setTargetCountry] = useState("");
  const [targetGovernorate, setTargetGovernorate] = useState("");
  const [targetCity, setTargetCity] = useState("");
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
        [
          user.full_name,
          user.mobile,
          user.primary_email,
          user.role_ar,
          user.role,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      )
      .slice(0, 80);
  }, [userQuery, users]);
  const selectedDestination = useMemo(
    () =>
      destinationOptions.find((option) => option.id === destinationId) ??
      destinationOptions[0],
    [destinationId],
  );
  const countries = useMemo(() => {
    return Array.from(
      new Set(
        locationRows
          .map((row) => String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [locationRows]);
  const governorates = useMemo(() => {
    return Array.from(
      new Set(
        locationRows
          .filter(
            (row) => String(row.governorate_ar ?? "").trim() !== COUNTRY_MARKER,
          )
          .filter(
            (row) =>
              !targetCountry ||
              String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() ===
                targetCountry,
          )
          .map((row) => String(row.governorate_ar ?? "").trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [locationRows, targetCountry]);
  const cities = useMemo(() => {
    return Array.from(
      new Set(
        locationRows
          .filter((row) => row.is_active !== false)
          .filter(
            (row) => String(row.governorate_ar ?? "").trim() !== COUNTRY_MARKER,
          )
          .filter(
            (row) =>
              !targetCountry ||
              String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() ===
                targetCountry,
          )
          .filter(
            (row) =>
              !targetGovernorate ||
              String(row.governorate_ar ?? "").trim() === targetGovernorate,
          )
          .map((row) => String(row.name_ar ?? "").trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [locationRows, targetCountry, targetGovernorate]);

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
      .select("id, full_name, mobile, primary_email, role, role_ar, role_en")
      .order("created_at", { ascending: false })
      .limit(500);
    setUsers((data ?? []) as UserOption[]);
    setError(usersError ? humanizeAdminError(usersError.message, lang) : null);
    setLoadingUsers(false);
  }

  async function loadRecent() {
    const { data } = await supabase
      .from("notifications")
      .select(
        "id, type, title_ar, title_en, body_ar, body_en, push_status, push_error, created_at",
      )
      .eq("type", "admin_broadcast")
      .order("created_at", { ascending: false })
      .limit(12);
    setRecent((data ?? []) as RecentNotification[]);
  }

  async function loadLocations() {
    const { data } = await supabase
      .from("cities")
      .select("country_ar,country_en,governorate_ar,governorate_en,name_ar,name_en,is_active")
      .order("country_ar", { ascending: true })
      .order("governorate_ar", { ascending: true })
      .order("name_ar", { ascending: true })
      .limit(1000);
    setLocationRows((data ?? []) as LocationRow[]);
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
          target_country_ar: targetCountry || null,
          target_governorate_ar: targetGovernorate || null,
          target_city_ar: targetCity || null,
          type: "admin_broadcast",
        },
      });

      setMessage(
        lang === "ar"
          ? `تم إرسال ${result?.inserted_count ?? 0} إشعار. بانتظار استجابة فايربيس.`
          : `Sent ${result?.inserted_count ?? 0} notifications. Delivery is being processed.`,
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
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  useEffect(() => {
    void loadUsers();
    void loadRecent();
    void loadLocations();
  }, []);

  return (
    <section className="content-panel broadcast-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">
            {lang === "ar"
              ? "داخل التطبيق وعلى جهاز المستخدم"
              : "In the app and on the user’s device"}
          </span>
          <h1>{lang === "ar" ? "إرسال إشعار" : "Send notification"}</h1>
          <p>
            {lang === "ar"
              ? "الإشعار يظهر داخل التطبيق، ويصل إلى جهاز المستخدم عندما تكون الإشعارات مفعلة."
              : "The notification appears in the app and reaches the user’s device when notifications are enabled."}
          </p>
        </div>
        <button className="soft-button" onClick={() => void loadRecent()}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? (
        <div className="alert">{humanizeAdminError(error, lang)}</div>
      ) : null}
      {message ? (
        <div className="success-alert">
          <CheckCircle2 size={18} /> {message}
        </div>
      ) : null}

      <div className="broadcast-grid">
        <form className="broadcast-form" onSubmit={sendNotification}>
          <div className="audience-grid">
            {audiences.map((option) => (
              <button
                type="button"
                key={option.id}
                className={
                  audience === option.id
                    ? "audience-card active"
                    : "audience-card"
                }
                onClick={() => setAudience(option.id)}
              >
                <strong>{lang === "ar" ? option.ar : option.en}</strong>
                <span>{lang === "ar" ? option.hintAr : option.hintEn}</span>
              </button>
            ))}
          </div>

          <div className="notification-destination-panel">
            <div>
              <strong>
                {lang === "ar" ? "استهداف الموقع" : "Location targeting"}
              </strong>
              <p className="muted">
                {lang === "ar"
                  ? "اترك الحقول فارغة لكل المناطق، أو اختر دولة ومحافظة ومدينة محددة."
                  : "Leave fields empty for all locations, or pick a country, governorate, and city."}
              </p>
            </div>
            <div className="form-split">
              <label>
                {lang === "ar" ? "الدولة" : "Country"}
                <select
                  value={targetCountry}
                  onChange={(event) => {
                    setTargetCountry(event.target.value);
                    setTargetGovernorate("");
                    setTargetCity("");
                  }}
                >
                  <option value="">
                    {lang === "ar" ? "كل الدول" : "All countries"}
                  </option>
                  {countries.map((country) => (
                    <option value={country} key={country}>
                      {lang === "ar" ? country : locationRows.find((row) => String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() === country)?.country_en || country}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {lang === "ar" ? "المحافظة" : "Governorate"}
                <select
                  value={targetGovernorate}
                  onChange={(event) => {
                    setTargetGovernorate(event.target.value);
                    setTargetCity("");
                  }}
                >
                  <option value="">
                    {lang === "ar" ? "كل المحافظات" : "All governorates"}
                  </option>
                  {governorates.map((governorate) => (
                    <option value={governorate} key={governorate}>
                      {lang === "ar" ? governorate : locationRows.find((row) => String(row.governorate_ar ?? "").trim() === governorate && (!targetCountry || String(row.country_ar ?? DEFAULT_COUNTRY_AR).trim() === targetCountry))?.governorate_en || governorate}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {lang === "ar" ? "المدينة" : "City"}
              <select
                value={targetCity}
                onChange={(event) => setTargetCity(event.target.value)}
              >
                <option value="">
                  {lang === "ar" ? "كل المدن" : "All cities"}
                </option>
                {cities.map((city) => (
                  <option value={city} key={city}>
                    {lang === "ar" ? city : locationRows.find((row) => String(row.name_ar ?? "").trim() === city && (!targetGovernorate || String(row.governorate_ar ?? "").trim() === targetGovernorate))?.name_en || city}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {audience === "specific" ? (
            <div className="specific-users-panel">
              <label className="search-box">
                <Search size={18} />
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder={
                    lang === "ar"
                      ? "ابحث بالاسم أو رقم الهاتف أو البريد"
                      : "Search name, mobile, or email"
                  }
                />
              </label>
              {loadingUsers ? (
                <div className="empty-state">{t("loading", lang)}</div>
              ) : null}
              <div className="user-picker-list">
                {filteredUsers.map((user) => (
                  <label className="user-picker-row" key={user.id}>
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                    />
                    <span>
                      <strong>
                        {user.full_name || user.primary_email || user.mobile}
                      </strong>
                      <small>
                        {(lang === "ar" ? user.role_ar : user.role_en) || user.role} |{" "}
                        {user.mobile || user.primary_email || "-"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted">
                {lang === "ar"
                  ? `المحدد: ${selectedUsers.length}` : `Selected: ${selectedUsers.length}`}
              </p>
            </div>
          ) : null}

          <div className="form-split">
            <label>
              {lang === "ar" ? "العنوان بالعربي" : "Arabic title"}
              <input
                value={titleAr}
                onChange={(event) => setTitleAr(event.target.value)}
                required
                maxLength={90}
              />
            </label>
            <label>
              {lang === "ar" ? "العنوان بالإنجليزي" : "English title"}
              <input
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
                maxLength={90}
              />
            </label>
          </div>

          <div className="form-split">
            <label>
              {lang === "ar" ? "النص بالعربي" : "Arabic body"}
              <textarea
                value={bodyAr}
                onChange={(event) => setBodyAr(event.target.value)}
                required
                maxLength={240}
              />
            </label>
            <label>
              {lang === "ar" ? "النص بالإنجليزي" : "English body"}
              <textarea
                value={bodyEn}
                onChange={(event) => setBodyEn(event.target.value)}
                maxLength={240}
              />
            </label>
          </div>

          <div className="notification-destination-panel">
            <div>
              <strong>
                {lang === "ar"
                  ? "يفتح أي صفحة في التطبيق؟"
                  : "Open where in the app?"}
              </strong>
              <p className="muted">
                {lang === "ar"
                  ? "اختر الصفحة التي يفتحها المستخدم بعد الضغط على الإشعار. لا تحتاج لكتابة رابط يدوي."
                  : "Choose where the user goes after tapping the notification. No manual link is needed."}
              </p>
            </div>
            <div className="destination-grid">
              {destinationOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    destinationId === option.id
                      ? "destination-card active"
                      : "destination-card"
                  }
                  onClick={() => chooseDestination(option)}
                >
                  <strong>{lang === "ar" ? option.ar : option.en}</strong>
                  <span>{lang === "ar" ? option.hintAr : option.hintEn}</span>
                </button>
              ))}
            </div>
            {selectedDestination.custom ? (
              <label className="destination-custom-field">
                {lang === "ar"
                  ? "الرابط الداخلي المخصص"
                  : "Custom internal link"}
                <input
                  dir="ltr"
                  value={deepLink}
                  onChange={(event) => setDeepLink(event.target.value)}
                  required
                />
              </label>
            ) : (
              <p className="selected-destination-note">
                {lang === "ar" ? "الوجهة المحددة:" : "Selected destination:"}{" "}
                <span dir="ltr">{deepLink}</span>
              </p>
            )}
          </div>

          <button
            className="primary-button broadcast-submit"
            disabled={sending}
          >
            <Send size={18} />
            {sending
              ? t("loading", lang)
              : lang === "ar"
                ? "إرسال الإشعار"
                : "Send notification"}
          </button>
        </form>

        <aside className="recent-notifications-card">
          <div className="recent-head">
            <BellRing size={20} />
            <h2>
              {lang === "ar"
                ? "آخر إشعارات الأدمن"
                : "Recent admin notifications"}
            </h2>
          </div>
          <div className="mini-list">
            {recent.length === 0 ? (
              <p className="muted">{t("noRows", lang)}</p>
            ) : null}
            {recent.map((notification) => (
              <div key={notification.id}>
                <strong>{lang === "ar" ? notification.title_ar || "إشعار سابق" : notification.title_en || "Previous notification"}</strong>
                <span>{friendlyPushResult(notification.push_status, notification.push_error, lang)}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
