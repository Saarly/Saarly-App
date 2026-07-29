import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/components/monetization-console.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/monetization/route.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../supabase/functions/process-admin-email-events/index.ts", import.meta.url), "utf8");

test("email history uses complete cards instead of the wide shared table", () => {
  assert.match(component, /<EmailEventCards/);
  assert.match(component, /className="email-event-card"/);
  assert.match(css, /\.email-event-list/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("email retry targets the selected event and saves a specific failure", () => {
  assert.match(route, /event_id: eventId \|\| undefined/);
  assert.match(route, /email_dispatch_unreachable/);
  assert.match(route, /email_target_not_processed/);
});

test("email worker prefers configured SMTP and reports exact missing secrets", () => {
  assert.match(worker, /return "smtp"/);
  assert.match(worker, /smtp_missing:/);
  assert.match(worker, /has_smtp_pass/);
  assert.match(worker, /targetEventId/);
});
