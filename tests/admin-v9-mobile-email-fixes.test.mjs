import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dataSection = fs.readFileSync("src/components/data-section.tsx", "utf8");
const monetization = fs.readFileSync("src/components/monetization-console.tsx", "utf8");
const route = fs.readFileSync("src/app/api/admin/monetization/route.ts", "utf8");
const css = fs.readFileSync("src/app/globals.css", "utf8");

test("all shared admin tables expose mobile labels", () => {
  assert.match(dataSection, /data-label=\{tr\(column\.label, lang\)\}/);
  assert.match(dataSection, /className="mobile-actions-cell"/);
  assert.match(monetization, /data-label=\{label\}/);
});

test("small screens render table rows as cards without horizontal scrolling", () => {
  assert.match(css, /V9: true mobile table layout/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.data-table-wrap \{[\s\S]*overflow: visible/);
  assert.match(css, /\.data-table thead \{[\s\S]*display: none/);
  assert.match(css, /content: attr\(data-label\)/);
  assert.match(css, /\.monetization-tabs \{[\s\S]*grid-template-columns: repeat\(2/);
});

test("email retry runs the worker immediately and returns the final event state", () => {
  assert.match(route, /functions\/v1\/process-admin-email-events/);
  assert.match(route, /const finalEvent/);
  assert.match(route, /return \{ event: finalEvent, dispatcher \}/);
  assert.match(monetization, /تم إرسال البريد بنجاح/);
  assert.match(monetization, /تمت إعادة المحاولة لكن فشل الإرسال/);
});
