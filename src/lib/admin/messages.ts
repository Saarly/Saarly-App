import type { Lang } from "./i18n";

const statusLabels: Record<string, { ar: string; en: string }> = {
  awaiting_confirmation: { ar: "�� ������ ����� ������", en: "Waiting for store confirmation" },
  confirmed: { ar: "�� �������", en: "Confirmed" },
  cancelled_by_merchant: { ar: "����� ������", en: "Cancelled by store" },
  cancelled_by_buyer: { ar: "����� ������", en: "Cancelled by buyer" },
  completed: { ar: "�����", en: "Completed" },
  pending: { ar: "��� ��������", en: "Pending" },
  processing: { ar: "���� �������", en: "Processing" },
  succeeded: { ar: "�� �����", en: "Succeeded" },
  failed: { ar: "���", en: "Failed" },
  due: { ar: "�����", en: "Due" },
  paid: { ar: "�����", en: "Paid" },
  active: { ar: "���", en: "Active" },
  inactive: { ar: "�����", en: "Inactive" },
  approved: { ar: "�����", en: "Approved" },
  rejected: { ar: "�����", en: "Rejected" },
  submitted: { ar: "�� �������", en: "Submitted" },
  open: { ar: "�����", en: "Open" },
  closed: { ar: "����", en: "Closed" }
};

export function humanizeAdminError(error: unknown, lang: Lang) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (!raw) return "";

  if (message.includes("country_required")) {
    return lang === "ar" ? "���� ��� ����� ����." : "Enter the country name first.";
  }

  if (message.includes("invalid_access_token") || message.includes("jwt") || message.includes("expired")) {
    return lang === "ar"
      ? "����� ���� ������. ���� ���� ����� ����� ��� ������ ������� ���� ������ Supabase �� Vercel."
      : "Your session expired. Sign out and sign in again. If it continues, check Supabase keys in Vercel.";
  }

  if (message.includes("service_role_key_missing")) {
    return lang === "ar"
      ? "����� ������ ��� ����� �� Vercel� ���� ��������� ������� ������."
      : "The service key is missing in Vercel, so sensitive actions are disabled.";
  }

  if (message.includes("admin_required")) {
    return lang === "ar"
      ? "������ ������ ��� ����� �������� ���� �������. ���� ���� ������ �� ���� ������ ���������� �� ��� ��� ����� ������� ������ �� Supabase."
      : "This account is not connected to Admin Web permissions. Check the account rank in Team and permissions, or run the admin permission repair SQL in Supabase.";
  }

  if (message.includes("admin_profile_api_not_deployed")) {
    return lang === "ar"
      ? "���� ������ �������� ��� Vercel ��� �� ����� ��� ����� �������. ���� ��� ���� �� Admin Web ��� GitHub ������ Deploy ����."
      : "The Vercel deployment does not have the latest permissions API yet. Push the latest Admin Web code and wait for a new deploy.";
  }

  if (message.includes("admin_profile_check_failed_501")) {
    return lang === "ar"
      ? "����� ���� Supabase ��� ����� �� ��� ���� �� Vercel. ���� ���� SUPABASE_SERVICE_ROLE_KEY �� Environment Variables."
      : "The Supabase service key is missing or invalid in Vercel. Add SUPABASE_SERVICE_ROLE_KEY to Environment Variables.";
  }

  if (message.includes("service_role_key_invalid")) {
    return lang === "ar"
      ? "����� ���� Supabase �� Vercel ��� ���� �� ������ �������. ���� �� SUPABASE_SERVICE_ROLE_KEY �� ����� service_role� �� ���� Redeploy ������."
      : "The Supabase service key is not working in this Vercel deployment. Make sure SUPABASE_SERVICE_ROLE_KEY is the service_role key, then redeploy the site.";
  }

  if (message.includes("service_role_access_denied")) {
    return lang === "ar"
      ? "������� �� ���� ���� ������� �������� ������. ���� ��� SQL ����� �������� service_role� ����� �� SUPABASE_SERVICE_ROLE_KEY ����� �� Vercel �� service_role� �� ���� Redeploy."
      : "The server cannot run this action with service permissions. Run the service_role grants SQL, confirm SUPABASE_SERVICE_ROLE_KEY is the service_role key in Vercel, then redeploy.";
  }

  if (message.includes("cannot_delete_current_admin")) {
    return lang === "ar"
      ? "�� ���� ��� ������ �������� ������ �� ���� �������."
      : "You cannot delete the account currently signed in to Admin Web.";
  }

  if (message.includes("user_not_found")) {
    return lang === "ar"
      ? "�� ��� ������ ��� ��� ������. ���� ������ ���� ��� ����."
      : "This account was not found. Refresh the page and try again.";
  }

  if (message.includes("admin_rls_access_denied")) {
    return lang === "ar"
      ? "���� ������ ���� �͡ ��� ����� �������� ��� ����� ��� �������. ���� ��� SQL ����� ���� ������� ������ �� ���� ���� ����� �� ������."
      : "The admin account is signed in, but the database is still blocking this action. Run the admin permission bridge SQL, then sign out and sign in again.";
  }

  if (message.includes("row_not_returned") || message.includes("pgrst116")) {
    return lang === "ar"
      ? "\u0644\u0645 \u0646\u0642\u062f\u0631 \u0646\u0639\u0631\u0636 \u0627\u0644\u0639\u0646\u0635\u0631 \u0628\u0639\u062f \u0627\u0644\u062a\u0639\u062f\u064a\u0644. \u062d\u062f\u062b \u0627\u0644\u0635\u0641\u062d\u0629 \u0648\u062c\u0631\u0628 \u062a\u0627\u0646\u064a\u060c \u0648\u0644\u0648 \u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0645\u0638\u0647\u0631\u0634 \u0631\u0627\u062c\u0639 \u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u062d\u0633\u0627\u0628."
      : "The item could not be shown after the change. Refresh and try again. If the change is not visible, check this account's permissions.";
  }

  if (message.includes("permission denied")) {
    return lang === "ar"
      ? "������ ������ �� ���� ������ ����� �� ��� ��� �����. �� ��� ���� ���� ��� SQL ������ �� ���� ������� ������."
      : "This account cannot access this area. If you are an admin, run the latest SQL file or check account permissions.";
  }

  if (message.includes("admin_staff_sql_not_applied")) {
    return lang === "ar"
      ? "��� SQL ����� ������� ���������� �� ��� ������ �� Supabase ���."
      : "The team permissions SQL file has not been run in Supabase yet.";
  }

  if (message.includes("permission_denied")) {
    return lang === "ar"
      ? "��� ������ �� ���� ������ ����� ��� �������."
      : "This account does not have permission for this action.";
  }

  if (message.includes("foreign key") || message.includes("violates") || message.includes("23503")) {
    return lang === "ar"
      ? "\u0644\u0627 \u064a\u0645\u0643\u0646 \u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0639\u0646\u0635\u0631 \u0644\u0623\u0646\u0647 \u0645\u0631\u0628\u0648\u0637 \u0628\u0628\u064a\u0627\u0646\u0627\u062a \u0623\u062e\u0631\u0649. \u0623\u0648\u0642\u0641\u0647 \u0623\u0648\u0644\u0627\u060c \u0623\u0648 \u0627\u062d\u0630\u0641 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062a\u0627\u0628\u0639\u0629 \u0644\u0647."
      : "This item is linked to other data. Disable it first, or delete the linked items before deleting it.";
  }

  if (message.includes("duplicate") || message.includes("already registered") || message.includes("already been registered")) {
    return lang === "ar"
      ? "��� �������� ������ ������. ���� ����� �� ������ �����."
      : "This record already exists. Try a different email or mobile.";
  }

  if (message.includes("password")) {
    return lang === "ar"
      ? "���� ���� �����ѡ ���� ���� ����� �������."
      : "Please check the password requirements.";
  }

  return raw;
}

export function friendlyStatus(value: unknown, lang: Lang) {
  const text = String(value ?? "").trim();
  return statusLabels[text]?.[lang] ?? text;
}
