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
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(app.includes('not consensus data'));
  assert.ok(server.includes('Yerbas Core UTXO-set total amount × NestEx last price'));
  assert.ok(server.includes('Yerbas Core UTXO-set total amount × Gatevia YERB/DOGE × Gatevia DOGE/USDT'));
});


test('asset pages link and embed IPFS metadata', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(app.includes("'https://ipfs.io/ipfs/' + encodeURIComponent(ipfsHash)"));
  assert.ok(app.includes('OPEN IPFS ↗'));
  assert.ok(app.includes('class="ipfs-frame"'));
  assert.ok(server.includes("img-src 'self' data: https://ipfs.io"));
  assert.ok(server.includes('frame-src https://ipfs.io'));
});


test('Gatevia YERB DOGE uses the public API with a safe degraded mode', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const config = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');

  assert.ok(server.includes("exchange: 'gatevia'"));
  assert.ok(server.includes("pair: 'YERB/DOGE'"));
  assert.ok(server.includes("public/markets/' + tickerId + '/tickers"));
  assert.ok(server.includes("public/markets/DOGE_USDT/tickers"));
  assert.ok(server.includes("public/markets/' + tickerId + '/order-book?limit=100"));
  assert.ok(server.includes("public/markets/' + tickerId + '/trades?limit=100&order_by=desc"));
  assert.ok(server.includes("tradeUrl: 'https://gatevia.io/exchange/YERB_DOGE'"));
  assert.ok(server.includes("available ? 'live-api' : 'api-unavailable'"));
  assert.ok(server.includes("reportedSpreadPct"));
  assert.ok(server.includes("reference: marketReferenceSummary(markets)"));
  assert.ok(server.includes("'/api/market/gatevia/YERB/DOGE'"));
  assert.ok(app.includes("exchangeId === 'gatevia'"));
  assert.ok(app.includes("'API OFFLINE'"));
  assert.ok(app.includes("const internalDetail = market.exchange === 'nestex' || market.exchange === 'gatevia';"));
  assert.ok(app.includes("'/markets/' + encodeURIComponent(market.exchange) + '/YERB/' + encodeURIComponent(market.quote || 'USDT')"));
  assert.ok(app.includes("TRADE ON ' + esc(exchangeName.toUpperCase()) + ' ↗"));
  assert.ok(app.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(config.includes("GATEVIA_API_BASE"));
});


test('markets page exposes a cross-exchange reference and resilient Gatevia trade labels', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(server.includes("method: 'simple mean of live exchange prices'"));
  assert.ok(server.includes("conversion = 'YERB/DOGE × DOGE/USDT'"));
  assert.ok(app.includes("'YERB REFERENCE'"));
  assert.ok(app.includes('TIME / ID'));
  assert.ok(app.includes("'#' + trade.id"));
  assert.ok(app.includes('Gatevia public API did not return bid levels.'));
});
