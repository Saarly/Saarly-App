import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  actionRoute,
  decisions,
  worker,
  dataSection,
  messages,
  migration,
  sections,
  referralMigration,
  deviceReferralMigration,
] = await Promise.all([
  read("../src/app/api/admin/action/route.ts"),
  read("../src/lib/admin/decision-events.ts"),
  read("../supabase/functions/process-admin-email-events/index.ts"),
  read("../src/components/data-section.tsx"),
  read("../src/lib/admin/messages.ts"),
  read(
    "../supabase/migrations/20260730172536_enforce_document_approval_before_application_approval.sql",
  ),
  read("../src/lib/admin/sections.ts"),
  read(
    "../supabase/migrations/20260803193000_referral_cycles_after_merchant_approval.sql",
  ),
  read(
    "../supabase/migrations/20260803201000_referral_buyer_and_device_guard.sql",
  ),
]);

test("rejecting a merchant or branch document queues a branded replacement email", () => {
  assert.match(actionRoute, /dispatchApprovalDocumentRejectionEvents/);
  assert.match(actionRoute, /if \(!approved\)/);
  assert.match(decisions, /merchant_document_rejected/);
  assert.match(decisions, /branch_document_rejected/);
  assert.match(decisions, /document_label/);
  assert.match(decisions, /يرجى رفع ملف بديل واضح وصحيح/);
  assert.match(worker, /مطلوب استبدال/);
  assert.match(worker, /مراجعة طلب المتجر/);
  assert.match(worker, /نفس شاشة متابعة طلب المتجر|شاشة متابعة طلب المتجر/);
});

test("final approval is blocked in UI, API, and database until documents are ready", () => {
  assert.match(dataSection, /finalApprovalBlockReason/);
  assert.match(dataSection, /disabled=\{Boolean\(finalApprovalBlockReason/);
  assert.match(
    actionRoute,
    /assertApprovalDocumentsReady\(service, "merchant"/,
  );
  assert.match(actionRoute, /assertApprovalDocumentsReady\(service, "branch"/);
  assert.match(messages, /required_documents_must_be_approved_first/);
  assert.match(messages, /rejected_documents_must_be_replaced_first/);
  assert.match(migration, /required_documents_must_be_approved_first/);
  assert.match(migration, /rejected_documents_must_be_replaced_first/);
});

test("an independent branch commercial register is required while a shared register stays optional", () => {
  assert.match(
    dataSection,
    /optional: row\.uses_parent_commercial_register !== false/,
  );
  assert.match(actionRoute, /uses_parent_commercial_register === false/);
  assert.match(migration, /uses_parent_commercial_register is false/);
});

test("resubmitted approval documents are clearly flagged for admin review", () => {
  assert.match(
    actionRoute,
    /select\("id,merchant_id,branch_id[\s\S]*metadata"\)/,
  );
  assert.match(actionRoute, /mobile_rejected_document_replacement/);
  assert.match(actionRoute, /replaces_document_id/);
  assert.match(actionRoute, /has_resubmitted_documents/);
  assert.match(actionRoute, /resubmission_status_ar/);
  assert.match(dataSection, /approvalDocumentWasResubmitted/);
  assert.match(dataSection, /hasResubmittedDocuments/);
  assert.match(dataSection, /Resubmitted/);
  assert.match(sections, /resubmission_status_ar/);
});

test("superseded rejected documents do not keep final approval disabled in the UI", () => {
  assert.match(
    actionRoute,
    /select\("id,merchant_id,branch_id[\s\S]*superseded_by[\s\S]*metadata"\)/,
  );
  assert.match(dataSection, /currentDocuments = documents\.filter/);
  assert.match(dataSection, /document\.superseded_by/);
  assert.match(dataSection, /currentDocuments[\s\S]*status[\s\S]*approved/);
  assert.match(dataSection, /currentDocuments\.some[\s\S]*rejected/);
});

test("referral milestones start counting again after merchant approval rewards", () => {
  assert.match(
    referralMigration,
    /private\.register_merchant_referral_after_approval/,
  );
  assert.match(referralMigration, /pending_merchant_approval/);
  assert.match(referralMigration, /referral_rewards_referral_milestone_unique/);
  assert.match(referralMigration, /milestone_number/);
  assert.match(referralMigration, /qualified_registrations/);
  assert.match(sections, /key:\s*"milestone_number"/);
  assert.match(sections, /key:\s*"qualified_registrations"/);
  assert.match(sections, /key:\s*"confirmed_registrations"/);
});

test("buyer referrals are registered after buyer profile completion", () => {
  assert.match(deviceReferralMigration, /public\.register_confirmed_referral/);
  assert.match(deviceReferralMigration, /public_referral_registration/);
});

test("referral counting requires device signals and stores merchant signals until approval", () => {
  assert.match(deviceReferralMigration, /device_fingerprint_required/);
  assert.match(deviceReferralMigration, /device_family_hash/);
  assert.match(
    deviceReferralMigration,
    /referral_events_device_family_hash_unique/,
  );
  assert.match(
    deviceReferralMigration,
    /submit_my_merchant_registration_with_referral_device/,
  );
  assert.match(deviceReferralMigration, /referral_device_fingerprint/);
  assert.match(deviceReferralMigration, /referral_device_family_fingerprint/);
});
