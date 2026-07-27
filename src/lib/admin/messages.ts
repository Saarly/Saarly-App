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
      ? "انتهت جلسة الدخول. سجل خروج وادخل مرة تانية."
      : "Your session expired. Sign out and sign in again.";
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
      : "You cannot delete the account currently signed in to Admin Web.";
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

  if (message.includes("duplicate") || message.includes("already registered") || message.includes("already been registered")) {
    return lang === "ar"
      ? "هذا السجل موجود بالفعل."
      : "This record already exists. Try a different email or mobile.";
  }

  if (message.includes("password")) {
    return lang === "ar"
      ? "راجع شروط كلمة المرور وجرب مرة تانية."
      : "Please check the password requirements.";
  }

  return raw;
}

export function friendlyStatus(value: unknown, lang: Lang) {
  const text = String(value ?? "").trim();
  return statusLabels[text]?.[lang] ?? text;
}
