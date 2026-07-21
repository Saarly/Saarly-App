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
type LocationRow = {
  country_ar: string | null;
  governorate_ar: string | null;
  name_ar: string | null;
  is_active?: boolean | null;
};

const DEFAULT_COUNTRY_AR = "���";
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
    ar: "�� ����������",
    en: "All users",
    hintAr: "����� ������ ����",
    hintEn: "Buyers, stores, and staff",
  },
  {
    id: "buyers",
    ar: "������� ���",
    en: "Buyers only",
    hintAr: "������ �������",
    hintEn: "Buyer accounts",
  },
  {
    id: "merchants",
    ar: "������� ���",
    en: "Stores only",
    hintAr: "����� �������",
    hintEn: "Merchant accounts",
  },
  {
    id: "staff",
    ar: "������ ���",
    en: "Staff only",
    hintAr: "���� ����",
    hintEn: "Admins and support",
  },
  {
    id: "specific",
    ar: "������ ����",
    en: "Specific users",
    hintAr: "������ ����",
    hintEn: "Manual selection",
  },
];

const destinationOptions: DestinationOption[] = [
  {
    id: "buyer_orders",
    deepLink: "saarly://buyer/orders",
    ar: "����� ������",
    en: "Buyer orders",
    hintAr: "���� ���� ����� ������ ������� ���� �������.",
    hintEn: "Opens the buyer orders and request status screen.",
  },
  {
    id: "buyer_support",
    deepLink: "saarly://buyer/support",
    ar: "��� ������",
    en: "Buyer support",
    hintAr: "���� ������ ����� ������ �������.",
    hintEn: "Opens the buyer support chat.",
  },
  {
    id: "buyer_favorites",
    deepLink: "saarly://buyer/favorites",
    ar: "����� ������",
    en: "Buyer favorites",
    hintAr: "���� ������ �������� ������� ������.",
    hintEn: "Opens buyer favorites and price alerts.",
  },
  {
    id: "buyer_referrals",
    deepLink: "saarly://buyer/referrals",
    ar: "���� ��������",
    en: "Invite friends",
    hintAr: "���� ���� �������� ��������� ������.",
    hintEn: "Opens referrals and rewards for buyers.",
  },
  {
    id: "merchant_requests",
    deepLink: "saarly://merchant/requests",
    ar: "����� ������",
    en: "Store requests",
    hintAr: "���� ����� ������� ������� ������.",
    hintEn: "Opens incoming customer requests for the store.",
  },
  {
    id: "merchant_rfqs",
    deepLink: "saarly://merchant/rfqs",
    ar: "����� �������",
    en: "RFQs",
    hintAr: "���� ����� ������� ������� ��� ������.",
    hintEn: "Opens manual RFQs for the store.",
  },
  {
    id: "merchant_products",
    deepLink: "saarly://merchant/products",
    ar: "������ ������",
    en: "Store products",
    hintAr: "���� ����� �������� �������� ������.",
    hintEn: "Opens product, price, and image management.",
  },
  {
    id: "merchant_reports",
    deepLink: "saarly://merchant/reports",
    ar: "������ ������",
    en: "Store reports",
    hintAr: "���� �������� ���������� ����� ������.",
    hintEn: "Opens sales, ratings, and performance reports.",
  },
  {
    id: "merchant_billing",
    deepLink: "saarly://merchant/billing",
    ar: "�������� �������� ������",
    en: "Store billing",
    hintAr: "���� ���� �������� ���������� ����������.",
    hintEn: "Opens subscriptions, dues, and payments.",
  },
  {
    id: "merchant_support",
    deepLink: "saarly://merchant/support",
    ar: "��� ������",
    en: "Store support",
    hintAr: "���� ������ ����� ������ �������.",
    hintEn: "Opens the store support chat.",
  },
  {
    id: "merchant_settings",
    deepLink: "saarly://merchant/settings",
    ar: "������� ������",
    en: "Store settings",
    hintAr: "���� ������� ������ ���������.",
    hintEn: "Opens account settings and policies.",
  },
  {
    id: "custom",
    deepLink: "",
    ar: "���� �����",
    en: "Custom destination",
    hintAr: "������ ��� �� ����� ���� ����� ��� ����� �� ����������.",
    hintEn: "For a developer-only internal destination not listed above.",
    custom: true,
  },
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
      .select(
        "id, type, title_ar, body_ar, push_status, push_error, created_at",
      )
      .eq("type", "admin_broadcast")
      .order("created_at", { ascending: false })
      .limit(12);
    setRecent((data ?? []) as RecentNotification[]);
  }

  async function loadLocations() {
    const { data } = await supabase
      .from("cities")
      .select("country_ar,governorate_ar,name_ar,is_active")
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
          ? `�� ����� ${result?.inserted_count ?? 0} �����. Firebase ������� ���� ����� �������.`
          : `${result?.inserted_count ?? 0} notifications queued. Firebase should send them in about a minute.`,
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
              ? "Firebase + ��� �������"
              : "Firebase + in-app bell"}
          </span>
          <h1>{lang === "ar" ? "����� �����" : "Send notification"}</h1>
          <p>
            {lang === "ar"
              ? "������� ���� ���� ������ޡ ��� ���� �������� ���� ������ ��� ��������� ����� �� Push."
              : "The notification appears in-app, and reaches Push when the user's device is registered and permissions are enabled."}
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
                {lang === "ar" ? "���� ���� ��� ������" : "Location targeting"}
              </strong>
              <p className="muted">
                {lang === "ar"
                  ? "��� ������� ����� �� ������� ��� ������� �� ����� ��� �� ������ �� �����."
                  : "Leave fields empty for all locations, or pick a country, governorate, and city."}
              </p>
            </div>
            <div className="form-split">
              <label>
                {lang === "ar" ? "�����" : "Country"}
                <select
                  value={targetCountry}
                  onChange={(event) => {
                    setTargetCountry(event.target.value);
                    setTargetGovernorate("");
                    setTargetCity("");
                  }}
                >
                  <option value="">
                    {lang === "ar" ? "�� ������" : "All countries"}
                  </option>
                  {countries.map((country) => (
                    <option value={country} key={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {lang === "ar" ? "��������" : "Governorate"}
                <select
                  value={targetGovernorate}
                  onChange={(event) => {
                    setTargetGovernorate(event.target.value);
                    setTargetCity("");
                  }}
                >
                  <option value="">
                    {lang === "ar" ? "�� ���������" : "All governorates"}
                  </option>
                  {governorates.map((governorate) => (
                    <option value={governorate} key={governorate}>
                      {governorate}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {lang === "ar" ? "�������" : "City"}
              <select
                value={targetCity}
                onChange={(event) => setTargetCity(event.target.value)}
              >
                <option value="">
                  {lang === "ar" ? "�� �����" : "All cities"}
                </option>
                {cities.map((city) => (
                  <option value={city} key={city}>
                    {city}
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
                      ? "���� ������ �� �������� �� �������"
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
                        {user.role_ar || user.role} |{" "}
                        {user.mobile || user.primary_email || "-"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted">
                {lang === "ar"
                  ? `�����: ${selectedUsers.length}`
                  : `Selected: ${selectedUsers.length}`}
              </p>
            </div>
          ) : null}

          <div className="form-split">
            <label>
              {lang === "ar" ? "����� ������� �������" : "Arabic title"}
              <input
                value={titleAr}
                onChange={(event) => setTitleAr(event.target.value)}
                required
                maxLength={90}
              />
            </label>
            <label>
              {lang === "ar" ? "����� ������� ����������" : "English title"}
              <input
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
                maxLength={90}
              />
            </label>
          </div>

          <div className="form-split">
            <label>
              {lang === "ar" ? "�� ������� �������" : "Arabic body"}
              <textarea
                value={bodyAr}
                onChange={(event) => setBodyAr(event.target.value)}
                required
                maxLength={240}
              />
            </label>
            <label>
              {lang === "ar" ? "�� ������� ����������" : "English body"}
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
                  ? "���� ��� ���� ������޿"
                  : "Open where in the app?"}
              </strong>
              <p className="muted">
                {lang === "ar"
                  ? "����� ������ ���� �������� ���� �� ��� ���� ��� �������. �� ����� ���� �� ���� �����."
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
                  ? "������ ������� ������"
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
                {lang === "ar" ? "������ ��������:" : "Selected destination:"}{" "}
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
                ? "����� �������"
                : "Send notification"}
          </button>
        </form>

        <aside className="recent-notifications-card">
          <div className="recent-head">
            <BellRing size={20} />
            <h2>
              {lang === "ar"
                ? "��� ������� ������"
                : "Recent admin notifications"}
            </h2>
          </div>
          <div className="mini-list">
            {recent.length === 0 ? (
              <p className="muted">{t("noRows", lang)}</p>
            ) : null}
            {recent.map((notification) => (
              <div key={notification.id}>
                <strong>{notification.title_ar}</strong>
                <span>
                  {notification.push_status || "pending"}
                  {notification.push_error
                    ? ` | ${notification.push_error}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
