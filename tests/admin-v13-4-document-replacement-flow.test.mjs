import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [actionRoute, decisions, worker, dataSection, messages, migration] = await Promise.all([
  read("../src/app/api/admin/action/route.ts"),
  read("../src/lib/admin/decision-events.ts"),
  read("../supabase/functions/process-admin-email-events/index.ts"),
  read("../src/components/data-section.tsx"),
  read("../src/lib/admin/messages.ts"),
  read("../supabase/migrations/20260730172536_enforce_document_approval_before_application_approval.sql"),
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
  assert.match(actionRoute, /assertApprovalDocumentsReady\(service, "merchant"/);
  assert.match(actionRoute, /assertApprovalDocumentsReady\(service, "branch"/);
  assert.match(messages, /required_documents_must_be_approved_first/);
  assert.match(messages, /rejected_documents_must_be_replaced_first/);
  assert.match(migration, /required_documents_must_be_approved_first/);
  assert.match(migration, /rejected_documents_must_be_replaced_first/);
});

test("an independent branch commercial register is required while a shared register stays optional", () => {
  assert.match(dataSection, /optional: row\.uses_parent_commercial_register !== false/);
  assert.match(actionRoute, /uses_parent_commercial_register === false/);
  assert.match(migration, /uses_parent_commercial_register is false/);
});
