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
const clientSource = await readFile(
  new URL("../src/lib/supabase/client.ts", import.meta.url),
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

test("email retry invokes the real dispatcher", () => {
  assert.match(monetizationRoute, /process-admin-email-events/);
  assert.match(monetizationRoute, /EMAIL_DISPATCH_SECRET/);
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
