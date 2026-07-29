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
import { humanizeAdminError } from "@/lib/admin/messages";
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
import { MonetizationConsole } from "@/components/monetization-console";
import { ComplaintsConsole } from "@/components/complaints-console";
import { PageGuide } from "@/components/page-guide";

const navigationGroups = [
  {
    title: { ar: "الرئيسية", en: "Main" },
    sectionIds: ["dashboard"],
  },
  {
    title: { ar: "إدارة المتاجر", en: "Store management" },
    sectionIds: [
      "merchant-approvals",
      "branch-approvals",
      "store-catalog",
      "categories",
      "cities",
    ],
  },
  {
    title: { ar: "إدارة المستخدمين", en: "User management" },
    sectionIds: ["users", "staff"],
  },
  {
    title: { ar: "التشغيل", en: "Operations" },
    sectionIds: [
      "orders",
      "shipping-companies",
      "payments",
      "referrals",
      "monetization",
    ],
  },
  {
    title: { ar: "التسويق والدعم", en: "Marketing and support" },
    sectionIds: ["ads", "broadcast", "complaints", "support"],
  },
  {
    title: { ar: "الذكاء الاصطناعي والبيانات", en: "AI and data" },
    sectionIds: ["ai-reads", "knowledge", "reports", "content-moderation"],
  },
] as const;

export function AdminConsole({ initialSection = "dashboard" }: { initialSection?: string }) {
  const [lang, setLang] = useState<Lang>("ar");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [booting, setBooting] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const section = useMemo(() => findSection(initialSection), [initialSection]);
  const navSections = useMemo(() => visibleSections(profile), [profile]);
  const groupedNavigation = useMemo(() => {
    const visibleById = new Map(navSections.map((item) => [item.id, item]));
    return navigationGroups
      .map((group) => ({
        ...group,
        sections: group.sectionIds
          .map((sectionId) => visibleById.get(sectionId))
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      }))
      .filter((group) => group.sections.length > 0);
  }, [navSections]);

  async function loadProfile(currentSession: Session | null) {
    if (!currentSession?.user) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    setCheckingProfile(true);
    setProfileError(null);

    try {
      const { data: rpcProfile, error: rpcError } = await supabase.rpc("admin_web_my_profile");
      if (!rpcError && rpcProfile && typeof rpcProfile === "object" && !Array.isArray(rpcProfile)) {
        setProfile(rpcProfile as AdminProfile);
        setProfileError(null);
        return;
      }

      const response = await fetch(`/api/admin/action?profile=1&t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`
        }
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: AdminProfile;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        const rawError =
          payload.error ??
          rpcError?.message ??
          (response.status === 405
            ? "admin_profile_api_not_deployed"
            : `admin_profile_check_failed_${response.status}`);
        setProfile(null);
        setProfileError(humanizeAdminError(rawError, lang));
        return;
      }

      setProfile(payload.data);
      setProfileError(null);
    } catch {
      setProfile(null);
      setProfileError(
        lang === "ar"
          ? "تعذر التحقق من صلاحيات لوحة الإدارة. حدّث الصفحة ثم حاول مرة أخرى."
          : "Could not verify admin permissions. Refresh the page and try again."
      );
    } finally {
      setCheckingProfile(false);
    }
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
    document.title = lang === "ar" ? "لوحة إدارة سعرلي" : "Saarly Admin Panel";
    const description =
      lang === "ar"
        ? "لوحة إدارة عمليات سعرلي والدعم والمدفوعات والإعدادات."
        : "Admin panel for Saarly operations, support, payments, and settings.";
    let descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!descriptionMeta) {
      descriptionMeta = document.createElement("meta");
      descriptionMeta.name = "description";
      document.head.appendChild(descriptionMeta);
    }
    descriptionMeta.content = description;
    window.localStorage.setItem("saarly-admin-lang", lang);
    window.localStorage.setItem("saarly-admin-theme", theme);
  }, [lang, theme]);

  async function signOut() {
    setBooting(false);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setProfileError(null);
  }

  async function retryProfileCheck() {
    setBooting(true);
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session);
    setBooting(false);
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
          <img className="brand-logo brand-logo-large" src="/saarly-logo.png" alt={lang === "ar" ? "سعرلي" : "Saarly"} />
          <h1>{t("unauthorized", lang)}</h1>
          {profileError ? <p className="login-error-detail">{profileError}</p> : null}
          <button className="ghost-button" onClick={() => void retryProfileCheck()} disabled={checkingProfile}>
            {checkingProfile
              ? t("loading", lang)
              : lang === "ar"
                ? "إعادة فحص الصلاحيات"
                : "Check permissions again"}
          </button>
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
          <img className="brand-logo brand-logo-sidebar" src="/saarly-logo.png" alt={lang === "ar" ? "سعرلي" : "Saarly"} />
          <div>
            <strong>{t("appName", lang)}</strong>
            <span>
              {profile.role_label ||
                (profile.role === "admin"
                  ? lang === "ar"
                    ? "مدير"
                    : "Administrator"
                  : lang === "ar"
                    ? "موظف دعم"
                    : "Support agent")}
            </span>
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
          {groupedNavigation.map((group) => (
            <div className="sidebar-nav-group" key={group.title.en}>
              <span className="sidebar-nav-heading">{tr(group.title, lang)}</span>
              {group.sections.map((navSection) => (
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
            </div>
          ))}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-only mobile-menu" onClick={() => setMenuOpen((current) => !current)} aria-label={lang === "ar" ? "فتح القائمة" : "Open menu"}>
            <Menu size={20} />
          </button>
          <div>
            <strong>{tr(section.title, lang)}</strong>
            <span>{t("readOnly", lang)}</span>
          </div>
          <div className="topbar-actions">
            <button className="soft-button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {lang === "ar" ? "الإنجليزية" : "Arabic"}
            </button>
            <button
              className="icon-only"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={
                theme === "light"
                  ? lang === "ar"
                    ? "تفعيل الوضع الداكن"
                    : "Enable dark mode"
                  : lang === "ar"
                    ? "تفعيل الوضع الفاتح"
                    : "Enable light mode"
              }
              title={
                theme === "light"
                  ? lang === "ar"
                    ? "الوضع الداكن"
                    : "Dark mode"
                  : lang === "ar"
                    ? "الوضع الفاتح"
                    : "Light mode"
              }
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="soft-button" onClick={signOut}>
              <LogOut size={17} />
              {t("signOut", lang)}
            </button>
          </div>
        </header>

        {allowed ? <PageGuide sectionId={section.id} lang={lang} /> : null}

        {!allowed ? (
          <section className="content-panel">
            <div className="empty-state">{t("unauthorized", lang)}</div>
          </section>
        ) : section.mode === "dashboard" ? (
          <DashboardPanel lang={lang} />
        ) : section.mode === "support" ? (
          <SupportConsole lang={lang} profile={profile} />
        ) : section.mode === "reports" ? (
          <ReportsPanel lang={lang} />
        ) : section.mode === "settings" ? (
          <SettingsPanel lang={lang} />
        ) : section.mode === "monetization" ? (
          <MonetizationConsole lang={lang} />
        ) : section.mode === "complaints" ? (
          <ComplaintsConsole lang={lang} profile={profile} />
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
