export type Lang = "ar" | "en";

type CopyValue = string | Record<string, string>;

export const copy = {
  appName: { ar: "إدارة سعرلي", en: "Saarly Admin" },
  loginTitle: { ar: "تسجيل دخول الإدارة", en: "Admin sign in" },
  loginSubtitle: {
    ar: "الدخول متاح للمشرفين وموظفي الدعم المسجلين فقط.",
    en: "Only registered admins and support agents can access."
  },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  password: { ar: "كلمة المرور", en: "Password" },
  signIn: { ar: "تسجيل الدخول", en: "Sign in" },
  sendLink: { ar: "إرسال الرابط", en: "Send magic link" },
  signOut: { ar: "تسجيل الخروج", en: "Sign out" },
  search: { ar: "بحث", en: "Search" },
  refresh: { ar: "تحديث", en: "Refresh" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  approve: { ar: "قبول", en: "Approve" },
  reject: { ar: "رفض", en: "Reject" },
  block: { ar: "حظر", en: "Block" },
  unblock: { ar: "فك الحظر", en: "Unblock" },
  reason: { ar: "سبب الرفض", en: "Rejection reason" },
  loading: { ar: "جاري التحميل...", en: "Loading..." },
  noRows: { ar: "لا توجد بيانات", en: "No data yet" },
  unauthorized: {
    ar: "هذا الحساب ليس مشرفاً أو موظف دعم نشطاً.",
    en: "This account is not an active admin or support agent."
  },
  serviceKeyMissing: {
    ar: "إعدادات هذا الإجراء غير مكتملة. راجع مسؤول النظام.",
    en: "This action is not fully configured. Ask the system owner to review it."
  },
  supportQueue: { ar: "طابور الدعم", en: "Support queue" },
  message: { ar: "اكتب رداً", en: "Write reply" },
  assignToMe: { ar: "تعيين لي", en: "Assign to me" },
  closeConversation: { ar: "إغلاق المحادثة", en: "Close conversation" },
  openApp: { ar: "فتح القسم", en: "Open section" },
  connected: { ar: "متصل بالبيانات المباشرة", en: "Connected to live data" },
  readOnly: {
    ar: "البيانات محدثة، والإجراءات الحساسة محمية بصلاحيات الإدارة.",
    en: "Data is up to date, and sensitive actions are protected by admin permissions."
  },
  theme: { ar: "المظهر", en: "Theme" },
  language: { ar: "اللغة", en: "Language" },
  light: { ar: "فاتح", en: "Light" },
  dark: { ar: "داكن", en: "Dark" }
} satisfies Record<string, CopyValue>;

export function t(key: keyof typeof copy, lang: Lang) {
  const value = copy[key];
  return typeof value === "string" ? value : value[lang];
}

export function tr(value: { ar: string; en: string }, lang: Lang) {
  return value[lang];
}
