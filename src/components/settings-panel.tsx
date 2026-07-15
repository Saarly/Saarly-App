"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";

type Flag = {
  id: string;
  key: string;
  description_ar: string | null;
  description_en: string | null;
  is_enabled: boolean;
  configuration: Record<string, unknown> | null;
};

const monetizationKeys = [
  "monetization_enabled",
  "merchant_monthly_subscription_enabled",
  "merchant_commission_enabled",
  "merchant_can_choose_billing_model",
  "buyer_in_app_payment_enabled",
  "referrals_enabled"
];

export function SettingsPanel({ lang }: { lang: Lang }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadFlags() {
    setError(null);
    const { data, error: loadError } = await supabase
      .from("feature_flags")
      .select("id, key, description_ar, description_en, is_enabled, configuration")
      .in("key", monetizationKeys)
      .order("key", { ascending: true });
    setFlags((data ?? []) as Flag[]);
    setError(loadError?.message ?? null);
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

  async function toggleFlag(flag: Flag, enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      await postAction({
        action: "toggle_active",
        table: "feature_flags",
        id: flag.id,
        payload: { enabled }
      });
      await loadFlags();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadFlags();
  }, []);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Feature flags</span>
          <h1>{lang === "ar" ? "الاشتراكات والمدفوعات" : "Monetization"}</h1>
          <p>
            {lang === "ar"
              ? "الميزات المدفوعة تظل مخفية في التطبيق طالما flags مقفولة."
              : "Paid features stay hidden in the app while flags are disabled."}
          </p>
        </div>
        <button className="soft-button" onClick={loadFlags}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error === "service_role_key_missing" ? t("serviceKeyMissing", lang) : error}</div> : null}

      <div className="settings-grid">
        {flags.map((flag) => (
          <article className="flag-card" key={flag.key}>
            <div>
              <strong>{flag.key}</strong>
              <p>{lang === "ar" ? flag.description_ar : flag.description_en}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={flag.is_enabled}
                disabled={saving}
                onChange={(event) => void toggleFlag(flag, event.target.checked)}
              />
              <span />
            </label>
          </article>
        ))}
      </div>

      <div className="ops-card full-width">
        <h2>{lang === "ar" ? "الخطوة التالية" : "Next step"}</h2>
        <p>
          {lang === "ar"
            ? "خطط الاشتراك ومقدمي الدفع يمكن إدارتهم من أقسام الجداول، أو نضيف فورم تفصيلي لهم بعد اختيار مقدم الدفع الفعلي."
            : "Subscription plans and providers are editable from data sections; a detailed provider form can follow once the payment provider is chosen."}
        </p>
        <button className="soft-button" disabled>
          <Save size={17} />
          {lang === "ar" ? "إعداد مقدم دفع فعلي لاحقا" : "Configure real provider later"}
        </button>
      </div>
    </section>
  );
}

