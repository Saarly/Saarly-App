"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";

const loginPageStyle = {
  minHeight: "100svh",
  display: "grid",
  placeItems: "center",
  padding: "16px",
  overflowX: "hidden",
  background: "#f7f6f3"
} satisfies CSSProperties;

const loginCardStyle = {
  width: "min(440px, 100%)",
  display: "grid",
  gap: "18px",
  background: "#ffffff",
  color: "#23262b",
  border: "1px solid #dedbd3",
  borderRadius: "8px",
  padding: "clamp(18px, 5vw, 28px)",
  boxShadow: "0 14px 40px rgba(35, 38, 43, 0.08)"
} satisfies CSSProperties;

const loginLogoStyle = {
  width: "min(190px, 70vw)",
  height: "auto",
  maxWidth: "100%",
  objectFit: "contain",
  objectPosition: "center"
} satisfies CSSProperties;

const formStyle = {
  display: "grid",
  gap: "14px"
} satisfies CSSProperties;

const loginCopy = {
  title: {
    ar: "\u062f\u062e\u0648\u0644 \u0644\u0648\u062d\u0629 \u0627\u0644\u0625\u062f\u0627\u0631\u0629",
    en: "Admin sign in"
  },
  subtitle: {
    ar: "\u0645\u0633\u0645\u0648\u062d \u0641\u0642\u0637 \u0644\u0644\u0623\u062f\u0645\u0646 \u0648\u0645\u0648\u0638\u0641\u064a \u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u0645\u0633\u062c\u0644\u064a\u0646.",
    en: "Only registered admins and support agents can access."
  },
  email: {
    ar: "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
    en: "Email"
  },
  password: {
    ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    en: "Password"
  },
  signIn: {
    ar: "\u062f\u062e\u0648\u0644",
    en: "Sign in"
  },
  sendCode: {
    ar: "\u0625\u0631\u0633\u0627\u0644 \u0643\u0648\u062f \u062f\u062e\u0648\u0644",
    en: "Send sign-in code"
  },
  otp: {
    ar: "\u0643\u0648\u062f \u0627\u0644\u062f\u062e\u0648\u0644",
    en: "Sign-in code"
  },
  verifyCode: {
    ar: "\u062f\u062e\u0648\u0644 \u0628\u0627\u0644\u0643\u0648\u062f",
    en: "Sign in with code"
  },
  codeHint: {
    ar: "\u0627\u0643\u062a\u0628 \u0627\u0644\u0643\u0648\u062f \u0627\u0644\u0644\u064a \u0648\u0635\u0644\u0643 \u0639\u0644\u0649 \u0627\u0644\u0625\u064a\u0645\u064a\u0644\u060c \u0645\u062a\u062d\u0637\u0648\u0634 \u0641\u064a \u062e\u0627\u0646\u0629 \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062f.",
    en: "Enter the code from your email here, not in the password field."
  },
  loading: {
    ar: "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
    en: "Loading..."
  },
  signedIn: {
    ar: "\u062a\u0645 \u0627\u0644\u062f\u062e\u0648\u0644.",
    en: "Signed in."
  },
  codeSent: {
    ar: "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0643\u0648\u062f \u0627\u0644\u062f\u062e\u0648\u0644 \u0639\u0644\u0649 \u0627\u0644\u0625\u064a\u0645\u064a\u0644.",
    en: "Sign-in code sent to email."
  },
  logoAlt: {
    ar: "\u0633\u0639\u0631\u0644\u064a",
    en: "Saarly"
  }
} satisfies Record<string, Record<Lang, string>>;

function text(key: keyof typeof loginCopy, lang: Lang) {
  return loginCopy[key][lang];
}

export function LoginCard({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    setMessage(error ? error.message : text("signedIn", lang));
  }

  async function sendOtpCode() {
    setBusy(true);
    setMessage(null);

    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false
      }
    });

    setBusy(false);
    setMessage(error ? error.message : text("codeSent", lang));
  }

  async function verifyOtpCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email"
    });

    setBusy(false);
    setMessage(error ? error.message : text("signedIn", lang));
  }

  return (
    <main className="login-page" style={loginPageStyle}>
      <section className="login-card" style={loginCardStyle}>
        <img
          className="brand-logo brand-logo-large"
          src="/saarly-logo.png"
          alt={text("logoAlt", lang)}
          width={190}
          height={65}
          style={loginLogoStyle}
        />
        <h1>{text("title", lang)}</h1>
        <p>{text("subtitle", lang)}</p>

        <form onSubmit={signInWithPassword} style={formStyle}>
          <label>
            {text("email", lang)}
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
            {text("password", lang)}
            <input
              dir="ltr"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button className="primary-button" disabled={busy || !email || !password}>
            {busy ? text("loading", lang) : text("signIn", lang)}
          </button>
        </form>

        <button className="ghost-button full" onClick={sendOtpCode} disabled={busy || !email}>
          {busy ? text("loading", lang) : text("sendCode", lang)}
        </button>

        <form onSubmit={verifyOtpCode} style={formStyle}>
          <label>
            {text("otp", lang)}
            <input
              dir="ltr"
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              autoComplete="one-time-code"
            />
          </label>

          <p>{text("codeHint", lang)}</p>

          <button className="primary-button" disabled={busy || !email || !otp.trim()}>
            {busy ? text("loading", lang) : text("verifyCode", lang)}
          </button>
        </form>

        {message ? <p className="form-message">{message}</p> : null}
      </section>
    </main>
  );
}
