import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dataSection = fs.readFileSync("src/components/data-section.tsx", "utf8");
const actionRoute = fs.readFileSync("src/app/api/admin/action/route.ts", "utf8");
const sections = fs.readFileSync("src/lib/admin/sections.ts", "utf8");

test("resubmission badge represents current pending replacement only", () => {
  assert.match(actionRoute, /pendingResubmittedDocumentsCount/);
  assert.match(dataSection, /document\.status.*pending/s);
});

test("approval actions patch rows without loading the whole section", () => {
  const actionStart = dataSection.indexOf("async function runRowAction");
  const actionEnd = dataSection.indexOf("async function saveEdit", actionStart);
  const actionBody = dataSection.slice(actionStart, actionEnd);
  assert.doesNotMatch(actionBody, /await loadRows\(\)/);
  assert.match(actionBody, /setRows\(\(current\)/);
});

test("merchant and branch approval filters exist", () => {
  assert.match(dataSection, /needs_review/);
  assert.match(dataSection, /resubmitted/);
  assert.match(dataSection, /فلترة الموافقات/);
});

test("referrals dashboard includes referrals without rewards", () => {
  assert.match(sections, /admin_referrals_rewards_dashboard_readable/);
  assert.match(sections, /remaining_registrations/);
});
