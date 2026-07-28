import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, dataSection, emailSetup] = await Promise.all([
  read("../supabase/migrations/20260728180000_product_images_primary_branch_and_badge_regression_guard.sql"),
  read("../src/components/data-section.tsx"),
  read("../EMAIL_PROVIDER_SETUP_REQUIRED_AR.md"),
]);

test("product image policy matches Flutter path contract", () => {
  assert.match(migration, /foldername\(name\)\)\[1\][\s\S]*auth\.uid/);
  assert.match(migration, /foldername\(name\)\)\[2\][\s\S]*'products'/);
  assert.match(migration, /foldername\(name\)\)\[3\][\s\S]*current_merchant_id/);
});

test("primary registration branch is reviewed only with its merchant", () => {
  assert.match(migration, /add column if not exists is_primary/);
  assert.match(migration, /where not b\.is_primary/);
  assert.match(migration, /primary_branch_reviewed_with_merchant/);
  assert.match(migration, /and is_primary/);
});

test("primary branch does not enqueue duplicate approval messages", () => {
  assert.match(migration, /tg_table_name = 'branches'[\s\S]*new\.is_primary[\s\S]*return new/);
  assert.match(migration, /'admin:' \|\| v_event_type \|\| ':' \|\| v_target_id::text/);
});

test("admin visibly reports email provider delivery failure", () => {
  assert.match(dataSection, /warnings\?: string\[\]/);
  assert.match(dataSection, /email_send_failed/);
  assert.match(dataSection, /تعذر إرسال البريد/);
  assert.match(emailSetup, /email_provider_not_configured/);
  assert.match(emailSetup, /RESEND_API_KEY/);
  assert.match(emailSetup, /SMTP_HOST/);
});
