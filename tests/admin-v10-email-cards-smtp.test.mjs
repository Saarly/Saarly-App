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

test("email worker uses the configured SMTP path with safe UTF-8 sender headers", () => {
  assert.match(worker, /SMTP_HOST/);
  assert.match(worker, /SMTP_USER/);
  assert.match(worker, /SMTP_PASS/);
  assert.match(worker, /smtp_missing:/);
  assert.match(worker, /nodemailer@/);
  assert.match(worker, /name:\s*senderName\(\)/);
  assert.match(worker, /address:\s*fromAddress/);
  assert.match(worker, /Saarly \| سعرلي/);
  assert.match(worker, /utf8_sender_headers/);
  assert.match(worker, /event_id/);
  assert.doesNotMatch(worker, /RESEND_API_KEY|api\.resend\.com/);
});
