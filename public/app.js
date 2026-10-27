const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const rpcState = document.querySelector('#rpc-state');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');

function layoutTheme() {
  return document.documentElement.dataset.layoutTheme === 'original'
    ? 'original'
    : 'new';
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed with HTTP ' + response.status + '.');
  }
  return data;
}

function setRpcState(state, label) {
  rpcState.className = 'rpc-state ' + state;
  rpcState.innerHTML =
    '<span class="rpc-dot" aria-hidden="true"></span>' +
    '<span>' + esc(label) + '</span>';
}

function showNotice(message, kind = 'info') {
  notice.className = 'notice ' + kind;
  notice.textContent = message;
}

function clearNotice() {
  notice.className = 'notice hidden';
  notice.textContent = '';
}

function compactHash(value) {
  if (!value) return '—';
  return value.slice(0, 12) + '…' + value.slice(-10);
}

function number(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function marketPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  if (numeric === 0) return '0';
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric < 0.01 ? 8 : 2,
    maximumFractionDigits: numeric < 0.0001 ? 12 : (numeric < 1 ? 8 : 4)
  });
}

function marketMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric < 1 ? 4 : 2,
    maximumFractionDigits: numeric < 1 ? 8 : 2
  });
}

function marketPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  return (numeric > 0 ? '+' : '') + numeric.toFixed(2) + '%';
}

function marketTime(value) {
  if (!value || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  const epochMs = numeric > 100000000000 ? numeric : numeric * 1000;
  return new Date(epochMs).toLocaleString();
}

function marketSparkline(history, fallbackQuote = '') {
  const sparkPoints = Array.isArray(history?.sparkPoints) ? history.sparkPoints : [];
  const dailyPoints = Array.isArray(history?.points) ? history.points : [];
  const rawPoints = sparkPoints.length >= 2 ? sparkPoints : dailyPoints;
  const windowStart = Number(history?.windowStart);
  const windowEnd = Number(history?.windowEnd);
  const useTimeScale = Number.isFinite(windowStart)
    && Number.isFinite(windowEnd)
    && windowEnd > windowStart;

  const plotted = rawPoints
    .map((point, index) => ({
      index,
      timestamp: Number(point?.timestamp),
      price: Number(point?.price),
      observed: point?.observed === true
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0);

  const quote = history?.quote || fallbackQuote || '';
  const change = Number(history?.changePct);
  const hasChange = history?.changePct !== null
    && history?.changePct !== undefined
    && Number.isFinite(change);
  const pricedDays = Number(history?.pricedDays || 0);
  const observedDays = Number(history?.observedDays || 0);
  const sparkObservations = Number(history?.sparkObservations || plotted.length || 0);
  const totalDays = Number(history?.days || 7);
  const completeWindow = history?.completeWindow === true;
  const changeClass = hasChange
    ? (change > 0 ? 'market-up' : (change < 0 ? 'market-down' : ''))
    : '';

  if (plotted.length < 2) {
    return '<span class="market-sparkline market-sparkline-empty">' +
      '<small>7D · ' + esc(quote) + '</small>' +
      '<span class="sparkline-placeholder">BUILDING HISTORY</span>' +
      '<em>' + esc(pricedDays + '/' + totalDays + 'D · ' + sparkObservations + ' OBS') + '</em>' +
    '</span>';
  }

  const width = 180;
  const height = 32;
  const pad = 2;
  const prices = plotted.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;
  const denominator = Math.max(1, rawPoints.length - 1);
  const coords = plotted.map((point) => {
    const timeRatio = useTimeScale && Number.isFinite(point.timestamp)
      ? Math.max(0, Math.min(1, (point.timestamp - windowStart) / (windowEnd - windowStart)))
      : (point.index / denominator);
    const x = pad + (timeRatio * (width - (pad * 2)));
    const y = span === 0
      ? height / 2
      : pad + (((max - point.price) / span) * (height - (pad * 2)));
    return {
      ...point,
      x: x.toFixed(2),
      y: y.toFixed(2)
    };
  });

  const segments = coords.slice(1).map((point, index) => {
    const previous = coords[index];
    const segmentClass = point.observed ? 'observed' : 'carried';
    return '<line class="sparkline-segment ' + segmentClass + '" '
      + 'x1="' + previous.x + '" y1="' + previous.y + '" '
      + 'x2="' + point.x + '" y2="' + point.y + '"></line>';
  }).join('');

  const observations = coords
    .filter((point) => point.observed)
    .map((point) =>
      '<circle class="sparkline-observation" cx="' + point.x + '" cy="' + point.y + '" r="1.7"></circle>'
    )
    .join('');

  const rangeTitle = '7-day ' + quote + ' range: '
    + marketPrice(min) + ' to ' + marketPrice(max);
  const coverageLabel = (
    hasChange
      ? marketPercent(change)
      : (completeWindow ? '—' : pricedDays + '/' + totalDays + 'D')
  ) + ' · ' + sparkObservations + ' OBS';

  return '<span class="market-sparkline ' + changeClass + '">' +
    '<small>7D · ' + esc(quote) + '</small>' +
    '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="' + esc(rangeTitle) + '">' +
      '<title>' + esc(rangeTitle) + '</title>' +
      '<line class="sparkline-guide" x1="0" y1="' + (height / 2) + '" x2="' + width + '" y2="' + (height / 2) + '"></line>' +
      segments +
      observations +
    '</svg>' +
    '<em>' + esc(coverageLabel) + '</em>' +
  '</span>';
}

function hashRate(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  let numeric = Number(value);
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let unit = 0;
  while (Math.abs(numeric) >= 1000 && unit < units.length - 1) {
    numeric /= 1000;
    unit += 1;
  }
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric < 100 ? 2 : 0,
    maximumFractionDigits: numeric < 10 ? 3 : 2
  }) + ' ' + units[unit];
}

function bytes(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
  return (n / 1024 / 1024).toFixed(1) + ' MiB';
}

function timeAgo(epoch) {
  if (!epoch) return '—';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(epoch)));
  if (seconds < 60) return seconds + 's ago';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

function isoTime(epoch) {
  if (!epoch) return '—';
  return new Date(Number(epoch) * 1000).toLocaleString();
}

function hashLink(type, value, label = null) {
  if (!value) return '—';
  return '<a class="mono" href="/' + type + '/' + encodeURIComponent(value) + '">' +
    esc(label || compactHash(value)) +
    '</a>';
}

function metricCard(index, label, value, foot = '') {
  return '<article class="metric-card" data-index="' + esc(index) + '">' +
    '<span>' + esc(label) + '</span>' +
    '<strong>' + esc(value) + '</strong>' +
    '<small>' + esc(foot) + '</small>' +
    '</article>';
}

function scaleLevel(value, max) {
  const numeric = Number(value || 0);
  const ceiling = Math.max(0, Number(max || 0));
  if (!ceiling || numeric <= 0) return 1;
  return Math.max(1, Math.min(10, Math.ceil((numeric / ceiling) * 10)));
}

function visualFact(label, value, note = '') {
  return '<article class="visual-fact">' +
    '<span>' + esc(label) + '</span>' +
    '<strong>' + esc(value) + '</strong>' +
    (note ? '<small>' + esc(note) + '</small>' : '') +
    '</article>';
}

function recordHero(kicker, title, value, kind, actions = '') {
  return '<section class="detail-hero record-hero">' +
    '<div class="record-hero-copy">' +
      '<div class="detail-kicker">' + esc(kicker) + '</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<div class="detail-hash">' + esc(value) + '</div>' +
      (actions ? '<div class="detail-actions">' + actions + '</div>' : '') +
    '</div>' +
    '<div class="record-symbol" aria-hidden="true"><span>' + esc(kind) + '</span></div>' +
  '</section>';
}

function addressIdentity(address, label = 'YERBAS ADDRESS') {
  return '<section class="address-identity">' +
    '<span>' + esc(label) + '</span>' +
    '<code>' + esc(address) + '</code>' +
    '<a href="/address/' + encodeURIComponent(address) + '">OPEN ADDRESS ↗</a>' +
  '</section>';
}

function telemetryRail(items) {
  return '<section class="telemetry-rail">' + items.map((item) =>
    '<div class="telemetry-cell">' +
      '<span>' + esc(item.label) + '</span>' +
      '<strong>' + esc(item.value) + '</strong>' +
      (item.note ? '<small>' + esc(item.note) + '</small>' : '') +
    '</div>'
  ).join('') + '</section>';
}

function ledgerHeader(kind, title, identity, actions = '', note = '') {
  return '<section class="ledger-header">' +
    '<div class="ledger-kind"><span class="ledger-dot"></span>' + esc(kind) + '</div>' +
    '<div class="ledger-title-row">' +
      '<h2>' + esc(title) + '</h2>' +
      (actions ? '<div class="ledger-actions">' + actions + '</div>' : '') +
    '</div>' +
    '<code class="ledger-identity">' + esc(identity) + '</code>' +
    (note ? '<p class="ledger-note">' + esc(note) + '</p>' : '') +
  '</section>';
}

function railHeading(eyebrow, title, meta = '') {
  return '<div class="rail-heading">' +
    '<div><span>' + esc(eyebrow) + '</span><h3>' + esc(title) + '</h3></div>' +
    (meta ? '<small>' + esc(meta) + '</small>' : '') +
  '</div>';
}

function panelHeading(index, eyebrow, title, meta = '') {
  return '<div class="panel-head">' +
    '<div class="panel-title">' +
      '<span class="panel-index">' + esc(index) + '</span>' +
      '<div><p class="eyebrow">' + esc(eyebrow) + '</p><h2>' + esc(title) + '</h2></div>' +
    '</div>' +
    (meta ? '<span class="panel-meta">' + esc(meta) + '</span>' : '') +
    '</div>';
}

function renderLoading(label) {
  app.innerHTML =
    '<section class="loading-card">' +
      '<span class="loading-scan" aria-hidden="true"></span>' +
      '<span>' + esc(label) + '</span>' +
    '</section>';
}

async function renderMarkets() {
  document.title = 'Markets · Yerbas Explorer';
  renderLoading('Reading live market feeds');

  const data = await api('/api/markets');
  setRpcState('online', 'Core online');

  const reference = data.reference || {};
  const referenceRail = reference.sourceCount
    ? telemetryRail([
        { label: 'YERB REFERENCE', value: marketPrice(reference.priceUsdt) + ' USDT', note: reference.method || 'live mean' },
        { label: 'MARKET CAP', value: marketMoney(reference.marketCapUsdt) + ' USDT', note: 'reference price × Core supply' },
        { label: 'SOURCES', value: number(reference.sourceCount), note: 'live exchanges' },
        { label: 'LOW', value: marketPrice(reference.lowUsdt) + ' USDT', note: 'cross-exchange' },
        { label: 'HIGH', value: marketPrice(reference.highUsdt) + ' USDT', note: 'cross-exchange' },
        { label: 'RANGE', value: marketPercent(reference.rangePct), note: 'high vs low around mean' }
      ])
    : '';

  const rows = (data.markets || []).map((market) => {
    const ticker = market.ticker || {};
    const hasLiveData = market.available !== false;
    const changeClass = ticker.change24hPct === null || ticker.change24hPct === undefined
      ? ''
      : (Number(ticker.change24hPct) >= 0 ? 'market-up' : 'market-down');
    const internalDetail = market.exchange === 'nestex';
    const detailHref = internalDetail
      ? '/markets/' + encodeURIComponent(market.exchange) + '/YERB/' + encodeURIComponent(market.quote || 'USDT')
      : market.tradeUrl;
    const detailExternal = internalDetail
      ? ''
      : ' target="_blank" rel="noopener noreferrer"';
    const quoteLabel = 'VOL ' + esc(market.quote || 'QUOTE');
    const valuation = market.valuation?.marketCapUsdt === null || market.valuation?.marketCapUsdt === undefined
      ? (hasLiveData ? '—' : 'EXTERNAL')
      : marketMoney(market.valuation.marketCapUsdt);

    const sourceLabel = hasLiveData
      ? 'LIVE API'
      : (market.status === 'external-live-market' ? 'TRADE LINK' : 'API OFFLINE');

    return '<div class="market-matrix-row' + (hasLiveData ? '' : ' external-market') + '">' +
      '<a class="market-exchange market-detail-link" href="' + esc(detailHref) + '"' + detailExternal + '><b>' + esc(market.exchangeName) + '</b><small>' + sourceLabel + '</small></a>' +
      '<a class="market-pair-link" href="' + esc(detailHref) + '"' + detailExternal + '>' + esc(market.pair) + '</a>' +
      '<span><small>LAST ' + esc(market.quote || '') + '</small>' + marketPrice(ticker.last) + '</span>' +
      '<span class="' + changeClass + '"><small>24H</small>' + marketPercent(ticker.change24hPct) + '</span>' +
      '<span><small>VOL YERB</small>' + number(ticker.baseVolume, 2) + '</span>' +
      '<span><small>' + quoteLabel + '</small>' + marketMoney(ticker.quoteVolume) + '</span>' +
      '<span><small>VALUATION</small>' + valuation + '</span>' +
      marketSparkline(market.history7d, market.quote) +
      '<a class="market-trade-link" href="' + esc(market.tradeUrl) + '" target="_blank" rel="noopener noreferrer">TRADE ↗</a>' +
    '</div>';
  }).join('');

  app.innerHTML =
    '<div class="market-page">' +
      ledgerHeader('MARKET OBSERVATORY', 'Yerbas markets', number((data.markets || []).length) + ' listed market' + ((data.markets || []).length === 1 ? '' : 's'), '<a href="/">LIVE CHAIN</a>') +
      referenceRail +
      '<section class="ledger-section">' +
        railHeading('MARKET MATRIX', 'Live exchange values', 'exchange data · not consensus data') +
        '<div class="market-matrix">' + (rows || '<div class="ledger-empty">No market feeds are currently available.</div>') + '</div>' +
      '</section>' +
      '<div class="market-disclaimer">Market data is informational and sourced from external exchanges. Blockchain state continues to come directly from Yerbas Core.</div>' +
    '</div>';
}

async function renderMarketDetail(exchange = 'nestex') {
  const exchangeId = String(exchange || '').toLowerCase();
  const isNestex = exchangeId === 'nestex';
  const isGatevia = exchangeId === 'gatevia';

  if (!isNestex && !isGatevia) {
    throw new Error('Unknown market exchange.');
  }

  const exchangeName = isGatevia ? 'Gatevia' : 'NestEx';
  const quote = isGatevia ? 'DOGE' : 'USDT';
  const pair = 'YERB/' + quote;
  document.title = exchangeName + ' ' + pair + ' · Yerbas Explorer';
  renderLoading('Reading ' + exchangeName + ' ' + pair + ' market');

  const market = await api('/api/market/' + exchangeId + '/YERB/' + quote);
  setRpcState('online', 'Core online');

  const ticker = market.ticker || {};
  const bids = market.orderbook?.bids || [];
  const asks = market.orderbook?.asks || [];
  const trades = market.trades?.items || [];
  const maxBidTotal = Math.max(0.00000001, ...bids.map((order) => Number(order.total || 0)));
  const maxAskTotal = Math.max(0.00000001, ...asks.map((order) => Number(order.total || 0)));
  const changeClass = ticker.change24hPct === null || ticker.change24hPct === undefined
    ? ''
    : (Number(ticker.change24hPct) >= 0 ? 'market-up' : 'market-down');

  const bidRows = bids.slice(0, 24).map((order) =>
    '<div class="orderbook-row bid">' +
      '<span>' + marketPrice(order.price) + '</span>' +
      '<span>' + number(order.amount, 8) + '</span>' +
      '<span>' + marketMoney(order.total) + '</span>' +
      '<i class="order-depth level-' + scaleLevel(order.total, maxBidTotal) + '"></i>' +
    '</div>'
  ).join('');

  const askRows = asks.slice(0, 24).map((order) =>
    '<div class="orderbook-row ask">' +
      '<span>' + marketPrice(order.price) + '</span>' +
      '<span>' + number(order.amount, 8) + '</span>' +
      '<span>' + marketMoney(order.total) + '</span>' +
      '<i class="order-depth level-' + scaleLevel(order.total, maxAskTotal) + '"></i>' +
    '</div>'
  ).join('');

  const tradeRows = trades.slice(0, 40).map((trade) => {
    const side = String(trade.side || '').toLowerCase();
    const timeOrId = trade.timestamp
      ? marketTime(trade.timestamp)
      : (trade.id === null || trade.id === undefined ? '—' : '#' + trade.id);
    return '<div class="market-trade-row ' + esc(side) + '">' +
      '<span class="trade-side">' + esc(trade.side || '—') + '</span>' +
      '<span>' + marketPrice(trade.price) + '</span>' +
      '<span>' + number(trade.amount, 8) + '</span>' +
      '<span>' + marketMoney(trade.total) + '</span>' +
      '<span>' + esc(timeOrId) + '</span>' +
    '</div>';
  }).join('');

  const liquidity = market.liquidity;
  const liquidityRail = liquidity
    ? '<section class="market-liquidity-rail">' +
        '<span><small>LIQUIDITY</small><b>' + marketMoney(liquidity.totalUsdt) + ' USDT</b></span>' +
        '<span><small>SCORE</small><b>' + number(liquidity.score) + '</b></span>' +
        '<span><small>POOLED YERB</small><b>' + number(liquidity.pooledYerb, 8) + '</b></span>' +
        '<span><small>POOLED USDT</small><b>' + marketMoney(liquidity.pooledUsdt) + '</b></span>' +
        '<span><small>POOL GROWTH</small><b>' + marketPercent(liquidity.growthPct) + '</b></span>' +
      '</section>'
    : '';

  const usdtMirror = ticker.lastUsdt === null || ticker.lastUsdt === undefined
    ? ''
    : ' · ≈ ' + marketPrice(ticker.lastUsdt) + ' USDT';
  const valuationNote = market.valuation?.basis || 'USDT conversion unavailable';

  app.innerHTML =
    ledgerHeader(
      'MARKET · ' + exchangeName.toUpperCase(),
      'YERB / ' + quote,
      market.available === false ? 'Public exchange API currently unavailable' : 'Live public exchange feed',
      '<a href="/markets">ALL MARKETS</a><a href="' + esc(market.tradeUrl) + '" target="_blank" rel="noopener noreferrer">TRADE ON ' + esc(exchangeName.toUpperCase()) + ' ↗</a>'
    ) +
    telemetryRail([
      { label: 'LAST', value: marketPrice(ticker.last) + ' ' + quote, note: 'last trade' + usdtMirror },
      { label: '24H CHANGE', value: marketPercent(ticker.change24hPct), note: 'rolling 24h' },
      { label: 'BID', value: marketPrice(ticker.bid), note: 'highest bid · ' + quote },
      { label: 'ASK', value: marketPrice(ticker.ask), note: 'lowest ask · ' + quote },
      { label: '24H HIGH', value: marketPrice(ticker.high), note: quote },
      { label: '24H LOW', value: marketPrice(ticker.low), note: quote }
    ]) +
    '<section class="market-value-rail">' +
      '<span><small>24H VOLUME</small><b>' + number(ticker.baseVolume, 8) + ' YERB</b><em>' + marketMoney(ticker.quoteVolume) + ' ' + quote + '</em></span>' +
      '<span><small>MARKET CAP EST.</small><b>' + marketMoney(market.valuation?.marketCapUsdt) + ' USDT</b><em>' + esc(valuationNote) + '</em></span>' +
      '<span class="' + changeClass + '"><small>SPREAD</small><b>' + marketPrice(ticker.spread) + ' ' + quote + '</b><em>' + marketPercent(ticker.spreadPct) + '</em></span>' +
      '<span><small>UPDATED</small><b>' + esc(marketTime(market.asOf)) + '</b><em>' + esc(exchangeName) + ' public API</em></span>' +
    '</section>' +
    liquidityRail +
    '<section class="market-split">' +
      '<div class="market-pane">' +
        railHeading('ORDER BOOK', 'Buy orders', number(bids.length) + ' levels loaded') +
        '<div class="orderbook-head"><span>PRICE</span><span>YERB</span><span>' + quote + '</span><span>DEPTH</span></div>' +
        '<div class="orderbook-list">' + (bidRows || '<div class="ledger-empty">' + (isGatevia ? 'Gatevia public API did not return bid levels.' : 'Order book unavailable.') + '</div>') + '</div>' +
      '</div>' +
      '<div class="market-pane">' +
        railHeading('ORDER BOOK', 'Sell orders', number(asks.length) + ' levels loaded') +
        '<div class="orderbook-head"><span>PRICE</span><span>YERB</span><span>' + quote + '</span><span>DEPTH</span></div>' +
        '<div class="orderbook-list">' + (askRows || '<div class="ledger-empty">' + (isGatevia ? 'Gatevia public API did not return ask levels.' : 'Order book unavailable.') + '</div>') + '</div>' +
      '</div>' +
    '</section>' +
    '<section class="ledger-section">' +
      railHeading('TRADE STREAM', 'Recent ' + exchangeName + ' trades', number(trades.length) + ' loaded') +
      '<div class="market-trade-head"><span>SIDE</span><span>PRICE</span><span>YERB</span><span>' + quote + '</span><span>TIME / ID</span></div>' +
      '<div class="market-trade-list">' + (tradeRows || '<div class="ledger-empty">Trade history unavailable.</div>') + '</div>' +
    '</section>' +
    '<div class="market-disclaimer">Exchange prices are external market data, not Yerbas consensus data. ' +
      (market.valuation?.basis ? 'Market-cap estimate: ' + esc(market.valuation.basis) + '.' : 'USDT market-cap conversion is unavailable when the quote conversion feed is unavailable.') +
    '</div>';
}

async function renderOriginalHome() {
  document.title = 'Yerbas Block Explorer';
  renderLoading('Reading live blockchain state');

  const pageSize = 10;
  const requestedPage = Math.max(
    1,
    Number.parseInt(new URLSearchParams(location.search).get('page') || '1', 10) || 1
  );
  const blockOffset = (requestedPage - 1) * pageSize;

  const [summary, transactions, markets] = await Promise.all([
    api('/ext/getsummary'),
    api('/api/transactions?limit=500&blocks=' + pageSize + '&offsetBlocks=' + blockOffset),
    api('/api/markets').catch(() => null)
  ]);

  setRpcState('online', 'Core online');

  const reference = markets?.reference || {};
  const totalBlocks = Math.max(1, Number(transactions?.tip ?? summary.blockcount ?? 0) + 1);
  const totalPages = Math.max(1, Math.ceil(totalBlocks / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const positiveItems = (Array.isArray(transactions?.items) ? transactions.items : [])
    .filter((tx) => Number(tx?.totalOutput || 0) > 0);
  const seenBlocks = new Set();
  const items = positiveItems.filter((tx) => {
    const height = Number(tx?.blockHeight);
    if (!Number.isFinite(height) || seenBlocks.has(height)) return false;
    seenBlocks.add(height);
    return true;
  }).slice(0, pageSize);

  const originalPageHref = (target) => target <= 1 ? '/' : '/?page=' + target;
  const pagination =
    '<nav class="original-pagination" aria-label="Latest transaction block pages">' +
      (page > 1
        ? '<a href="/">Latest</a><a href="' + originalPageHref(page - 1) + '">Newer</a>'
        : '<span class="disabled">Latest</span><span class="disabled">Newer</span>') +
      '<span class="original-page-status">Page ' + number(page) + ' of ' + number(totalPages) + '</span>' +
      (page < totalPages
        ? '<a href="' + originalPageHref(page + 1) + '">Older</a>'
        : '<span class="disabled">Older</span>') +
    '</nav>';

  const lastTimestamp = items[0]?.blockTime || null;
  const lastUpdated = lastTimestamp
    ? new Date(Number(lastTimestamp) * 1000).toLocaleString()
    : new Date().toLocaleString();

  const rows = items.length
    ? items.map((tx) =>
        '<tr>' +
          '<td><a href="/block/' + encodeURIComponent(tx.blockHeight) + '">' + number(tx.blockHeight) + '</a></td>' +
          '<td class="original-tx-hash"><a href="/tx/' + encodeURIComponent(tx.txid) + '?block=' + encodeURIComponent(tx.blockHash) + '">' + esc(tx.txid) + '</a></td>' +
          '<td>' + number(tx.outputs) + '</td>' +
          '<td>' + number(tx.totalOutput, 8) + '</td>' +
          '<td>' + esc(marketTime(tx.blockTime)) + '</td>' +
        '</tr>'
      ).join('')
    : '<tr><td colspan="5">No recent confirmed transactions returned.</td></tr>';

  app.innerHTML =
    '<div class="original-home">' +
      '<section class="original-header-panels" aria-label="Network summary">' +
        '<article class="original-panel-card">' +
          '<small>Network Hashrate</small>' +
          '<strong>' + esc(hashRate(summary.hashrate)) + '</strong>' +
        '</article>' +
        '<article class="original-panel-card">' +
          '<small>Network Difficulty</small>' +
          '<strong>' + number(summary.difficulty, 8) + '</strong>' +
        '</article>' +
        '<article class="original-panel-card original-panel-logo" aria-label="Yerbas">' +
          '<img src="/yerbas-logo.png?v=8f08d21881e8eed66110444013d129441e9d799c" alt="Yerbas">' +
        '</article>' +
      '</section>' +
      '<section class="original-page-heading">' +
        '<h3>Yerbas Block Explorer</h3>' +
        '<div><strong>Last Updated:</strong> <span>' + esc(lastUpdated) + '</span></div>' +
        '<p>A listing of all verified Yerbas transactions</p>' +
      '</section>' +
      '<section class="original-market-strip">' +
        '<span><small>YERB/USDT</small><strong>' + marketPrice(reference.priceUsdt) + '</strong></span>' +
        '<span><small>Market Cap</small><strong>' + marketMoney(reference.marketCapUsdt) + ' USDT</strong></span>' +
        '<span><small>Connections</small><strong>' + number(summary.connections) + '</strong></span>' +
        '<span><small>Block Height</small><strong>' + number(summary.blockcount) + '</strong></span>' +
      '</section>' +
      '<section class="original-card">' +
        '<header><strong>Latest Transactions</strong><a href="/transactions">View all</a></header>' +
        '<div class="original-table-wrap">' +
          '<table class="original-latest-table">' +
            '<thead><tr><th>Block</th><th>Transaction</th><th>Recipients</th><th>Amount (YERB)</th><th>Timestamp</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        pagination +
      '</section>' +
    '</div>';
}


async function renderHome() {
  if (layoutTheme() === 'original' && location.pathname === '/') {
    return renderOriginalHome();
  }

  document.title = 'Yerbas Explorer';
  renderLoading('Reading live blockchain state');

  const pageSize = 12;
  const requestedPage = Math.max(1, Number.parseInt(new URLSearchParams(location.search).get('page') || '1', 10) || 1);
  const marketPromise = api('/api/v1/market-price').catch(() => null);
  const status = await api('/api/status');
  const totalBlocks = Math.max(1, Number(status.blocks || 0) + 1);
  const totalPages = Math.max(1, Math.ceil(totalBlocks / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const blocks = await api('/api/blocks?limit=' + pageSize + '&offset=' + offset);
  const market = await marketPromise;

  setRpcState('online', 'Core online');

  const maxTx = Math.max(1, ...blocks.map((block) => Number(block.transactions || 0)));

  const telemetry = telemetryRail([
    { label: 'CHAIN TIP', value: number(status.blocks), note: status.chain || 'mainnet' },
    { label: 'DIFFICULTY', value: number(status.difficulty, 6), note: 'network target' },
    { label: 'PEERS', value: number(status.network?.connections), note: 'connected' },
    { label: 'MEMPOOL', value: number(status.mempool?.transactions), note: bytes(status.mempool?.bytes) },
    { label: 'YERB/USDT', value: market ? marketPrice(market.priceUsdt) : '—', note: market ? 'NestEx · ' + marketPercent(market.change24hPct) : 'market unavailable' },
    { label: 'MARKET CAP', value: market ? marketMoney(market.marketCapUsdt) : '—', note: 'USDT estimate' },
    { label: 'SOURCE', value: 'RPC', note: 'Yerbas Core' }
  ]);

  const tape = blocks.map((block, index) => {
    const confirmations = Math.max(0, Number(status.blocks || 0) - Number(block.height || 0) + 1);
    const confirmed = confirmations >= 6;
    const tipClass = page === 1 && index === 0 ? ' is-tip' : '';
    const maturityClass = confirmed ? ' is-confirmed' : ' is-confirming';
    const maturityLabel = confirmed ? 'CONFIRMED' : confirmations + '/6';
    const maturityTitle = confirmed
      ? number(confirmations) + ' confirmations · confirmed'
      : number(confirmations) + ' of 6 confirmations';

    return '<a class="chain-tape-row' + tipClass + maturityClass + '" href="/block/' + block.height + '" title="' + esc(maturityTitle) + '">' +
      '<span class="tape-node" aria-hidden="true">' +
        '<svg class="tape-block-icon" viewBox="0 0 32 32" focusable="false">' +
          '<path class="chain-weave weave-back" d="M16 0C7 4 7 10 12 13"></path>' +
          '<path class="chain-weave weave-back weave-back-bottom" d="M20 19C25 22 25 28 16 32"></path>' +
          '<path class="block-face block-top" d="M16 6 25 11 16 16 7 11Z"></path>' +
          '<path class="block-face block-left" d="M7 11 16 16V26L7 21Z"></path>' +
          '<path class="block-face block-right" d="M25 11 16 16V26l9-5Z"></path>' +
          '<path class="chain-weave weave-front" d="M12 13C15 15 17 17 20 19"></path>' +
          '<path class="chain-core-line" d="M16 0V5.3M16 26.7V32"></path>' +
          '<path class="block-check" d="m11.5 16.5 3 3 6-7"></path>' +
        '</svg>' +
      '</span>' +
      '<span class="tape-height">#' + number(block.height) + '</span>' +
      '<span class="tape-age">' + esc(timeAgo(block.time)) + '<small class="tape-confirmation">' + esc(maturityLabel) + '</small></span>' +
      '<span class="tape-stat"><small>TX</small><b>' + number(block.transactions) + '</b></span>' +
      '<span class="tape-stat"><small>SIZE</small><b>' + bytes(block.size) + '</b></span>' +
      '<code class="tape-hash">' + esc(block.hash) + '</code>' +
      '<span class="tape-open">↗</span>' +
    '</a>';
  }).join('');

  const rhythm = blocks.slice().reverse().map((block) => {
    const txCount = Number(block.transactions || 0);
    return '<i class="rhythm-tick level-' + scaleLevel(txCount, maxTx) + '" title="Block ' +
      esc(block.height) + ' · ' + number(txCount) + ' transaction' + (txCount === 1 ? '' : 's') + '"></i>';
  }).join('');

  const newestHeight = blocks.length ? Number(blocks[0].height) : null;
  const oldestHeight = blocks.length ? Number(blocks[blocks.length - 1].height) : null;
  const rangeLabel = newestHeight === null
    ? 'no blocks on this page'
    : 'heights ' + number(oldestHeight) + '–' + number(newestHeight);

  const blockBase = location.pathname === '/blocks' ? '/blocks' : '/';
  const pageHref = (target) => target <= 1 ? blockBase : blockBase + '?page=' + target;
  const latest = page > 1 ? '<a href="' + blockBase + '">LATEST</a>' : '<span class="disabled">LATEST</span>';
  const newer = page > 1 ? '<a href="' + pageHref(page - 1) + '">← NEWER</a>' : '<span class="disabled">← NEWER</span>';
  const older = page < totalPages ? '<a href="' + pageHref(page + 1) + '">OLDER →</a>' : '<span class="disabled">OLDER →</span>';
  const genesis = page < totalPages ? '<a href="' + pageHref(totalPages) + '">GENESIS</a>' : '<span class="disabled">GENESIS</span>';

  const pagination =
    '<nav class="chain-pagination" aria-label="Chain tape pagination">' +
      latest +
      newer +
      '<span class="chain-page-status">PAGE ' + number(page) + ' / ' + number(totalPages) + '</span>' +
      older +
      genesis +
    '</nav>';

  app.innerHTML =
    telemetry +
    '<section class="observatory-strip">' +
      '<div class="observatory-label"><span>TX / BLOCK</span><strong>Transaction count on this page</strong></div>' +
      '<div class="rhythm-line" aria-label="Transactions per block on the current chain tape page">' + rhythm + '</div>' +
      '<div class="observatory-source"><span class="live-dot"></span>MAX ' + number(maxTx) + ' TX</div>' +
    '</section>' +
    '<section class="ledger-section">' +
      railHeading('CHAIN TAPE', 'Recent blocks', rangeLabel + ' · confirming 1–5 · confirmed 6+') +
      '<div class="chain-tape">' + tape + '</div>' +
      pagination +
    '</section>';
}


async function renderBlock(identifier) {
  renderLoading('Resolving block and transaction outputs from Yerbas Core');
  const block = await api('/api/block/' + encodeURIComponent(identifier) + '?transactions=1');
  setRpcState('online', 'Core online');
  document.title = 'Block ' + block.height + ' · Yerbas Explorer';

  const transactions = Array.isArray(block.tx) ? block.tx : [];
  const actions = '<a href="/">LIVE CHAIN</a>';

  const txGroups = transactions.length
    ? transactions.map((tx, index) => {
        const txid = typeof tx === 'string' ? tx : tx?.txid;
        const outputs = Array.isArray(tx?.vout) ? tx.vout : [];
        const totalOutput = outputs.reduce((sum, vout) => sum + Number(vout?.value || 0), 0);
        const isCoinbase = Array.isArray(tx?.vin) && tx.vin.some((vin) => Boolean(vin?.coinbase));

        const outputRows = outputs.length
          ? outputs.map((vout) =>
              '<div class="block-output-row">' +
                '<span class="block-output-index">OUT ' + number(vout?.n) + '</span>' +
                '<strong>' + yerb(vout?.value) + ' <small>YERB</small></strong>' +
                '<div class="block-output-address">' +
                  '<span>DESTINATION</span>' +
                  outputAddresses(vout) +
                '</div>' +
              '</div>'
            ).join('')
          : '<div class="ledger-empty">No decoded outputs returned for this transaction.</div>';

        return '<article class="block-tx-group">' +
          '<div class="block-tx-head">' +
            '<span class="ledger-index">' + String(index + 1).padStart(2, '0') + '</span>' +
            '<span class="block-tx-type">' + (isCoinbase ? 'COINBASE' : 'TRANSACTION') + '</span>' +
            '<a class="block-tx-id mono" href="/tx/' + encodeURIComponent(txid) + '?block=' + encodeURIComponent(block.hash) + '">' +
              esc(txid || 'Unknown transaction') +
            '</a>' +
            '<span class="block-tx-summary"><small>OUTPUTS</small><b>' + number(outputs.length) + '</b></span>' +
            '<span class="block-tx-summary"><small>TOTAL</small><b>' + yerb(totalOutput) + ' YERB</b></span>' +
            '<a class="ledger-open" href="/tx/' + encodeURIComponent(txid) + '?block=' + encodeURIComponent(block.hash) + '">OPEN ↗</a>' +
          '</div>' +
          '<div class="block-output-list">' + outputRows + '</div>' +
        '</article>';
      }).join('')
    : '<div class="ledger-empty">No decoded transactions returned.</div>';

  app.innerHTML =
    ledgerHeader('BLOCK', '#' + number(block.height), block.hash, actions, 'Confirmed ledger entry · ' + esc(isoTime(block.time))) +
    telemetryRail([
      { label: 'CONFIRMATIONS', value: number(block.confirmations), note: 'active chain' },
      { label: 'TRANSACTIONS', value: number(transactions.length), note: 'decoded entries' },
      { label: 'SIZE', value: bytes(block.size), note: 'serialized' },
      { label: 'DIFFICULTY', value: number(block.difficulty, 8), note: 'target' }
    ]) +
    '<section class="chain-nav-rail">' +
      (block.previousblockhash
        ? '<a href="/block/' + encodeURIComponent(block.previousblockhash) + '"><span>← PREVIOUS</span><code>' + esc(compactHash(block.previousblockhash)) + '</code></a>'
        : '<span class="disabled"><span>GENESIS</span></span>') +
      '<div><span>CURRENT</span><strong>#' + number(block.height) + '</strong></div>' +
      (block.nextblockhash
        ? '<a href="/block/' + encodeURIComponent(block.nextblockhash) + '"><span>NEXT →</span><code>' + esc(compactHash(block.nextblockhash)) + '</code></a>'
        : '<span class="disabled"><span>CHAIN TIP</span></span>') +
    '</section>' +
    '<section class="ledger-section block-transactions-section">' +
      railHeading('BLOCK CONTENTS', 'Transactions + outputs', number(transactions.length) + ' total') +
      '<div class="block-tx-list">' + txGroups + '</div>' +
    '</section>';
}

function outputAddresses(vout) {
  const script = vout?.scriptPubKey || {};
  const addresses = script.addresses || (script.address ? [script.address] : []);

  if (addresses.length) {
    return addresses.map((address) =>
      '<a class="mono" href="/address/' + encodeURIComponent(address) + '">' + esc(address) + '</a>'
    ).join('<br>');
  }

  return '<span class="muted">' + esc(script.type || 'script') + '</span>';
}

function yerb(value) {
  if (value === null || value === undefined || value === '') return '0.00000000';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8
  });
}

async function renderTransactions() {
  document.title = 'Transactions · Yerbas Explorer';
  renderLoading('Reading recent confirmed transactions from Yerbas Core');

  const data = await api('/api/transactions?limit=60&blocks=10');
  setRpcState('online', 'Core online');

  const items = Array.isArray(data.items) ? data.items : [];
  const rows = items.length
    ? items.map((tx, index) =>
        '<a class="recent-tx-row" href="/tx/' + encodeURIComponent(tx.txid) + '?block=' + encodeURIComponent(tx.blockHash) + '">' +
          '<span class="ledger-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<span class="recent-tx-kind">' + (tx.coinbase ? 'COINBASE' : 'TX') + '</span>' +
          '<code class="recent-tx-id">' + esc(tx.txid) + '</code>' +
          '<span><small>BLOCK</small><b>#' + number(tx.blockHeight) + '</b></span>' +
          '<span><small>AGE</small><b>' + esc(timeAgo(tx.blockTime)) + '</b></span>' +
          '<span><small>IN / OUT</small><b>' + number(tx.inputs) + ' / ' + number(tx.outputs) + '</b></span>' +
          '<span><small>TOTAL OUT</small><b>' + yerb(tx.totalOutput) + '</b></span>' +
          '<span class="ledger-open">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="ledger-empty">No recent confirmed transactions returned.</div>';

  app.innerHTML =
    '<div class="transactions-page">' +
      ledgerHeader(
        'TRANSACTION INDEX',
        'Recent transactions',
        number(items.length) + ' confirmed entries from ' + number(data.blocksScanned) + ' recent blocks',
        '<a href="/blocks">BLOCKS</a><a href="/movement">LARGE MOVEMENTS</a>'
      ) +
      '<div class="tx-overview">' + [
      ['Total output', number(totalOutput, 8) + ' YERB'],
      ['Network fee', tx.feeYerb == null ? '—' : number(tx.feeYerb, 8) + ' YERB'],
      ['Confirmations', number(tx.confirmations)],
      ['Size', bytes(tx.size)]
    ].map(([label, value]) => '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join('') + '</div>' +
    '<div class="tx-context"><span class="tx-type">' + esc(kind) + '</span><span>' + (tx.blocktime || tx.time ? esc(new Date((tx.blocktime || tx.time) * 1000).toLocaleString()) : 'Awaiting confirmation') + '</span></div>' +
    '<section class="tx-flow-grid"><div class="tx-flow-side"><h2>From <small>' + number(inputCount) + ' inputs</small></h2><div id="tx-inputs">' + flowRows('inputs') + '</div></div><span class="tx-flow-arrow" aria-hidden="true">→</span><div class="tx-flow-side"><h2>To <small>' + number(outputs.length) + ' outputs</small></h2><div id="tx-outputs">' + flowRows('outputs') + '</div></div></section>' +
    '<p class="tx-flow-note">Outputs can include coins returned to the sender. Follow the transaction links to trace their movement.</p>' +
    (tx.feeReason ? '<p>' + esc(tx.feeReason) + '</p>' : '') +
    '<details class="raw-ledger"><summary>RAW RPC RESPONSE</summary><pre id="raw-json"></pre></details>';

  app.querySelector('.tx-flow-grid').addEventListener('click', event => {
    const button = event.target.closest('button[data-flow]');
    if (!button) return;
    const side = button.dataset.flow;
    pages[side] += Number(button.dataset.step);
    document.querySelector('#tx-' + side).innerHTML = flowRows(side);
  });
  const target = /^#(input|output)-(\d+)$/.exec(location.hash);
  if (target) {
    const side = target[1] === 'input' ? 'inputs' : 'outputs';
    const rows = side === 'inputs' ? inputs : outputs;
    const index = side === 'inputs' ? Number(target[2]) : rows.findIndex(row => row.n === Number(target[2]));
    if (index >= 0 && index < rows.length) {
      pages[side] = Math.floor(index / pageSize);
      document.querySelector('#tx-' + side).innerHTML = flowRows(side);
      document.getElementById(target[0].slice(1))?.scrollIntoView({ block: 'center' });
    }
  }
  document.querySelector('#raw-json').textContent = JSON.stringify(tx, null, 2);
}


function networkTrendChart(items, field, title, format) {
  if (items.length < 2) return '<section class="network-chart"><h3>' + title + '</h3><p>Collecting observations. Charts appear after two samples, approximately five minutes apart. No earlier history is inferred.</p></section>';
  const minTime = items[0].time, maxTime = items.at(-1).time;
  const values = items.map(row => row[field]);
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const segments = []; let current = [];
  items.forEach((row, index) => {
    if (index && row.time - items[index - 1].time > 900) { segments.push(current); current = []; }
    current.push((20 + (row.time - minTime) / Math.max(1, maxTime - minTime) * 760).toFixed(2) + ',' + (160 - (row[field] - minimum) / Math.max(1e-12, maximum - minimum) * 130).toFixed(2));
  });
  segments.push(current);
  return '<section class="network-chart"><h3>' + title + '</h3><p>' + esc(format(minimum)) + ' – ' + esc(format(maximum)) + '</p>' +
    '<svg viewBox="0 0 800 180" role="img" aria-label="' + esc(title) + ' over the selected period"><path d="M20 20V160H780" class="chart-axis"/>' +
    segments.filter(points => points.length > 1).map(points => '<polyline class="network-chart-line" points="' + points.join(' ') + '"/>').join('') + '</svg>' +
    '<div class="chart-range"><span>' + esc(new Date(minTime * 1000).toLocaleString()) + '</span><span>' + esc(new Date(maxTime * 1000).toLocaleString()) + '</span></div></section>';
}

async function renderNetworkHealth() {
  renderLoading('Reading network observations');
  const days = [1,7,30].includes(Number(new URLSearchParams(location.search).get('days'))) ? Number(new URLSearchParams(location.search).get('days')) : 7;
  const [history, peers] = await Promise.all([api('/api/network-history?days=' + days), api('/api/peers')]);
  document.title = 'Network health · Yerbas Explorer'; setRpcState('online', 'Core online');
  app.innerHTML = ledgerHeader('NETWORK', 'Network health', 'Observed hashrate, difficulty and current peer connections', '<a href="/node-map">GEOGRAPHIC MAP</a>') +
    '<nav class="rail-pagination"><a href="/network?days=1">24 hours</a><a href="/network?days=7">7 days</a><a href="/network?days=30">30 days</a></nav>' +
    '<p>' + number(history.items.length) + ' observations · sampled every five minutes · gaps remain visible · ' + days + '-day window</p>' +
    '<div class="network-chart-grid">' + networkTrendChart(history.items, 'hashrate', 'Estimated network hashrate', hashRate) + networkTrendChart(history.items, 'difficulty', 'Difficulty', value => number(value, 8)) + '</div>' +
    railHeading('CONNECTION TOOLS', 'Current peers', number(peers.length) + ' connected · not a list of all reachable nodes') +
    '<p>Copy an addnode command for your own node. Inbound peers may use temporary source ports; commands are offered only for outbound peers.</p>' +
    peers.map(peer => '<div class="peer-tools-row"><code>' + esc(peer.address) + '</code><span>' + esc(peer.subversion || 'Unknown version') + ' · protocol ' + number(peer.version) + '</span>' +
      '<span>' + (peer.inbound ? 'Inbound' : 'Outbound') + '</span>' + (!peer.inbound ? copyButton('addnode "' + peer.address + '" onetry', 'addnode command') : '') + '</div>').join('');
}

async function renderMovements() {
  renderLoading('Scanning the latest 100 confirmed blocks');
  const raw = new URLSearchParams(location.search).get('minimum') || '1000';
  const minimum = /^\d{1,12}(?:\.\d{1,8})?$/.test(raw) ? raw : '1000';
  const data = await api('/api/movement?minimum=' + encodeURIComponent(minimum));
  document.title = 'Large movements · Yerbas Explorer'; setRpcState('online', 'Core online');
  app.innerHTML = ledgerHeader('RECENT CHAIN ACTIVITY', 'Large movements', 'Non-coinbase transactions by total native output value', '<a href="/transactions">TRANSACTIONS</a>') +
    '<form class="tool-form" action="/movement"><label>Minimum total output (YERB)<input name="minimum" value="' + esc(minimum) + '" inputmode="decimal"></label><button>Filter</button></form>' +
    '<p>Scanned blocks ' + number(data.fromHeight) + '–' + number(data.tip) + ' (' + number(data.blocksScanned) + ' blocks). Output totals include change and are not the amount sent to another owner.</p>' +
    (data.items.length ? data.items.map(tx => '<a class="movement-row" href="/tx/' + encodeURIComponent(tx.txid) + '?block=' + encodeURIComponent(tx.blockHash) + '"><code>' + esc(compactHash(tx.txid)) + '</code><strong>' + esc(tx.outputYerb) + ' YERB</strong><span>' + esc(isoTime(tx.time)) + '</span><span>Block ' + number(tx.height) + '</span></a>').join('') : '<div class="ledger-empty">No transactions meet this threshold in the scanned block range.</div>');
}

async function renderRewards() {
  const params = new URLSearchParams(location.search);
  const address = (params.get('address') || '').trim();
  const blocks = [100,500,1000,2000].includes(Number(params.get('blocks'))) ? Number(params.get('blocks')) : 1000;
  document.title = 'Smartnode payouts · Yerbas Explorer';
  const form = '<form class="tool-form" action="/rewards"><label>Payout address<input name="address" required maxlength="40" value="' + esc(address) + '" placeholder="Yerbas payout address"></label><label>Recent blocks<select name="blocks">' + [100,500,1000,2000].map(count => '<option' + (count === blocks ? ' selected' : '') + '>' + count + '</option>').join('') + '</select></label><button>Check payouts</button></form>';
  app.innerHTML = ledgerHeader('SMARTNODE PAYMENTS', 'Verified recent payouts', 'Scheduled payees checked against confirmed coinbase outputs', '<a href="/smartnodes">SMARTNODES</a>') + form +
    '<p>This is a recent block-window lookup, not lifetime earnings. Only confirmed coinbase outputs to the scheduled Smartnode payee are counted. If mining or other coinbase rewards use the same address, those outputs can also be included.</p><div id="reward-results"></div>';
  if (!address) return;
  const target = document.getElementById('reward-results'); target.textContent = 'Checking scheduled payouts…';
  try {
    const data = await api('/api/rewards/' + encodeURIComponent(address) + '?blocks=' + blocks);
    setRpcState('online', 'Core online');
    target.innerHTML = '<p>Blocks ' + number(data.fromHeight) + '–' + number(data.toHeight) + ' · ' + number(data.items.length) + ' verified payouts · total ' + esc(data.totalYerb) + ' YERB' + (data.truncated ? ' · latest 100 matching blocks only' : '') + '</p>' +
      (data.items.length ? data.items.map(row => '<a class="movement-row" href="/tx/' + encodeURIComponent(row.txid) + '?block=' + encodeURIComponent(row.blockHash) + '"><span>Block ' + number(row.height) + '</span><strong>' + esc(row.amountYerb) + ' YERB</strong><time>' + esc(isoTime(row.time)) + '</time></a>').join('') : '<div class="ledger-empty">No verified payouts to this address in the selected range.</div>');
  } catch(error) { target.textContent = 'Payout lookup unavailable: ' + error.message; }
}

async function route() {
  clearNotice();
  const parts = location.pathname.split('/').filter(Boolean);

  try {
    if (parts[0] === 'blocks') {
      return await renderHome();
    }

    if (parts[0] === 'network') return await renderNetworkHealth();
    if (parts[0] === 'movement') return await renderMovements();
    if (parts[0] === 'rewards') return await renderRewards();

    if (parts[0] === 'transactions') {
      return await renderTransactions();
    }

    if (parts[0] === 'richlist') return await renderRichlist();

    if (parts[0] === 'addresses') {
      return await renderAddresses();
    }

    if (parts[0] === 'block' && parts[1]) {
      return await renderBlock(decodeURIComponent(parts[1]));
    }

    if (parts[0] === 'tx' && parts[1]) {
      return await renderTransaction(decodeURIComponent(parts[1]));
    }

    if (parts[0] === 'address' && parts[1]) {
      return await renderAddress(decodeURIComponent(parts.slice(1).join('/')));
    }

    if (parts[0] === 'assets') {
      return await renderAssets();
    }

    if (parts[0] === 'asset' && parts[1]) {
      return await renderAsset(decodeURIComponent(parts.slice(1).join('/')));
    }

    if (parts[0] === 'smartnodes' || parts[0] === 'masternodes') {
      return await renderSmartnodes();
    }

    if (parts[0] === 'node-map') {
      return await renderNetworkMap();
    }

    if (parts[0] === 'markets' && parts.length >= 2) {
      return await renderMarketDetail(parts[1]);
    }

    if (parts[0] === 'markets') {
      return await renderMarkets();
    }

    return await renderHome();
  } catch (error) {
    setRpcState('offline', 'Core unavailable');
    app.innerHTML =
      '<section class="error-card">' +
        '<p class="eyebrow">RPC connection error</p>' +
        '<h2>Explorer request failed</h2>' +
        '<p>' + esc(error.message) + '</p>' +
        '<a class="button-link" href="/">Retry explorer</a>' +
      '</section>';
  }
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice();

  const query = searchInput.value.trim();
  if (!query) {
    showNotice('Enter a block height, block hash, transaction ID, Yerbas address, or asset name.', 'error');
    return;
  }

  try {
    const result = await api('/api/search?q=' + encodeURIComponent(query));

    if (result.type === 'block') {
      location.href = '/block/' + encodeURIComponent(result.target);
    } else if (result.type === 'tx') {
      location.href = '/tx/' + encodeURIComponent(result.target);
    } else if (result.type === 'address') {
      location.href = '/address/' + encodeURIComponent(result.target);
    } else if (result.type === 'asset') {
      location.href = '/asset/' + encodeURIComponent(result.target);
    }
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

window.addEventListener('yerbas-layout-theme-change', () => {
  route();
});

route();
