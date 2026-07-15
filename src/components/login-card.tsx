"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";

export function LoginCard({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    setMessage(error ? error.message : lang === "ar" ? "تم الدخول." : "Signed in.");
  }

  async function sendMagicLink() {
    setBusy(true);
    setMessage(null);
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    setBusy(false);
    setMessage(
      error
        ? error.message
        : lang === "ar"
          ? "تم إرسال رابط الدخول على الإيميل."
          : "Magic link sent to email."
    );
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <img className="brand-logo brand-logo-large" src="/saarly-logo.png" alt="سعرلي" />
        <h1>{t("loginTitle", lang)}</h1>
        <p>{t("loginSubtitle", lang)}</p>
        <form onSubmit={signInWithPassword}>
          <label>
            {t("email", lang)}
            <input
              dir="ltr"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            {t("password", lang)}
            <input
              dir="ltr"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="primary-button" disabled={busy || !email}>
            {busy ? t("loading", lang) : t("signIn", lang)}
          </button>
        </form>
        <button className="ghost-button full" onClick={sendMagicLink} disabled={busy || !email}>
          {t("sendLink", lang)}
        </button>
        {message ? <p className="form-message">{message}</p> : null}
      </section>
    </main>
  );
}
