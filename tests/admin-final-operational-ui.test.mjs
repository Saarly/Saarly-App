import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  adminConsole,
  sections,
  orders,
  shipping,
  actionRoute,
  monetization,
  monetizationRoute,
  decisions,
  emailWorker,
  nextConfig,
  compression,
  dataSection,
  types,
] = await Promise.all([
  read("../src/components/admin-console.tsx"),
  read("../src/lib/admin/sections.ts"),
  read("../src/components/orders-console.tsx"),
  read("../src/components/shipping-companies-console.tsx"),
  read("../src/app/api/admin/action/route.ts"),
  read("../src/components/monetization-console.tsx"),
  read("../src/app/api/admin/monetization/route.ts"),
  read("../src/lib/admin/decision-events.ts"),
  read("../supabase/functions/process-admin-email-events/index.ts"),
  read("../next.config.mjs"),
  read("../src/lib/admin/image-compression.ts"),
  read("../src/components/data-section.tsx"),
  read("../src/lib/admin/types.ts"),
]);

const componentDir = new URL("../src/components/", import.meta.url);
const componentNames = (await readdir(componentDir)).filter((name) => name.endsWith(".tsx"));
const allComponents = (await Promise.all(componentNames.map((name) => read(`../src/components/${name}`)))).join("\n");

test("orders use a dedicated operational UI with real filters, sorting, details and export", () => {
  assert.match(sections, /id:\s*"orders"[\s\S]*mode:\s*"orders"/);
  assert.match(adminConsole, /<OrdersConsole lang=\{lang\}/);
  for (const marker of [
    "عرض التفاصيل",
    "حالة الطلب",
    "حالة الدفع داخل التطبيق",
    "الأحدث أولًا",
    "الأعلى قيمة",
    "قيمة المنتجات المختارة",
    "الإجمالي النهائي",
    "المنتجات المختارة",
  ]) assert.match(orders, new RegExp(marker));
  assert.match(orders, /accepted_offer_snapshot/);
  assert.match(orders, /delivery_cost/);
  assert.match(orders, /downloadExcel/);
});

test("shipping companies have a dedicated details route and visible details action", () => {
  assert.match(sections, /id:\s*"shipping-companies"[\s\S]*mode:\s*"shipping"/);
  assert.match(adminConsole, /<ShippingCompaniesConsole lang=\{lang\}/);
  assert.match(shipping, /عرض التفاصيل/);
  assert.match(shipping, /شرائح الوزن والأسعار/);
  assert.match(shipping, /shipping_company_id/);
  assert.match(actionRoute, /shipping_company_id/);
  assert.match(actionRoute, /merchant_shipping_batches/);
});

test("manual payment proof links distinguish absent and missing objects and preserve originals", () => {
  assert.match(monetizationRoute, /proof_not_uploaded/);
  assert.match(monetizationRoute, /proof_file_missing/);
  assert.match(monetizationRoute, /merchant-payment-proofs/);
  assert.match(monetizationRoute, /createSignedUrl\(path,\s*60 \* 10\)/);
  assert.match(monetization, /لم يتم رفع إثبات/);
  assert.match(monetization, /preserveOriginal/);
});

test("document review lives in approval pages while founders stays read-only", () => {
  assert.match(monetization, /setDocumentPreviewMerchantId\(asString\(row\.id\)\)/);
  assert.match(monetization, /عرض الملفات/);
  assert.match(monetization, /الملفات هنا للعرض والمتابعة فقط/);
  assert.doesNotMatch(monetization, /review_document/);
  assert.match(dataSection, /review_merchant_document/);
  assert.match(dataSection, /review_branch_document/);
  assert.match(dataSection, /قبول الملف/);
  assert.match(dataSection, /رفض الملف/);
  assert.match(actionRoute, /approval_documents/);
});

test("legacy manual proof paths keep the real payment-proof bucket", () => {
  assert.match(monetizationRoute, /knownStorageBuckets/);
  assert.match(monetizationRoute, /merchant-payment-proofs/);
  assert.match(monetizationRoute, /bucket === "legacy-url"/);
});

test("manual payment plan change is an explicit independent action", () => {
  assert.match(monetization, /ManualPlanChangeModal/);
  assert.match(monetization, /تغيير الخطة/);
  assert.match(monetization, /تأكيد تغيير الخطة/);
  assert.match(monetization, /update_manual_payment_plan/);
  assert.match(monetizationRoute, /async function updateManualPaymentPlan/);
});

test("automatic decision email uses the same SMTP dispatcher as manual retry", () => {
  assert.match(decisions, /process-admin-email-events/);
  assert.match(decisions, /event_id:\s*eventId/);
  assert.match(decisions, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(decisions, /RESEND_API_KEY|SAARLY_EMAIL_API_KEY|api\.resend\.com/);
  assert.match(emailWorker, /SMTP_HOST/);
  assert.match(emailWorker, /SMTP_PASS/);
});

test("Arabic email sender headers are sanitized and retain the exact Saarly brand", () => {
  assert.match(emailWorker, /Saarly \| سعرلي/);
  assert.match(emailWorker, /cleanHeader/);
  assert.match(emailWorker, /rawHasReplacement/);
  assert.match(emailWorker, /configured\.includes\("سعرلي"\)/);
  assert.match(emailWorker, /name:\s*senderName\(\)/);
  assert.match(emailWorker, /utf8_sender_headers/);
});

test("payment feature status shows enabled state separately from last update", () => {
  assert.match(monetization, /feature-status-row/);
  assert.match(monetization, /Boolean\(flag\.is_enabled\)/);
  assert.match(monetization, /آخر تعديل:/);
  assert.match(monetization, /gateway\.is_enabled/);
});

test("admin images are optimized without altering original proof files", () => {
  assert.doesNotMatch(allComponents, /<img\b/);
  assert.match(nextConfig, /qualities:\s*\[75,\s*82\]/);
  assert.match(nextConfig, /formats:\s*\["image\/avif",\s*"image\/webp"\]/);
  assert.match(compression, /image\/webp/);
  assert.match(compression, /0\.84/);
  assert.match(compression, /Math\.min\(1,/);
  assert.match(allComponents, /preserveOriginal/);
  assert.match(dataSection, /AdminImage[^>]+preserveOriginal/);
});

test("known lint bypasses are not used in application source", () => {
  assert.doesNotMatch(allComponents, /eslint-disable/);
});


test("every supported admin server action has a visible UI path or a documented equivalent", () => {
  const routeSource = `${actionRoute}\n${monetizationRoute}`;
  const actionNames = new Set([
    ...routeSource.matchAll(/action\s*===\s*["']([^"']+)/g),
    ...routeSource.matchAll(/case\s+["']([^"']+)["']\s*:/g),
  ].map((match) => match[1]).filter((name) => name !== "object"));
  const uiSurface = `${allComponents}\n${sections}\n${types}`;
  const legacyEquivalent = new Set(["set_badge"]);
  const missing = [...actionNames].filter((name) => !legacyEquivalent.has(name) && !new RegExp(`["']${name}["']`).test(uiSurface));
  assert.deepEqual(missing, []);
  assert.match(monetizationRoute, /const badgeTypes = new Set\(\["trusted_store", "founding_partner"\]\)/);
  assert.match(monetization, /set_merchant_badges/);
  assert.match(monetization, /founder_badge/);
  assert.match(monetization, /trusted_badge/);
});
