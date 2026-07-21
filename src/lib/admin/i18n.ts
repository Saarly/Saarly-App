export type Lang = "ar" | "en";

type CopyValue = string | Record<string, string>;

export const copy = {
  appName: { ar: "إدارة سعرلي", en: "Saarly Admin" },
  loginTitle: { ar: "تسجيل دخول الإدارة", en: "Admin sign in" },
  loginSubtitle: {
    ar: "����� ��� ������ ������ ����� ��������.",
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
    ar: "��� ������ ��� ���� �� ���� ��� �����.",
    en: "This account is not an active admin or support agent."
  },
  serviceKeyMissing: {
    ar: "��� ����� ������ �� Vercel ������ ��� �������.",
    en: "Add the service role key in Vercel to enable this action."
  },
  supportQueue: { ar: "طابور الدعم", en: "Support queue" },
  message: { ar: "اكتب رداً", en: "Write reply" },
  assignToMe: { ar: "تعيين لي", en: "Assign to me" },
  closeConversation: { ar: "إغلاق المحادثة", en: "Close conversation" },
  openApp: { ar: "فتح القسم", en: "Open section" },
  connected: { ar: "متصل ببيانات قاعدة البيانات", en: "Connected to Supabase data" },
  readOnly: {
    ar: "����� �����ɡ �������� ������ ��� API ����.",
    en: "Live read access; sensitive writes go through a protected API."
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

