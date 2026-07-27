import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/admin/action/route.ts", "utf8");
const messages = readFileSync("src/lib/admin/messages.ts", "utf8");

test("staff creation searches Auth before creating a duplicate login", () => {
  assert.match(route, /findAuthUserByEmail/);
  assert.match(route, /auth\.admin\.listUsers\(\{ page, perPage \}\)/);
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
