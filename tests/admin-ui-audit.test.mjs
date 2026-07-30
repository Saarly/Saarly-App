import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const componentDir = new URL("../src/components/", import.meta.url);
const componentNames = (await readdir(componentDir)).filter((name) => name.endsWith(".tsx"));
const componentSources = await Promise.all(componentNames.map((name) => read(`../src/components/${name}`)));
const allComponents = componentSources.join("\n");
const [loginCard, adminConsole, layout, dataSection, reportsPanel, formatSource, messages, actionRoute, monetizationRoute, languageHelper] = await Promise.all([
  read("../src/components/login-card.tsx"),
  read("../src/components/admin-console.tsx"),
  read("../src/app/layout.tsx"),
  read("../src/components/data-section.tsx"),
  read("../src/components/reports-panel.tsx"),
  read("../src/lib/admin/format.ts"),
  read("../src/lib/admin/messages.ts"),
  read("../src/app/api/admin/action/route.ts"),
  read("../src/app/api/admin/monetization/route.ts"),
  read("../src/lib/admin/language.ts"),
]);

test("login errors are localized instead of exposing provider messages", () => {
  assert.match(loginCard, /humanizeAdminError\(error, lang\)/);
  assert.doesNotMatch(loginCard, /setMessage\(error \? error\.message/);
  for (const code of ["invalid login credentials", "email not confirmed", "otp expired", "invalid otp", "rate limit"]) {
    assert.match(messages, new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("page metadata and navigation controls follow the selected language", () => {
  assert.match(layout, /title:\s*"لوحة إدارة سعرلي"/);
  assert.doesNotMatch(layout, /feature flags/i);
  assert.match(adminConsole, /const pageTitle = lang === "ar"/);
  assert.match(adminConsole, /document\.head\.querySelectorAll\("title"\)/);
  assert.match(adminConsole, /extraTitleTag\.remove\(\)/);
  assert.match(adminConsole, /document\.title = pageTitle/);
  assert.doesNotMatch(adminConsole, /<title>\{pageTitle\}<\/title>/);
  assert.match(adminConsole, /new MutationObserver\(applyDocumentState\)/);
  assert.match(adminConsole, /headObserver\.observe\(document\.head/);
  assert.match(adminConsole, /\? "الإنجليزية" : "Arabic"/);
  assert.match(adminConsole, /\? "فتح القائمة" : "Open menu"/);
  assert.match(adminConsole, /\? "مدير"[\s\S]*?: "Administrator"/);
});

test("login page honors an explicit URL language before stored admin language", () => {
  assert.match(languageHelper, /new URLSearchParams/);
  assert.match(languageHelper, /params\.get\("lang"\)/);
  assert.match(languageHelper, /return "ar"/);
  assert.match(adminConsole, /resolveInitialAdminLanguage\(window\.location\.search, savedLang\)/);
  assert.doesNotMatch(adminConsole, /if \(savedLang === "ar" \|\| savedLang === "en"\) setLang\(savedLang\)/);
});

test("known operational values have bilingual display labels", () => {
  const values = [
    "draft", "processing", "needs_review", "approved", "failed", "current", "past_due", "suspended",
    "pending_review", "under_review", "pre_launch_access", "free_trial", "subscription_active", "commission_active",
    "expired_unconfirmed", "cancelled_by_merchant", "not_configured", "refunded", "trialing", "transferred",
    "in_support", "resolved", "monthly_subscription", "commission", "catalog", "manual_quote"
  ];
  for (const value of values) assert.match(formatSource, new RegExp(`\\b${value}:\\s*\\{\\s*ar:`));
  assert.match(formatSource, /if \(\/\^\[a-z0-9\]/);
  assert.match(formatSource, /if \(lang === "ar"\) return "قيمة غير معروفة"/);
});

test("visible copy does not retain the known raw technical labels", () => {
  assert.doesNotMatch(allComponents, />\s*CSV\s*</);
  assert.doesNotMatch(allComponents, /\?\s*"EN"\s*:\s*"عربي"/);
  assert.doesNotMatch(allComponents, /"رمز الخطأ"|"Error code"/);
  assert.doesNotMatch(allComponents, /"كود العملة"|"Currency code"/);
  for (const visibleTechnicalCopy of [
    '"Vercel"', '"Firebase"', '"service_role"', '"PGRST"', '>action_failed<'
  ]) {
    assert.doesNotMatch(allComponents, new RegExp(visibleTechnicalCopy));
  }
  assert.match(reportsPanel, /تنزيل التقرير/);
});

test("ad status is based on activation and finite schedule", () => {
  assert.match(dataSection, /if \(row\.is_active !== true\) return "inactive"/);
  assert.match(dataSection, /endsAt <= now\) return "ended"/);
  assert.match(dataSection, /startsAt > now\) return "scheduled"/);
  assert.match(dataSection, /row\.saved_starts_at \?\? row\.starts_at/);
  assert.doesNotMatch(dataSection, /30 \* 24 \* 60 \* 60/);
});

test("every client action referenced by a literal has a server implementation", () => {
  const actions = new Set();
  for (const source of componentSources) {
    for (const match of source.matchAll(/action:\s*["']([a-z0-9_]+)["']/g)) actions.add(match[1]);
    for (const match of source.matchAll(/(?:post|action|runAction|postAdminAction)\(\s*["']([a-z0-9_]+)["']/g)) actions.add(match[1]);
  }
  const server = `${actionRoute}\n${monetizationRoute}`;
  const missing = [...actions].filter((action) => !server.includes(action));
  assert.deepEqual(missing, []);
  assert.ok(actions.size >= 40, `Expected broad action coverage; found ${actions.size}`);
});
