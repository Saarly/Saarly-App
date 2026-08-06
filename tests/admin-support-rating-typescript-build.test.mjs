import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/admin/action/route.ts'),
  'utf8',
);

test('support rating enrichment preserves AnyRow typing for Vercel TypeScript builds', () => {
  assert.match(
    routeSource,
    /const ratings:\s*AnyRow\[\]\s*=\s*ratingRows\.map\(\(row\):\s*AnyRow\s*=>/,
  );
  assert.match(
    routeSource,
    /String\(rating\.conversation_id\)/,
  );
});
