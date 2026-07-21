"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Plus, RefreshCw, Save, ShieldCheck, UserCog } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";

type AccessLevel = "full_admin" | "limited_admin" | "support_agent";
type PermissionMap = Record<string, boolean>;

type StaffRow = {
  id: string;
  full_name: string | null;
  mobile: string | null;
  primary_email: string | null;
  internal_role: "admin" | "support_agent";
  role_label: string | null;
  permissions: PermissionMap | null;
  staff_is_active: boolean | null;
  is_blocked: boolean | null;
  created_at: string;
};

type StaffForm = {
  full_name: string;
  email: string;
  mobile: string;
  password: string;
  confirm_password: string;
  role_label: string;
  access_level: AccessLevel;
  permissions: PermissionMap;
};

const permissionGroups = [
  {
    ar: "������� ��������",
    en: "Core admin",
    items: [
      { key: "dashboard", ar: "��������", en: "Dashboard" },
      { key: "users", ar: "����������", en: "Users" },
      { key: "staff", ar: "������ ����������", en: "Team permissions" },
      { key: "audit", ar: "��� ��������", en: "Audit log" }
    ]
  },
  {
    ar: "������� ���������",
    en: "Stores and catalog",
    items: [
      { key: "merchant_approvals", ar: "������� �������", en: "Merchant approvals" },
      { key: "branch_approvals", ar: "������� ������", en: "Branch approvals" },
      { key: "stores", ar: "����� �������", en: "Stores" },
      { key: "store_catalog", ar: "����� ������� ���������", en: "Store catalog moderation" },
      { key: "shipping_companies", ar: "����� �����", en: "Shipping companies" },
      { key: "categories", ar: "�������", en: "Categories" },
      { key: "cities", ar: "����� ��������", en: "Cities and areas" }
    ]
  },
  {
    ar: "������� ������",
    en: "Orders and support",
    items: [
      { key: "orders", ar: "�������", en: "Orders" },
      { key: "support_chats", ar: "������� �����", en: "Support chats" },
      { key: "complaints", ar: "������� ���������", en: "Complaints" },
      { key: "knowledge_base", ar: "����� ����� �����", en: "Bot knowledge base" },
      { key: "content_moderation", ar: "����� �������", en: "Content moderation" },
      { key: "suspicious_matches", ar: "��������� ������� ����", en: "Low confidence matches" },
      { key: "ai_reads", ar: "������ ������ ���������", en: "AI reads" }
    ]
  },
  {
    ar: "������� ���������",
    en: "Marketing and finance",
    items: [
      { key: "broadcast", ar: "����� �������", en: "Send notifications" },
      { key: "ads", ar: "���������", en: "Ads" },
      { key: "reports", ar: "��������", en: "Reports" },
      { key: "monetization", ar: "���������� ����������", en: "Monetization" },
      { key: "payments", ar: "������� �����", en: "Payments" },
      { key: "referrals", ar: "�������� ���������", en: "Referrals" }
    ]
  }
];

const permissionItems = permissionGroups.flatMap((group) => group.items);
const allPermissionKeys = permissionItems.map((item) => item.key);

const blankPermissions = () => Object.fromEntries(allPermissionKeys.map((key) => [key, false])) as PermissionMap;
const fullPermissions = () => Object.fromEntries(allPermissionKeys.map((key) => [key, true])) as PermissionMap;

function initialForm(): StaffForm {
  return {
    full_name: "",
    email: "",
    mobile: "",
    password: "",
    confirm_password: "",
    role_label: "",
    access_level: "limited_admin",
    permissions: blankPermissions()
  };
}

export function StaffManagement({ lang }: { lang: Lang }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [form, setForm] = useState<StaffForm>(initialForm);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [editRoleLabel, setEditRoleLabel] = useState("");
  const [editAccessLevel, setEditAccessLevel] = useState<AccessLevel>("limited_admin");
  const [editPermissions, setEditPermissions] = useState<PermissionMap>(blankPermissions);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeCount = useMemo(() => staff.filter((row) => row.staff_is_active && !row.is_blocked).length, [staff]);

  async function loadStaff() {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("admin_staff_readable")
      .select("*")
      .order("created_at", { ascending: false });
    setStaff((data ?? []) as StaffRow[]);
    setError(loadError ? normalizeError(new Error(loadError.message.includes("admin_staff_readable") ? "admin_staff_sql_not_applied" : loadError.message), lang) : null);
    setLoading(false);
  }

  async function postAdminAction(body: Record<string, unknown>) {
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

  function setAccessLevel(accessLevel: AccessLevel) {
    setForm((current) => ({
      ...current,
      access_level: accessLevel,
      permissions: accessLevel === "full_admin" ? fullPermissions() : blankPermissions()
    }));
  }

  function togglePermission(key: string) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: !current.permissions[key]
      }
    }));
  }

  function toggleEditPermission(key: string) {
    setEditPermissions((current) => ({ ...current, [key]: !current[key] }));
  }

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (form.password.length < 8) {
        throw new Error("password_must_be_at_least_8_chars");
      }
      if (form.password !== form.confirm_password) {
        throw new Error("passwords_do_not_match");
      }

      await postAdminAction({
        action: "create_admin_staff",
        payload: {
          full_name: form.full_name,
          email: form.email,
          mobile: form.mobile,
          password: form.password,
          role_label: form.role_label,
          access_level: form.access_level,
          permissions: form.permissions
        }
      });

      setForm(initialForm());
      setMessage(lang === "ar" ? "�� ����� ���� ������ ���� ��������." : "Staff account created with permissions.");
      await loadStaff();
    } catch (createError) {
      setError(normalizeError(createError, lang));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: StaffRow) {
    const accessLevel = accessLevelForRow(row);
    setEditing(row);
    setEditRoleLabel(row.role_label ?? "");
    setEditAccessLevel(accessLevel);
    setEditPermissions(accessLevel === "full_admin" ? fullPermissions() : { ...blankPermissions(), ...readPermissions(row.permissions) });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await postAdminAction({
        action: "update_staff_permissions",
        id: editing.id,
        payload: {
          role_label: editRoleLabel,
          access_level: editAccessLevel,
          permissions: editAccessLevel === "full_admin" ? fullPermissions() : editPermissions,
          is_active: editing.staff_is_active !== false && editing.is_blocked !== true
        }
      });

      setEditing(null);
      setMessage(lang === "ar" ? "�� ����� ������� ������." : "Staff permissions updated.");
      await loadStaff();
    } catch (saveError) {
      setError(normalizeError(saveError, lang));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStaffActive(row: StaffRow) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const enabled = !(row.staff_is_active && !row.is_blocked);
      await postAdminAction({
        action: "set_staff_active",
        id: row.id,
        payload: { enabled }
      });
      setMessage(enabled ? (lang === "ar" ? "�� ����� ������." : "Account enabled.") : lang === "ar" ? "�� ����� ������." : "Account disabled.");
      await loadStaff();
    } catch (toggleError) {
      setError(normalizeError(toggleError, lang));
    } finally {
      setSaving(false);
    }
  }

  async function setPassword(row: StaffRow) {
    const password = window.prompt(lang === "ar" ? "���� ���� ���� ����� ���� ������" : "Enter a new password for this account");
    if (!password) return;
    const confirmation = window.prompt(lang === "ar" ? "���� ��� ���� ������ �������" : "Confirm the new password");
    if (password !== confirmation) {
      setError(lang === "ar" ? "����� ������ ��� ���������." : "Passwords do not match.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await postAdminAction({
        action: "set_user_password",
        id: row.id,
        payload: { password }
      });
      setMessage(lang === "ar" ? "�� ����� ���� ������." : "Password updated.");
    } catch (passwordError) {
      setError(normalizeError(passwordError, lang));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadStaff();
  }, []);

  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "���� ���� �� ���� ������" : "Admin team control"}</span>
          <h1>{lang === "ar" ? "������ ����������" : "Team and permissions"}</h1>
          <p>
            {lang === "ar"
              ? "��� ���� ���ϡ ���� ��� �����ɡ ���� ������� ���������� �������� �� �� ��� �� ���� Supabase."
              : "Add a staff account, name the rank, and choose what it can access without opening Supabase."}
          </p>
        </div>
        <button className="soft-button" onClick={loadStaff}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {message ? <div className="success-alert"><CheckCircle2 size={18} /> {message}</div> : null}

      <div className="staff-layout">
        <form className="staff-form ops-card" onSubmit={createStaff}>
          <div className="staff-form-head">
            <Plus size={20} />
            <h2>{lang === "ar" ? "����� ��� ����" : "Add new staff"}</h2>
          </div>

          <div className="form-split">
            <label>
              {lang === "ar" ? "�����" : "Name"}
              <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required />
            </label>
            <label>
              {lang === "ar" ? "��� ������" : "Rank name"}
              <input value={form.role_label} onChange={(event) => setForm((current) => ({ ...current, role_label: event.target.value }))} placeholder={lang === "ar" ? "����: ���� �����" : "Example: Store manager"} required />
            </label>
          </div>

          <div className="form-split">
            <label>
              {lang === "ar" ? "�������" : "Email"}
              <input dir="ltr" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
            </label>
            <label>
              {lang === "ar" ? "��������" : "Mobile"}
              <input dir="ltr" value={form.mobile} onChange={(event) => setForm((current) => ({ ...current, mobile: event.target.value }))} required />
            </label>
          </div>

          <div className="form-split">
            <label>
              {lang === "ar" ? "���� ������" : "Password"}
              <input dir="ltr" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
            </label>
            <label>
              {lang === "ar" ? "����� ���� ������" : "Confirm password"}
              <input dir="ltr" type="password" value={form.confirm_password} onChange={(event) => setForm((current) => ({ ...current, confirm_password: event.target.value }))} required />
            </label>
          </div>

          <div className="access-options">
            {accessOptions(lang).map((option) => (
              <button
                type="button"
                className={form.access_level === option.id ? "access-card active" : "access-card"}
                key={option.id}
                onClick={() => setAccessLevel(option.id)}
              >
                <strong>{option.title}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>

          <PermissionChecklist
            lang={lang}
            permissions={form.access_level === "full_admin" ? fullPermissions() : form.permissions}
            disabled={form.access_level === "full_admin"}
            onToggle={togglePermission}
          />

          <button className="primary-button broadcast-submit" disabled={saving}>
            <Save size={18} />
            {saving ? t("loading", lang) : lang === "ar" ? "����� ������" : "Create account"}
          </button>
        </form>

        <aside className="staff-list ops-card">
          <div className="staff-form-head">
            <ShieldCheck size={20} />
            <h2>{lang === "ar" ? "������ ������" : "Current team"}</h2>
          </div>
          <p className="muted">
            {lang === "ar" ? `��� ����: ${activeCount}` : `Active now: ${activeCount}`}
          </p>

          {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
          {!loading && staff.length === 0 ? <div className="empty-state">{t("noRows", lang)}</div> : null}

          <div className="staff-card-list">
            {staff.map((row) => (
              <article className="staff-card" key={row.id}>
                <div>
                  <strong>{row.full_name || row.primary_email}</strong>
                  <span>{row.role_label || internalRoleLabel(row.internal_role, lang)}</span>
                  <small>{row.primary_email} | {row.mobile || "-"}</small>
                </div>
                <span className={row.staff_is_active && !row.is_blocked ? "status-pill active" : "status-pill muted"}>
                  {row.staff_is_active && !row.is_blocked ? (lang === "ar" ? "���" : "Active") : lang === "ar" ? "�����" : "Inactive"}
                </span>
                <p className="muted">{permissionSummary(row, lang)}</p>
                <div className="row-actions">
                  <button className="tiny-button" type="button" onClick={() => startEdit(row)}>
                    <UserCog size={14} />
                    {lang === "ar" ? "�����" : "Edit"}
                  </button>
                  <button className="tiny-button" type="button" onClick={() => void setPassword(row)}>
                    <KeyRound size={14} />
                    {lang === "ar" ? "������" : "Password"}
                  </button>
                  <button className="tiny-button" type="button" onClick={() => void toggleStaffActive(row)} disabled={saving}>
                    {row.staff_is_active && !row.is_blocked ? (lang === "ar" ? "�����" : "Disable") : lang === "ar" ? "�����" : "Enable"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>

      {editing ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card staff-edit-modal">
            <h2>{lang === "ar" ? "����� ������ ����������" : "Edit rank and permissions"}</h2>
            <label>
              {lang === "ar" ? "��� ������" : "Rank name"}
              <input value={editRoleLabel} onChange={(event) => setEditRoleLabel(event.target.value)} />
            </label>
            <div className="access-options">
              {accessOptions(lang).map((option) => (
                <button
                  type="button"
                  className={editAccessLevel === option.id ? "access-card active" : "access-card"}
                  key={option.id}
                  onClick={() => {
                    setEditAccessLevel(option.id);
                    setEditPermissions(option.id === "full_admin" ? fullPermissions() : blankPermissions());
                  }}
                >
                  <strong>{option.title}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>
            <PermissionChecklist
              lang={lang}
              permissions={editAccessLevel === "full_admin" ? fullPermissions() : editPermissions}
              disabled={editAccessLevel === "full_admin"}
              onToggle={toggleEditPermission}
            />
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setEditing(null)}>
                {t("cancel", lang)}
              </button>
              <button className="primary-button" onClick={() => void saveEdit()} disabled={saving}>
                {t("save", lang)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PermissionChecklist({
  lang,
  permissions,
  disabled,
  onToggle
}: {
  lang: Lang;
  permissions: PermissionMap;
  disabled?: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="permission-groups">
      {permissionGroups.map((group) => (
        <section className="permission-group" key={group.en}>
          <h3>{lang === "ar" ? group.ar : group.en}</h3>
          <div className="permission-grid">
            {group.items.map((item) => (
              <label className={permissions[item.key] ? "permission-check active" : "permission-check"} key={item.key}>
                <input
                  type="checkbox"
                  checked={permissions[item.key] === true}
                  disabled={disabled}
                  onChange={() => onToggle(item.key)}
                />
                <span>{lang === "ar" ? item.ar : item.en}</span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function accessOptions(lang: Lang): Array<{ id: AccessLevel; title: string; hint: string }> {
  return [
    {
      id: "limited_admin",
      title: lang === "ar" ? "���� �������� �����" : "Limited admin",
      hint: lang === "ar" ? "���� ������ ��� ���������� ���� ���." : "Can use the dashboard based on the checked permissions."
    },
    {
      id: "support_agent",
      title: lang === "ar" ? "���� ���" : "Support agent",
      hint: lang === "ar" ? "����� ����� �������� ����������." : "Best for support, complaints, and chats."
    },
    {
      id: "full_admin",
      title: lang === "ar" ? "���� �������� �����" : "Full-permission admin",
      hint: lang === "ar" ? "���� ������ �� �� ���." : "Can see and control everything."
    }
  ];
}

function accessLevelForRow(row: StaffRow): AccessLevel {
  const permissions = readPermissions(row.permissions);
  if (row.internal_role === "support_agent") return "support_agent";
  return permissions.__limit_admin === true ? "limited_admin" : "full_admin";
}

function readPermissions(value: PermissionMap | null | undefined) {
  if (!value || typeof value !== "object") return {};
  return value;
}

function internalRoleLabel(role: string, lang: Lang) {
  if (role === "admin") return lang === "ar" ? "���� ����" : "Full admin";
  return lang === "ar" ? "���� ���" : "Support agent";
}

function permissionSummary(row: StaffRow, lang: Lang) {
  const permissions = readPermissions(row.permissions);
  if (row.internal_role === "admin" && permissions.__limit_admin !== true) {
    return lang === "ar" ? "�� ���������" : "All permissions";
  }
  const enabled = permissionItems.filter((item) => permissions[item.key]).slice(0, 5);
  if (enabled.length === 0) return lang === "ar" ? "�� ���� ������� �����" : "No permissions selected";
  const names = enabled.map((item) => (lang === "ar" ? item.ar : item.en)).join("� ");
  const extra = permissionItems.filter((item) => permissions[item.key]).length - enabled.length;
  return extra > 0 ? `${names} +${extra}` : names;
}

function normalizeError(error: unknown, lang: Lang) {
  const message = error instanceof Error ? error.message : String(error);
  const labels: Record<string, { ar: string; en: string }> = {
    service_role_key_missing: {
      ar: "����� ������ ��� ����� �� Vercel� ���� �� ���� ����� �� ����� ������ ������.",
      en: "The service role key is missing in Vercel, so staff accounts cannot be changed."
    },
    admin_staff_sql_not_applied: {
      ar: "��� SQL ����� ����� ������ �� ��� ������ �� Supabase ���.",
      en: "The staff permissions SQL file has not been run in Supabase yet."
    },
    password_must_be_at_least_8_chars: {
      ar: "���� ������ ���� ���� 8 ���� ��� �����.",
      en: "Password must be at least 8 characters."
    },
    passwords_do_not_match: {
      ar: "����� ������ ��� ���������.",
      en: "Passwords do not match."
    },
    permission_denied: {
      ar: "��� ������ �� ���� ������ ����� ��� �������.",
      en: "This account does not have permission for this action."
    },
    cannot_disable_your_own_account: {
      ar: "�� ����� ����� ����� ������ �� ���.",
      en: "You cannot disable your current account here."
    },
    cannot_limit_your_own_admin_account: {
      ar: "�� ����� ����� ������� ����� ������ �� ���.",
      en: "You cannot limit your current admin account here."
    }
  };
  return labels[message]?.[lang] ?? humanizeAdminError(message, lang);
}
