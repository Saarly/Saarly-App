import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const tsconfig = JSON.parse(fs.readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const functionSource = fs.readFileSync(
  new URL('../supabase/functions/process-admin-email-events/index.ts', import.meta.url),
  'utf8',
);

test('Next.js TypeScript build excludes Supabase Deno edge functions', () => {
  assert.ok(Array.isArray(tsconfig.exclude));
  assert.ok(tsconfig.exclude.includes('supabase/functions/**/*'));
});

test('Supabase edge function remains preserved for Supabase deployment', () => {
  assert.match(functionSource, /https:\/\/esm\.sh\/@supabase\/supabase-js/);
  assert.match(functionSource, /Deno\.serve/);
});

test('V12.2 package version is recorded', () => {
  assert.equal(packageJson.version, '0.1.8');
});
