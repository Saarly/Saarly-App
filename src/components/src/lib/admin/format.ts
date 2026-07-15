import type { ColumnConfig } from "./types";

export function formatCell(value: unknown, tone: ColumnConfig["tone"]) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (tone === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("ar-EG", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(date);
  }

  if (tone === "money") {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(amount)
      : String(value);
  }

  if (tone === "json" || typeof value === "object") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "نعم" : "لا";
  }

  return String(value);
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

