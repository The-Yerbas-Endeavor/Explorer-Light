import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('NestEx market feed is server-side, cached, and normalized', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("cg/tickers/' + tickerId"));
  assert.ok(server.includes("cg/orderbook/YERB_USDT?depth=100"));
  assert.ok(server.includes("cg/tradebook/YERB_USDT?page=1"));
  assert.ok(server.includes("v1/liquidity/YERB"));
  assert.ok(server.includes("cached('market:nestex:' + cacheKey"));
  assert.ok(server.includes("marketCapUsdt"));
});

test('market browser and API routes are exposed', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.ok(server.includes("'/api/markets'"));
  assert.ok(server.includes("'/api/market/nestex/YERB/USDT'"));
  assert.ok(server.includes("url.pathname === '/markets'"));
  assert.ok(app.includes('async function renderMarkets()'));
  assert.ok(app.includes('async function renderMarketDetail'));
  assert.ok(html.includes('href="/markets"'));
});

test('market values remain explicitly external to Yerbas consensus', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('not consensus data'));
  assert.ok(app.includes('Core UTXO supply × last price'));
});
