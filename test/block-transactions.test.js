import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('block API can return decoded transactions', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("url.searchParams.get('transactions') === '1'"));
  assert.ok(server.includes("includeTransactions ? 2 : 1"));
});

test('block page renders transaction outputs inline', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("'?transactions=1'"));
  assert.ok(app.includes("Transactions + outputs"));
  assert.ok(app.includes('block-output-row'));
  assert.ok(app.includes('outputAddresses(vout)'));
  assert.ok(app.includes("isCoinbase ? 'COINBASE' : 'TRANSACTION'"));
});
