export type Lang = "ar" | "en";

type CopyValue = string | Record<string, string>;

export const copy = {
  appName: { ar: "لوحة سعرلي", en: "Saarly Admin" },
  loginTitle: { ar: "دخول لوحة الإدارة", en: "Admin sign in" },
  loginSubtitle: {
    ar: "مسموح فقط للأدمن وموظفي الدعم المسجلين.",
    en: "Only registered admins and support agents can access."
  },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  password: { ar: "كلمة المرور", en: "Password" },
  signIn: { ar: "دخول", en: "Sign in" },
  sendLink: { ar: "إرسال رابط دخول", en: "Send magic link" },
  signOut: { ar: "خروج", en: "Sign out" },
  search: { ar: "بحث", en: "Search" },
  refresh: { ar: "تحديث", en: "Refresh" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  approve: { ar: "قبول", en: "Approve" },
  reject: { ar: "رفض", en: "Reject" },
  block: { ar: "حظر", en: "Block" },
  unblock: { ar: "تفعيل", en: "Unblock" },
  reason: { ar: "سبب الرفض", en: "Rejection reason" },
  loading: { ar: "جاري التحميل...", en: "Loading..." },
  noRows: { ar: "لا توجد بيانات حاليا", en: "No data yet" },
  unauthorized: {
    ar: "هذا الحساب ليس أدمن أو موظف دعم مفعّل.",
    en: "This account is not an active admin or support agent."
  },
  serviceKeyMissing: {
    ar: "أضف مفتاح الخدمة في Vercel لتفعيل هذا الإجراء.",
    en: "Add the service role key in Vercel to enable this action."
  },
  supportQueue: { ar: "طابور الدعم", en: "Support queue" },
  message: { ar: "اكتب الرد", en: "Write reply" },
  assignToMe: { ar: "استلام المحادثة", en: "Assign to me" },
  closeConversation: { ar: "إغلاق المحادثة", en: "Close conversation" },
  openApp: { ar: "فتح القسم", en: "Open section" },
  connected: { ar: "متصل ببيانات Supabase", en: "Connected to Supabase data" },
  readOnly: {
    ar: "قراءة مباشرة، والتعديل الحساس عبر API مؤمن.",
    en: "Live read access; sensitive writes go through a protected API."
  },
  theme: { ar: "الثيم", en: "Theme" },
  language: { ar: "اللغة", en: "Language" },
  light: { ar: "لايت", en: "Light" },
  dark: { ar: "دارك", en: "Dark" }
} satisfies Record<string, CopyValue>;

export function t(key: keyof typeof copy, lang: Lang) {
  const value = copy[key];
  return typeof value === "string" ? value : value[lang];
}

export function tr(value: { ar: string; en: string }, lang: Lang) {
  return value[lang];
}

