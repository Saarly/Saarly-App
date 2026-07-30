import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [actionRoute, sections, dataSection, supportConsole, complaintsConsole, monetizationConsole, notificationBroadcast, formatSource, globalsCss, monetizationRoute] = await Promise.all([
  read("../src/app/api/admin/action/route.ts"),
  read("../src/lib/admin/sections.ts"),
  read("../src/components/data-section.tsx"),
  read("../src/components/support-console.tsx"),
  read("../src/components/complaints-console.tsx"),
  read("../src/components/monetization-console.tsx"),
  read("../src/components/notification-broadcast.tsx"),
  read("../src/lib/admin/format.ts"),
  read("../src/app/globals.css"),
  read("../src/app/api/admin/monetization/route.ts"),
]);

test("merchant and branch final approval requires all current required documents to be approved", () => {
  assert.match(actionRoute, /required_documents_must_be_approved_first/);
  assert.match(actionRoute, /rejected_documents_must_be_replaced_first/);
  assert.match(actionRoute, /assertApprovalDocumentsReady/);
  assert.match(dataSection, /finalApprovalBlockReason/);
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

test("ads include a persisted ongoing option", () => {
  assert.match(dataSection, /ad_ongoing/);
  assert.match(dataSection, /values\.is_ongoing = ongoing/);
  assert.match(dataSection, /row\.is_ongoing/);
  assert.match(dataSection, /values\.starts_at = null/);
  assert.match(dataSection, /values\.ends_at = null/);
  assert.match(actionRoute, /"is_ongoing"/);
});

test("merchant billing method reads active and future plans dynamically", () => {
  assert.match(monetizationConsole, /adjustBillingPreference/);
  assert.match(monetizationConsole, /field:\s*["']billing_method["']/);
  assert.match(monetizationConsole, /data\?\.plans/);
  assert.match(monetizationConsole, /value=\{`plan:/);
  assert.match(monetizationRoute, /billing_plan_id/);
  assert.match(monetizationRoute, /subscription_plans/);
});


test("saved approval decisions are not reported as action_failed when notification dispatch fails", () => {
  assert.match(actionRoute, /Merchant decision event failed after the review was saved/);
  assert.match(actionRoute, /Branch decision event failed after the review was saved/);
  assert.match(actionRoute, /warnings:\s*eventWarnings/);
});

test("support label editor auto-sizes instead of filling the conversation card", () => {
  assert.match(globalsCss, /\.chat-card\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/);
  assert.match(globalsCss, /\.conversation-label-editor\s*\{[\s\S]*?height:\s*auto/);
});

test("an ongoing ad restores its saved finite schedule without inventing a new duration", () => {
  assert.doesNotMatch(dataSection, /defaultAdSchedule\(\)/);
  assert.match(dataSection, /row\.saved_starts_at \?\? row\.starts_at/);
  assert.match(dataSection, /row\.saved_ends_at \?\? row\.ends_at/);
  assert.match(dataSection, /ad_saved_starts_at/);
  assert.match(dataSection, /ad_saved_ends_at/);
  assert.match(dataSection, /ad_schedule_required/);
  assert.match(dataSection, /ad_end_must_be_after_start/);
});

test("founder counting can be paused and commission settings are configurable", () => {
  assert.doesNotMatch(monetizationRoute, /founder_counting_cannot_be_disabled_after_start/);
  assert.match(monetizationRoute, /admin_configure_commissions_as/);
  assert.match(monetizationRoute, /configure_commissions/);
  assert.match(monetizationConsole, /commissionDraft/);
  assert.match(monetizationConsole, /category_rates/);
});

test("merchant billing uses a controlled selector backed by subscription plans", () => {
  assert.match(monetizationConsole, /billing-method-modal/);
  assert.match(monetizationConsole, /<select/);
  assert.match(monetizationConsole, /value="commission"/);
  assert.match(monetizationConsole, /planOptionLabel\(plan, lang\)/);
  assert.match(monetizationConsole, /أي باقة جديدة مفعلة ستظهر هنا تلقائيًا/);
  const billingHandler = monetizationConsole.match(/function adjustBillingPreference[\s\S]*?function saveBillingPreference/)?.[0] ?? "";
  assert.doesNotMatch(billingHandler, /window\.prompt|prompt\(/);
});

test("turning off an ongoing ad immediately deactivates it", () => {
  assert.match(dataSection, /ad_ongoing:\s*false,[\s\S]*?is_active:\s*false/);
  assert.match(dataSection, /!startsAt\s*&&\s*!endsAt\s*&&\s*!active/);
  assert.match(globalsCss, /\.ads-placement-grid\s*\{[\s\S]*?align-items:\s*start/);
  assert.match(globalsCss, /\.ads-placement-card\s*\{[\s\S]*?align-self:\s*start/);
});

test("complaints can update status and manage the shared support labels", () => {
  assert.match(actionRoute, /admin_set_support_complaint_status_as/);
  assert.match(complaintsConsole, /set_complaint_status_admin/);
  assert.match(complaintsConsole, /upsert_support_label/);
  assert.match(complaintsConsole, /complaint-label-manager/);
  assert.doesNotMatch(complaintsConsole, /<h2>\{text\(selected\.title\)\}<\/h2>/);
  assert.doesNotMatch(complaintsConsole, /<strong>\{text\(item\.title\)/);
});

test("store moderation supports visible suspend, restore and atomic delete operations", async () => {
  const catalog = await read("../src/components/store-catalog-moderation.tsx");
  assert.match(catalog, /restore_merchant/);
  assert.match(catalog, /manually_suspended_at/);
  assert.match(catalog, /تم إيقاف المتجر بنجاح/);
  assert.match(actionRoute, /admin_set_merchant_suspension_as/);
  assert.match(actionRoute, /admin_delete_merchant_as/);
  assert.match(actionRoute, /merchant_has_financial_or_order_history|delete_merchant/);
});
