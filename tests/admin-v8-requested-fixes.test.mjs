import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminConsole = fs.readFileSync("src/components/admin-console.tsx", "utf8");
const sections = fs.readFileSync("src/lib/admin/sections.ts", "utf8");
const dataSection = fs.readFileSync("src/components/data-section.tsx", "utf8");
const monetization = fs.readFileSync("src/components/monetization-console.tsx", "utf8");
const monetizationRoute = fs.readFileSync("src/app/api/admin/monetization/route.ts", "utf8");
const actionRoute = fs.readFileSync("src/app/api/admin/action/route.ts", "utf8");
const serverClient = fs.readFileSync("src/lib/supabase/server.ts", "utf8");
const css = fs.readFileSync("src/app/globals.css", "utf8");

test("sidebar uses the requested grouped non-clickable headings and ordering", () => {
  const headings = [
    "الرئيسية",
    "إدارة المتاجر",
    "إدارة المستخدمين",
    "التشغيل",
    "التسويق والدعم",
    "الذكاء الاصطناعي والبيانات",
  ];
  let last = -1;
  for (const heading of headings) {
    const index = adminConsole.indexOf(heading);
    assert.ok(index > last, `${heading} must appear in the requested order`);
    last = index;
  }
  assert.match(adminConsole, /className="sidebar-nav-heading"/);
  assert.match(css, /\.sidebar-nav-heading[\s\S]*pointer-events:\s*none/);
});

test("sidebar tab identifiers follow the requested order within each group", () => {
  assert.match(adminConsole, /sectionIds:\s*\["dashboard"\]/);
  assert.match(adminConsole, /"merchant-approvals",\s*"branch-approvals",\s*"store-catalog",\s*"categories",\s*"cities"/);
  assert.match(adminConsole, /sectionIds:\s*\["users",\s*"staff"\]/);
  assert.match(adminConsole, /"orders",\s*"shipping-companies",\s*"payments",\s*"referrals",\s*"monetization"/);
  assert.match(adminConsole, /sectionIds:\s*\["ads",\s*"broadcast",\s*"complaints",\s*"support"\]/);
  assert.match(adminConsole, /sectionIds:\s*\["ai-reads",\s*"knowledge",\s*"reports",\s*"content-moderation"\]/);
  assert.match(sections, /تحليلات المساعد الذكي/);
});

test("users page supports all, stores and buyers filters", () => {
  assert.match(dataSection, /userRoleFilter/);
  assert.match(dataSection, /"all" \| "merchant" \| "buyer"/);
  assert.match(dataSection, /String\(row\.role \?\? ""\)\.toLowerCase\(\) === userRoleFilter/);
  assert.match(dataSection, /"المتاجر"/);
  assert.match(dataSection, /"العملاء"/);
});

test("emails tab loads real admin email events and retries the selected event", () => {
  assert.match(monetizationRoute, /rows\(service, "admin_email_events"/);
  assert.match(monetizationRoute, /const emailEvents = decorateMerchant/);
  assert.match(monetizationRoute, /emailEvents,/);
  assert.match(monetization, /rows=\{filtered\?\.emailEvents \?\? \[\]\}/);
  assert.match(monetization, /recipient_email/);
  assert.match(monetization, /post\("retry_email_event"/);
  assert.match(monetizationRoute, /async function retryEmailEvent/);
  assert.match(monetizationRoute, /action === "retry_email_event"/);
});

test("trial action clearly explains that it changes the free trial end date", () => {
  assert.match(monetization, /زر تغيير نهاية الفترة يحدد آخر يوم مجاني للمتجر فقط/);
  assert.match(monetization, /"تغيير نهاية الفترة"/);
  assert.match(monetization, /"منح فترة تجريبية"/);
  assert.match(monetization, /set_merchant_trial/);
});

test("reports keep authenticated RPCs and add protected readable-data fallbacks", () => {
  assert.match(actionRoute, /fallbackAdminReport/);
  assert.match(actionRoute, /admin_orders_readable/);
  assert.match(actionRoute, /admin_active_merchants_readable/);
  assert.match(actionRoute, /admin_referral_rewards_readable/);
  assert.match(actionRoute, /if \(reportRows\.length === 0\)/);
  assert.match(serverClient, /SUPABASE_SERVICE_ROLE_KEY \?\?/);
  assert.match(serverClient, /Authorization: `Bearer \$\{accessToken\}`/);
});
