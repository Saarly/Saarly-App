import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [dataSection, actionRoute, css] = await Promise.all([
  read("../src/components/data-section.tsx"),
  read("../src/app/api/admin/action/route.ts"),
  read("../src/app/globals.css"),
]);

test("merchant and branch approval documents render inline with decisions below each preview", () => {
  assert.match(dataSection, /className="approval-document-grid"/);
  assert.match(dataSection, /className="approval-document-image"/);
  assert.match(dataSection, /className="approval-document-pdf"/);
  assert.match(dataSection, /فتح بالحجم الكامل/);
  assert.match(dataSection, /قبول الملف/);
  assert.match(dataSection, /رفض الملف/);
  assert.match(css, /\.approval-document-grid\s*\{/);
  assert.match(css, /object-fit:\s*contain\s*!important/);
  assert.match(css, /\.approval-document-actions/);
});

test("legacy approval images can be reviewed without a migration", () => {
  assert.match(dataSection, /_legacy_source:\s*true/);
  assert.match(dataSection, /legacy_document:/);
  assert.match(actionRoute, /ensureLegacyApprovalDocument/);
  assert.match(actionRoute, /legacy_approval_fields/);
  assert.match(actionRoute, /admin_active_merchants_readable/);
  assert.match(actionRoute, /admin_branches_readable/);
  assert.match(actionRoute, /merchant_documents/);
});

test("stored review records are merged with direct application images", () => {
  assert.match(dataSection, /storedByKind/);
  assert.match(dataSection, /specifiedDocuments/);
  assert.match(dataSection, /extraStoredDocuments/);
  assert.match(dataSection, /return \[\.\.\.specifiedDocuments, \.\.\.extraStoredDocuments\]/);
});

test("inline approval document list keeps the full Row type for TypeScript builds", () => {
  assert.match(dataSection, /const displayDocuments = useMemo<Row\[\]>\(\(\) => \{/);
  assert.match(dataSection, /document\._display_key \?\? document\.id/);
});
