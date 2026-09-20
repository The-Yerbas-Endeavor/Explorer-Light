import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('blocks API supports offset pagination from the current tip', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("url.searchParams.get('offset')"));
  assert.ok(server.includes("recentBlocks(limit, offset)"));
  assert.ok(server.includes("'blocks:' + limit + ':' + offset"));
});

test('home chain tape exposes full-history pagination controls', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const label of ['LATEST', '← NEWER', 'OLDER →', 'GENESIS']) {
    assert.ok(app.includes(label), `missing chain pagination label: ${label}`);
  }
  assert.ok(app.includes("'/api/blocks?limit=' + pageSize + '&offset=' + offset"));
  assert.ok(app.includes("page === 1 && index === 0 ? ' is-tip' : ''"));
});


test('chain tape uses six-confirmation maturity states', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('confirmations >= 6'));
  assert.ok(app.includes("' is-confirmed'"));
  assert.ok(app.includes("' is-confirming'"));
  assert.ok(app.includes("confirmed 6+"));
  assert.ok(app.includes('block-check'));
});
