"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t, tr } from "@/lib/admin/i18n";
import type { AdminProfile } from "@/lib/admin/types";
import { findSection, sectionIsAllowed, visibleSections } from "@/lib/admin/sections";
import { LoginCard } from "@/components/login-card";
import { AdminIcon } from "@/components/icon";
import { DashboardPanel } from "@/components/dashboard-panel";
import { DataSection } from "@/components/data-section";
import { SupportConsole } from "@/components/support-console";
import { ReportsPanel } from "@/components/reports-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { StoreCatalogModeration } from "@/components/store-catalog-moderation";
import { NotificationBroadcast } from "@/components/notification-broadcast";
import { StaffManagement } from "@/components/staff-management";

export function AdminConsole({ initialSection = "dashboard" }: { initialSection?: string }) {
  const [lang, setLang] = useState<Lang>("ar");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const section = useMemo(() => findSection(initialSection), [initialSection]);
  const navSections = useMemo(() => visibleSections(profile), [profile]);

  async function loadProfile(currentSession: Session | null) {
    if (!currentSession?.user) {
      setProfile(null);
      return;
    }

    const response = await fetch("/api/admin/action", {
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`
      }
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: AdminProfile;
    };

    if (!response.ok || !payload.data) {
      setProfile(null);
      return;
    }

    setProfile(payload.data);
  }

  useEffect(() => {
    const savedLang = window.localStorage.getItem("saarly-admin-lang");
    const savedTheme = window.localStorage.getItem("saarly-admin-theme");
    if (savedLang === "ar" || savedLang === "en") setLang(savedLang);
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setBooting(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        setSession(nextSession);
        await loadProfile(nextSession);
        setBooting(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("saarly-admin-lang", lang);
    window.localStorage.setItem("saarly-admin-theme", theme);
  }, [lang, theme]);

  async function signOut() {
    setBooting(false);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  if (booting) {
    return <main className="admin-boot-screen" aria-label={t("loading", lang)} />;
  }

  if (!session) {
    return <LoginCard lang={lang} />;
  }

  if (!profile) {
    return (
      <main className="login-page">
        <section className="login-card">
          <img className="brand-logo brand-logo-large" src="/saarly-logo.png" alt="سعرلي" />
          <h1>{t("unauthorized", lang)}</h1>
          <button className="primary-button" onClick={signOut}>
            {t("signOut", lang)}
          </button>
        </section>
      </main>
    );
  }

  const allowed = sectionIsAllowed(section, profile);

  return (
    <div className="admin-shell">
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label={lang === "ar" ? "إغلاق القائمة" : "Close menu"}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebar-brand">
          <img className="brand-logo brand-logo-sidebar" src="/saarly-logo.png" alt="سعرلي" />
          <div>
            <strong>{t("appName", lang)}</strong>
            <span>{profile.role_label || (profile.role === "admin" ? "Admin" : "Support")}</span>
          </div>
          <button
            type="button"
            className="icon-only sidebar-close"
            aria-label={lang === "ar" ? "إغلاق القائمة" : "Close menu"}
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          {navSections.map((navSection) => (
            <Link
              key={navSection.id}
              href={navSection.href}
              className={navSection.id === section.id ? "active" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <AdminIcon name={navSection.icon} />
              <span>{tr(navSection.title, lang)}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-only mobile-menu" onClick={() => setMenuOpen((current) => !current)} aria-label="menu">
            <Menu size={20} />
          </button>
          <div>
            <strong>{tr(section.title, lang)}</strong>
            <span>{t("readOnly", lang)}</span>
          </div>
          <div className="topbar-actions">
            <button className="soft-button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {lang === "ar" ? "EN" : "عربي"}
            </button>
            <button className="icon-only" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="soft-button" onClick={signOut}>
              <LogOut size={17} />
              {t("signOut", lang)}
            </button>
          </div>
        </header>

        {!allowed ? (
          <section className="content-panel">
            <div className="empty-state">{t("unauthorized", lang)}</div>
          </section>
        ) : section.mode === "dashboard" ? (
          <DashboardPanel lang={lang} />
        ) : section.mode === "support" ? (
          <SupportConsole lang={lang} />
        ) : section.mode === "reports" ? (
          <ReportsPanel lang={lang} />
        ) : section.mode === "settings" ? (
          <SettingsPanel lang={lang} />
        ) : section.mode === "catalog" ? (
          <StoreCatalogModeration lang={lang} />
        ) : section.mode === "broadcast" ? (
          <NotificationBroadcast lang={lang} />
        ) : section.mode === "staff" ? (
          <StaffManagement lang={lang} />
        ) : (
          <DataSection section={section} lang={lang} />
        )}
      </main>
    </div>
  );
}
