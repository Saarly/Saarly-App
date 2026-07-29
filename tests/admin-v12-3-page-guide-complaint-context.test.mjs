import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageGuide = readFileSync(new URL("../src/components/page-guide.tsx", import.meta.url), "utf8");
const complaints = readFileSync(new URL("../src/components/complaints-console.tsx", import.meta.url), "utf8");
const actionRoute = readFileSync(new URL("../src/app/api/admin/action/route.ts", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const requiredGuideIds = [
  "dashboard",
  "merchant-approvals",
  "branch-approvals",
  "shipping-companies",
  "users",
  "staff",
  "categories",
  "cities",
  "stores",
  "store-catalog",
  "orders",
  "suspicious-matches",
  "ai-reads",
  "support",
  "broadcast",
  "ads",
  "complaints",
  "knowledge",
  "reports",
  "content-moderation",
  "monetization",
  "payments",
  "referrals",
  "audit",
];

test("only the recurring page guide card is centered and keeps start-aligned text", () => {
  assert.match(globalCss, /\.page-guide\s*\{[\s\S]*?justify-self:\s*center/);
  assert.match(globalCss, /\.page-guide\s*\{[\s\S]*?margin:\s*18px auto 0/);
  assert.match(globalCss, /\.page-guide\s*\{[\s\S]*?text-align:\s*start/);
  assert.doesNotMatch(globalCss, /\.main-area\s*\{[^}]*justify-content:\s*center/);
  assert.doesNotMatch(globalCss, /\.content-panel\s*\{[^}]*margin-inline:\s*auto/);
});

test("every admin page has specific bilingual guidance", () => {
  for (const id of requiredGuideIds) {
    assert.match(pageGuide, new RegExp(`(?:\\"|')${id}(?:\\"|')`));
  }
  assert.match(pageGuide, /هنا بتاخد لقطة سريعة عن حالة المنصة/);
  assert.match(pageGuide, /Manage formal complaints after escalation from support/);
  assert.match(pageGuide, /سياق العميل والبوت والدعم قبل التصعيد/);
});

test("formal complaint context loads the linked support conversation safely", () => {
  assert.match(actionRoute, /complaint_context/);
  assert.match(actionRoute, /\.contains\("metadata", \{ complaint_id: complaintContextId \}\)/);
  assert.match(actionRoute, /\.from\("chat_messages"\)/);
  assert.match(actionRoute, /senderNames\.get/);
  assert.match(actionRoute, /Cache-Control/);
});

test("complaint UI separates customer, bot, support and formal complaint stages", () => {
  assert.match(complaints, /رسائل العميل قبل الشكوى/);
  assert.match(complaints, /رسائل البوت/);
  assert.match(complaints, /رسائل النظام والتحويل/);
  assert.match(complaints, /ردود الدعم قبل تحويلها لشكوى/);
  assert.match(complaints, /رسائل الشكوى الرسمية/);
  assert.match(complaints, /customerContextMessages/);
  assert.match(complaints, /botContextMessages/);
  assert.match(complaints, /systemContextMessages/);
  assert.match(complaints, /supportContextMessages/);
  assert.match(complaints, /selectedMessages/);
  assert.doesNotMatch(complaints, /<strong>\{lang === "ar" \? "نص الشكوى"/);
});

test("resolving a complaint preserves its support conversation link", () => {
  assert.match(actionRoute, /existingAdminAction/);
  assert.match(actionRoute, /requestedAdminAction/);
  assert.match(actionRoute, /\.\.\.existingAdminAction,[\s\S]*?\.\.\.requestedAdminAction/);
});
