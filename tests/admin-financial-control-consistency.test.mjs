import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20260801185000_unify_manual_payment_control.sql"),
  "utf8",
);
const route = readFileSync(join(root, "src/app/api/admin/monetization/route.ts"), "utf8");

test("زر التحويل اليدوي الحالي هو المصدر الفعلي لطلب الدفع اليدوي", () => {
  assert.match(migration, /private\.manual_payments_enabled\(\)/);
  assert.match(migration, /feature_enabled\('manual_payments_enabled'\)/);
  assert.match(migration, /if not private\.manual_payments_enabled\(\)/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.portal_create_manual_subscription_payment_request[\s\S]*?\$\$;/)?.[0] ?? "",
    /feature_enabled\('manual_payment_enabled'\)/,
  );
});

test("لوحة الأدمن تواصل حفظ زر التحويل اليدوي الحالي دون تغيير الواجهة", () => {
  assert.match(route, /setFlag\(service, actor, "manual_payments_enabled"/);
  assert.match(route, /action === "save_payment_modes"/);
});

test("القيمة القديمة تتبع زر الأدمن ولا تتحكم فيه", () => {
  assert.match(migration, /new\.key = 'manual_payments_enabled'/);
  assert.match(migration, /'manual_payment_enabled'/);
  assert.match(migration, /'controlled_by', 'manual_payments_enabled'/);
});

const electronicMigration = readFileSync(
  join(root, "supabase/migrations/20260801190000_unify_electronic_payment_control.sql"),
  "utf8",
);

test("زر الدفع الإلكتروني الحالي يمنع إنشاء معاملات المتاجر عند الإيقاف", () => {
  assert.match(electronicMigration, /private\.electronic_payments_enabled\(\)/);
  assert.match(electronicMigration, /feature_enabled\('electronic_payments_enabled'\)/);
  const occurrences = electronicMigration.match(/if not private\.electronic_payments_enabled\(\)/g) ?? [];
  assert.equal(occurrences.length, 2);
});

test("الإعداد القديم للدفع الإلكتروني يتبع زر الأدمن الحالي", () => {
  assert.match(electronicMigration, /new\.key = 'electronic_payments_enabled'/);
  assert.match(electronicMigration, /'electronic_payments'/);
  assert.match(electronicMigration, /'controlled_by', 'electronic_payments_enabled'/);
});

const commissionMigration = readFileSync(
  join(root, "supabase/migrations/20260801192000_unify_commission_control.sql"),
  "utf8",
);

test("تشغيل العمولة من الملخص يمر عبر نفس حفظ النسبة", () => {
  assert.match(route, /key === "merchant_commission_enabled"/);
  assert.match(route, /configureCommissions\(service, actor/);
  assert.match(route, /currentRate > 0 \? currentRate : 3/);
});

test("إتاحة العمولة واختيارها يعتمدان على قرار الأدمن الحالي وإعداد النسبة", () => {
  assert.match(commissionMigration, /feature_enabled\('merchant_commission_enabled'\)/);
  assert.match(commissionMigration, /from public\.commission_settings cs/);
  assert.match(commissionMigration, /not private\.commissions_are_enabled\(\)/);
  assert.doesNotMatch(
    commissionMigration.match(/create or replace function private\.commissions_are_enabled[\s\S]*?\$\$;/)?.[0] ?? "",
    /feature_enabled\('commission_mode_enabled'\)|where f\.key = 'commissions'/,
  );
});

test("الإعدادان القديمان للعمولة يتبعان الإعداد الحالي", () => {
  assert.match(commissionMigration, /'commission_mode_enabled'/);
  assert.match(commissionMigration, /'commissions'/);
  assert.match(commissionMigration, /'controlled_by', 'merchant_commission_enabled'/);
});

const flutterReadMigration = readFileSync(
  join(root, "supabase/migrations/20260801194000_fix_flutter_financial_read_model.sql"),
  "utf8",
);

test("تطبيق الموبايل يستلم حالة مالية للقراءة فقط من الإعدادات الحالية", () => {
  assert.match(flutterReadMigration, /monthly_subscription_enabled', private\.monthly_subscriptions_enabled\(\)/);
  assert.match(flutterReadMigration, /commission_enabled', private\.commissions_are_enabled\(\)/);
  assert.match(flutterReadMigration, /'payment_methods', '\[\]'::jsonb/);
  assert.match(flutterReadMigration, /'plans', '\[\]'::jsonb/);
  assert.match(flutterReadMigration, /'can_choose_billing_model', false/);
  assert.match(flutterReadMigration, /'latest_payments', latest_payments/);
});

const gatewayMigration = readFileSync(
  join(root, "supabase/migrations/20260801200000_require_verified_payment_gateway.sql"),
  "utf8",
);

test("البوابة لا تظهر جاهزة دون سر واختبار اتصال حقيقي", () => {
  assert.match(gatewayMigration, /private\.payment_provider_ready/);
  assert.match(gatewayMigration, /p\.is_connected/);
  assert.match(gatewayMigration, /p\.config_status = 'connected'/);
  assert.match(gatewayMigration, /p\.secret_reference/);
  assert.match(gatewayMigration, /connection_succeeded/);
  assert.match(gatewayMigration, /payment_provider_not_ready/);
});

test("لوحة الأدمن لا تحتفظ بحالة اتصال قديمة غير موثقة", () => {
  assert.match(route, /connectionVerified/);
  assert.match(route, /last_test_result\) === "connection_succeeded"/);
  assert.match(route, /is_connected: false/);
  assert.match(route, /payment_adapter_required_before_connection/);
});

const settingsPanel = readFileSync(join(root, "src/components/settings-panel.tsx"), "utf8");

test("الإعدادات العامة لم تعد تحتوي على صفحة مالية موازية", () => {
  assert.match(settingsPanel, /const settingsKeys = \["price_alerts", "referrals_enabled"\]/);
  assert.match(settingsPanel, /إعدادات المزايا/);
  assert.doesNotMatch(settingsPanel, /\.from\("payment_settings"\)/);
  assert.doesNotMatch(settingsPanel, /\.from\("subscription_plans"\)/);
  assert.doesNotMatch(settingsPanel, /Payment methods|طرق الدفع|Subscription plans|خطط الاشتراك/);
});
