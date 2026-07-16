"use client";

import { useEffect, useState } from "react";
import { CreditCard, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";

type Flag = {
  key: string;
  description_ar: string | null;
  description_en: string | null;
  is_enabled: boolean;
  configuration: Record<string, unknown> | null;
};

type PaymentProvider = {
  id: string;
  provider: string;
  is_enabled: boolean;
  is_direct_to_merchant_supported?: boolean | null;
  configuration: Record<string, unknown> | null;
  webhook_secret_name: string | null;
  webhook_signature_header: string | null;
};

type ProviderDraft = {
  merchant_id: string;
  account_label: string;
  settlement_account: string;
  wallet_number: string;
  api_secret_name: string;
  webhook_secret_name: string;
  webhook_signature_header: string;
  direct_to_merchant: boolean;
  instructions: string;
};

type SubscriptionPlan = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  monthly_price: number | null;
  is_active: boolean;
  billing_period_months?: number | null;
  grace_months?: number | null;
};

type ReferralSettingsDraft = {
  target_confirmed_registrations: string;
  default_reward_type: "tshirt" | "monthly_subscription";
  apply_existing: boolean;
};

const monetizationKeys = [
  "monetization_enabled",
  "merchant_monthly_subscription_enabled",
  "merchant_commission_enabled",
  "merchant_can_choose_billing_model",
  "buyer_in_app_payment_enabled",
  "referrals_enabled"
];

const flagLabels: Record<string, { ar: string; en: string; hintAr: string; hintEn: string }> = {
  monetization_enabled: {
    ar: "\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u062f\u0641\u0648\u0639",
    en: "Enable paid system",
    hintAr: "\u0644\u0648 \u0645\u0642\u0641\u0648\u0644\u0629\u060c \u0623\u064a \u0627\u0634\u062a\u0631\u0627\u0643\u0627\u062a \u0623\u0648 \u062f\u0641\u0639 \u0647\u062a\u0641\u0636\u0644 \u0645\u062e\u0641\u064a\u0629 \u0645\u0646 \u0627\u0644\u062a\u0637\u0628\u064a\u0642.",
    hintEn: "When off, all paid screens stay hidden."
  },
  merchant_monthly_subscription_enabled: {
    ar: "\u0627\u0634\u062a\u0631\u0627\u0643 \u0634\u0647\u0631\u064a \u0644\u0644\u0645\u062a\u0627\u062c\u0631",
    en: "Merchant monthly subscriptions",
    hintAr: "\u064a\u0638\u0647\u0631 \u0644\u0644\u0645\u062a\u062c\u0631 \u062e\u064a\u0627\u0631 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0627\u0644\u0634\u0647\u0631\u064a.",
    hintEn: "Shows the monthly subscription option to stores."
  },
  merchant_commission_enabled: {
    ar: "\u0646\u0633\u0628\u0629 \u0639\u0644\u0649 \u0643\u0644 \u0641\u0627\u062a\u0648\u0631\u0629",
    en: "Commission per order",
    hintAr: "\u064a\u062d\u0633\u0628 \u0645\u0633\u062a\u062d\u0642\u0627\u062a \u0633\u0639\u0631\u0644\u064a \u0639\u0644\u0649 \u0645\u0628\u064a\u0639\u0627\u062a \u0627\u0644\u0645\u062a\u062c\u0631.",
    hintEn: "Calculates Saarly dues on store sales."
  },
  merchant_can_choose_billing_model: {
    ar: "\u0627\u0644\u0645\u062a\u062c\u0631 \u064a\u062e\u062a\u0627\u0631 \u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629",
    en: "Store chooses billing model",
    hintAr: "\u064a\u0638\u0647\u0631 \u0644\u0644\u0645\u062a\u062c\u0631 \u0627\u062e\u062a\u064a\u0627\u0631: \u0627\u0634\u062a\u0631\u0627\u0643 \u0623\u0648 \u0646\u0633\u0628\u0629.",
    hintEn: "Lets stores choose subscription or commission."
  },
  buyer_in_app_payment_enabled: {
    ar: "\u062f\u0641\u0639 \u0627\u0644\u0639\u0645\u064a\u0644 \u062f\u0627\u062e\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642",
    en: "Buyer in-app payment",
    hintAr: "\u0628\u0639\u062f \u0642\u0628\u0648\u0644 \u0627\u0644\u0639\u0631\u0636\u060c \u0627\u0644\u0639\u0645\u064a\u0644 \u064a\u0642\u062f\u0631 \u064a\u062f\u0641\u0639 \u0644\u0644\u0645\u062a\u062c\u0631 \u0645\u0646 \u0627\u0644\u062a\u0637\u0628\u064a\u0642.",
    hintEn: "Allows buyers to pay stores inside the app."
  },
  referrals_enabled: {
    ar: "\u062f\u0639\u0648\u0629 \u0627\u0644\u0623\u0635\u062f\u0642\u0627\u0621",
    en: "Referrals",
    hintAr: "\u064a\u0641\u062a\u062d \u0634\u0627\u0634\u0629 \u0627\u062f\u0639\u0648 \u0623\u0635\u062d\u0627\u0628\u0643 \u0648\u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062a.",
    hintEn: "Enables invite codes and rewards."
  }
};

export function SettingsPanel({ lang }: { lang: Lang }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({});
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [referralDraft, setReferralDraft] = useState<ReferralSettingsDraft>(defaultReferralSettingsDraft());
  const [error, setError] = useState<string | null>(null);
  const [savingKeys, setSavingKeys] = useState<string[]>([]);

  async function loadSettings() {
    setError(null);

    const [flagResult, providerResult, planResult] = await Promise.all([
      supabase
        .from("feature_flags")
        .select("key, description_ar, description_en, is_enabled, configuration")
        .in("key", monetizationKeys)
        .order("key", { ascending: true }),
      supabase
        .from("payment_settings")
        .select("id, provider, is_enabled, is_direct_to_merchant_supported, configuration, webhook_secret_name, webhook_signature_header")
        .order("provider", { ascending: true }),
      supabase
        .from("subscription_plans")
        .select("id, name_ar, name_en, monthly_price, is_active, billing_period_months, grace_months")
        .order("monthly_price", { ascending: true })
    ]);

    const nextFlags = (flagResult.data ?? []) as Flag[];
    const nextProviders = (providerResult.data ?? []) as PaymentProvider[];
    setFlags(nextFlags);
    setProviders(nextProviders);
    setProviderDrafts(Object.fromEntries(nextProviders.map((provider) => [provider.id, providerDraftFrom(provider)])));
    setPlans((planResult.data ?? []) as SubscriptionPlan[]);
    setReferralDraft(referralDraftFromFlags(nextFlags));

    const firstError = flagResult.error ?? providerResult.error ?? planResult.error;
    setError(firstError ? humanizeAdminError(firstError.message, lang) : null);
  }

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

    if (table === "feature_flags") {
      setFlags((current) => current.map((flag) => (flag.key === id ? { ...flag, is_enabled: enabled } : flag)));
    } else if (table === "payment_settings") {
      setProviders((current) => current.map((provider) => (provider.id === id ? { ...provider, is_enabled: enabled } : provider)));
    } else if (table === "subscription_plans") {
      setPlans((current) => current.map((plan) => (plan.id === id ? { ...plan, is_active: enabled } : plan)));
    }

    try {
      await postAction({ action: "toggle_active", table, id, payload: { enabled } });
    } catch (toggleError) {
      setError(humanizeAdminError(toggleError, lang));
      await loadSettings();
    } finally {
      setSavingKey(key, false);
    }
  }

  function updateProviderDraft(id: string, values: Partial<ProviderDraft>) {
    setProviderDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyProviderDraft()),
        ...values
      }
    }));
  }

  async function saveProviderSettings(provider: PaymentProvider) {
    const key = `provider-save:${provider.id}`;
    const draft = providerDrafts[provider.id] ?? providerDraftFrom(provider);
    const configuration = providerConfigurationFromDraft(provider, draft);
    setSavingKey(key, true);
    setError(null);

    try {
      await postAction({
        action: "update_row",
        table: "payment_settings",
        id: provider.id,
        values: {
          provider: provider.provider,
          is_enabled: provider.is_enabled,
          is_direct_to_merchant_supported: draft.direct_to_merchant,
          configuration,
          webhook_secret_name: emptyToNull(draft.webhook_secret_name),
          webhook_signature_header: emptyToNull(draft.webhook_signature_header)
        }
      });
      setProviders((current) =>
        current.map((item) =>
          item.id === provider.id
            ? {
                ...item,
                is_direct_to_merchant_supported: draft.direct_to_merchant,
                configuration,
                webhook_secret_name: emptyToNull(draft.webhook_secret_name),
                webhook_signature_header: emptyToNull(draft.webhook_signature_header)
              }
            : item
        )
      );
    } catch (saveError) {
      setError(humanizeAdminError(saveError, lang));
      await loadSettings();
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
          reward_type: referralDraft.default_reward_type,
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

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "\u062a\u062d\u0643\u0645 \u0627\u0644\u0623\u062f\u0645\u0646" : "Admin control"}</span>
          <h1>{lang === "ar" ? "\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643\u0627\u062a \u0648\u0627\u0644\u0645\u062f\u0641\u0648\u0639\u0627\u062a" : "Monetization"}</h1>
          <p>
            {lang === "ar"
              ? "\u0645\u0646 \u0647\u0646\u0627 \u062a\u0641\u062a\u062d \u0623\u0648 \u062a\u0642\u0641\u0644 \u0623\u064a \u062c\u0632\u0621 \u0645\u062f\u0641\u0648\u0639 \u0641\u064a \u0627\u0644\u062a\u0637\u0628\u064a\u0642. \u0644\u0648 \u0643\u0644\u0647 \u0645\u0642\u0641\u0648\u0644\u060c \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u064a\u0641\u0636\u0644 \u0645\u062c\u0627\u0646\u064a."
              : "Turn paid app features on or off. When all are off, the app remains free."}
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
          <label>
            {lang === "ar" ? "\u0646\u0648\u0639 \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629" : "Reward type"}
            <select
              value={referralDraft.default_reward_type}
              onChange={(event) =>
                setReferralDraft((current) => ({
                  ...current,
                  default_reward_type: event.target.value === "monthly_subscription" ? "monthly_subscription" : "tshirt"
                }))
              }
            >
              <option value="tshirt">{lang === "ar" ? "\u062a\u064a\u0634\u064a\u0631\u062a" : "T-shirt"}</option>
              <option value="monthly_subscription">{lang === "ar" ? "\u0627\u0634\u062a\u0631\u0627\u0643 \u0634\u0647\u0631\u064a" : "Monthly subscription"}</option>
            </select>
          </label>
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

      <div className="settings-grid">
        <article className="ops-card full-width">
          <h2>
            <CreditCard size={18} />
            {lang === "ar" ? "\u0637\u0631\u0642 \u0627\u0644\u062f\u0641\u0639" : "Payment methods"}
          </h2>
          <div className="provider-settings-list">
            {providers.map((provider) => {
              const rowKey = `payment_settings:${provider.id}`;
              const saveKey = `provider-save:${provider.id}`;
              const draft = providerDrafts[provider.id] ?? providerDraftFrom(provider);
              const isWalletProvider = provider.provider.includes("wallet") || provider.provider.includes("cash");
              return (
                <div className="provider-settings-card" key={provider.id}>
                  <div className="provider-row-head">
                    <div>
                      <strong>{providerLabel(provider.provider, lang)}</strong>
                      <span>
                        {provider.is_enabled
                          ? lang === "ar"
                            ? "\u0645\u0641\u0639\u0644\u0629"
                            : "Enabled"
                          : lang === "ar"
                            ? "\u0645\u0642\u0641\u0648\u0644\u0629"
                            : "Disabled"}
                      </span>
                    </div>
                    <label className="switch compact-switch">
                      <input
                        type="checkbox"
                        checked={provider.is_enabled}
                        disabled={isSaving(rowKey)}
                        onChange={(event) => void toggleRow("payment_settings", provider.id, event.target.checked)}
                      />
                      <span />
                    </label>
                  </div>

                  <div className="provider-config-grid">
                    <label>
                      {lang === "ar" ? "\u0631\u0642\u0645 \u0627\u0644\u062a\u0627\u062c\u0631 / \u062d\u0633\u0627\u0628 \u0627\u0644\u062f\u0641\u0639" : "Merchant/account ID"}
                      <input
                        dir="auto"
                        value={draft.merchant_id}
                        onChange={(event) => updateProviderDraft(provider.id, { merchant_id: event.target.value })}
                      />
                    </label>
                    <label>
                      {lang === "ar" ? "\u0627\u0633\u0645 \u0627\u0644\u062d\u0633\u0627\u0628 \u0644\u0644\u0639\u0631\u0636" : "Display account name"}
                      <input
                        dir="auto"
                        value={draft.account_label}
                        onChange={(event) => updateProviderDraft(provider.id, { account_label: event.target.value })}
                      />
                    </label>
                    <label>
                      {lang === "ar" ? "\u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u062d\u0635\u064a\u0644" : "Settlement account"}
                      <input
                        dir="auto"
                        value={draft.settlement_account}
                        onChange={(event) => updateProviderDraft(provider.id, { settlement_account: event.target.value })}
                      />
                    </label>
                    {isWalletProvider ? (
                      <label>
                        {lang === "ar" ? "\u0631\u0642\u0645 \u0627\u0644\u0645\u062d\u0641\u0638\u0629" : "Wallet number"}
                        <input
                          dir="ltr"
                          value={draft.wallet_number}
                          onChange={(event) => updateProviderDraft(provider.id, { wallet_number: event.target.value })}
                        />
                      </label>
                    ) : null}
                    <label>
                      {lang === "ar" ? "\u0627\u0633\u0645 \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u062f\u0641\u0639 \u0627\u0644\u0645\u062d\u0641\u0648\u0638" : "Saved payment key name"}
                      <input
                        dir="ltr"
                        value={draft.api_secret_name}
                        onChange={(event) => updateProviderDraft(provider.id, { api_secret_name: event.target.value })}
                        placeholder="PAYMENT_PROVIDER_SECRET"
                      />
                    </label>
                    <label>
                      {lang === "ar" ? "\u0627\u0633\u0645 \u0633\u0631 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062f\u0641\u0639" : "Webhook secret name"}
                      <input
                        dir="ltr"
                        value={draft.webhook_secret_name}
                        onChange={(event) => updateProviderDraft(provider.id, { webhook_secret_name: event.target.value })}
                        placeholder="PAYMENT_WEBHOOK_SECRET"
                      />
                    </label>
                    <label>
                      {lang === "ar" ? "\u0647\u064a\u062f\u0631 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062f\u0641\u0639" : "Webhook signature header"}
                      <input
                        dir="ltr"
                        value={draft.webhook_signature_header}
                        onChange={(event) => updateProviderDraft(provider.id, { webhook_signature_header: event.target.value })}
                        placeholder="x-signature"
                      />
                    </label>
                    <label className="provider-wide-field">
                      {lang === "ar" ? "\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u062a\u0634\u063a\u064a\u0644 \u0644\u0644\u0623\u062f\u0645\u0646" : "Admin operation notes"}
                      <textarea
                        dir="auto"
                        value={draft.instructions}
                        onChange={(event) => updateProviderDraft(provider.id, { instructions: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="provider-actions-row">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={draft.direct_to_merchant}
                        onChange={(event) => updateProviderDraft(provider.id, { direct_to_merchant: event.target.checked })}
                      />
                      <span>{lang === "ar" ? "\u064a\u062f\u0639\u0645 \u0627\u0644\u062f\u0641\u0639 \u0644\u0644\u0645\u062a\u062c\u0631 \u0645\u0628\u0627\u0634\u0631\u0629" : "Supports direct-to-store payment"}</span>
                    </label>
                    <button className="soft-button" disabled={isSaving(saveKey)} onClick={() => void saveProviderSettings(provider)}>
                      <Save size={16} />
                      {isSaving(saveKey) ? (lang === "ar" ? "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638" : "Saving") : t("save", lang)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="ops-card full-width">
          <h2>
            <ShieldCheck size={18} />
            {lang === "ar" ? "\u062e\u0637\u0637 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643" : "Subscription plans"}
          </h2>
          <div className="mini-list">
            {plans.map((plan) => {
              const rowKey = `subscription_plans:${plan.id}`;
              return (
                <div key={plan.id}>
                  <strong>{lang === "ar" ? plan.name_ar ?? plan.name_en : plan.name_en ?? plan.name_ar}</strong>
                  <span>
                    {Number(plan.monthly_price ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}{" "}
                    {lang === "ar" ? "\u062c\u0646\u064a\u0647 \u0634\u0647\u0631\u064a\u0627" : "EGP/month"}
                  </span>
                  <label className="switch compact-switch">
                    <input
                      type="checkbox"
                      checked={plan.is_active}
                      disabled={isSaving(rowKey)}
                      onChange={(event) => void toggleRow("subscription_plans", plan.id, event.target.checked)}
                    />
                    <span />
                  </label>
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}

function providerDraftFrom(provider: PaymentProvider): ProviderDraft {
  const config = provider.configuration ?? {};
  return {
    merchant_id: stringConfig(config, "merchant_id", "merchantId"),
    account_label: stringConfig(config, "account_label", "accountLabel"),
    settlement_account: stringConfig(config, "settlement_account", "settlementAccount"),
    wallet_number: stringConfig(config, "wallet_number", "walletNumber"),
    api_secret_name: stringConfig(config, "api_secret_name", "apiSecretName"),
    webhook_secret_name: provider.webhook_secret_name ?? "",
    webhook_signature_header: provider.webhook_signature_header ?? "",
    direct_to_merchant: Boolean(provider.is_direct_to_merchant_supported),
    instructions: stringConfig(config, "instructions", "notes")
  };
}

function defaultReferralSettingsDraft(): ReferralSettingsDraft {
  return {
    target_confirmed_registrations: "10",
    default_reward_type: "tshirt",
    apply_existing: true
  };
}

function referralDraftFromFlags(flags: Flag[]): ReferralSettingsDraft {
  const referralFlag = flags.find((flag) => flag.key === "referrals_enabled");
  const configuration = referralFlag?.configuration ?? {};
  const threshold = configuration["confirmed_referrals_threshold"];
  const rewardType = configuration["default_reward_type"];
  return {
    target_confirmed_registrations: String(typeof threshold === "number" && Number.isFinite(threshold) ? threshold : 10),
    default_reward_type: rewardType === "monthly_subscription" ? "monthly_subscription" : "tshirt",
    apply_existing: true
  };
}

function emptyProviderDraft(): ProviderDraft {
  return {
    merchant_id: "",
    account_label: "",
    settlement_account: "",
    wallet_number: "",
    api_secret_name: "",
    webhook_secret_name: "",
    webhook_signature_header: "",
    direct_to_merchant: false,
    instructions: ""
  };
}

function providerConfigurationFromDraft(provider: PaymentProvider, draft: ProviderDraft) {
  return {
    ...(provider.configuration ?? {}),
    merchant_id: emptyToNull(draft.merchant_id),
    account_label: emptyToNull(draft.account_label),
    settlement_account: emptyToNull(draft.settlement_account),
    wallet_number: emptyToNull(draft.wallet_number),
    api_secret_name: emptyToNull(draft.api_secret_name),
    instructions: emptyToNull(draft.instructions)
  };
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

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function providerLabel(provider: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    visa: { ar: "\u0641\u064a\u0632\u0627", en: "Visa" },
    meeza: { ar: "\u0645\u064a\u0632\u0629", en: "Meeza" },
    wallet: { ar: "\u0645\u062d\u0627\u0641\u0638 \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629", en: "Wallets" },
    wallets: { ar: "\u0645\u062d\u0627\u0641\u0638 \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629", en: "Wallets" },
    vodafone_cash: { ar: "\u0641\u0648\u062f\u0627\u0641\u0648\u0646 \u0643\u0627\u0634", en: "Vodafone Cash" }
  };
  return labels[provider]?.[lang] ?? provider;
}
