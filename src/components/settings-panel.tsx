"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageUp, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";
import { adminValueLabel } from "@/lib/admin/format";
import { AdminImage } from "@/components/admin-image";
import { compressUiImage } from "@/lib/admin/image-compression";

type Flag = {
  key: string;
  description_ar: string | null;
  description_en: string | null;
  is_enabled: boolean;
  configuration: Record<string, unknown> | null;
};


type PriceAlertStats = {
  total_alerts?: number | null;
  active_alerts?: number | null;
  price_down_alerts?: number | null;
  price_up_alerts?: number | null;
  unavailable_alerts?: number | null;
  last_checked_at?: string | null;
};

type PriceAlertLog = {
  id: string;
  status: string;
  previous_price: number | null;
  current_price: number | null;
  checked_at: string;
  metadata: Record<string, unknown> | null;
};

type ReferralRewardType = "tshirt" | "monthly_subscription" | "football" | "cap" | "other";
type ReferralAudience = "buyer" | "merchant";

type ReferralRewardOptionDraft = {
  reward_type: ReferralRewardType;
  label_ar: string;
  label_en: string;
  is_active: boolean;
  display_order: number;
};

type ReferralSettingsDraft = {
  target_confirmed_registrations: string;
  active_buyer_reward_type: ReferralRewardType;
  active_merchant_reward_type: ReferralRewardType;
  buyer_rewards: ReferralRewardOptionDraft[];
  merchant_rewards: ReferralRewardOptionDraft[];
  buyer_banner_image_url: string;
  merchant_banner_image_url: string;
  apply_existing: boolean;
};

const referralRewardCatalog: Record<ReferralAudience, ReferralRewardOptionDraft[]> = {
  buyer: [
    { reward_type: "tshirt", label_ar: "قميص", label_en: "T-shirt", is_active: true, display_order: 0 },
    { reward_type: "football", label_ar: "كرة قدم", label_en: "Football", is_active: true, display_order: 1 },
    { reward_type: "cap", label_ar: "قبعة", label_en: "Cap", is_active: true, display_order: 2 },
    { reward_type: "other", label_ar: "مكافأة جديدة", label_en: "New reward", is_active: true, display_order: 3 }
  ],
  merchant: [
    {
      reward_type: "monthly_subscription",
      label_ar: "اشتراك شهري",
      label_en: "Monthly subscription",
      is_active: true,
      display_order: 0
    },
    { reward_type: "tshirt", label_ar: "قميص", label_en: "T-shirt", is_active: true, display_order: 1 },
    { reward_type: "other", label_ar: "مكافأة جديدة", label_en: "New reward", is_active: true, display_order: 2 }
  ]
};

function defaultReferralRewards(audience: ReferralAudience) {
  return referralRewardCatalog[audience]
    .filter((reward) => reward.reward_type !== "other")
    .map((reward) => ({ ...reward }));
}

const settingsKeys = ["price_alerts", "referrals_enabled"];

const flagLabels: Record<string, { ar: string; en: string; hintAr: string; hintEn: string }> = {
  referrals_enabled: {
    ar: "دعوة الأصدقاء",
    en: "Referrals",
    hintAr: "تشغيل رموز الدعوات والمكافآت للمشترين والمتاجر.",
    hintEn: "Enables invite codes and rewards for buyers and merchants."
  },
  price_alerts: {
    ar: "تنبيهات الأسعار",
    en: "Price alerts",
    hintAr: "تشغيل متابعة الأسعار وإشعارات تغير السعر للمشترين.",
    hintEn: "Enables buyer price tracking and price-change alerts."
  }
};

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function priceAlertStatusLabel(status: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    price_down: { ar: "السعر انخفض", en: "Price dropped" },
    price_up: { ar: "السعر ارتفع", en: "Price increased" },
    unavailable: { ar: "غير متاح", en: "Unavailable" },
    no_change: { ar: "لا تغيير", en: "No change" },
    waiting: { ar: "في الانتظار", en: "Waiting" }
  };
  return labels[status]?.[lang] ?? adminValueLabel(status, lang);
}

export function SettingsPanel({ lang }: { lang: Lang }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [priceAlertStats, setPriceAlertStats] = useState<PriceAlertStats | null>(null);
  const [priceAlertLogs, setPriceAlertLogs] = useState<PriceAlertLog[]>([]);
  const [referralDraft, setReferralDraft] = useState<ReferralSettingsDraft>(defaultReferralSettingsDraft());
  const [error, setError] = useState<string | null>(null);
  const [savingKeys, setSavingKeys] = useState<string[]>([]);

  const loadSettings = useCallback(async () => {
    setError(null);

    const [flagResult, priceStatsResult, priceLogsResult] = await Promise.all([
      supabase
        .from("feature_flags")
        .select("key, description_ar, description_en, is_enabled, configuration")
        .in("key", settingsKeys)
        .order("key", { ascending: true }),
      supabase.rpc("admin_price_alert_stats"),
      supabase
        .from("price_alert_history")
        .select("id, status, previous_price, current_price, checked_at, metadata")
        .order("checked_at", { ascending: false })
        .limit(8)
    ]);

    const nextFlags = (flagResult.data ?? []) as Flag[];
    setFlags(nextFlags);
    setPriceAlertStats((priceStatsResult.data as PriceAlertStats | null) ?? null);
    setPriceAlertLogs((priceLogsResult.data ?? []) as PriceAlertLog[]);
    setReferralDraft(referralDraftFromFlags(nextFlags));

    const firstError = flagResult.error ?? priceStatsResult.error ?? priceLogsResult.error;
    setError(firstError ? humanizeAdminError(firstError.message, lang) : null);
  }, [lang]);

  async function postAction(body: Record<string, unknown>) {
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
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "action_failed");
  }

  function setSavingKey(key: string, saving: boolean) {
    setSavingKeys((current) => (saving ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key)));
  }

  function isSaving(key: string) {
    return savingKeys.includes(key);
  }

  async function toggleRow(table: string, id: string, enabled: boolean) {
    const key = `${table}:${id}`;
    setSavingKey(key, true);
    setError(null);

    if (table !== "feature_flags") {
      setSavingKey(key, false);
      throw new Error("settings_table_not_allowed");
    }
    setFlags((current) => current.map((flag) => (flag.key === id ? { ...flag, is_enabled: enabled } : flag)));

    try {
      await postAction({ action: "toggle_active", table, id, payload: { enabled } });
    } catch (toggleError) {
      setError(humanizeAdminError(toggleError, lang));
      await loadSettings();
    } finally {
      setSavingKey(key, false);
    }
  }

  async function runPriceAlertScan() {
    const key = "price-alert-scan";
    setSavingKey(key, true);
    setError(null);
    try {
      const { error: scanError } = await supabase.rpc("admin_retry_price_alert_scan");
      if (scanError) throw scanError;
      await loadSettings();
    } catch (scanError) {
      setError(humanizeAdminError(scanError, lang));
    } finally {
      setSavingKey(key, false);
    }
  }

  async function cleanPriceAlertHistory() {
    const key = "price-alert-cleanup";
    setSavingKey(key, true);
    setError(null);
    try {
      const { error: cleanupError } = await supabase.rpc("cleanup_price_alert_history", { p_retention_days: 90 });
      if (cleanupError) throw cleanupError;
      await loadSettings();
    } catch (cleanupError) {
      setError(humanizeAdminError(cleanupError, lang));
    } finally {
      setSavingKey(key, false);
    }
  }

  async function saveReferralSettings() {
    const key = "referral-settings";
    setSavingKey(key, true);
    setError(null);
    try {
      await postAction({
        action: "update_referral_settings",
        payload: {
          target_confirmed_registrations: Number(referralDraft.target_confirmed_registrations),
          buyer_reward_type: referralDraft.active_buyer_reward_type,
          merchant_reward_type: referralDraft.active_merchant_reward_type,
          buyer_rewards: referralDraft.buyer_rewards,
          merchant_rewards: referralDraft.merchant_rewards,
          buyer_banner_image_url: referralDraft.buyer_banner_image_url,
          merchant_banner_image_url: referralDraft.merchant_banner_image_url,
          apply_existing: referralDraft.apply_existing
        }
      });
      await loadSettings();
    } catch (saveError) {
      setError(humanizeAdminError(saveError, lang));
    } finally {
      setSavingKey(key, false);
    }
  }

  function updateRewardOption(audience: ReferralAudience, rewardType: ReferralRewardType, values: Partial<ReferralRewardOptionDraft>) {
    const listKey = audience === "merchant" ? "merchant_rewards" : "buyer_rewards";
    setReferralDraft((current) => ({
      ...current,
      [listKey]: current[listKey].map((reward) => (reward.reward_type === rewardType ? { ...reward, ...values } : reward))
    }));
  }

  function addRewardOption(audience: ReferralAudience) {
    const listKey = audience === "merchant" ? "merchant_rewards" : "buyer_rewards";
    setReferralDraft((current) => {
      const existingTypes = new Set(current[listKey].map((reward) => reward.reward_type));
      const nextReward = referralRewardCatalog[audience].find((reward) => !existingTypes.has(reward.reward_type));
      if (!nextReward) {
        const inactiveReward = current[listKey].find((reward) => !reward.is_active);
        if (!inactiveReward) return current;
        return {
          ...current,
          [listKey]: current[listKey].map((reward) =>
            reward.reward_type === inactiveReward.reward_type ? { ...reward, is_active: true } : reward
          )
        };
      }
      return {
        ...current,
        [listKey]: [...current[listKey], { ...nextReward, display_order: current[listKey].length }]
      };
    });
  }

  function deleteRewardOption(audience: ReferralAudience, rewardType: ReferralRewardType) {
    const listKey = audience === "merchant" ? "merchant_rewards" : "buyer_rewards";
    const activeKey = audience === "merchant" ? "active_merchant_reward_type" : "active_buyer_reward_type";
    setReferralDraft((current) => {
      const nextRewards = current[listKey].filter((reward) => reward.reward_type !== rewardType);
      if (nextRewards.length === 0) return current;
      const safeRewards = nextRewards.some((reward) => reward.is_active)
        ? nextRewards
        : nextRewards.map((reward, index) => ({ ...reward, is_active: index === 0 }));
      const fallbackActiveReward = safeRewards.find((reward) => reward.is_active) ?? safeRewards[0];
      return {
        ...current,
        [listKey]: safeRewards.map((reward, index) => ({ ...reward, display_order: index })),
        [activeKey]: current[activeKey] === rewardType ? fallbackActiveReward.reward_type : current[activeKey]
      };
    });
  }

  async function uploadReferralBanner(audience: ReferralAudience, file: File | null) {
    if (!file) return;
    const key = `referral-banner-${audience}`;
    setSavingKey(key, true);
    setError(null);
    try {
      const { file: optimizedFile } = await compressUiImage(file, { maxSide: 1920, quality: 0.84, fallbackName: `${audience}-referral` });
      const extension = optimizedFile.name.split(".").pop()?.toLowerCase() || "webp";
      const safeName = `${audience}-${Date.now()}.${extension}`;
      const path = `referrals/${safeName}`;
      const { error: uploadError } = await supabase.storage.from("banners").upload(path, optimizedFile, {
        cacheControl: "31536000",
        upsert: true,
        contentType: optimizedFile.type || undefined
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("banners").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      setReferralDraft((current) => ({
        ...current,
        [audience === "merchant" ? "merchant_banner_image_url" : "buyer_banner_image_url"]: publicUrl
      }));
    } catch (uploadError) {
      setError(humanizeAdminError(uploadError, lang));
    } finally {
      setSavingKey(key, false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "\u062a\u062d\u0643\u0645 \u0627\u0644\u0623\u062f\u0645\u0646" : "Admin control"}</span>
          <h1>{lang === "ar" ? "إعدادات المزايا" : "Feature settings"}</h1>
          <p>
            {lang === "ar"
              ? "إدارة تنبيهات الأسعار والدعوات والمكافآت. إدارة الاشتراكات والدفع والعمولات موجودة في صفحة تحقيق الدخل فقط."
              : "Manage price alerts, referrals, and rewards. Subscriptions, payments, and commissions are managed only from the monetization page."}
          </p>
        </div>
        <button className="soft-button" onClick={loadSettings}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{humanizeAdminError(error, lang)}</div> : null}

      <div className="settings-grid">
        {flags.map((flag) => {
          const label = flagLabels[flag.key];
          const rowKey = `feature_flags:${flag.key}`;
          return (
            <article className="flag-card" key={flag.key}>
              <div>
                <strong>{label?.[lang] ?? flag.key}</strong>
                <p>{lang === "ar" ? label?.hintAr ?? flag.description_ar : label?.hintEn ?? flag.description_en}</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={flag.is_enabled}
                  disabled={isSaving(rowKey)}
                  onChange={(event) => void toggleRow("feature_flags", flag.key, event.target.checked)}
                />
                <span />
              </label>
            </article>
          );
        })}
      </div>

      <article className="ops-card full-width price-alert-admin-card">
        <div className="provider-row-head">
          <div>
            <h2>{lang === "ar" ? "متابعة تنبيهات الأسعار" : "Price alert monitor"}</h2>
            <p>
              {lang === "ar"
                ? "تابع حالة تنبيهات الأسعار، أعد الفحص عند الحاجة، ونظّف السجل القديم."
                : "Track price alerts, run a scan when needed, and clean old history."}
            </p>
          </div>
          <span className={flags.find((flag) => flag.key === "price_alerts")?.is_enabled ? "status-pill active" : "status-pill muted"}>
            {flags.find((flag) => flag.key === "price_alerts")?.is_enabled
              ? lang === "ar"
                ? "مفعّلة"
                : "Enabled"
              : lang === "ar"
                ? "موقوفة"
                : "Disabled"}
          </span>
        </div>

        <div className="metric-grid price-alert-metrics">
          <Metric label={lang === "ar" ? "كل التنبيهات" : "All alerts"} value={priceAlertStats?.total_alerts ?? 0} />
          <Metric label={lang === "ar" ? "النشطة" : "Active"} value={priceAlertStats?.active_alerts ?? 0} />
          <Metric label={lang === "ar" ? "انخفاض" : "Down"} value={priceAlertStats?.price_down_alerts ?? 0} />
          <Metric label={lang === "ar" ? "ارتفاع" : "Up"} value={priceAlertStats?.price_up_alerts ?? 0} />
          <Metric label={lang === "ar" ? "غير متاح" : "Unavailable"} value={priceAlertStats?.unavailable_alerts ?? 0} />
        </div>

        <div className="provider-actions-row">
          <span>
            {priceAlertStats?.last_checked_at
              ? lang === "ar"
                ? `آخر فحص: ${new Date(priceAlertStats.last_checked_at).toLocaleDateString("ar-EG")}`
                : `Last scan: ${new Date(priceAlertStats.last_checked_at).toLocaleDateString("en-US")}`
              : lang === "ar"
                ? "لم يتم الفحص بعد"
                : "No scan yet"}
          </span>
          <div className="provider-actions-row">
            <button className="soft-button" disabled={isSaving("price-alert-scan")} onClick={() => void runPriceAlertScan()}>
              <RefreshCw size={16} />
              {isSaving("price-alert-scan") ? (lang === "ar" ? "جار الفحص" : "Scanning") : lang === "ar" ? "فحص الآن" : "Scan now"}
            </button>
            <button className="soft-button" disabled={isSaving("price-alert-cleanup")} onClick={() => void cleanPriceAlertHistory()}>
              <Trash2 size={16} />
              {isSaving("price-alert-cleanup") ? (lang === "ar" ? "جار التنظيف" : "Cleaning") : lang === "ar" ? "تنظيف السجل" : "Clean history"}
            </button>
          </div>
        </div>

        <div className="price-alert-log-list">
          {priceAlertLogs.length === 0 ? (
            <div className="empty-state compact">{lang === "ar" ? "لا توجد سجلات حديثة." : "No recent logs."}</div>
          ) : (
            priceAlertLogs.map((log) => (
              <div className="provider-settings-card" key={log.id}>
                <div className="provider-row-head">
                  <strong>{priceAlertStatusLabel(log.status, lang)}</strong>
                  <span>{new Date(log.checked_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                </div>
                <span>
                  {lang === "ar" ? "السابق" : "Previous"}: {log.previous_price ?? "-"} · {lang === "ar" ? "الحالي" : "Current"}:{" "}
                  {log.current_price ?? "-"}
                </span>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="ops-card full-width referral-settings-card">
        <h2>{lang === "ar" ? "\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u062f\u0639\u0648\u0627\u062a \u0648\u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629" : "Referral reward settings"}</h2>
        <p>
          {lang === "ar"
            ? "\u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u0644\u064a \u0647\u062a\u0638\u0647\u0631 \u0644\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0641\u064a \u0634\u0627\u0634\u0629 \u0627\u062f\u0639\u0648 \u0623\u0635\u062d\u0627\u0628\u0643\u060c \u0648\u0639\u062f\u062f \u0627\u0644\u062a\u0633\u062c\u064a\u0644\u0627\u062a \u0627\u0644\u0645\u0624\u0643\u062f\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629."
            : "Choose what users see on the invite screen and how many confirmed signups are required."}
        </p>
        <div className="provider-config-grid">
          <label>
            {lang === "ar" ? "\u0639\u062f\u062f \u0627\u0644\u062a\u0633\u062c\u064a\u0644\u0627\u062a \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629" : "Required confirmed signups"}
            <input
              inputMode="numeric"
              min={1}
              type="number"
              value={referralDraft.target_confirmed_registrations}
              onChange={(event) =>
                setReferralDraft((current) => ({
                  ...current,
                  target_confirmed_registrations: event.target.value
                }))
              }
            />
          </label>
          <ReferralBannerField
            audience="buyer"
            lang={lang}
            value={referralDraft.buyer_banner_image_url}
            disabled={isSaving("referral-banner-buyer")}
            onChange={(value) =>
              setReferralDraft((current) => ({
                ...current,
                buyer_banner_image_url: value
              }))
            }
            onUpload={(file) => void uploadReferralBanner("buyer", file)}
          />
          <ReferralBannerField
            audience="merchant"
            lang={lang}
            value={referralDraft.merchant_banner_image_url}
            disabled={isSaving("referral-banner-merchant")}
            onChange={(value) =>
              setReferralDraft((current) => ({
                ...current,
                merchant_banner_image_url: value
              }))
            }
            onUpload={(file) => void uploadReferralBanner("merchant", file)}
          />
        </div>
        <div className="reward-settings-grid">
          <ReferralRewardEditor
            audience="buyer"
            lang={lang}
            rewards={referralDraft.buyer_rewards}
            activeRewardType={referralDraft.active_buyer_reward_type}
            onActiveChange={(rewardType) =>
              setReferralDraft((current) => ({
                ...current,
                active_buyer_reward_type: rewardType
              }))
            }
            onRewardChange={(rewardType, values) => updateRewardOption("buyer", rewardType, values)}
            onRewardDelete={(rewardType) => deleteRewardOption("buyer", rewardType)}
            onRewardAdd={() => addRewardOption("buyer")}
          />
          <ReferralRewardEditor
            audience="merchant"
            lang={lang}
            rewards={referralDraft.merchant_rewards}
            activeRewardType={referralDraft.active_merchant_reward_type}
            onActiveChange={(rewardType) =>
              setReferralDraft((current) => ({
                ...current,
                active_merchant_reward_type: rewardType
              }))
            }
            onRewardChange={(rewardType, values) => updateRewardOption("merchant", rewardType, values)}
            onRewardDelete={(rewardType) => deleteRewardOption("merchant", rewardType)}
            onRewardAdd={() => addRewardOption("merchant")}
          />
        </div>
        <div className="provider-actions-row">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={referralDraft.apply_existing}
              onChange={(event) =>
                setReferralDraft((current) => ({
                  ...current,
                  apply_existing: event.target.checked
                }))
              }
            />
            <span>
              {lang === "ar"
                ? "\u0637\u0628\u0642 \u0646\u0648\u0639 \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629 \u0639\u0644\u0649 \u0627\u0644\u062f\u0639\u0648\u0627\u062a \u0627\u0644\u0645\u0648\u062c\u0648\u062f\u0629 \u062d\u0627\u0644\u064a\u0627"
                : "Apply this reward to current invite links too"}
            </span>
          </label>
          <button className="soft-button" disabled={isSaving("referral-settings")} onClick={() => void saveReferralSettings()}>
            <Save size={16} />
            {isSaving("referral-settings") ? (lang === "ar" ? "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638" : "Saving") : t("save", lang)}
          </button>
        </div>
      </article>

    </section>
  );
}

function ReferralBannerField({
  audience,
  lang,
  value,
  disabled,
  onChange,
  onUpload
}: {
  audience: ReferralAudience;
  lang: Lang;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onUpload: (file: File | null) => void;
}) {
  const title =
    audience === "merchant"
      ? lang === "ar"
        ? "صورة دعوات المتاجر"
        : "Merchant invite image"
      : lang === "ar"
        ? "صورة دعوات العملاء"
        : "Buyer invite image";

  return (
    <label className="provider-wide-field referral-banner-field">
      {title}
      <div className="referral-banner-upload">
        <input dir="ltr" value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://..." />
        <span className="tiny-button">
          <ImageUp size={14} />
          {disabled ? (lang === "ar" ? "جاري الرفع" : "Uploading") : lang === "ar" ? "رفع صورة" : "Upload"}
          <input
            aria-label={title}
            disabled={disabled}
            type="file"
            accept="image/*"
            onChange={(event) => {
              onUpload(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </span>
      </div>
      {value.trim() ? <AdminImage className="referral-banner-preview" src={value.trim()} alt={title} width={1280} height={480} sizes="(max-width: 768px) 100vw, 720px" /> : null}
    </label>
  );
}

function ReferralRewardEditor({
  audience,
  lang,
  rewards,
  activeRewardType,
  onActiveChange,
  onRewardChange,
  onRewardDelete,
  onRewardAdd
}: {
  audience: ReferralAudience;
  lang: Lang;
  rewards: ReferralRewardOptionDraft[];
  activeRewardType: ReferralRewardType;
  onActiveChange: (rewardType: ReferralRewardType) => void;
  onRewardChange: (rewardType: ReferralRewardType, values: Partial<ReferralRewardOptionDraft>) => void;
  onRewardDelete: (rewardType: ReferralRewardType) => void;
  onRewardAdd: () => void;
}) {
  const hasMissingReward = referralRewardCatalog[audience].some(
    (catalogReward) => !rewards.some((reward) => reward.reward_type === catalogReward.reward_type)
  );
  const hasInactiveReward = rewards.some((reward) => !reward.is_active);
  const canAdd = hasMissingReward || hasInactiveReward;
  const activeRewardsCount = rewards.filter((reward) => reward.is_active).length;
  const addLabel = canAdd
    ? lang === "ar"
      ? "إضافة"
      : "Add"
    : lang === "ar"
      ? "كل المكافآت مضافة"
      : "All rewards added";

  return (
    <section className="reward-editor">
      <div className="reward-editor-head">
        <div>
          <strong>
            {audience === "merchant"
              ? lang === "ar"
                ? "مكافآت المتاجر"
                : "Merchant rewards"
              : lang === "ar"
                ? "مكافآت العملاء"
                : "Buyer rewards"}
          </strong>
          <span>
            {lang === "ar"
              ? audience === "merchant"
                ? "اشتراك شهري أو قميص"
                : "قميص أو كرة قدم أو قبعة"
              : audience === "merchant"
                ? "Monthly subscription or T-shirt"
                : "T-shirt, football, or cap"}
          </span>
        </div>
        <button className="tiny-button" type="button" disabled={!canAdd} onClick={onRewardAdd} title={addLabel}>
          <Plus size={14} />
          {addLabel}
        </button>
      </div>

      <label className="reward-active-select">
        {lang === "ar" ? "مكافأة مفعلة" : "Active reward"}
        <select value={activeRewardType} onChange={(event) => onActiveChange(event.target.value as ReferralRewardType)}>
          {rewards
            .filter((reward) => reward.is_active)
            .map((reward) => (
              <option key={reward.reward_type} value={reward.reward_type}>
                {lang === "ar" ? reward.label_ar || reward.label_en : reward.label_en || reward.label_ar}
              </option>
            ))}
        </select>
      </label>

      <div className="reward-option-list">
        {rewards.map((reward) => (
          <div className="reward-option-row" key={reward.reward_type}>
            <label>
              {lang === "ar" ? "عربي" : "Arabic"}
              <input
                dir="auto"
                value={reward.label_ar}
                onChange={(event) => onRewardChange(reward.reward_type, { label_ar: event.target.value })}
              />
            </label>
            <label>
              {lang === "ar" ? "إنجليزي" : "English"}
              <input
                dir="auto"
                value={reward.label_en}
                onChange={(event) => onRewardChange(reward.reward_type, { label_en: event.target.value })}
              />
            </label>
            <label className="checkbox-field reward-check">
              <input
                type="checkbox"
                checked={reward.is_active}
                disabled={reward.is_active && activeRewardsCount <= 1}
                onChange={(event) => onRewardChange(reward.reward_type, { is_active: event.target.checked })}
              />
              <span>{lang === "ar" ? "مفعل" : "Active"}</span>
            </label>
            <button
              className="tiny-button danger"
              type="button"
              disabled={rewards.length <= 1}
              onClick={() => onRewardDelete(reward.reward_type)}
            >
              <Trash2 size={14} />
              {lang === "ar" ? "حذف" : "Delete"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function defaultReferralSettingsDraft(): ReferralSettingsDraft {
  return {
    target_confirmed_registrations: "10",
    active_buyer_reward_type: "tshirt",
    active_merchant_reward_type: "monthly_subscription",
    buyer_rewards: defaultReferralRewards("buyer"),
    merchant_rewards: defaultReferralRewards("merchant"),
    buyer_banner_image_url: "",
    merchant_banner_image_url: "",
    apply_existing: true
  };
}

function referralDraftFromFlags(flags: Flag[]): ReferralSettingsDraft {
  const referralFlag = flags.find((flag) => flag.key === "referrals_enabled");
  const configuration = referralFlag?.configuration ?? {};
  const threshold = configuration["confirmed_referrals_threshold"];
  const buyerRewards = normalizeRewardOptions(configuration["buyer_rewards"], "buyer");
  const merchantRewards = normalizeRewardOptions(configuration["merchant_rewards"], "merchant");
  const defaultRewardType = rewardTypeFromUnknown(configuration["default_reward_type"], "tshirt");
  const activeBuyerRewardType = rewardTypeFromUnknown(configuration["active_buyer_reward_type"], defaultRewardType);
  const activeMerchantRewardType = rewardTypeFromUnknown(configuration["active_merchant_reward_type"], "monthly_subscription");
  return {
    target_confirmed_registrations: String(typeof threshold === "number" && Number.isFinite(threshold) ? threshold : 10),
    active_buyer_reward_type: rewardExists(buyerRewards, activeBuyerRewardType) ? activeBuyerRewardType : buyerRewards[0].reward_type,
    active_merchant_reward_type: rewardExists(merchantRewards, activeMerchantRewardType)
      ? activeMerchantRewardType
      : merchantRewards[0].reward_type,
    buyer_rewards: buyerRewards,
    merchant_rewards: merchantRewards,
    buyer_banner_image_url: stringConfig(configuration, "buyer_banner_image_url", "buyerBannerImageUrl"),
    merchant_banner_image_url: stringConfig(configuration, "merchant_banner_image_url", "merchantBannerImageUrl"),
    apply_existing: true
  };
}

function normalizeRewardOptions(value: unknown, audience: ReferralAudience): ReferralRewardOptionDraft[] {
  const catalog = referralRewardCatalog[audience];
  const allowedTypes = new Set(catalog.map((reward) => reward.reward_type));
  const source = Array.isArray(value) ? value : defaultReferralRewards(audience);
  const normalized = source
    .map((item, index) => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const rewardType = rewardTypeFromUnknown(raw.reward_type, catalog[index]?.reward_type ?? catalog[0].reward_type);
      if (!allowedTypes.has(rewardType)) return null;
      const fallback = catalog.find((reward) => reward.reward_type === rewardType) ?? catalog[0];
      return {
        reward_type: rewardType,
        label_ar: String(raw.label_ar ?? fallback.label_ar).trim() || fallback.label_ar,
        label_en: String(raw.label_en ?? fallback.label_en).trim() || fallback.label_en,
        is_active: raw.is_active !== false,
        display_order: Number.isFinite(Number(raw.display_order)) ? Number(raw.display_order) : index
      } satisfies ReferralRewardOptionDraft;
    })
    .filter((reward): reward is ReferralRewardOptionDraft => reward !== null);

  const uniqueRewards = Array.from(new Map(normalized.map((reward) => [reward.reward_type, reward])).values()).sort(
    (left, right) => left.display_order - right.display_order
  );
  const rewards = uniqueRewards.length > 0 ? uniqueRewards : defaultReferralRewards(audience);
  return rewards.some((reward) => reward.is_active)
    ? rewards
    : rewards.map((reward, index) => ({ ...reward, is_active: index === 0 }));
}

function rewardTypeFromUnknown(value: unknown, fallback: ReferralRewardType): ReferralRewardType {
  return value === "monthly_subscription" ||
    value === "football" ||
    value === "cap" ||
    value === "other" ||
    value === "tshirt"
    ? value
    : fallback;
}

function rewardExists(rewards: ReferralRewardOptionDraft[], rewardType: ReferralRewardType) {
  return rewards.some((reward) => reward.reward_type === rewardType && reward.is_active);
}

function stringConfig(config: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string") {
      return value;
    }
    if (value !== null && value !== undefined) {
      return String(value);
    }
  }
  return "";
}

