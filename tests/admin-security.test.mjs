import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionRoute = await readFile(
  new URL("../src/app/api/admin/action/route.ts", import.meta.url),
  "utf8",
);
const monetizationRoute = await readFile(
  new URL("../src/app/api/admin/monetization/route.ts", import.meta.url),
  "utf8",
);
const monetizationConsole = await readFile(
  new URL("../src/components/monetization-console.tsx", import.meta.url),
  "utf8",
);
const clientSource = await readFile(
  new URL("../src/lib/supabase/client.ts", import.meta.url),
  "utf8",
);
const decisionEventsSource = await readFile(
  new URL("../src/lib/admin/decision-events.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("merchant and branch decisions use atomic server RPCs", () => {
  assert.match(actionRoute, /admin_review_merchant_registration_as/);
  assert.match(actionRoute, /admin_review_branch_as/);
  assert.match(actionRoute, /admin_set_merchant_suspension_as/);
});

test("generic row editor cannot change approval decisions", () => {
  const start = actionRoute.indexOf("const editableFields");
  const end = actionRoute.indexOf("const toggleFieldByTable");
  assert.ok(start >= 0 && end > start);
  const block = actionRoute.slice(start, end);
  assert.doesNotMatch(block, /[\"']approval_status[\"']/);
  assert.doesNotMatch(block, /[\"']rejection_reason[\"']/);
});

test("merchant document review is atomic", () => {
  assert.match(monetizationRoute, /admin_review_merchant_document_as/);
  const start = monetizationRoute.indexOf("async function reviewDocument");
  const end = monetizationRoute.indexOf("async function", start + 20);
  const block = monetizationRoute.slice(start, end > start ? end : undefined);
  assert.doesNotMatch(block, /\.from\([\"']merchant_documents[\"']\)\s*\.update/s);
});

test("manual payment plan cannot change after review starts", () => {
  const start = monetizationRoute.indexOf("async function updateManualPaymentPlan");
  const end = monetizationRoute.indexOf("async function", start + 20);
  const block = monetizationRoute.slice(start, end > start ? end : undefined);
  assert.match(block, /String\(before\.status\)\s*!==\s*[\"']submitted[\"']/);
  assert.doesNotMatch(block, /\[[\"']submitted[\"'],\s*[\"']under_review[\"']\]/);
});

test("email retry invokes the real dispatcher with the server-only service role", () => {
  assert.match(monetizationRoute, /process-admin-email-events/);
  assert.match(monetizationRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(monetizationRoute, /Authorization: `Bearer \$\{serviceRoleKey\}`/);
  assert.doesNotMatch(monetizationRoute, /email_dispatch_secret_not_configured/);
});

test("decision notifications avoid partial unique-index upsert conflicts", () => {
  const start = decisionEventsSource.indexOf("async function upsertNotification");
  const end = decisionEventsSource.indexOf("async function ensureEmailEvent", start);
  assert.ok(start >= 0 && end > start);
  const block = decisionEventsSource.slice(start, end);
  assert.match(block, /\.eq\(["']user_id["'],\s*userId\)/);
  assert.match(block, /\.eq\(["']dedupe_key["'],\s*dedupeKey\)/);
  assert.match(block, /\.insert\(\{/);
  assert.doesNotMatch(block, /\.upsert\([\s\S]*onConflict:\s*["']user_id,dedupe_key["']/);
});

test("percentage discounts keep blank cash amount as null", () => {
  const start = monetizationRoute.indexOf("async function saveDiscount");
  const end = monetizationRoute.indexOf("async function", start + 20);
  assert.ok(start >= 0 && end > start);
  const block = monetizationRoute.slice(start, end);
  assert.match(block, /hasPercent/);
  assert.match(block, /hasAmount/);
  assert.match(block, /const discountAmount = hasAmount && !hasPercent[\s\S]*:\s*null;/);
  assert.match(block, /discount_amount:\s*discountAmount/);
  assert.doesNotMatch(block, /discount_amount:\s*numberValue\(payload\.discount_amount,\s*0\)/);
});

test("manual payment approval creates one source-linked subscription before decision events", () => {
  const ensureStart = monetizationRoute.indexOf("async function ensureManualPaymentSubscription");
  const ensureEnd = monetizationRoute.indexOf("async function rows", ensureStart);
  assert.ok(ensureStart >= 0 && ensureEnd > ensureStart);
  const ensureBlock = monetizationRoute.slice(ensureStart, ensureEnd);
  assert.match(ensureBlock, /\.eq\("source_payment_request_id", requestId\)/);
  assert.match(ensureBlock, /source_payment_request_id:\s*requestId/);
  assert.match(ensureBlock, /\.insert\(subscriptionRow\)/);
  assert.match(ensureBlock, /\.update\(\{/);
  assert.match(ensureBlock, /extend_manual_payment_subscription/);
  assert.match(ensureBlock, /activate_manual_payment_subscription/);

  const reviewStart = monetizationRoute.indexOf("async function reviewManualPayment");
  const reviewEnd = monetizationRoute.indexOf("async function updateManualPaymentPlan", reviewStart);
  assert.ok(reviewStart >= 0 && reviewEnd > reviewStart);
  const reviewBlock = monetizationRoute.slice(reviewStart, reviewEnd);
  const ensureCall = reviewBlock.indexOf("await ensureManualPaymentSubscription");
  const dispatchCall = reviewBlock.indexOf("dispatchSubscriptionDecisionEvents");
  assert.ok(ensureCall >= 0 && dispatchCall > ensureCall);
});

test("monetization Excel exports keep decorated store and plan columns before raw payment fields", () => {
  const exportStart = monetizationConsole.indexOf("function downloadExcelRows");
  const exportEnd = monetizationConsole.indexOf("function planDraftFrom", exportStart);
  assert.ok(exportStart >= 0 && exportEnd > exportStart);
  const block = monetizationConsole.slice(exportStart, exportEnd);
  assert.match(block, /const priorityColumns = \[/);
  assert.match(block, /"store_name"/);
  assert.match(block, /lang === "ar" \? "plan_name_ar" : "plan_name_en"/);
  assert.match(block, /\.\.\.priorityColumns,[\s\S]*\.slice\(0,\s*30\)/);
});

test("runtime packages are pinned", () => {
  const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const [name, version] of Object.entries(all)) {
    assert.doesNotMatch(version, /^[~^*]|\bx\b/i, `${name} is not pinned: ${version}`);
  }
});


test("browser Supabase client is initialized lazily", () => {
  assert.match(clientSource, /function getSupabaseClient/);
  assert.match(clientSource, /new Proxy/);
  assert.doesNotMatch(clientSource, /export const supabase = createClient/);
});
