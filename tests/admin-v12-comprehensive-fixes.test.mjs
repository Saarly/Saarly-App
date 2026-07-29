import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const notification = read('src/components/notification-broadcast.tsx');
const actionRoute = read('src/app/api/admin/action/route.ts');
const staff = read('src/components/staff-management.tsx');
const monetization = read('src/components/monetization-console.tsx');
const reports = read('src/components/reports-panel.tsx');
const css = read('src/app/globals.css');
const sections = read('src/lib/admin/sections.ts');
const format = read('src/lib/admin/format.ts');

const order = (source, values) => values.map((value) => source.indexOf(value));

test('custom Saarly icon replaces the hosting favicon', () => {
  for (const file of ['src/app/icon.png', 'src/app/apple-icon.png', 'src/app/favicon.ico', 'public/favicon.png']) {
    assert.ok(fs.statSync(new URL(`../${file}`, import.meta.url)).size > 100);
  }
  assert.match(read('src/app/layout.tsx'), /icons:\s*\{/);
});

test('notification templates save and restore all broadcast settings', () => {
  assert.match(notification, /قوالب الإشعارات المحفوظة/);
  assert.match(notification, /save_notification_template/);
  assert.match(notification, /applyTemplate/);
  assert.match(actionRoute, /admin_notification_templates/);
  assert.match(actionRoute, /list_notification_templates/);
  assert.match(actionRoute, /delete_notification_template/);
});

test('notification destinations put buyers first, stores second, and extras last', () => {
  const positions = order(notification, ['id: "buyer_orders"', 'id: "buyer_support"', 'id: "buyer_favorites"', 'id: "merchant_requests"', 'id: "merchant_settings"', 'id: "buyer_referrals"', 'id: "custom"']);
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('Arabic notification text is cleaned in UI, server and database migration', () => {
  assert.match(notification, /sanitizeArabicNotificationText/);
  assert.match(actionRoute, /sanitizeNotificationText/);
  assert.match(read('supabase/migrations/20260729223000_admin_v12_notification_text_sanitizer.sql'), /sanitize_admin_broadcast_text/);
});

test('team access removal preserves normal buyer or merchant accounts', () => {
  assert.match(staff, /حذف الصلاحية/);
  assert.match(actionRoute, /removeAdminStaffAccess/);
  assert.match(actionRoute, /fallbackRole = .*merchant.*buyer/s);
  assert.match(actionRoute, /normal_account_preserved: true/);
  assert.doesNotMatch(actionRoute.match(/async function removeAdminStaffAccess[\s\S]*?async function getAdminProfile/)?.[0] ?? '', /deleteUser/);
});

test('all report exports use real xlsx files instead of CSV', () => {
  assert.match(reports, /downloadExcel/);
  assert.match(monetization, /downloadExcelRows/);
  assert.doesNotMatch(`${reports}\n${monetization}`, /text\/csv|\.csv`|downloadCsv|csvEscape/);
  assert.match(read('src/lib/admin/excel.ts'), /spreadsheetml\.sheet/);
});

test('modals use a fixed top-left close icon and save-only action rows', () => {
  assert.match(css, /\.modal-close-button[\s\S]*left:\s*14px/);
  assert.match(staff, /modal-close-button/);
  assert.match(read('src/components/data-section.tsx'), /modal-close-button/);
  assert.match(read('src/components/support-console.tsx'), /modal-actions-save-only/);
});

test('light theme secondary text has stronger contrast', () => {
  assert.match(css, /:root:not\(\[data-theme="dark"\]\)[\s\S]*--muted:\s*#4f574d/);
});

test('desktop page and sidebar scrollbars are adjacent in both directions', () => {
  assert.match(css, /html\[dir="rtl"\] \.sidebar \{ direction: ltr; \}/);
  assert.match(css, /html\[dir="rtl"\] \.main-area \{ direction: ltr; \}/);
  assert.match(css, /html\[dir="ltr"\] \.sidebar \{ direction: rtl; \}/);
  assert.match(css, /html\[dir="ltr"\] \.main-area \{ direction: rtl; \}/);
});

test('founder free-trial ranges are editable and persisted', () => {
  assert.match(monetization, /founderTrialTiers/);
  assert.match(monetization, /الفترة المجانية حسب رقم المتجر/);
  assert.match(monetization, /founder_trial_tiers/);
  assert.match(monetization, /apply_existing_founder_tiers/);
  assert.match(read('src/app/api/admin/monetization/route.ts'), /admin_apply_founder_trial_tiers_as/);
  assert.match(read('supabase/migrations/20260729220000_admin_v12_notification_templates_and_founder_trial_tiers.sql'), /founder_trial_days_for_number/);
});

test('orders page uses plain-language payment and subtotal labels', () => {
  assert.match(sections, /حالة الدفع داخل التطبيق/);
  assert.match(sections, /قيمة المنتجات المختارة/);
  const dataSection = read('src/components/data-section.tsx');
  assert.match(dataSection, /payment_status: \{ ar: \"حالة الدفع داخل التطبيق\"/);
  assert.match(dataSection, /selected_subtotal_snapshot: \{ ar: \"قيمة المنتجات المختارة\"/);
  assert.match(format, /لا يحتاج دفعًا داخل التطبيق/);
});

test('operational live-data filler is not rendered by admin components', () => {
  const components = ['src/components/admin-console.tsx', 'src/components/data-section.tsx', 'src/components/dashboard-panel.tsx'].map(read).join('\n');
  assert.doesNotMatch(components, /t\("connected"|t\("readOnly"/);
});
