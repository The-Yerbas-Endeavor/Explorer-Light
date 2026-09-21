const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const rpcState = document.querySelector('#rpc-state');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');

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
  const rawPoints = Array.isArray(history?.points) ? history.points : [];
  const plotted = rawPoints
    .map((point, index) => ({
      index,
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
  const totalDays = Number(history?.days || 7);
  const completeWindow = history?.completeWindow === true;
  const changeClass = hasChange
    ? (change > 0 ? 'market-up' : (change < 0 ? 'market-down' : ''))
    : '';

  if (plotted.length < 2) {
    return '<span class="market-sparkline market-sparkline-empty">' +
      '<small>7D · ' + esc(quote) + '</small>' +
      '<span class="sparkline-placeholder">NO HISTORY</span>' +
      '<em>' + esc(pricedDays + '/' + totalDays + ' DAYS · ' + observedDays + ' OBS') + '</em>' +
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
    const x = pad + ((point.index / denominator) * (width - (pad * 2)));
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
      : (completeWindow ? '—' : pricedDays + '/' + totalDays + ' DAYS')
  ) + ' · ' + observedDays + ' OBS';

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
    const internalDetail = market.exchange === 'nestex' || market.exchange === 'gatevia';
    const href = internalDetail
      ? '/markets/' + encodeURIComponent(market.exchange) + '/YERB/' + encodeURIComponent(market.quote || 'USDT')
      : market.tradeUrl;
    const external = internalDetail
      ? ''
      : ' target="_blank" rel="noopener noreferrer"';
    const quoteLabel = 'VOL ' + esc(market.quote || 'QUOTE');
    const valuation = market.valuation?.marketCapUsdt === null || market.valuation?.marketCapUsdt === undefined
      ? (hasLiveData ? '—' : 'EXTERNAL')
      : marketMoney(market.valuation.marketCapUsdt);

    return '<a class="market-matrix-row' + (hasLiveData ? '' : ' external-market') + '" href="' + esc(href) + '"' + external + '>' +
      '<span class="market-exchange"><b>' + esc(market.exchangeName) + '</b><small>' + (hasLiveData ? 'LIVE API' : 'API OFFLINE') + '</small></span>' +
      '<strong>' + esc(market.pair) + '</strong>' +
      '<span><small>LAST ' + esc(market.quote || '') + '</small>' + marketPrice(ticker.last) + '</span>' +
      '<span class="' + changeClass + '"><small>24H</small>' + marketPercent(ticker.change24hPct) + '</span>' +
      '<span><small>VOL YERB</small>' + number(ticker.baseVolume, 2) + '</span>' +
      '<span><small>' + quoteLabel + '</small>' + marketMoney(ticker.quoteVolume) + '</span>' +
      '<span><small>VALUATION</small>' + valuation + '</span>' +
      marketSparkline(market.history7d, market.quote) +
      '<span class="ledger-open">' + (hasLiveData ? '↗' : 'TRADE ↗') + '</span>' +
    '</a>';
  }).join('');

  app.innerHTML =
    ledgerHeader('MARKET OBSERVATORY', 'Yerbas markets', number((data.markets || []).length) + ' listed market' + ((data.markets || []).length === 1 ? '' : 's'), '<a href="/">LIVE CHAIN</a>') +
    referenceRail +
    '<section class="ledger-section">' +
      railHeading('MARKET MATRIX', 'Live exchange values', 'exchange data · not consensus data') +
      '<div class="market-matrix">' + (rows || '<div class="ledger-empty">No market feeds are currently available.</div>') + '</div>' +
    '</section>' +
    '<div class="market-disclaimer">Market data is informational and sourced from external exchanges. Blockchain state continues to come directly from Yerbas Core.</div>';
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

async function renderHome() {
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

  const pageHref = (target) => target <= 1 ? '/' : '/?page=' + target;
  const latest = page > 1 ? '<a href="/">LATEST</a>' : '<span class="disabled">LATEST</span>';
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

async function renderAddress(address) {
  renderLoading('Reading address index from Yerbas Core');

  const data = await api('/api/address/' + encodeURIComponent(address));
  setRpcState('online', 'Core online');
  document.title = 'Address ' + data.address + ' · Yerbas Explorer';

  const balance = data.history?.balance;
  const txids = Array.isArray(data.history?.txids) ? data.history.txids : [];
  const utxos = Array.isArray(data.history?.utxos) ? data.history.utxos : [];
  const assetBalances = data.assets?.available && data.assets?.balances && typeof data.assets.balances === 'object'
    ? Object.entries(data.assets.balances)
    : [];

  const assetRows = assetBalances.length
    ? assetBalances.map(([name, amount]) =>
        '<a class="ledger-row asset-ledger-row" href="/asset/' + encodeURIComponent(name) + '">' +
          '<span class="asset-inline-type">' + esc(assetType(name)) + '</span>' +
          '<strong>' + esc(name) + '</strong>' +
          '<span class="asset-inline-balance">' + esc(amount) + '</span>' +
          '<span class="ledger-open">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="ledger-empty">No indexed asset balances.</div>';

  const txRows = txids.length
    ? txids.slice(0, 40).map((txid, index) =>
        '<a class="ledger-row tx-ledger-row" href="/tx/' + encodeURIComponent(txid) + '">' +
          '<span class="ledger-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<span class="ledger-row-label">TX</span>' +
          '<code>' + esc(txid) + '</code>' +
          '<span class="ledger-open">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="ledger-empty">No indexed transactions.</div>';

  const utxoRows = utxos.length
    ? utxos.slice(0, 30).map((utxo) =>
        '<a class="ledger-row utxo-ledger-row" href="/tx/' + encodeURIComponent(utxo.txid) + '">' +
          '<span class="ledger-row-label">UTXO</span>' +
          '<strong>' + yerb(Number(utxo.satoshis || 0) / 100000000) + ' YERB</strong>' +
          '<span>vout ' + number(utxo.outputIndex) + '</span>' +
          '<span>block ' + number(utxo.height) + '</span>' +
          '<code>' + esc(compactHash(utxo.txid)) + '</code>' +
          '<span class="ledger-open">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="ledger-empty">No unspent outputs.</div>';

  const historyNotice = data.history?.available
    ? ''
    : '<div class="ledger-warning">Address recognized, but indexed history is unavailable from Core.</div>';

  app.innerHTML =
    ledgerHeader('YERBAS ADDRESS', 'Address', data.address, '<a href="/">LIVE CHAIN</a>') +
    historyNotice +
    telemetryRail([
      { label: 'BALANCE', value: yerb(balance?.balanceYerb) + ' YERB', note: 'current' },
      { label: 'RECEIVED', value: yerb(balance?.receivedYerb) + ' YERB', note: 'lifetime' },
      { label: 'TRANSACTIONS', value: number(txids.length), note: 'indexed' },
      { label: 'UTXOS', value: number(utxos.length), note: 'unspent' },
      { label: 'ASSETS', value: number(assetBalances.length), note: 'positions' }
    ]) +
    '<section class="split-ledger">' +
      '<div class="ledger-pane">' +
        railHeading('PORTFOLIO', 'Native assets', number(assetBalances.length) + ' positions') +
        '<div class="ledger-list">' + assetRows + '</div>' +
      '</div>' +
      '<div class="ledger-pane">' +
        railHeading('AVAILABLE VALUE', 'Unspent outputs', number(utxos.length) + ' UTXOs') +
        '<div class="ledger-list">' + utxoRows + '</div>' +
      '</div>' +
    '</section>' +
    '<section class="ledger-section">' +
      railHeading('ACTIVITY', 'Address transactions', number(txids.length) + ' indexed') +
      '<div class="ledger-list">' + txRows + '</div>' +
    '</section>';
}


function assetType(name) {
  if (name.endsWith('!')) return 'Owner';
  if (name.startsWith('$')) return 'Restricted';
  if (name.startsWith('#')) return 'Qualifier';
  if (name.includes('#')) return 'Unique';
  if (name.includes('/')) return 'Sub-asset';
  return 'Root';
}
function assetAmount(value, units = null) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);

  const digits = Number.isInteger(Number(units))
    ? Math.min(8, Math.max(0, Number(units)))
    : 8;

  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function assetMetadataLink(asset) {
  const ref = asset?.metadataRef;
  if (!ref?.value) return '<span class="muted">—</span>';

  if (ref.type === 'ipfs') {
    const href = 'https://ipfs.io/ipfs/' + encodeURIComponent(ref.value);
    return '<a class="metadata-link" href="' + href + '" target="_blank" rel="noopener noreferrer">IPFS ↗</a>';
  }

  if (ref.type === 'txid' && /^[0-9a-fA-F]{64}$/.test(ref.value)) {
    return '<a class="metadata-link" href="/tx/' + encodeURIComponent(ref.value) + '">TXID</a>';
  }

  return '<span class="mono">' + esc(ref.value) + '</span>';
}

function assetListHref(params, page) {
  const next = new URLSearchParams();
  const q = (params.get('q') || '').trim();
  const type = params.get('type') || '';
  const metadata = params.get('metadata') || '';
  const reissuable = params.get('reissuable') || '';
  const sort = params.get('sort') || 'name';

  if (q) next.set('q', q);
  if (type) next.set('type', type);
  if (metadata) next.set('metadata', metadata);
  if (reissuable) next.set('reissuable', reissuable);
  if (sort && sort !== 'name') next.set('sort', sort);
  if (page > 1) next.set('page', String(page));

  const query = next.toString();
  return '/assets' + (query ? '?' + query : '');
}

async function renderAssets() {
  renderLoading('Reading Yerbas asset index');

  const params = new URLSearchParams(location.search);
  const query = (params.get('q') || '').trim();
  const type = params.get('type') || '';
  const metadata = params.get('metadata') || '';
  const reissuable = params.get('reissuable') || '';
  const sort = params.get('sort') || 'name';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);

  const request = new URLSearchParams({
    q: query,
    type,
    metadata,
    reissuable,
    sort,
    page: String(page),
    count: '25'
  });

  const data = await api('/api/assets?' + request.toString());
  setRpcState('online', 'Core online');
  document.title = 'Assets · Yerbas Explorer';

  const rows = data.items.length
    ? data.items.map((asset) =>
        '<a class="asset-matrix-row" href="/asset/' + encodeURIComponent(asset.name) + '">' +
          '<span class="asset-inline-type">' + esc(asset.type || assetType(asset.name)) + '</span>' +
          '<strong>' + esc(asset.name) + '</strong>' +
          '<span><small>SUPPLY</small>' + assetAmount(asset.amount, asset.units) + '</span>' +
          '<span><small>HOLDERS</small>' + (asset.holders === null ? '—' : number(asset.holders)) + '</span>' +
          '<span><small>UNITS</small>' + number(asset.units) + '</span>' +
          '<span class="asset-state">' + (asset.metadataRef?.value ? 'META' : '—') + ' / ' + (Number(asset.reissuable) ? 'REISSUE' : 'FIXED') + '</span>' +
          '<span class="ledger-open">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="ledger-empty">No assets matched these filters.</div>';

  const pagination =
    '<div class="rail-pagination">' +
      (data.page > 1 ? '<a href="' + assetListHref(params, data.page - 1) + '">← PREV</a>' : '<span></span>') +
      '<span>PAGE ' + number(data.page) + ' / ' + number(data.totalPages) + '</span>' +
      (data.page < data.totalPages ? '<a href="' + assetListHref(params, data.page + 1) + '">NEXT →</a>' : '<span></span>') +
    '</div>';

  app.innerHTML =
    ledgerHeader('ASSET INDEX', 'Yerbas assets', number(data.total) + ' matching assets', '<a href="/">LIVE CHAIN</a>') +
    '<section id="asset-summary">' +
      telemetryRail([
        { label: 'INDEX', value: 'LIVE', note: 'assetindex' },
        { label: 'ASSETS', value: number(data.total), note: 'current view' },
        { label: 'HOLDERS', value: '…', note: 'aggregate' },
        { label: 'SOURCE', value: 'CORE', note: 'direct RPC' }
      ]) +
    '</section>' +
    '<form class="rail-filter" action="/assets" method="get" role="search">' +
      '<input name="q" value="' + esc(query) + '" placeholder="Search asset names">' +
      '<select name="type"><option value="">ALL TYPES</option>' +
        ['Root','Sub-asset','Unique','Qualifier','Restricted','Owner'].map((value) =>
          '<option value="' + value + '"' + (type === value ? ' selected' : '') + '>' + value.toUpperCase() + '</option>').join('') +
      '</select>' +
      '<select name="metadata"><option value="">ANY META</option><option value="yes"' + (metadata === 'yes' ? ' selected' : '') + '>HAS META</option><option value="no"' + (metadata === 'no' ? ' selected' : '') + '>NO META</option></select>' +
      '<select name="reissuable"><option value="">ANY SUPPLY</option><option value="yes"' + (reissuable === 'yes' ? ' selected' : '') + '>REISSUABLE</option><option value="no"' + (reissuable === 'no' ? ' selected' : '') + '>FIXED</option></select>' +
      '<select name="sort"><option value="name"' + (sort === 'name' ? ' selected' : '') + '>NAME</option><option value="supply-desc"' + (sort === 'supply-desc' ? ' selected' : '') + '>SUPPLY ↓</option><option value="supply-asc"' + (sort === 'supply-asc' ? ' selected' : '') + '>SUPPLY ↑</option></select>' +
      '<button type="submit">FILTER</button>' +
    '</form>' +
    '<section class="ledger-section">' +
      railHeading('ASSET MATRIX', 'On-chain catalog', number(data.items.length) + ' shown') +
      '<div class="asset-matrix">' + rows + '</div>' +
      pagination +
    '</section>';

  api('/api/assets/stats').then((stats) => {
    const summary = document.querySelector('#asset-summary');
    if (!summary) return;
    summary.innerHTML = telemetryRail([
      { label: 'INDEX', value: stats.ready ? 'LIVE' : 'CHECK', note: 'assetindex' },
      { label: 'ASSETS', value: number(stats.indexedAssets), note: 'whole directory' },
      { label: 'HOLDERS', value: number(stats.indexedHolders), note: 'relationships' },
      { label: 'SOURCE', value: 'CORE', note: 'direct RPC' }
    ]);
  }).catch(() => {});
}


async function renderAsset(name) {
  renderLoading('Reading asset data from Yerbas Core');

  const data = await api('/api/asset/' + encodeURIComponent(name));
  setRpcState('online', 'Core online');
  document.title = data.name + ' · Asset · Yerbas Explorer';

  const metadata = data.metadata || {};
  const holders = data.holders?.items || [];
  const supply = Number(metadata.amount || 0);
  const maxBalance = Math.max(0.00000001, ...holders.map((holder) => Number(holder.balance || 0)));

  const holderRows = holders.length
    ? holders.map((holder, index) => {
        const balance = Number(holder.balance || 0);
        const ownership = supply > 0 ? (balance / supply) * 100 : 0;
        const level = scaleLevel(balance, maxBalance);
        return '<a class="holder-rail-row" href="/address/' + encodeURIComponent(holder.address) + '">' +
          '<span class="ledger-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<code>' + esc(holder.address) + '</code>' +
          '<strong>' + assetAmount(holder.balance, metadata.units) + '</strong>' +
          '<span>' + ownership.toFixed(2) + '%</span>' +
          '<i class="holder-microbar level-' + level + '"></i>' +
        '</a>';
      }).join('')
    : '<div class="ledger-empty">' + esc(data.holders?.unavailableReason || 'No holder balances returned.') + '</div>';

  const ipfsHash = metadata.ipfs_hash || null;
  const txidHash = metadata.txid_hash || metadata.txid || null;
  const metadataValue = ipfsHash || txidHash || null;
  const metadataType = ipfsHash ? 'IPFS' : (txidHash ? 'TXID' : 'NONE');
  const ipfsUrl = ipfsHash ? 'https://ipfs.io/ipfs/' + encodeURIComponent(ipfsHash) : null;
  const metadataRefHtml = ipfsUrl
    ? '<a class="asset-ipfs-ref" href="' + ipfsUrl + '" target="_blank" rel="noopener noreferrer">' +
        '<code>' + esc(ipfsHash) + '</code><span>OPEN IPFS ↗</span>' +
      '</a>'
    : (txidHash && /^[0-9a-fA-F]{64}$/.test(txidHash)
      ? '<a class="asset-ipfs-ref" href="/tx/' + encodeURIComponent(txidHash) + '">' +
          '<code>' + esc(txidHash) + '</code><span>OPEN TX ↗</span>' +
        '</a>'
      : '<code>' + esc(metadataValue || '—') + '</code>');

  const ipfsPreview = ipfsUrl
    ? '<section class="ipfs-display">' +
        '<div class="ipfs-display-head">' +
          '<div><span>IPFS CONTENT</span><strong>Asset metadata preview</strong></div>' +
          '<a href="' + ipfsUrl + '" target="_blank" rel="noopener noreferrer">OPEN IN IPFS ↗</a>' +
        '</div>' +
        '<div class="ipfs-frame-shell">' +
          '<iframe class="ipfs-frame" src="' + ipfsUrl + '" title="' + esc(data.name) + ' IPFS content" loading="lazy" sandbox></iframe>' +
        '</div>' +
        '<div class="ipfs-display-foot"><code>' + esc(ipfsHash) + '</code><span>PUBLIC IPFS GATEWAY · ipfs.io</span></div>' +
      '</section>'
    : '';

  app.innerHTML =
    ledgerHeader('ASSET', data.name, assetType(data.name), '<a href="/assets">ASSET INDEX</a><a href="/">LIVE CHAIN</a>') +
    telemetryRail([
      { label: 'SUPPLY', value: assetAmount(metadata.amount, metadata.units), note: 'issued' },
      { label: 'UNITS', value: number(metadata.units), note: 'precision' },
      { label: 'HOLDERS', value: data.holders?.total === null ? '—' : number(data.holders?.total), note: 'indexed' },
      { label: 'REISSUABLE', value: Number(metadata.reissuable) ? 'YES' : 'NO', note: assetType(data.name) },
      { label: 'METADATA', value: metadataType, note: metadataValue ? compactHash(metadataValue) : 'none' }
    ]) +
    '<section class="asset-facts-rail">' +
      '<div><span>ISSUANCE BLOCK</span><strong>' + (data.issuance?.blockHeight !== null && data.issuance?.blockHeight !== undefined ? number(data.issuance.blockHeight) : '—') + '</strong></div>' +
      '<div><span>VERIFIER</span><code>' + esc(metadata.verifier_string || '—') + '</code></div>' +
      '<div><span>METADATA REF</span>' + metadataRefHtml + '</div>' +
    '</section>' +
    ipfsPreview +
    '<section class="ledger-section">' +
      railHeading('OWNERSHIP RAIL', 'Top holders', data.holders?.total === null ? 'availability unknown' : number(data.holders?.total) + ' total') +
      '<div class="holder-rail">' + holderRows + '</div>' +
    '</section>';
}


function shortService(value) {
  return value || '—';
}

function compactMiddle(value, lead = 9, tail = 7) {
  const text = String(value || '');
  if (text.length <= lead + tail + 1) return text;
  return text.slice(0, lead) + '…' + text.slice(-tail);
}

function smartnodeStatusClass(status) {
  if (status === 'ENABLED') return 'status-enabled';
  if (status === 'POSE_BANNED') return 'status-banned';
  return 'status-unknown';
}

function smartnodeListHref(params, page) {
  const next = new URLSearchParams();
  const q = (params.get('q') || '').trim();
  const status = params.get('status') || 'ENABLED';
  const collateral = params.get('collateral') || '';
  const sort = params.get('sort') || 'pay-age-asc';

  if (q) next.set('q', q);
  if (status && status !== 'ENABLED') next.set('status', status);
  if (collateral) next.set('collateral', collateral);
  if (sort && sort !== 'pay-age-asc') next.set('sort', sort);
  if (page > 1) next.set('page', String(page));

  const query = next.toString();
  return '/smartnodes' + (query ? '?' + query : '');
}

function smartnodeSortHref(params, key) {
  const current = params.get('sort') || 'pay-age-asc';
  const nextSort = current === key + '-asc' ? key + '-desc' : key + '-asc';
  const next = new URLSearchParams();

  const q = (params.get('q') || '').trim();
  const status = params.get('status') || 'ENABLED';
  const collateral = params.get('collateral') || '';

  if (q) next.set('q', q);
  if (status && status !== 'ENABLED') next.set('status', status);
  if (collateral) next.set('collateral', collateral);
  next.set('sort', nextSort);

  return '/smartnodes?' + next.toString();
}

function smartnodeSortHeader(label, key, currentSort) {
  const activeAsc = currentSort === key + '-asc';
  const activeDesc = currentSort === key + '-desc';
  const arrow = activeAsc ? '↑' : (activeDesc ? '↓' : '↕');
  const activeClass = activeAsc || activeDesc ? ' active' : '';

  return '<a class="sort-header' + activeClass + '" href="' +
    smartnodeSortHref(new URLSearchParams(location.search), key) +
    '" title="Sort by ' + esc(label) + '">' +
    '<span>' + esc(label) + '</span><span class="sort-arrow" aria-hidden="true">' + arrow + '</span>' +
    '</a>';
}

async function renderSmartnodes() {
  renderLoading('Reading smartnodes from Yerbas Core');

  const params = new URLSearchParams(location.search);
  const request = new URLSearchParams({
    q: (params.get('q') || '').trim(),
    status: params.get('status') || 'ENABLED',
    collateral: params.get('collateral') || '',
    sort: params.get('sort') || 'pay-age-asc',
    page: String(Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)),
    count: '50'
  });

  const data = await api('/api/smartnodes?' + request.toString());
  setRpcState('online', 'Core online');
  document.title = 'Smartnodes · Yerbas Explorer';

  const collateralOptions = Object.entries(data.collateralCounts || {})
    .filter(([amount]) => amount !== 'unknown')
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([amount, count]) =>
      '<option value="' + esc(amount) + '"' + (request.get('collateral') === amount ? ' selected' : '') +
      '>' + number(amount) + ' YERB (' + number(count) + ')</option>'
    ).join('');

  const enabled = Number(data.network?.enabled || 0);
  const total = Number(data.network?.total || 0);
  const poseBanned = Number(data.network?.poseBanned || 0);

  const collateralRail = Object.entries(data.collateralCounts || {})
    .filter(([amount]) => amount !== 'unknown')
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([amount, count]) =>
      '<span><b>' + number(amount) + '</b><small>YERB</small><strong>' + number(count) + '</strong></span>'
    ).join('');

  const nodeRows = data.items.length
    ? data.items.map((node) => {
        const payout = node.payoutAddress
          ? '<a class="mono node-payout" title="' + esc(node.payoutAddress) + '" href="/address/' + encodeURIComponent(node.payoutAddress) + '">' + esc(node.payoutAddress) + '</a>'
          : '<span class="muted">—</span>';
        return '<div class="node-stream-row">' +
          '<span class="node-status-dot ' + smartnodeStatusClass(node.status) + '"></span>' +
          '<span class="node-pay-rank">' + (node.paymentAgeRank === null ? '—' : number(node.paymentAgeRank)) + '</span>' +
          '<span class="node-service"><b>' + esc(shortService(node.service)) + '</b><code>' + esc(compactHash(node.proTxHash || node.outpoint)) + '</code></span>' +
          '<span class="node-payout-wrap"><small>YERBAS PAYOUT</small>' + payout + '</span>' +
          '<span class="node-collateral"><b>' + (node.collateralAmount === null ? '—' : number(node.collateralAmount)) + '</b><small>YERB</small></span>' +
          '<span class="node-paid"><small>LAST PAID</small><b>' + (Number(node.lastPaidBlock) > 0 ? 'BLOCK ' + number(node.lastPaidBlock) : 'NEVER') + '</b></span>' +
          '<span class="node-pose"><small>POSE</small><b>' + number(node.PoSePenalty) + '</b></span>' +
          '<span class="smartnode-status ' + smartnodeStatusClass(node.status) + '">' + esc(node.status) + '</span>' +
        '</div>';
      }).join('')
    : '<div class="ledger-empty">No smartnodes matched these filters.</div>';

  const pageLinks =
    '<div class="rail-pagination">' +
      (data.page > 1 ? '<a href="' + smartnodeListHref(params, data.page - 1) + '">← PREV</a>' : '<span></span>') +
      '<span>PAGE ' + number(data.page) + ' / ' + number(data.totalPages) + '</span>' +
      (data.page < data.totalPages ? '<a href="' + smartnodeListHref(params, data.page + 1) + '">NEXT →</a>' : '<span></span>') +
    '</div>';

  app.innerHTML =
    ledgerHeader('SMARTNODE NETWORK', 'Deterministic node stream', number(enabled) + ' enabled', '<a href="/node-map?view=smartnodes">NETWORK MAP ↗</a><a href="/">LIVE CHAIN</a>') +
    telemetryRail([
      { label: 'ENABLED', value: number(enabled), note: total ? ((enabled / total) * 100).toFixed(1) + '%' : '—' },
      { label: 'REGISTERED', value: number(total), note: 'deterministic' },
      { label: 'POSE BANNED', value: number(poseBanned), note: 'current' },
      { label: 'PROTOCOL', value: data.protocolVersion === null ? '—' : number(data.protocolVersion), note: 'local Core' }
    ]) +
    '<section class="collateral-rail"><span class="rail-label">COLLATERAL</span>' + collateralRail + '</section>' +
    '<form class="rail-filter smartnode-rail-filter" action="/smartnodes" method="get">' +
      '<input name="q" value="' + esc(request.get('q')) + '" placeholder="IP, payout address, ProTx…">' +
      '<select name="status"><option value="ENABLED"' + (request.get('status') === 'ENABLED' ? ' selected' : '') + '>ENABLED</option><option value="ALL"' + (request.get('status') === 'ALL' ? ' selected' : '') + '>ALL</option><option value="POSE_BANNED"' + (request.get('status') === 'POSE_BANNED' ? ' selected' : '') + '>POSE BANNED</option></select>' +
      '<select name="collateral"><option value="">ALL COLLATERAL</option>' + collateralOptions + '</select>' +
      '<select name="sort"><option value="pay-age-asc"' + (request.get('sort') === 'pay-age-asc' ? ' selected' : '') + '>PAY AGE ↑</option><option value="pay-age-desc"' + (request.get('sort') === 'pay-age-desc' ? ' selected' : '') + '>PAY AGE ↓</option><option value="collateral-desc"' + (request.get('sort') === 'collateral-desc' ? ' selected' : '') + '>COLLATERAL ↓</option><option value="last-paid-asc"' + (request.get('sort') === 'last-paid-asc' ? ' selected' : '') + '>LAST PAID ↑</option><option value="registered-asc"' + (request.get('sort') === 'registered-asc' ? ' selected' : '') + '>REGISTERED ↑</option></select>' +
      '<button type="submit">FILTER</button>' +
    '</form>' +
    '<section class="ledger-section">' +
      railHeading('NODE STREAM', number(data.total) + ' matching smartnodes', 'pay age · service · payout · collateral · state') +
      '<div class="node-stream-head"><span></span><span>RANK</span><span>SERVICE / PROTX</span><span>YERBAS PAYOUT</span><span>COLLATERAL</span><span>LAST PAID</span><span>POSE</span><span>STATUS</span></div>' +
      '<div class="node-stream">' + nodeRows + '</div>' +
      pageLinks +
    '</section>';
}


function networkMapSeverity(status) {
  const order = {
    'online': 1,
    'slow': 2,
    'penalized': 3,
    'offline': 4,
    'pose-banned': 5
  };
  return order[status] || 0;
}

function networkMapHasGeo(item) {
  return Boolean(
    item?.geo
    && Number.isFinite(Number(item.geo.latitude))
    && Number.isFinite(Number(item.geo.longitude))
  );
}

function networkMapMatchesFilter(item, filter) {
  if (filter === 'reachable') {
    return ['online', 'slow', 'penalized'].includes(item.status);
  }

  if (filter === 'offline') return item.status === 'offline';
  if (filter === 'pose-banned') return item.status === 'pose-banned';
  if (filter === 'plotted') return networkMapHasGeo(item);

  if (filter === 'countries') {
    return networkMapHasGeo(item) && Boolean(item.geo.countryCode || item.geo.country);
  }

  return true;
}

function networkMapFilterLabel(filter) {
  const labels = {
    all: 'all nodes',
    countries: 'nodes with country data',
    reachable: 'reachable nodes',
    offline: 'offline nodes',
    'pose-banned': 'PoSe-banned nodes',
    plotted: 'geolocated nodes'
  };
  return labels[filter] || labels.all;
}

function networkMapClusters(items) {
  const groups = new Map();

  for (const item of items) {
    if (!networkMapHasGeo(item)) continue;

    const latitude = Number(item.geo.latitude);
    const longitude = Number(item.geo.longitude);
    const key = latitude.toFixed(2) + ',' + longitude.toFixed(2);

    if (!groups.has(key)) {
      groups.set(key, {
        latitude,
        longitude,
        city: item.geo.city || null,
        region: item.geo.region || null,
        country: item.geo.country || item.geo.countryCode || null,
        countryCode: item.geo.countryCode || null,
        isp: item.geo.isp || null,
        nodes: [],
        status: item.status
      });
    }

    const group = groups.get(key);
    group.nodes.push(item);

    if (networkMapSeverity(item.status) > networkMapSeverity(group.status)) {
      group.status = item.status;
    }
  }

  return [...groups.values()];
}

function networkMapPinPosition(latitude, longitude) {
  const left = ((Number(longitude) + 180) / 360) * 100;
  const top = ((90 - Number(latitude)) / 180) * 100;

  return {
    left: Math.max(0, Math.min(100, left)),
    top: Math.max(0, Math.min(100, top))
  };
}

function networkMapLocationLabel(cluster) {
  return [cluster.city, cluster.region, cluster.country]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(', ') || 'Approximate location';
}

function networkMapNodeDetail(node, view) {
  const service = esc(node.service || node.id || 'Unknown node');
  const status = esc(String(node.status || 'unknown').replaceAll('-', ' '));

  if (view === 'peers') {
    return '<div class="map-node-row">' +
      '<div><strong class="mono">' + service + '</strong><span class="map-node-status ' + esc(node.status) + '">' + status + '</span></div>' +
      '<small>' +
        (node.inbound ? 'Inbound' : 'Outbound') +
        (node.subversion ? ' · ' + esc(node.subversion) : '') +
        (Number.isFinite(Number(node.pingTime)) ? ' · ' + Math.round(Number(node.pingTime) * 1000) + ' ms' : '') +
      '</small>' +
    '</div>';
  }

  const payout = node.payoutAddress
    ? '<a href="/address/' + encodeURIComponent(node.payoutAddress) + '">' + esc(compactMiddle(node.payoutAddress, 10, 7)) + '</a>'
    : '—';

  return '<div class="map-node-row">' +
    '<div><strong class="mono">' + service + '</strong><span class="map-node-status ' + esc(node.status) + '">' + status + '</span></div>' +
    '<small>Collateral ' + (node.collateralAmount === null || node.collateralAmount === undefined ? '—' : number(node.collateralAmount) + ' YERB') +
      ' · Payout ' + payout + '</small>' +
  '</div>';
}

async function renderNetworkMap() {
  renderLoading('Locating Yerbas network nodes');

  const params = new URLSearchParams(location.search);
  const view = params.get('view') === 'peers' ? 'peers' : 'smartnodes';
  const allowedFilters = new Set(['all', 'countries', 'reachable', 'offline', 'pose-banned', 'plotted']);
  let activeFilter = allowedFilters.has(params.get('filter')) ? params.get('filter') : 'all';

  const data = await api('/api/network-map?view=' + encodeURIComponent(view));

  setRpcState('online', 'Core online');
  document.title = 'Network Map · Yerbas Explorer';

  const stats = data.stats || {};
  const statDefinitions = [
    ['Total nodes', stats.totalNodes, 'all'],
    ['Countries', stats.countries, 'countries'],
    ['Reachable', stats.reachable, 'reachable'],
    ['Offline', stats.offline, 'offline'],
    ['PoSe banned', stats.poseBanned, 'pose-banned'],
    ['Plotted', stats.plotted, 'plotted']
  ];

  const statCards = statDefinitions.map(([label, value, filter]) =>
    '<button type="button" class="network-stat' + (activeFilter === filter ? ' active' : '') + '"' +
      ' data-map-filter="' + filter + '" title="Show ' + esc(networkMapFilterLabel(filter)) + '">' +
      '<span>' + esc(label) + '</span><strong>' + number(value) + '</strong>' +
    '</button>'
  ).join('');

  const legend = [
    ['online', 'Online'],
    ['slow', 'Slow'],
    ['penalized', 'Penalized'],
    ['offline', 'Offline'],
    ['pose-banned', 'PoSe banned']
  ].map(([status, label]) =>
    '<span class="map-legend-item"><i class="status-' + status + '"></i>' + label + '</span>'
  ).join('');

  app.innerHTML =
    '<section class="detail-hero network-map-hero">' +
      '<div class="detail-kicker">Yerbas peer geography / approximate IP locations</div>' +
      '<h2>Yerbas Network Map</h2>' +
      '<div class="detail-hash">View currently connected network peers and registered Smartnodes around the world.</div>' +
      '<div class="detail-actions"><a class="text-link" href="/">← Back to live chain</a></div>' +
    '</section>' +

    '<section class="network-map-tabs">' +
      '<a class="' + (view === 'peers' ? 'active' : '') + '" href="/node-map?view=peers">Network Nodes</a>' +
      '<a class="' + (view === 'smartnodes' ? 'active' : '') + '" href="/node-map?view=smartnodes">Smartnodes</a>' +
      '<div class="map-legend">' + legend + '</div>' +
    '</section>' +

    '<section class="network-map-stats">' + statCards + '</section>' +

    '<section class="panel network-map-panel">' +
      '<div id="network-map-canvas" class="network-map-canvas">' +
        '<div id="network-map-stage" class="network-map-stage">' +
          '<img class="network-map-base" src="https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg" alt="" aria-hidden="true">' +
          '<div class="network-map-grid" aria-hidden="true"></div>' +
          '<div id="network-map-pins" class="network-map-pins"></div>' +
        '</div>' +
        '<div class="network-map-controls" aria-label="Map controls">' +
          '<button type="button" data-map-zoom="in" title="Zoom in">+</button>' +
          '<button type="button" data-map-zoom="out" title="Zoom out">−</button>' +
          '<button type="button" data-map-zoom="reset" title="Reset map">↺</button>' +
        '</div>' +
        '<div class="network-map-hint">Scroll to zoom · drag to pan · double-click to zoom</div>' +
        '<aside id="network-map-detail" class="network-map-detail hidden"></aside>' +
      '</div>' +
      '<div class="network-map-foot">' +
        '<span>' + esc(data.source) + '</span>' +
        '<span id="network-map-filter-status"></span>' +
        '<span>Node locations are approximate and derived from IP geolocation. Exact operator locations are not exposed.</span>' +
        '<span>Geo: HackMyIP · Map: Wikimedia Commons CC0</span>' +
      '</div>' +
    '</section>';

  const allItems = Array.isArray(data.items) ? data.items : [];
  const canvas = document.querySelector('#network-map-canvas');
  const stage = document.querySelector('#network-map-stage');
  const pinsElement = document.querySelector('#network-map-pins');
  const detail = document.querySelector('#network-map-detail');
  const filterStatus = document.querySelector('#network-map-filter-status');

  let currentClusters = [];
  let mapView = { scale: 1, x: 0, y: 0 };
  let dragState = null;

  function clampMapView() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaledWidth = rect.width * mapView.scale;
    const scaledHeight = rect.height * mapView.scale;

    if (mapView.scale <= 1) {
      mapView.x = 0;
      mapView.y = 0;
      return;
    }

    mapView.x = Math.min(0, Math.max(rect.width - scaledWidth, mapView.x));
    mapView.y = Math.min(0, Math.max(rect.height - scaledHeight, mapView.y));
  }

  function applyMapView() {
    if (!stage) return;
    clampMapView();
    stage.style.transform =
      'translate(' + mapView.x.toFixed(2) + 'px,' + mapView.y.toFixed(2) + 'px) scale(' +
      mapView.scale.toFixed(4) + ')';

    if (pinsElement) {
      // The map stage scales geographic positions. Counter-scale the pins so
      // they grow gently with zoom instead of ballooning by the full map scale.
      const screenPinScale = Math.min(1.7, 1 + (mapView.scale - 1) * 0.1);
      const localPinScale = screenPinScale / mapView.scale;
      pinsElement.style.setProperty('--network-pin-scale', localPinScale.toFixed(4));
      pinsElement.style.setProperty('--network-pin-hover-scale', (localPinScale * 1.16).toFixed(4));
      pinsElement.dataset.mapZoom = mapView.scale.toFixed(2);
    }
  }

  function zoomMapAt(clientX, clientY, nextScale) {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const oldScale = mapView.scale;
    const scale = Math.max(1, Math.min(8, nextScale));

    if (Math.abs(scale - oldScale) < 0.0001) return;

    const cursorX = clientX - rect.left;
    const cursorY = clientY - rect.top;
    const worldX = (cursorX - mapView.x) / oldScale;
    const worldY = (cursorY - mapView.y) / oldScale;

    mapView.scale = scale;
    mapView.x = cursorX - worldX * scale;
    mapView.y = cursorY - worldY * scale;
    applyMapView();
  }

  function zoomMapCentered(factor) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomMapAt(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      mapView.scale * factor
    );
  }

  function resetMapView() {
    mapView = { scale: 1, x: 0, y: 0 };
    applyMapView();
  }

  function updateFilterUrl() {
    const url = new URL(location.href);
    if (activeFilter === 'all') url.searchParams.delete('filter');
    else url.searchParams.set('filter', activeFilter);
    history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString());
  }

  function updateStatButtons() {
    document.querySelectorAll('[data-map-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mapFilter === activeFilter);
    });
  }

  function openCluster(index) {
    const cluster = currentClusters[index];
    if (!cluster || !detail) return;

    const location = networkMapLocationLabel(cluster);
    const nodes = cluster.nodes.slice(0, 20);

    detail.classList.remove('hidden');
    detail.innerHTML =
      '<button class="map-detail-close" type="button" aria-label="Close">×</button>' +
      '<p class="eyebrow">APPROXIMATE LOCATION</p>' +
      '<h3>' + esc(location) + '</h3>' +
      '<div class="map-detail-meta">' +
        number(cluster.nodes.length) + (cluster.nodes.length === 1 ? ' node' : ' nodes') +
        (cluster.isp ? ' · ' + esc(cluster.isp) : '') +
      '</div>' +
      '<div class="map-node-list">' +
        nodes.map((node) => networkMapNodeDetail(node, view)).join('') +
        (cluster.nodes.length > nodes.length
          ? '<div class="map-node-more">+' + number(cluster.nodes.length - nodes.length) + ' more at this approximate location</div>'
          : '') +
      '</div>';

    detail.querySelector('.map-detail-close')?.addEventListener('click', () => {
      detail.classList.add('hidden');
    });
  }

  function renderMapPins() {
    if (!pinsElement) return;

    const matchingItems = allItems.filter((item) => networkMapMatchesFilter(item, activeFilter));
    currentClusters = networkMapClusters(matchingItems);

    pinsElement.innerHTML = currentClusters.map((cluster, index) => {
      const label = networkMapLocationLabel(cluster);
      const count = cluster.nodes.length;
      const position = networkMapPinPosition(cluster.latitude, cluster.longitude);

      return '<button class="network-pin status-' + esc(cluster.status) + (count > 1 ? ' cluster' : '') + '"' +
        ' type="button" data-map-cluster="' + index + '"' +
        ' data-map-left="' + position.left.toFixed(4) + '"' +
        ' data-map-top="' + position.top.toFixed(4) + '"' +
        ' title="' + esc(label + ' · ' + count + (count === 1 ? ' node' : ' nodes')) + '">' +
        (count > 1 ? '<span>' + number(count) + '</span>' : '') +
      '</button>';
    }).join('');

    const plottedMatching = matchingItems.filter(networkMapHasGeo).length;
    if (filterStatus) {
      filterStatus.textContent =
        'Showing ' + number(plottedMatching) + ' plotted of ' + number(matchingItems.length) +
        ' ' + networkMapFilterLabel(activeFilter);
    }

    pinsElement.querySelectorAll('[data-map-cluster]').forEach((button) => {
      const left = Number(button.dataset.mapLeft);
      const top = Number(button.dataset.mapTop);

      if (Number.isFinite(left) && Number.isFinite(top)) {
        button.style.left = left.toFixed(4) + '%';
        button.style.top = top.toFixed(4) + '%';
      }

      button.addEventListener('click', () => openCluster(Number(button.dataset.mapCluster)));
    });

    if (detail) detail.classList.add('hidden');
  }

  document.querySelectorAll('[data-map-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = allowedFilters.has(button.dataset.mapFilter) ? button.dataset.mapFilter : 'all';
      updateFilterUrl();
      updateStatButtons();
      renderMapPins();
    });
  });

  document.querySelectorAll('[data-map-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.mapZoom;
      if (action === 'in') zoomMapCentered(1.35);
      else if (action === 'out') zoomMapCentered(1 / 1.35);
      else resetMapView();
    });
  });

  canvas?.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomMapAt(event.clientX, event.clientY, mapView.scale * (event.deltaY < 0 ? 1.18 : 1 / 1.18));
  }, { passive: false });

  canvas?.addEventListener('dblclick', (event) => {
    if (event.target.closest('.network-pin, .network-map-controls, .network-map-detail')) return;
    event.preventDefault();
    zoomMapAt(event.clientX, event.clientY, mapView.scale * 1.5);
  });

  canvas?.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.network-pin, .network-map-controls, .network-map-detail')) return;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mapX: mapView.x,
      mapY: mapView.y
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });

  canvas?.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    mapView.x = dragState.mapX + event.clientX - dragState.startX;
    mapView.y = dragState.mapY + event.clientY - dragState.startY;
    applyMapView();
  });

  function finishMapDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    canvas?.classList.remove('is-dragging');
  }

  canvas?.addEventListener('pointerup', finishMapDrag);
  canvas?.addEventListener('pointercancel', finishMapDrag);
  window.addEventListener('resize', applyMapView, { passive: true });

  updateStatButtons();
  renderMapPins();
  applyMapView();
}

async function renderTransaction(txid) {
  renderLoading('Resolving transaction from Yerbas Core');

  const knownBlock = new URLSearchParams(location.search).get('block');
  const query = knownBlock ? '?block=' + encodeURIComponent(knownBlock) : '';
  const tx = await api('/api/tx/' + encodeURIComponent(txid) + query);

  setRpcState('online', 'Core online');
  document.title = 'Transaction · Yerbas Explorer';

  const inputCount = Array.isArray(tx.vin) ? tx.vin.length : 0;
  const outputs = Array.isArray(tx.vout) ? tx.vout : [];
  const totalOutput = outputs.reduce((sum, vout) => sum + Number(vout.value || 0), 0);
  const maxOutput = Math.max(0.00000001, ...outputs.map((vout) => Number(vout.value || 0)));

  const outputRows = outputs.length
    ? outputs.map((vout) => {
        const level = scaleLevel(Number(vout.value || 0), maxOutput);
        return '<div class="output-rail-row">' +
          '<span class="ledger-index">' + String(vout.n).padStart(2, '0') + '</span>' +
          '<strong>' + number(vout.value, 8) + ' YERB</strong>' +
          '<div class="output-rail-address"><small>YERBAS ADDRESS / SCRIPT</small>' + outputAddresses(vout) + '</div>' +
          '<span class="output-microbar"><i class="level-' + level + '"></i></span>' +
        '</div>';
      }).join('')
    : '<div class="ledger-empty">No outputs returned.</div>';

  const actions = '<a href="/">LIVE CHAIN</a>' +
    (tx.blockhash ? '<a href="/block/' + encodeURIComponent(tx.blockhash) + '">BLOCK ↗</a>' : '');

  app.innerHTML =
    ledgerHeader(tx.confirmations ? 'CONFIRMED TRANSACTION' : 'MEMPOOL TRANSACTION', 'Transaction', tx.txid, actions) +
    telemetryRail([
      { label: 'CONFIRMATIONS', value: number(tx.confirmations), note: tx.confirmations ? 'confirmed' : 'unconfirmed' },
      { label: 'TOTAL OUTPUT', value: number(totalOutput, 8) + ' YERB', note: 'decoded' },
      { label: 'INPUTS', value: number(inputCount), note: 'sources' },
      { label: 'OUTPUTS', value: number(outputs.length), note: 'destinations' },
      { label: 'SIZE', value: bytes(tx.size), note: 'serialized' }
    ]) +
    '<section class="flow-rail">' +
      '<span><small>INPUTS</small><b>' + number(inputCount) + '</b></span>' +
      '<i>→</i>' +
      '<span class="flow-center"><small>TX</small><b>' + number(totalOutput, 8) + ' YERB</b></span>' +
      '<i>→</i>' +
      '<span><small>OUTPUTS</small><b>' + number(outputs.length) + '</b></span>' +
    '</section>' +
    '<section class="ledger-section">' +
      railHeading('VALUE RAIL', 'Transaction outputs', 'scaled by output value') +
      '<div class="output-rail">' + outputRows + '</div>' +
    '</section>' +
    '<details class="raw-ledger"><summary>RAW RPC RESPONSE</summary><pre id="raw-json"></pre></details>';

  document.querySelector('#raw-json').textContent = JSON.stringify(tx, null, 2);
}


async function route() {
  clearNotice();
  const parts = location.pathname.split('/').filter(Boolean);

  try {
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

route();
