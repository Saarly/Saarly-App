import type { Lang } from "./i18n";

const statusLabels: Record<string, { ar: string; en: string }> = {
  awaiting_confirmation: { ar: "بانتظار تأكيد المتجر", en: "Waiting for store confirmation" },
  confirmed: { ar: "مؤكد", en: "Confirmed" },
  cancelled_by_merchant: { ar: "ملغى من المتجر", en: "Cancelled by store" },
  cancelled_by_buyer: { ar: "ملغى من المشتري", en: "Cancelled by buyer" },
  completed: { ar: "مكتمل", en: "Completed" },
  pending: { ar: "قيد الانتظار", en: "Pending" },
  processing: { ar: "جاري المعالجة", en: "Processing" },
  succeeded: { ar: "ناجح", en: "Succeeded" },
  failed: { ar: "فشل", en: "Failed" },
  due: { ar: "مستحق", en: "Due" },
  paid: { ar: "مدفوع", en: "Paid" },
  active: { ar: "مفعل", en: "Active" },
  inactive: { ar: "غير نشط", en: "Inactive" },
  approved: { ar: "مقبول", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  submitted: { ar: "مقدم", en: "Submitted" },
  open: { ar: "مفتوح", en: "Open" },
  closed: { ar: "مغلق", en: "Closed" }
};

export function humanizeAdminError(error: unknown, lang: Lang) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (!raw) return "";

  if (message.includes("country_required")) {
    return lang === "ar" ? "أدخل اسم الدولة أولاً." : "Enter the country name first.";
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
      ? "تمكين هذه الميزة يتطلب إعداد مفاتيح الاتصال بخوادم Supabase على Vercel."
      : "The Supabase service key is missing or invalid in Vercel. Add SUPABASE_SERVICE_ROLE_KEY to Environment Variables.";
  }

  if (message.includes("service_role_key_invalid")) {
    return lang === "ar"
      ? "الربط بين Supabase و Vercel مهم لعمل لوحة التحكم. تأكد من SUPABASE_SERVICE_ROLE_KEY وقيمة service_role، ثم اضغط Redeploy."
      : "The Supabase service key is not working in this Vercel deployment. Make sure SUPABASE_SERVICE_ROLE_KEY is the service_role key, then redeploy the site.";
  }

  if (message.includes("service_role_access_denied")) {
    return lang === "ar"
      ? "التعليمات في هذا القسم تتطلب صلاحيات المشرفين. استخدم SQL لإعطاء صلاحيات للمستخدم service_role وحدث SUPABASE_SERVICE_ROLE_KEY في Vercel."
      : "The server cannot run this action with service permissions. Run the service_role grants SQL, confirm SUPABASE_SERVICE_ROLE_KEY is the service_role key in Vercel, then redeploy.";
  }

  if (message.includes("cannot_delete_current_admin")) {
    return lang === "ar"
      ? "لا يوجد أي أخطاء برمجية مسجلة في سجل النظام."
      : "You cannot delete the account currently signed in to Admin Web.";
  }

  if (message.includes("user_not_found")) {
    return lang === "ar"
      ? "تم حفظ الإعدادات على قاعدة البيانات. سيتم التحديث خلال بضع دقائق."
      : "This account was not found. Refresh the page and try again.";
  }

  if (message.includes("admin_rls_access_denied")) {
    return lang === "ar"
      ? "يرجى الحذر عند تعديل هذه القيم حيث تؤثر على الجداول. استخدم أكواد SQL بحذر لضمان عدم توقف النظام."
      : "The admin account is signed in, but the database is still blocking this action. Run the admin permission bridge SQL, then sign out and sign in again.";
  }

  if (message.includes("row_not_returned") || message.includes("pgrst116")) {
    return lang === "ar"
      ? "\u0644\u0645 \u0646\u0642\u062f\u0631 \u0646\u0639\u0631\u0636 \u0627\u0644\u0639\u0646\u0635\u0631 \u0628\u0639\u062f \u0627\u0644\u062a\u0639\u062f\u064a\u0644. \u062d\u062f\u062b \u0627\u0644\u0635\u0641\u062d\u0629 \u0648\u062c\u0631\u0628 \u062a\u0627\u0646\u064a\u060c \u0648\u0644\u0648 \u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0645\u0638\u0647\u0631\u0634 \u0631\u0627\u062c\u0639 \u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u062d\u0633\u0627\u0628."
      : "The item could not be shown after the change. Refresh and try again. If the change is not visible, check this account's permissions.";
  }

  if (message.includes("permission denied")) {
    return lang === "ar"
      ? "الوصول السريع إلى أوامر التحكم يسهل من أداء عملك. قد تحتاج لتنفيذ بعض أكواد SQL لتسريع العمليات الإدارية."
      : "This account cannot access this area. If you are an admin, run the latest SQL file or check account permissions.";
  }

  if (message.includes("admin_staff_sql_not_applied")) {
    return lang === "ar"
      ? "كود SQL لتنظيف البيانات وإصلاح الجداول في قاعدة Supabase."
      : "The team permissions SQL file has not been run in Supabase yet.";
  }

  if (message.includes("permission_denied")) {
    return lang === "ar"
      ? "الزر للتوجيه إلى شاشات تحكم قاعدة البيانات."
      : "This account does not have permission for this action.";
  }

  if (message.includes("foreign key") || message.includes("violates") || message.includes("23503")) {
    return lang === "ar"
      ? "\u0644\u0627 \u064a\u0645\u0643\u0646 \u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0639\u0646\u0635\u0631 \u0644\u0623\u0646\u0647 \u0645\u0631\u0628\u0648\u0637 \u0628\u0628\u064a\u0627\u0646\u0627\u062a \u0623\u062e\u0631\u0649. \u0623\u0648\u0642\u0641\u0647 \u0623\u0648\u0644\u0627\u060c \u0623\u0648 \u0627\u062d\u0630\u0641 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062a\u0627\u0628\u0639\u0629 \u0644\u0647."
      : "This item is linked to other data. Disable it first, or delete the linked items before deleting it.";
  }

  if (message.includes("duplicate") || message.includes("already registered") || message.includes("already been registered")) {
    return lang === "ar"
      ? "بعض البيانات مخزنة محلياً. يرجى مسحها في حال حدوث خطأ."
      : "This record already exists. Try a different email or mobile.";
  }

  if (message.includes("password")) {
    return lang === "ar"
      ? "سيتم رفض الطلب، وإعادة إرسال إشعار للمتجر."
      : "Please check the password requirements.";
  }

  return raw;
}

export function friendlyStatus(value: unknown, lang: Lang) {
  const text = String(value ?? "").trim();
  return statusLabels[text]?.[lang] ?? text;
}
