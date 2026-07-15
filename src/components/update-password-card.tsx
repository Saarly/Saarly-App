"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const copy = {
  title: "\u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
  subtitle: "\u0627\u0643\u062a\u0628 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629 \u0644\u062d\u0633\u0627\u0628 \u0644\u0648\u062d\u0629 \u0627\u0644\u0623\u062f\u0645\u0646.",
  password: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629",
  confirm: "\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
  save: "\u062d\u0641\u0638 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
  loading: "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
  wait: "\u0627\u0641\u062a\u062d \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u0645\u0646 \u0644\u064a\u0646\u0643 \u062a\u0639\u064a\u064a\u0646 \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062f \u0627\u0644\u0644\u064a \u0648\u0635\u0644\u0643 \u0639\u0644\u0649 \u0627\u0644\u0625\u064a\u0645\u064a\u0644.",
  mismatch: "\u0643\u0644\u0645\u062a\u064a \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0634 \u0645\u062a\u0637\u0627\u0628\u0642\u064a\u0646.",
  short: "\u0627\u062e\u062a\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 8 \u062d\u0631\u0648\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.",
  done: "\u062a\u0645 \u062d\u0641\u0638 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631. \u062a\u0642\u062f\u0631 \u062a\u0631\u062c\u0639 \u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u062f\u062e\u0648\u0644 \u0648\u062a\u062f\u062e\u0644 \u0628\u0627\u0644\u0625\u064a\u0645\u064a\u0644 \u0648\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062f.",
  back: "\u0627\u0644\u0631\u062c\u0648\u0639 \u0644\u0644\u062f\u062e\u0648\u0644",
  logoAlt: "\u0633\u0639\u0631\u0644\u064a"
};

export function UpdatePasswordCard() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        setReady(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || session) && mounted) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();

    if (password.length < 8) {
      setMessage(copy.short);
      return;
    }

    if (password !== confirmPassword) {
      setMessage(copy.mismatch);
      return;
    }

    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({ password });

    setBusy(false);
    setMessage(error ? error.message : copy.done);
  }

  return (
    <main className="login-page" dir="rtl">
      <section className="login-card">
        <img className="brand-logo brand-logo-large" src="/saarly-logo.png" alt={copy.logoAlt} />
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>

        {ready ? (
          <form onSubmit={updatePassword}>
            <label>
              {copy.password}
              <input
                dir="ltr"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label>
              {copy.confirm}
              <input
                dir="ltr"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>

            <button className="primary-button" disabled={busy || !password || !confirmPassword}>
              {busy ? copy.loading : copy.save}
            </button>
          </form>
        ) : (
          <p className="form-message">{copy.wait}</p>
        )}

        {message ? <p className="form-message">{message}</p> : null}

        <a className="ghost-button full" href="/">
          {copy.back}
        </a>
      </section>
    </main>
  );
}
