import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  actionRoute,
  dataSection,
  sections,
  catalog,
  complaints,
  reports,
  formatter,
  adminConsole,
  pageGuide,
  globalCss,
  support,
  migration,
] = await Promise.all([
  read("../src/app/api/admin/action/route.ts"),
  read("../src/components/data-section.tsx"),
  read("../src/lib/admin/sections.ts"),
  read("../src/components/store-catalog-moderation.tsx"),
  read("../src/components/complaints-console.tsx"),
  read("../src/components/reports-panel.tsx"),
  read("../src/lib/admin/format.ts"),
  read("../src/components/admin-console.tsx"),
  read("../src/components/page-guide.tsx"),
  read("../src/app/globals.css"),
  read("../src/components/support-console.tsx"),
  read("../supabase/migrations/20260727182000_admin_v6_locations_and_store_archive_fix.sql"),
]);

test("country, governorate and city writes use the audited location RPC", () => {
  assert.match(actionRoute, /admin_upsert_city_location_as/);
  assert.match(actionRoute, /p_place_kind:\s*locationKind/);
  assert.match(actionRoute, /p_display_order:\s*Number\.isFinite/);
  assert.match(dataSection, /payload:\s*section\.id === "cities"/);
  assert.match(dataSection, /place_kind/);
  assert.match(migration, /create or replace function public\.admin_upsert_city_location_as/);
  assert.match(migration, /location_already_exists/);
});

test("store deletion removes active access while preserving required history", () => {
  assert.match(migration, /add column if not exists is_archived/);
  assert.match(migration, /archive_merchant_with_history/);
  assert.match(migration, /history_preserved/);
  assert.match(sections, /source:\s*"admin_active_merchants_readable"/);
  assert.match(actionRoute, /admin_active_merchants_readable/);
  assert.match(actionRoute, /deletionResult\.archived !== true/);
  assert.match(catalog, /result\.archived === true/);
});

test("complaints never expose not_provided as visible copy", () => {
  assert.match(complaints, /isMissingValue/);
  assert.match(complaints, /not\[_\\s-\]\?provided/);
  assert.match(complaints, /غير متوفر/);
  assert.doesNotMatch(complaints, />\s*not_provided\s*</i);
});

test("reports translate technical enum values and show every returned result progressively", () => {
  for (const value of ["monthly_subscription", "commission", "tshirt"]) {
    assert.match(formatter, new RegExp(`\\b${value}:\\s*\\{\\s*ar:`));
  }
  assert.match(actionRoute, /p_limit:\s*1000/);
  assert.match(reports, /filteredRows\.length/);
  assert.match(reports, /visibleRows = filteredRows\.slice\(0, visibleLimit\)/);
  assert.match(reports, /setVisibleLimit\(\(current\) => current \+ 10\)/);
  assert.doesNotMatch(reports, /\.slice\(0,\s*5\)/);
  assert.match(reports, /adminValueLabel/);
});

test("every admin page starts with bilingual plain-language guidance", () => {
  assert.match(adminConsole, /<PageGuide sectionId=\{section\.id\} lang=\{lang\}/);
  for (const id of [
    "dashboard", "merchant-approvals", "branch-approvals", "shipping-companies",
    "users", "staff", "categories", "cities", "store-catalog", "orders",
    "suspicious-matches", "ai-reads", "support", "broadcast", "ads",
    "complaints", "knowledge", "reports", "content-moderation", "monetization",
    "payments", "referrals", "audit",
  ]) {
    assert.match(pageGuide, new RegExp(`(?:\\"|')${id}(?:\\"|')`));
  }
  assert.match(pageGuide, /الصفحة دي بتعمل إيه/);
  assert.match(pageGuide, /What is this page for/);
});


test("page help cards fit their text and remain responsive", () => {
  assert.match(globalCss, /\.page-guide[\s\S]*?width:\s*fit-content/);
  assert.match(globalCss, /max-width:\s*min\(920px, calc\(100% - 40px\)\)/);
  assert.match(globalCss, /@media \(max-width: 720px\)[\s\S]*?max-width:\s*calc\(100% - 24px\)/);
});

test("desktop sidebar is viewport-fixed with its own scrolling", () => {
  assert.match(globalCss, /\.sidebar\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(globalCss, /height:\s*100dvh/);
  assert.match(globalCss, /overscroll-behavior:\s*contain/);
  assert.match(globalCss, /\.main-area\s*\{[\s\S]*?margin-inline-start:\s*280px/);
  assert.match(globalCss, /@media \(max-width: 1180px\)[\s\S]*?margin-inline-start:\s*0/);
});

test("support metadata removes technical missing values and isolates mixed-direction text", () => {
  assert.match(support, /technicalMissingValues/);
  assert.match(support, /safeContact\(selected\.customer_mobile, selected\.customer_email\)/);
  assert.match(support, /not\[_\\s-\]\?provided/);
  assert.match(support, /<bdi>\{assignedLabel/);
  assert.match(support, /className="chat-meta"/);
});
