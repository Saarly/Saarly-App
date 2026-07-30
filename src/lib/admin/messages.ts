import type { Lang } from "./i18n";
import { adminValueLabel } from "./format";

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


  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials") ||
    message.includes("invalid_grant")
  ) {
    return lang === "ar"
      ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
      : "The email or password is incorrect.";
  }

  if (message.includes("email not confirmed")) {
    return lang === "ar"
      ? "فعّل البريد الإلكتروني أولاً ثم حاول تسجيل الدخول مرة أخرى."
      : "Confirm your email first, then try signing in again.";
  }

  if (
    message.includes("otp expired") ||
    message.includes("token has expired") ||
    message.includes("email link is invalid or has expired")
  ) {
    return lang === "ar"
      ? "انتهت صلاحية كود الدخول. اطلب كودًا جديدًا."
      : "The sign-in code expired. Request a new code.";
  }

  if (
    message.includes("invalid otp") ||
    message.includes("token is invalid") ||
    message.includes("invalid token")
  ) {
    return lang === "ar"
      ? "كود الدخول غير صحيح. راجعه أو اطلب كودًا جديدًا."
      : "The sign-in code is incorrect. Check it or request a new code.";
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("email rate limit")
  ) {
    return lang === "ar"
      ? "تمت محاولات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى."
      : "There were too many attempts in a short time. Wait a moment and try again.";
  }

  if (message.includes("ad_schedule_required")) {
    return lang === "ar"
      ? "حدد تاريخ بداية الإعلان وتاريخ انتهائه قبل الحفظ."
      : "Choose the ad start and end dates before saving.";
  }

  if (message.includes("ad_end_must_be_after_start")) {
    return lang === "ar"
      ? "تاريخ انتهاء الإعلان لازم يكون بعد تاريخ البداية."
      : "The ad end date must be after the start date.";
  }

  if (message.includes("global_rate_must_be_between_0_and_100")) {
    return lang === "ar"
      ? "نسبة العمولة العامة لازم تكون بين 0 و100."
      : "The global commission rate must be between 0 and 100.";
  }

  if (message.includes("category_rates_must_be_numbers_between_0_and_100")) {
    return lang === "ar"
      ? "نسب الأقسام لازم تكون أرقامًا بين 0 و100."
      : "Category commission rates must be numbers between 0 and 100.";
  }

  if (message.includes("country_required")) {
    return lang === "ar" ? "اكتب اسم البلد الأول." : "Enter the country name first.";
  }
  if (message.includes("governorate_required")) {
    return lang === "ar" ? "اختار أو اكتب اسم المحافظة الأول." : "Choose or enter the governorate first.";
  }
  if (message.includes("city_required")) {
    return lang === "ar" ? "اكتب اسم المدينة الأول." : "Enter the city name first.";
  }
  if (message.includes("location_already_exists")) {
    return lang === "ar" ? "البلد أو المحافظة أو المدينة دي موجودة بالفعل." : "This country, governorate, or city already exists.";
  }
  if (message.includes("invalid_location_kind")) {
    return lang === "ar" ? "اختار نوع الإضافة: بلد أو محافظة أو مدينة." : "Choose whether this is a country, governorate, or city.";
  }

  if (
    message.includes("invalid_access_token") ||
    message.includes("jwt expired") ||
    message.includes("session expired") ||
    message.includes("refresh_token_not_found")
  ) {
    return lang === "ar"
      ? "انتهت جلسة الدخول. سجل خروج وادخل مرة تانية."
      : "Your session expired. Sign out and sign in again.";
  }

  if (message.includes("auth_required") || message.includes("missing_session")) {
    return lang === "ar"
      ? "انتهت جلسة الدخول. سجل الدخول مرة أخرى."
      : "Your session ended. Sign in again.";
  }


  if (message.includes("smtp_missing:")) {
    const missing = raw.split(":").slice(1).join(":");
    return lang === "ar"
      ? `إعداد SMTP غير مكتمل داخل أسرار Supabase: ${missing}`
      : `SMTP configuration is missing in Supabase secrets: ${missing}`;
  }

  if (message.includes("email_dispatch_unreachable")) {
    return lang === "ar"
      ? "لوحة الإدارة لم تستطع الوصول إلى عامل إرسال البريد. تم حفظ السبب داخل سجل الرسالة للمراجعة."
      : "The admin panel could not reach the email worker. The reason was saved on the email event.";
  }

  if (message.includes("email_target_not_processed")) {
    return lang === "ar"
      ? "عامل البريد اشتغل لكنه لم يلتقط الرسالة المطلوبة. حاول مرة أخرى بعد تحديث الصفحة."
      : "The email worker ran but did not claim the selected message. Refresh and retry.";
  }

  if (message.includes("invalid login") || message.includes("535") || message.includes("authentication failed")) {
    return lang === "ar"
      ? "خادم Hostinger رفض تسجيل دخول البريد. راجع كلمة مرور صندوق info@saarly.app داخل SMTP_PASS."
      : "Hostinger rejected the mailbox login. Review the info@saarly.app mailbox password in SMTP_PASS.";
  }

  if (message.includes("action_failed") || message.includes("load_failed")) {
    return lang === "ar"
      ? "تعذر إتمام العملية. حدّث الصفحة ثم حاول مرة أخرى."
      : "The action could not be completed. Refresh and try again.";
  }

  if (message.includes("missing_update_payload") || message.includes("missing_create_payload") || message.includes("missing_id")) {
    return lang === "ar"
      ? "بيانات العملية غير مكتملة. حدّث الصفحة ثم حاول مرة أخرى."
      : "The action details are incomplete. Refresh and try again.";
  }

  if (message.includes("service_role_key_missing")) {
    return lang === "ar"
      ? "بعض إجراءات الإدارة المهمة مش جاهزة حاليًا. راجع مسؤول النظام."
      : "Some important admin actions are not ready yet. Ask the system owner to review setup.";
  }

  if (message.includes("admin_required")) {
    return lang === "ar"
      ? "الحساب ده مش عليه صلاحية لاستخدام لوحة الإدارة."
      : "This account does not have permission to use the admin panel.";
  }

  if (message.includes("admin_profile_api_not_deployed")) {
    return lang === "ar"
      ? "نسخة لوحة الإدارة الحالية محتاجة تحديث. جرب تاني بعد نشر آخر نسخة."
      : "The current admin panel version needs an update. Try again after the latest version is published.";
  }

  if (message.includes("admin_profile_check_failed_501")) {
    return lang === "ar"
      ? "إعدادات لوحة الإدارة مش مكتملة لهذه الميزة."
      : "The admin panel setup is not complete for this feature.";
  }

  if (message.includes("service_role_key_invalid")) {
    return lang === "ar"
      ? "ربط لوحة الإدارة محتاج مراجعة من مسؤول النظام."
      : "The admin panel connection needs to be reviewed by the system owner.";
  }

  if (message.includes("service_role_access_denied")) {
    return lang === "ar"
      ? "الحساب الحالي لا يملك صلاحية تنفيذ الإجراء ده."
      : "The current account is not allowed to run this action.";
  }

  if (message.includes("cannot_delete_current_admin")) {
    return lang === "ar"
      ? "لا يمكنك حذف الحساب المستخدم حالياً في لوحة الإدارة."
      : "You cannot delete the account currently signed in to the admin panel.";
  }

  if (message.includes("user_not_found")) {
    return lang === "ar"
      ? "لم يتم العثور على هذا الحساب. حدّث الصفحة ثم جرّب مرة أخرى."
      : "This account was not found. Refresh the page and try again.";
  }


  if (message.includes("auth_user_missing") || message.includes("database error loading user")) {
    return lang === "ar"
      ? "الحساب موجود في السجل لكنه محذوف من نظام تسجيل الدخول، لذلك لا يمكن تعيين كلمة مرور له."
      : "The profile exists, but its authentication account was deleted, so a password cannot be assigned.";
  }

  if (message.includes("label_name_required")) {
    return lang === "ar" ? "اكتب اسم التصنيف بالعربي والإنجليزي." : "Enter the label name in Arabic and English.";
  }

  if (message.includes("invalid_label_color")) {
    return lang === "ar" ? "اختر لوناً صحيحاً للتصنيف." : "Choose a valid label color.";
  }

  if (message.includes("reason_required")) {
    return lang === "ar" ? "اكتب سبباً واضحاً قبل حفظ الإجراء." : "Enter a clear reason before saving this action.";
  }

  if (message.includes("merchant_not_found")) {
    return lang === "ar" ? "لم يتم العثور على المتجر. حدّث الصفحة وحاول مرة أخرى." : "The store was not found. Refresh and try again.";
  }

  if (message.includes("merchant_has_financial_or_order_history")) {
    return lang === "ar"
      ? "لا يمكن حذف المتجر نهائيًا لأنه مرتبط بطلبات أو سجلات مالية محفوظة. استخدم إيقاف المتجر بدلًا من الحذف للحفاظ على السجلات."
      : "This store cannot be permanently deleted because it has retained orders or financial history. Suspend it instead to preserve those records.";
  }

  if (message.includes("invalid_complaint_status") || message.includes("complaint_status_required")) {
    return lang === "ar" ? "اختر حالة صحيحة للشكوى." : "Choose a valid complaint status.";
  }
  if (message.includes("complaint_not_found")) {
    return lang === "ar" ? "لم يتم العثور على الشكوى. حدّث الصفحة وحاول مرة أخرى." : "The complaint was not found. Refresh and try again.";
  }

  if (message.includes("complaint_closed")) {
    return lang === "ar" ? "هذه الشكوى مغلقة بالفعل ولا يمكن إضافة رد جديد." : "This complaint is already closed and cannot receive a new reply.";
  }

  if (message.includes("resolution_required")) {
    return lang === "ar" ? "اكتب ملخصاً واضحاً للحل قبل إغلاق الشكوى." : "Enter a clear resolution before closing the complaint.";
  }

  if (message.includes("message_body_required")) {
    return lang === "ar" ? "اكتب نص الرسالة أولاً." : "Write the message first.";
  }

  if (message.includes("admin_rls_access_denied")) {
    return lang === "ar"
      ? "الحساب الحالي لا يملك صلاحية تعديل البيانات دي."
      : "The current account is not allowed to change this data.";
  }

  if (message.includes("row_not_returned") || message.includes("pgrst116")) {
    return lang === "ar"
      ? "\u0644\u0645 \u0646\u0642\u062f\u0631 \u0646\u0639\u0631\u0636 \u0627\u0644\u0639\u0646\u0635\u0631 \u0628\u0639\u062f \u0627\u0644\u062a\u0639\u062f\u064a\u0644. \u062d\u062f\u062b \u0627\u0644\u0635\u0641\u062d\u0629 \u0648\u062c\u0631\u0628 \u062a\u0627\u0646\u064a\u060c \u0648\u0644\u0648 \u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0645\u0638\u0647\u0631\u0634 \u0631\u0627\u062c\u0639 \u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u062d\u0633\u0627\u0628."
      : "The item could not be shown after the change. Refresh and try again. If the change is not visible, check this account's permissions.";
  }

  if (message.includes("permission denied")) {
    return lang === "ar"
      ? "الحساب الحالي مش مسموح له يفتح القسم ده."
      : "The current account is not allowed to open this section.";
  }

  if (message.includes("admin_staff_sql_not_applied")) {
    return lang === "ar"
      ? "إعدادات صلاحيات الفريق مش جاهزة بالكامل."
      : "Team permission setup is not ready yet.";
  }

  if (message.includes("staff_email_already_exists")) {
    return lang === "ar"
      ? "البريد الإلكتروني ده مربوط بحساب موجود في فريق الإدارة بالفعل. افتح الحساب من القائمة وعدّل صلاحياته بدل إنشاء حساب جديد."
      : "This email is already linked to an admin team account. Open it from the list and edit its permissions instead.";
  }

  if (message.includes("email_belongs_to_existing_account")) {
    return lang === "ar"
      ? "البريد الإلكتروني ده مستخدم في حساب مستخدم أو متجر موجود بالفعل، ومينفعش نحوله لحساب إدارة تلقائيًا حفاظًا على الحساب. استخدم بريدًا مختلفًا."
      : "This email belongs to an existing user or store account and cannot be converted into an admin account automatically. Use a different email.";
  }

  if (message.includes("staff_mobile_already_exists")) {
    return lang === "ar"
      ? "رقم الموبايل ده مستخدم في حساب آخر بالفعل. راجع الرقم أو استخدم رقمًا مختلفًا."
      : "This mobile number is already used by another account. Check it or use a different number.";
  }

  if (message.includes("auth_user_lookup_limit_reached")) {
    return lang === "ar"
      ? "تعذر التأكد من حسابات تسجيل الدخول حاليًا. حاول مرة تانية بعد تحديث الصفحة."
      : "Could not finish checking login accounts. Refresh the page and try again.";
  }

  if (message.includes("permission_denied")) {
    return lang === "ar"
      ? "الحساب الحالي لا يملك صلاحية تنفيذ الإجراء ده."
      : "This account does not have permission for this action.";
  }

  if (message.includes("payment_proof_required")) {
    return lang === "ar"
      ? "لا يمكن قبول طلب الدفع قبل وجود إثبات دفع مرفوع."
      : "A payment proof must be uploaded before this request can be approved.";
  }

  if (message.includes("manual_payment_request_required")) {
    return lang === "ar" ? "اختار طلب دفع صحيح الأول." : "Choose a valid payment request first.";
  }

  if (message.includes("manual_payment_plan_not_editable")) {
    return lang === "ar"
      ? "يمكن تعديل الباقة قبل قبول الطلب أو رفضه فقط."
      : "The plan can only be changed before the request is approved or rejected.";
  }

  if (message.includes("subscription_plan_required")) {
    return lang === "ar" ? "اختار باقة صحيحة أولاً." : "Choose a valid plan first.";
  }

  if (message.includes("subscription_plan_not_available") || message.includes("subscription_plan_not_found")) {
    return lang === "ar"
      ? "الباقة المختارة غير متاحة حالياً."
      : "The selected plan is not available right now.";
  }

  if (message.includes("manual_method_required_fields")) {
    return lang === "ar"
      ? "اكتب اسم طريقة التحويل ورقم الحساب قبل الحفظ."
      : "Enter the transfer method name and account number before saving.";
  }

  if (message.includes("payment_provider_not_supported")) {
    return lang === "ar" ? "اختار بوابة دفع صحيحة." : "Choose a valid payment gateway.";
  }

  if (message.includes("gateway_secret_reference_required")) {
    return lang === "ar"
      ? "اكتب اسم بيانات الربط المحفوظة قبل تجربة البوابة."
      : "Enter the saved connection name before checking this gateway.";
  }

  if (message.includes("payment_adapter_required_before_connection")) {
    return lang === "ar"
      ? "تم حفظ بيانات البوابة، لكن التفعيل النهائي محتاج استكمال الربط مع شركة الدفع."
      : "The gateway details were saved, but final activation still needs the payment company connection.";
  }

  if (message.includes("payment_adapter_required_before_retry")) {
    return lang === "ar"
      ? "إعادة المحاولة تحتاج استكمال ربط شركة الدفع أولًا."
      : "Retry needs the payment company connection to be completed first.";
  }

  if (message.includes("payment_adapter_required_before_refund")) {
    return lang === "ar"
      ? "الاسترداد يحتاج استكمال ربط شركة الدفع أولًا."
      : "Refund needs the payment company connection to be completed first.";
  }

  if (message.includes("proof_not_uploaded")) {
    return lang === "ar"
      ? "لم يتم رفع إثبات دفع لهذا الطلب."
      : "No payment proof was uploaded for this request.";
  }

  if (message.includes("proof_file_missing")) {
    return lang === "ar"
      ? "مسار إثبات الدفع مسجل، لكن الملف نفسه غير موجود في التخزين."
      : "The payment proof path is saved, but the file is missing from storage.";
  }

  if (message.includes("file_not_available") || message.includes("file_record_not_found")) {
    return lang === "ar" ? "الملف غير متاح حاليًا." : "The file is not available right now.";
  }

  if (message.includes("legacy_file_placeholder")) {
    return lang === "ar"
      ? "هذا السجل قديم أو تجريبي ولا يحتوي على ملف مرفوع فعلياً."
      : "This old or test record does not have a real uploaded file.";
  }

  if (message.includes("signed_link_failed")) {
    return lang === "ar"
      ? "تعذر فتح الملف. قد يكون الملف غير مرفوع أو تم نقله."
      : "Could not open the file. It may be missing or moved.";
  }

  if (message.includes("foreign key") || message.includes("violates") || message.includes("23503")) {
    return lang === "ar"
      ? "تعذر تنفيذ الإجراء لأن البيانات مرتبطة بسجلات أخرى. راجع الحقول المطلوبة أو العناصر التابعة ثم جرّب مرة أخرى."
      : "The action could not be completed because this data is linked to other records. Review required fields or related items and try again.";
  }

  if (message.includes("email_exists") || message.includes("email address has already been registered")) {
    return lang === "ar"
      ? "البريد الإلكتروني ده موجود في نظام تسجيل الدخول. النسخة الجديدة بتحاول إصلاح الحساب الناقص تلقائيًا؛ حدّث الصفحة وجرّب مرة تانية."
      : "This email already exists in the login system. The new version repairs incomplete accounts automatically; refresh and try again.";
  }

  if (message.includes("duplicate") || message.includes("already registered") || message.includes("already been registered")) {
    return lang === "ar"
      ? "في قيمة مستخدمة قبل كده، زي البريد أو رقم الموبايل. راجع البيانات وحاول مرة تانية."
      : "A value such as the email or mobile number is already in use. Review the details and try again.";
  }

  if (message.includes("password")) {
    return lang === "ar"
      ? "راجع شروط كلمة المرور وجرب مرة تانية."
      : "Please check the password requirements.";
  }

  console.error("Admin operation error:", raw);
  return lang === "ar"
    ? "حدثت مشكلة غير متوقعة. حدّث الصفحة ثم حاول مرة أخرى."
    : "An unexpected problem occurred. Refresh and try again.";
}

export function friendlyStatus(value: unknown, lang: Lang) {
  const text = String(value ?? "").trim();
  return statusLabels[text]?.[lang] ?? adminValueLabel(text, lang);
}
