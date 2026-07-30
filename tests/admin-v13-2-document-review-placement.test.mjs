import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [dataSection, monetization, actionRoute] = await Promise.all([
  read("../src/components/data-section.tsx"),
  read("../src/components/monetization-console.tsx"),
  read("../src/app/api/admin/action/route.ts"),
]);

test("store and branch document decisions live only in approval pages", () => {
  assert.match(dataSection, /review_merchant_document/);
  assert.match(dataSection, /review_branch_document/);
  assert.match(dataSection, /قبول الملف/);
  assert.match(dataSection, /رفض الملف/);
  assert.match(actionRoute, /approval_documents/);
  assert.match(actionRoute, /admin_review_merchant_document_as/);

  assert.match(monetization, /عرض الملفات/);
  assert.match(monetization, /للعرض والمتابعة فقط/);
  assert.doesNotMatch(monetization, /review_document/);
  assert.doesNotMatch(monetization, /onApprove/);
  assert.doesNotMatch(monetization, /onReject/);
});
