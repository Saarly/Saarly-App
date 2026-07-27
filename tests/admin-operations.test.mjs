import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [actionRoute, sections, dataSection, supportConsole, complaintsConsole, monetizationConsole, notificationBroadcast, formatSource] = await Promise.all([
  read("../src/app/api/admin/action/route.ts"),
  read("../src/lib/admin/sections.ts"),
  read("../src/components/data-section.tsx"),
  read("../src/components/support-console.tsx"),
  read("../src/components/complaints-console.tsx"),
  read("../src/components/monetization-console.tsx"),
  read("../src/components/notification-broadcast.tsx"),
  read("../src/lib/admin/format.ts"),
]);

test("merchant and branch decisions do not require a duplicate document-approval workflow", () => {
  assert.doesNotMatch(actionRoute, /required_documents_must_be_approved_first/);
  assert.doesNotMatch(actionRoute, /missingApprovalDocuments/);
  assert.match(dataSection, /owner_id_back_image_url/);
  assert.match(dataSection, /manager_id_back_image_url/);
});

test("redundant stores and audit navigation entries stay hidden", () => {
  assert.match(sections, /id:\s*["']stores["'][\s\S]{0,180}hidden:\s*true/);
  assert.match(sections, /id:\s*["']audit["'][\s\S]{0,180}hidden:\s*true/);
});

test("support operations include labels, assignment and complaint conversion", () => {
  assert.match(actionRoute, /admin_upsert_support_label_as/);
  assert.match(actionRoute, /admin_set_support_conversation_labels_as/);
  assert.match(actionRoute, /admin_convert_support_conversation_to_complaint_as/);
  assert.match(supportConsole, /Convert conversation to complaint/);
  assert.match(complaintsConsole, /resolve_complaint/);
});

test("merchant monetization supports badges, test accounts and trial management", () => {
  assert.match(monetizationConsole, /founder_badge_enabled/);
  assert.match(monetizationConsole, /trusted_badge_enabled/);
  assert.match(monetizationConsole, /is_test_account/);
  assert.match(actionRoute, /admin_set_merchant_badges_as/);
  assert.match(actionRoute, /admin_set_merchant_trial_as/);
});

test("notification audience no longer offers staff-only delivery", () => {
  assert.doesNotMatch(notificationBroadcast, /value=["']staff["']/);
  assert.doesNotMatch(notificationBroadcast, /team only/i);
});

test("bilingual value formatter covers operational technical values", () => {
  for (const value of ["not_required", "awaiting_confirmation", "expired_unconfirmed", "needs_review", "support_agent", "not_provided"]) {
    assert.match(formatSource, new RegExp(value));
  }
});

test("private review images are signed by the server instead of public bucket URLs", () => {
  assert.match(actionRoute, /signed_admin_file/);
  assert.match(dataSection, /fallback_bucket/);
  assert.doesNotMatch(dataSection, /createSignedUrl\(path/);
});

test("catalog data is loaded through the protected admin API", async () => {
  const catalog = await read("../src/components/store-catalog-moderation.tsx");
  assert.match(catalog, /\/api\/admin\/action\?catalog=1/);
  assert.doesNotMatch(catalog, /\.from\(["']admin_merchants_readable["']\)/);
});

test("complaints support labels and atomic resolution", () => {
  assert.match(actionRoute, /admin_set_support_complaint_labels_as/);
  assert.match(actionRoute, /admin_resolve_support_complaint_as/);
  assert.match(complaintsConsole, /set_support_complaint_labels/);
});

test("ads include a real ongoing option", () => {
  assert.match(dataSection, /ad_ongoing/);
  assert.match(dataSection, /values\.starts_at = null/);
  assert.match(dataSection, /values\.ends_at = null/);
});

test("merchant billing method can be changed from the founders tab", () => {
  assert.match(monetizationConsole, /adjustBillingPreference/);
  assert.match(monetizationConsole, /field:\s*["']billing_preference["']/);
});
