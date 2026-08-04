import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sections = readFileSync('src/lib/admin/sections.ts', 'utf8');
const dataSection = readFileSync('src/components/data-section.tsx', 'utf8');
const dashboard = readFileSync('src/components/dashboard-panel.tsx', 'utf8');
const route = readFileSync('src/app/api/admin/action/route.ts', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

test('referral admin hides zero referrals and exposes contact and reward-delivery fields', () => {
  assert.match(route, /confirmed_registrations[^\n]+greater than|Number\(row\.confirmed_registrations/);
  assert.match(sections, /referrer_email/);
  assert.match(sections, /referrer_mobile/);
  assert.match(sections, /حالة تسليم المكافأة/);
  assert.match(route, /reward_delivery_status_en/);
});

test('referral admin is rendered as responsive cards without a wide table', () => {
  assert.match(dataSection, /section\.id === "referrals"/);
  assert.match(dataSection, /referral-admin-grid/);
  assert.match(css, /\.referral-admin-grid/);
  assert.match(css, /@media \(max-width: 560px\)/);
});

test('dashboard includes total confirmed orders', () => {
  assert.match(dashboard, /confirmed_orders_count/);
  assert.match(route, /\.eq\("status", "confirmed"\)/);
});
