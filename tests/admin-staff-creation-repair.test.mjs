import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/admin/action/route.ts", "utf8");
const messages = readFileSync("src/lib/admin/messages.ts", "utf8");
const authRepairMigration = readFileSync("supabase/migrations/20260727203500_repair_auth_null_tokens.sql", "utf8");

test("staff creation searches Auth before creating a duplicate login", () => {
  assert.match(route, /findAuthUserByEmail/);
  assert.doesNotMatch(route, /auth\.admin\.listUsers/);
});

test("staff creation uses only the exact service-role auth lookup", () => {
  assert.match(route, /admin_auth_user_lookup_by_email_as/);
  assert.match(route, /if \(!directLookup \|\| typeof directLookup !== "object"\)/);
  assert.match(route, /return null/);
});

test("email_exists is retried through orphan-account repair instead of becoming a generic failure", () => {
  assert.match(route, /hidden\/orphan Auth record/);
  assert.match(route, /const existingAuthUser = await findAuthUserByEmail\(service, email\)/);
});

test("orphan Auth accounts are repaired and reused", () => {
  assert.match(route, /repairedOrphanAuthUser = true/);
  assert.match(route, /auth\.admin\.updateUserById\(/);
  assert.match(route, /repaired_existing_login/);
});

test("existing customer accounts are not silently promoted to admin", () => {
  assert.match(route, /email_belongs_to_existing_account/);
  assert.match(messages, /مينفعش نحوله لحساب إدارة تلقائيًا/);
});

test("email and mobile conflicts show separate useful messages", () => {
  assert.match(route, /staff_email_already_exists/);
  assert.match(route, /staff_mobile_already_exists/);
  assert.match(messages, /رقم الموبايل ده مستخدم/);
});

test("new incomplete Auth accounts are explicitly cleaned up", () => {
  assert.match(route, /const \{ error: cleanupError \} = await service\.auth\.admin\.deleteUser\(userId\)/);
});


test("legacy Auth rows are normalized so GoTrue can list users", () => {
  assert.match(authRepairMigration, /confirmation_token = coalesce\(confirmation_token, ''\)/);
  assert.match(authRepairMigration, /recovery_token = coalesce\(recovery_token, ''\)/);
  assert.match(authRepairMigration, /email_change_token_new = coalesce\(email_change_token_new, ''\)/);
  assert.match(authRepairMigration, /email_change = coalesce\(email_change, ''\)/);
  assert.match(authRepairMigration, /phone_change = coalesce\(phone_change, ''\)/);
  assert.match(authRepairMigration, /reauthentication_token = coalesce\(reauthentication_token, ''\)/);
});
