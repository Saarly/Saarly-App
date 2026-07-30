import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const component = readFileSync(join(root, "src/components/monetization-console.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("store document file preview replaces the document list and returns to it", () => {
  assert.match(component, /documentPreview && !filePreview/);
  assert.match(component, /returnToDocuments=\{Boolean\(documentPreview\)\}/);
  assert.match(component, /الرجوع لمستندات المتجر/);
  assert.match(component, /Back to store documents/);
});

test("store document and file preview dialogs have explicit layer ordering", () => {
  assert.match(component, /modal-backdrop file-preview-backdrop/);
  assert.match(component, /modal-backdrop store-documents-backdrop/);
  assert.match(css, /\.store-documents-backdrop\s*\{[^}]*z-index:\s*50/s);
  assert.match(css, /\.file-preview-backdrop\s*\{[^}]*z-index:\s*60/s);
});
