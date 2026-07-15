import type { Lang } from "./i18n";

const statusLabels: Record<string, { ar: string; en: string }> = {
  awaiting_confirmation: { ar: "في انتظار تأكيد المتجر", en: "Waiting for store confirmation" },
  confirmed: { ar: "تم التأكيد", en: "Confirmed" },
  cancelled_by_merchant: { ar: "ألغاه المتجر", en: "Cancelled by store" },
  cancelled_by_buyer: { ar: "ألغاه العميل", en: "Cancelled by buyer" },
  completed: { ar: "مكتمل", en: "Completed" },
  pending: { ar: "قيد الانتظار", en: "Pending" },
  processing: { ar: "جاري التنفيذ", en: "Processing" },
  succeeded: { ar: "تم بنجاح", en: "Succeeded" },
  failed: { ar: "فشل", en: "Failed" },
  due: { ar: "مستحق", en: "Due" },
  paid: { ar: "مدفوع", en: "Paid" },
  active: { ar: "نشط", en: "Active" },
  inactive: { ar: "متوقف", en: "Inactive" },
  approved: { ar: "مقبول", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  submitted: { ar: "تم الإرسال", en: "Submitted" },
  open: { ar: "مفتوح", en: "Open" },
  closed: { ar: "مغلق", en: "Closed" }
};

export function humanizeAdminError(error: unknown, lang: Lang) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (!raw) return "";

  if (message.includes("invalid_access_token") || message.includes("jwt") || message.includes("expired")) {
    return lang === "ar"
      ? "انتهت جلسة الدخول. اعمل خروج وادخل تاني، ولو استمرت المشكلة راجع مفاتيح Supabase في Vercel."
      : "Your session expired. Sign out and sign in again. If it continues, check Supabase keys in Vercel.";
  }

  if (message.includes("service_role_key_missing")) {
    return lang === "ar"
      ? "مفتاح الخدمة غير موجود في Vercel، لذلك الإجراءات الحساسة متوقفة."
      : "The service key is missing in Vercel, so sensitive actions are disabled.";
  }

  if (message.includes("admin_required")) {
    return lang === "ar"
      ? "الحساب الحالي غير مربوط بصلاحيات لوحة الإدارة. راجع رتبة الحساب من صفحة الفريق والصلاحيات أو شغل ملف إصلاح صلاحيات الأدمن في Supabase."
      : "This account is not connected to Admin Web permissions. Check the account rank in Team and permissions, or run the admin permission repair SQL in Supabase.";
  }

  if (message.includes("admin_profile_api_not_deployed")) {
    return lang === "ar"
      ? "نسخة الموقع الموجودة على Vercel لسه مش عليها آخر تعديل صلاحيات. ارفع آخر نسخة من Admin Web على GitHub واستنى Deploy جديد."
      : "The Vercel deployment does not have the latest permissions API yet. Push the latest Admin Web code and wait for a new deploy.";
  }

  if (message.includes("admin_profile_check_failed_501")) {
    return lang === "ar"
      ? "مفتاح خدمة Supabase غير موجود أو غير صحيح في Vercel. لازم تضيف SUPABASE_SERVICE_ROLE_KEY في Environment Variables."
      : "The Supabase service key is missing or invalid in Vercel. Add SUPABASE_SERVICE_ROLE_KEY to Environment Variables.";
  }

  if (message.includes("service_role_key_invalid")) {
    return lang === "ar"
      ? "مفتاح خدمة Supabase في Vercel غير شغال في النسخة الحالية. تأكد أن SUPABASE_SERVICE_ROLE_KEY هو مفتاح service_role، ثم اعمل Redeploy للموقع."
      : "The Supabase service key is not working in this Vercel deployment. Make sure SUPABASE_SERVICE_ROLE_KEY is the service_role key, then redeploy the site.";
  }

  if (message.includes("service_role_access_denied")) {
    return lang === "ar"
      ? "السيرفر مش قادر ينفذ التعديل بصلاحيات الخدمة. شغّل ملف SQL الخاص بصلاحيات service_role، وتأكد أن SUPABASE_SERVICE_ROLE_KEY موجود في Vercel كـ service_role، ثم اعمل Redeploy."
      : "The server cannot run this action with service permissions. Run the service_role grants SQL, confirm SUPABASE_SERVICE_ROLE_KEY is the service_role key in Vercel, then redeploy.";
  }

  if (message.includes("permission denied")) {
    return lang === "ar"
      ? "الحساب الحالي لا يملك صلاحية تنفيذ أو عرض هذا الجزء. لو أنت أدمن، شغّل ملف SQL الأخير أو راجع صلاحيات الحساب."
      : "This account cannot access this area. If you are an admin, run the latest SQL file or check account permissions.";
  }

  if (message.includes("admin_staff_sql_not_applied")) {
    return lang === "ar"
      ? "ملف SQL الخاص بالفريق والصلاحيات لم يتم تشغيله في Supabase بعد."
      : "The team permissions SQL file has not been run in Supabase yet.";
  }

  if (message.includes("permission_denied")) {
    return lang === "ar"
      ? "هذا الحساب لا يملك صلاحية تنفيذ هذا الإجراء."
      : "This account does not have permission for this action.";
  }

  if (message.includes("duplicate") || message.includes("already registered") || message.includes("already been registered")) {
    return lang === "ar"
      ? "هذه البيانات موجودة بالفعل. جرّب إيميل أو موبايل مختلف."
      : "This record already exists. Try a different email or mobile.";
  }

  if (message.includes("password")) {
    return lang === "ar"
      ? "راجع كلمة المرور، لازم تكون صحيحة ومناسبة."
      : "Please check the password requirements.";
  }

  return raw;
}

export function friendlyStatus(value: unknown, lang: Lang) {
  const text = String(value ?? "").trim();
  return statusLabels[text]?.[lang] ?? text;
}
