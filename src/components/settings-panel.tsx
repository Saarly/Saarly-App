"use client";

import { useEffect, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";

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
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        .select("id, provider, is_enabled, is_direct_to_merchant_supported")
        .order("provider", { ascending: true }),
      supabase
        .from("subscription_plans")
        .select("id, name_ar, name_en, monthly_price, is_active, billing_period_months, grace_months")
        .order("monthly_price", { ascending: true })
    ]);

    setFlags((flagResult.data ?? []) as Flag[]);
    setProviders((providerResult.data ?? []) as PaymentProvider[]);
    setPlans((planResult.data ?? []) as SubscriptionPlan[]);

    const firstError = flagResult.error ?? providerResult.error ?? planResult.error;
    setError(firstError?.message ?? null);
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

  async function toggleRow(table: string, id: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      await postAction({ action: "toggle_active", table, id, payload: { enabled } });
      await loadSettings();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadSettings();
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

      {error ? <div className="alert">{error === "service_role_key_missing" ? t("serviceKeyMissing", lang) : error}</div> : null}

      <div className="settings-grid">
        {flags.map((flag) => {
          const label = flagLabels[flag.key];
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
                  disabled={saving}
                  onChange={(event) => void toggleRow("feature_flags", flag.key, event.target.checked)}
                />
                <span />
              </label>
            </article>
          );
        })}
      </div>

      <div className="settings-grid">
        <article className="ops-card full-width">
          <h2>
            <CreditCard size={18} />
            {lang === "ar" ? "\u0637\u0631\u0642 \u0627\u0644\u062f\u0641\u0639" : "Payment methods"}
          </h2>
          <div className="mini-list">
            {providers.map((provider) => (
              <div key={provider.id}>
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
                <label className="switch compact-switch">
                  <input
                    type="checkbox"
                    checked={provider.is_enabled}
                    disabled={saving}
                    onChange={(event) => void toggleRow("payment_settings", provider.id, event.target.checked)}
                  />
                  <span />
                </label>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-card full-width">
          <h2>
            <ShieldCheck size={18} />
            {lang === "ar" ? "\u062e\u0637\u0637 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643" : "Subscription plans"}
          </h2>
          <div className="mini-list">
            {plans.map((plan) => (
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
                    disabled={saving}
                    onChange={(event) => void toggleRow("subscription_plans", plan.id, event.target.checked)}
                  />
                  <span />
                </label>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function providerLabel(provider: string, lang: Lang) {
  const labels: Record<string, { ar: string; en: string }> = {
    visa: { ar: "\u0641\u064a\u0632\u0627", en: "Visa" },
    meeza: { ar: "\u0645\u064a\u0632\u0629", en: "Meeza" },
    wallet: { ar: "\u0645\u062d\u0627\u0641\u0638 \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629", en: "Wallets" },
    vodafone_cash: { ar: "\u0641\u0648\u062f\u0627\u0641\u0648\u0646 \u0643\u0627\u0634", en: "Vodafone Cash" }
  };
  return labels[provider]?.[lang] ?? provider;
}
