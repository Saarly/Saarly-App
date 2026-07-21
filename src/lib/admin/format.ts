import type { ColumnConfig } from "./types";

type CellLang = "ar" | "en";

const cellStatusLabels: Record<string, { ar: string; en: string }> = {
  transferred: { ar: "\u0645\u062d\u0648\u0644\u0629 \u0644\u062e\u062f\u0645\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621", en: "Transferred to support" },
  bot: { ar: "\u0645\u062d\u0627\u062f\u062b\u0629 \u0645\u0639 \u0627\u0644\u0628\u0648\u062a", en: "Bot chat" },
  open: { ar: "\u0645\u0641\u062a\u0648\u062d", en: "Open" },
  closed: { ar: "\u0645\u063a\u0644\u0642", en: "Closed" },
  active: { ar: "\u0645\u0641\u0639\u0644", en: "Active" },
  inactive: { ar: "\u0645\u062a\u0648\u0642\u0641", en: "Inactive" },
  approved: { ar: "\u0645\u0642\u0628\u0648\u0644", en: "Approved" },
  rejected: { ar: "\u0645\u0631\u0641\u0648\u0636", en: "Rejected" },
  pending: { ar: "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631", en: "Pending" },
  confirmed: { ar: "\u062a\u0645 \u0627\u0644\u062a\u0623\u0643\u064a\u062f", en: "Confirmed" },
  awaiting_confirmation: { ar: "\u0641\u064a \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0645\u062a\u062c\u0631", en: "Waiting for store confirmation" },
  cancelled_by_merchant: { ar: "\u0623\u0644\u063a\u0627\u0647 \u0627\u0644\u0645\u062a\u062c\u0631", en: "Cancelled by store" },
  cancelled_by_buyer: { ar: "\u0623\u0644\u063a\u0627\u0647 \u0627\u0644\u0639\u0645\u064a\u0644", en: "Cancelled by buyer" },
  completed: { ar: "\u0645\u0643\u062a\u0645\u0644", en: "Completed" }
};

export function formatCell(value: unknown, tone: ColumnConfig["tone"], lang: CellLang = "ar") {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (tone === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(date);
  }

  if (tone === "money") {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { style: "currency", currency: "EGP" }).format(amount)
      : String(value);
  }

  if (tone === "json" || typeof value === "object") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? (lang === "ar" ? "\u0646\u0639\u0645" : "Yes") : lang === "ar" ? "\u0644\u0627" : "No";
  }

  const text = String(value);
  const status = cellStatusLabels[text];
  if (status && (tone === "status" || tone === undefined)) {
    return status[lang];
  }

  return text;
}

export function rowMatches(row: Record<string, unknown>, keys: string[] | undefined, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const targets = keys && keys.length > 0 ? keys : Object.keys(row);
  return targets.some((key) => String(row[key] ?? "").toLowerCase().includes(normalized));
}

export function coerceFormValue(key: string, value: string | boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  if (["display_order", "sort_order", "grace_months", "billing_period_months"].includes(key)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (["monthly_price"].includes(key)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (["configuration", "features", "permissions", "admin_action"].includes(key)) {
    return JSON.parse(trimmed || "{}") as unknown;
  }

  return trimmed;
}

export function fieldIsBoolean(key: string) {
  return key.startsWith("is_") || key === "needs_embedding";
}

export function fieldIsLongText(key: string) {
  return key.includes("content") || key.includes("description") || key === "configuration" || key === "features";
}
