export type Lang = "ar" | "en";

type CopyValue = string | Record<string, string>;

export const copy = {
  appName: { ar: "���� �����", en: "Saarly Admin" },
  loginTitle: { ar: "���� ���� �������", en: "Admin sign in" },
  loginSubtitle: {
    ar: "����� ��� ������ ������ ����� ��������.",
    en: "Only registered admins and support agents can access."
  },
  email: { ar: "������ ����������", en: "Email" },
  password: { ar: "���� ������", en: "Password" },
  signIn: { ar: "����", en: "Sign in" },
  sendLink: { ar: "����� ���� ����", en: "Send magic link" },
  signOut: { ar: "����", en: "Sign out" },
  search: { ar: "���", en: "Search" },
  refresh: { ar: "�����", en: "Refresh" },
  save: { ar: "���", en: "Save" },
  cancel: { ar: "�����", en: "Cancel" },
  approve: { ar: "����", en: "Approve" },
  reject: { ar: "���", en: "Reject" },
  block: { ar: "���", en: "Block" },
  unblock: { ar: "�����", en: "Unblock" },
  reason: { ar: "��� �����", en: "Rejection reason" },
  loading: { ar: "���� �������...", en: "Loading..." },
  noRows: { ar: "�� ���� ������ �����", en: "No data yet" },
  unauthorized: {
    ar: "��� ������ ��� ���� �� ���� ��� �����.",
    en: "This account is not an active admin or support agent."
  },
  serviceKeyMissing: {
    ar: "��� ����� ������ �� Vercel ������ ��� �������.",
    en: "Add the service role key in Vercel to enable this action."
  },
  supportQueue: { ar: "����� �����", en: "Support queue" },
  message: { ar: "���� ����", en: "Write reply" },
  assignToMe: { ar: "������ ��������", en: "Assign to me" },
  closeConversation: { ar: "����� ��������", en: "Close conversation" },
  openApp: { ar: "��� �����", en: "Open section" },
  connected: { ar: "���� ������� Supabase", en: "Connected to Supabase data" },
  readOnly: {
    ar: "����� �����ɡ �������� ������ ��� API ����.",
    en: "Live read access; sensitive writes go through a protected API."
  },
  theme: { ar: "�����", en: "Theme" },
  language: { ar: "�����", en: "Language" },
  light: { ar: "����", en: "Light" },
  dark: { ar: "����", en: "Dark" }
} satisfies Record<string, CopyValue>;

export function t(key: keyof typeof copy, lang: Lang) {
  const value = copy[key];
  return typeof value === "string" ? value : value[lang];
}

export function tr(value: { ar: string; en: string }, lang: Lang) {
  return value[lang];
}

