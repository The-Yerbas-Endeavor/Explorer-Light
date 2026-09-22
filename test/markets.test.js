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
  assert.ok(server.includes("url.pathname.startsWith('/markets/')"));
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


test('asset pages proxy IPFS image previews through the Explorer origin', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(app.includes("'https://ipfs.io/ipfs/' + encodeURIComponent(ipfsHash)"));
  assert.ok(app.includes("'/api/ipfs-preview/' + encodeURIComponent(ipfsHash)"));
  assert.ok(app.includes('OPEN IPFS ↗'));
  assert.ok(app.includes('OPEN IN IPFS ↗'));
  assert.ok(app.includes('class="ipfs-image"'));
  assert.ok(app.includes('SAME-ORIGIN PREVIEW · IPFS.IO SOURCE'));
  assert.ok(!app.includes('class="ipfs-frame"'));
  assert.ok(css.includes('.ipfs-image'));
  assert.ok(css.includes('object-fit: contain'));
  assert.ok(server.includes("path.startsWith('/api/ipfs-preview/')"));
  assert.ok(server.includes('sendIpfsImagePreview'));
  assert.ok(server.includes('IPFS_PREVIEW_MAX_BYTES'));
  assert.ok(server.includes("'cross-origin-resource-policy': 'same-origin'"));
  assert.ok(server.includes('safeImageContentType'));
});


test('Gatevia YERB DOGE uses the public API with a safe degraded mode', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const config = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');

  assert.ok(server.includes("exchange: 'gatevia'"));
  assert.ok(server.includes("pair: 'YERB/DOGE'"));
  assert.ok(server.includes("public/markets/' + tickerId + '/tickers"));
  assert.ok(server.includes("public/markets/DOGE_USDT/tickers"));
  assert.ok(server.includes("public/markets/' + tickerId + '/depth?limit=100"));
  assert.ok(server.includes("public/markets/' + tickerId + '/trades?limit=100&order_by=desc"));
  assert.ok(server.includes("tradeUrl: 'https://gatevia.io/exchange/YERB_DOGE'"));
  assert.ok(server.includes("available ? 'live-api' : 'api-unavailable'"));
  assert.ok(server.includes("reportedSpreadPct"));
  assert.ok(server.includes("public/markets/' + tickerId + '/depth?limit=5"));
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
  assert.ok(server.includes('marketCapUsdt'));
  assert.ok(server.includes('supplyYerb * priceUsdt'));
  assert.ok(app.includes("'YERB REFERENCE'"));
  assert.ok(app.includes("'MARKET CAP'"));
  assert.ok(app.includes("'reference price × Core supply'"));
  assert.ok(app.includes('TIME / ID'));
  assert.ok(app.includes("'#' + trade.id"));
  assert.ok(app.includes('Gatevia public API did not return bid levels.'));
});


test('market detail URLs are served through the Explorer SPA shell', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(server.includes("url.pathname.startsWith('/markets/')"));
  assert.ok(server.includes("'/api/market/gatevia/YERB/DOGE'"));
});


test('Gatevia order books use the Peatio depth endpoint', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(server.includes("public/markets/' + tickerId + '/depth?limit=5"));
  assert.ok(server.includes("public/markets/' + tickerId + '/depth?limit=100"));
  assert.ok(!server.includes("public/markets/' + tickerId + '/order-book"));
});


test('market matrix exposes cached seven-day price sparklines', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(server.includes('MARKET_HISTORY_DAYS = 7'));
  assert.ok(server.includes("'cg/tradebook/YERB_USDT?page=' + page"));
  assert.ok(server.includes("public/markets/YERB_DOGE/k-line?period=1440&time_from="));
  assert.ok(server.includes("'NestEx public tradebook'"));
  assert.ok(server.includes("'Gatevia daily k-line'"));
  assert.ok(server.includes('history7d: marketHistory7d('));
  assert.ok(server.includes('marketSparkPoints'));
  assert.ok(server.includes('sparkPoints'));
  assert.ok(server.includes('sparkObservations'));
  assert.ok(app.includes('function marketSparkline('));
  assert.ok(app.includes('marketSparkline(market.history7d, market.quote)'));
  assert.ok(app.includes('7D · '));
  assert.ok(css.includes('.market-sparkline'));
  assert.ok(css.includes('.sparkline-segment'));
});


test('seven-day market history reports coverage before showing a weekly change', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(server.includes('pricedDays'));
  assert.ok(server.includes('observedDays'));
  assert.ok(server.includes('completeWindow'));
  assert.ok(server.includes('const changePct = completeWindow'));
  assert.ok(app.includes("pricedDays + '/' + totalDays + 'D'"));
});


test('market history persists hourly snapshots in a hardened systemd state directory', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const config = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
  const installer = await readFile(new URL('../scripts/install-fresh-server.sh', import.meta.url), 'utf8');

  assert.ok(server.includes('recordMarketHistorySnapshot'));
  assert.ok(server.includes('snapshotMarketHistoryFromFeeds'));
  assert.ok(server.includes('startMarketHistorySnapshots'));
  assert.ok(server.includes('persistedMarketHistoryEntries'));
  assert.ok(server.includes('MARKET_HISTORY_STORE_VERSION'));
  assert.ok(config.includes('MARKETS_HISTORY_FILE'));
  assert.ok(config.includes('MARKETS_HISTORY_SNAPSHOT_MS'));
  assert.ok(config.includes('MARKETS_HISTORY_RETENTION_DAYS'));
  assert.ok(installer.includes('StateDirectory=yerbas-explorer-light'));
  assert.ok(installer.includes('StateDirectoryMode=0750'));
});

test('market sparklines distinguish observed prices from carried values', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(app.includes('sparkline-segment'));
  assert.ok(app.includes('sparkline-observation'));
  assert.ok(app.includes("sparkObservations + ' OBS'"));
  assert.ok(css.includes('.sparkline-segment.carried'));
  assert.ok(css.includes('stroke-dasharray'));
  assert.ok(css.includes('.sparkline-observation'));
});


test('IPFS preview proxy accepts only bounded raster image responses', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(server.includes("const IPFS_PREVIEW_MAX_BYTES = 64 * 1024 * 1024"));
  assert.ok(server.includes("return 'image/png'"));
  assert.ok(server.includes("return 'image/jpeg'"));
  assert.ok(server.includes("return 'image/gif'"));
  assert.ok(server.includes("return 'image/webp'"));
  assert.ok(server.includes("return 'image/avif'"));
  assert.ok(server.includes("error: 'IPFS content does not contain a supported image preview.'"));
  assert.ok(server.includes('fetchIpfsPreviewResponse'));
  assert.ok(server.includes('config.ipfs.previewGateways'));
});


test('IPFS image preview resolves image files inside UnixFS directory listings', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(server.includes('IPFS_DIRECTORY_MAX_BYTES'));
  assert.ok(server.includes('IPFS_IMAGE_EXTENSIONS'));
  assert.ok(server.includes('ipfsDirectoryImagePath'));
  assert.ok(server.includes('fetchIpfsPreviewResponse'));
  assert.ok(server.includes("upstreamType.includes('text/html')"));
  assert.ok(server.includes("error: 'IPFS content does not contain a supported image preview.'"));
  assert.ok(server.includes("error: 'IPFS content does not contain a supported image preview.'"));
});


test('IPFS directory preview falls back to the gateway TAR representation', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(server.includes('IPFS_DIRECTORY_TAR_MAX_BYTES'));
  assert.ok(server.includes('ipfsTarFirstImage'));
  assert.ok(server.includes('fetchIpfsDirectoryTarImage'));
  assert.ok(server.includes("searchParams.set('format', format)"));
  assert.ok(server.includes("accept: 'application/x-tar,application/octet-stream"));
  assert.ok(server.includes("error: 'IPFS content does not contain a supported image preview.'"));
});


test('IPFS preview retries independent public gateways after rate limits or gateway errors', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const config = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

  assert.ok(config.includes('IPFS_PREVIEW_GATEWAYS'));
  assert.ok(config.includes('https://ipfs.io,https://ipfs.filebase.io,https://gateway.pinata.cloud'));
  assert.ok(server.includes('for (const gateway of config.ipfs.previewGateways)'));
  assert.ok(server.includes('All IPFS gateways failed; last HTTP'));
  assert.ok(server.includes("'x-ipfs-gateway': new URL(gatewayUsed).host"));
  assert.ok(env.includes('IPFS_PREVIEW_GATEWAYS=https://ipfs.io,https://ipfs.filebase.io,https://gateway.pinata.cloud'));
});


test('market sparklines use real intraday observations while seven-day coverage builds', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(server.includes('function marketSparkPoints('));
  assert.ok(server.includes('maxPoints = 72'));
  assert.ok(server.includes('windowStart: window.start'));
  assert.ok(server.includes('windowEnd: window.now'));
  assert.ok(app.includes('sparkPoints.length >= 2 ? sparkPoints : dailyPoints'));
  assert.ok(app.includes('(point.timestamp - windowStart) / (windowEnd - windowStart)'));
  assert.ok(app.includes('BUILDING HISTORY'));
});

test('market overview uses larger readable typography without returning to oversized rows', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(app.includes('<div class="market-page">'));
  assert.ok(css.includes('.market-page .telemetry-cell > span'));
  assert.ok(css.includes('font-size: 9px'));
  assert.ok(css.includes('.market-page .market-matrix-row'));
  assert.ok(css.includes('min-height: 56px'));
  assert.ok(css.includes('.market-matrix-row > strong'));
  assert.ok(css.includes('font-size: 16px'));
});


test('mast section labels are real navigation links', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(html.includes('<a href="/blocks">BLOCKS</a>'));
  assert.ok(html.includes('<a href="/transactions">TRANSACTIONS</a>'));
  assert.ok(html.includes('<a href="/addresses">ADDRESSES</a>'));
  assert.ok(html.includes('<a href="/assets">ASSETS</a>'));
  assert.ok(html.includes('<a href="/smartnodes">SMARTNODES</a>'));
  assert.ok(html.includes('<a href="/markets">MARKETS</a>'));
  assert.ok(css.includes('.mast-nav a:hover'));
});

test('recent transaction index is decoded directly from recent blocks', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(server.includes('async function recentTransactions('));
  assert.ok(server.includes("method: 'getblock', params: [hash, 2]"));
  assert.ok(server.includes("url.pathname === '/api/transactions'"));
  assert.ok(server.includes("url.pathname === '/transactions'"));
  assert.ok(app.includes('async function renderTransactions()'));
  assert.ok(app.includes("api('/api/transactions?limit=60&blocks=10')"));
  assert.ok(app.includes("parts[0] === 'transactions'"));
});

test('blocks and address index routes are served through the Explorer shell', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(server.includes("url.pathname === '/blocks'"));
  assert.ok(server.includes("url.pathname === '/addresses'"));
  assert.ok(app.includes("parts[0] === 'blocks'"));
  assert.ok(app.includes("parts[0] === 'addresses'"));
  assert.ok(app.includes('async function renderAddresses()'));
  assert.ok(app.includes("result.type !== 'address'"));
});
