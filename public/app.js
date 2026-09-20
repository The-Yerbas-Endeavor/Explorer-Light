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

async function renderHome() {
  document.title = 'Yerbas Explorer Light';
  renderLoading('Reading live blockchain state');

  const [status, blocks] = await Promise.all([
    api('/api/status'),
    api('/api/blocks')
  ]);

  setRpcState('online', 'Core online');

  const latest = blocks[0] || {};
  const maxTransactions = Math.max(1, ...blocks.map((block) => Number(block.transactions || 0)));
  const maxSize = Math.max(1, ...blocks.map((block) => Number(block.size || 0)));

  const cards = [
    metricCard('01', 'Block height', number(status.blocks), status.chain || 'mainnet'),
    metricCard('02', 'Difficulty', number(status.difficulty, 4), 'network target'),
    metricCard('03', 'Connections', number(status.network?.connections), 'active peers'),
    metricCard('04', 'Mempool', number(status.mempool?.transactions), bytes(status.mempool?.bytes))
  ].join('');

  const pulse = blocks.slice(0, 12).reverse().map((block) => {
    const activity = Number(block.transactions || 0) + (Number(block.size || 0) / maxSize) * maxTransactions;
    const level = scaleLevel(activity, maxTransactions * 2);
    return '<a class="pulse-bar level-' + level + '" href="/block/' + block.height + '" title="Block ' +
      esc(block.height) + ' · ' + number(block.transactions) + ' transactions"><span></span></a>';
  }).join('');

  const blockCards = blocks.map((block, index) => {
    const activity = Number(block.transactions || 0) + (Number(block.size || 0) / maxSize) * maxTransactions;
    const level = scaleLevel(activity, maxTransactions * 2);
    return '<a class="block-card" href="/block/' + block.height + '">' +
      '<div class="block-card-top">' +
        '<span class="block-sequence">' + (index === 0 ? 'CHAIN TIP' : '−' + number(index)) + '</span>' +
        '<span class="block-age">' + esc(timeAgo(block.time)) + '</span>' +
      '</div>' +
      '<strong class="block-card-height">#' + number(block.height) + '</strong>' +
      '<span class="block-card-hash mono">' + esc(compactHash(block.hash)) + '</span>' +
      '<div class="block-card-meta">' +
        '<span><small>TX</small><b>' + number(block.transactions) + '</b></span>' +
        '<span><small>SIZE</small><b>' + bytes(block.size) + '</b></span>' +
      '</div>' +
      '<div class="activity-meter" aria-hidden="true"><span class="meter-fill level-' + level + '"></span></div>' +
    '</a>';
  }).join('');

  app.innerHTML =
    '<section class="cockpit-grid">' +
      '<article class="tip-card">' +
        '<div class="tip-card-label"><span class="live-dot"></span> LIVE CHAIN TIP</div>' +
        '<div class="tip-height">#' + number(status.blocks) + '</div>' +
        '<div class="tip-context">' +
          '<span>' + esc(status.chain || 'mainnet') + '</span>' +
          '<span>' + (latest.time ? esc(timeAgo(latest.time)) : 'waiting for block') + '</span>' +
        '</div>' +
        '<a class="tip-hash mono" href="' + (latest.height !== undefined ? '/block/' + latest.height : '/') + '">' +
          esc(latest.hash ? compactHash(latest.hash) : 'Yerbas Core connected') +
        '</a>' +
      '</article>' +
      '<article class="pulse-card">' +
        '<div class="pulse-head"><div><span>NETWORK RHYTHM</span><strong>Last ' + number(blocks.length) + ' blocks</strong></div>' +
          '<span class="pulse-caption">activity / block</span></div>' +
        '<div class="pulse-chart">' + pulse + '</div>' +
        '<div class="pulse-foot"><span>older</span><span>live tip</span></div>' +
      '</article>' +
    '</section>' +
    '<section class="metric-strip modern-metrics">' + cards + '</section>' +
    '<section class="section-intro">' +
      '<div><p class="eyebrow">LIVE BLOCK STREAM</p><h2>What the chain is doing now</h2></div>' +
      '<p>Each tile is a confirmed block. Activity bars combine transaction count and block size so busy blocks stand out instantly.</p>' +
    '</section>' +
    '<section class="block-card-grid">' + blockCards + '</section>';
}


async function renderBlock(identifier) {
  renderLoading('Resolving block from Yerbas Core');
  const block = await api('/api/block/' + encodeURIComponent(identifier));
  setRpcState('online', 'Core online');
  document.title = 'Block ' + block.height + ' · Yerbas Explorer Light';

  const transactions = Array.isArray(block.tx) ? block.tx : [];
  const txCards = transactions.length
    ? transactions.map((txid, index) =>
        '<a class="tx-chip-card" href="/tx/' + encodeURIComponent(txid) + '?block=' + encodeURIComponent(block.hash) + '">' +
          '<span class="tx-chip-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<span><small>TRANSACTION</small><strong class="mono">' + esc(compactHash(txid)) + '</strong></span>' +
          '<span class="tx-chip-arrow">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="empty-state">No transaction IDs were returned for this block.</div>';

  const metrics = [
    metricCard('01', 'Confirmations', number(block.confirmations), 'buried in the active chain'),
    metricCard('02', 'Transactions', number(transactions.length), 'ledger entries'),
    metricCard('03', 'Block size', bytes(block.size), 'serialized block'),
    metricCard('04', 'Difficulty', number(block.difficulty, 8), 'network target')
  ].join('');

  const actions = '<a class="text-link" href="/">← Live chain</a>';

  app.innerHTML =
    recordHero('Confirmed ledger object', 'Block #' + number(block.height), block.hash, 'BLK', actions) +
    '<section class="metric-strip modern-metrics">' + metrics + '</section>' +
    '<section class="chain-route">' +
      '<a class="chain-route-node' + (block.previousblockhash ? '' : ' disabled') + '" ' +
        (block.previousblockhash ? 'href="/block/' + encodeURIComponent(block.previousblockhash) + '"' : '') + '>' +
        '<small>PREVIOUS</small><strong>' + (block.previousblockhash ? esc(compactHash(block.previousblockhash)) : 'GENESIS') + '</strong>' +
      '</a>' +
      '<div class="chain-route-current"><span>BLOCK</span><strong>#' + number(block.height) + '</strong><small>' + esc(isoTime(block.time)) + '</small></div>' +
      '<a class="chain-route-node' + (block.nextblockhash ? '' : ' disabled') + '" ' +
        (block.nextblockhash ? 'href="/block/' + encodeURIComponent(block.nextblockhash) + '"' : '') + '>' +
        '<small>NEXT</small><strong>' + (block.nextblockhash ? esc(compactHash(block.nextblockhash)) : 'CHAIN TIP') + '</strong>' +
      '</a>' +
    '</section>' +
    '<section class="section-intro compact">' +
      '<div><p class="eyebrow">BLOCK CONTENTS</p><h2>' + number(transactions.length) + ' transactions</h2></div>' +
      '<p>Open any transaction to follow its value flow and destination outputs.</p>' +
    '</section>' +
    '<section class="tx-chip-grid">' + txCards + '</section>';
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
  document.title = 'Address ' + data.address + ' · Yerbas Explorer Light';

  const balance = data.history?.balance;
  const txids = Array.isArray(data.history?.txids) ? data.history.txids : [];
  const utxos = Array.isArray(data.history?.utxos) ? data.history.utxos : [];
  const assetBalances = data.assets?.available && data.assets?.balances && typeof data.assets.balances === 'object'
    ? Object.entries(data.assets.balances)
    : [];

  const cards = [
    metricCard('01', 'Balance', yerb(balance?.balanceYerb) + ' YERB', 'current indexed balance'),
    metricCard('02', 'Total received', yerb(balance?.receivedYerb) + ' YERB', 'lifetime received'),
    metricCard('03', 'Transactions', number(txids.length), 'indexed activity'),
    metricCard('04', 'UTXOs', number(utxos.length), 'currently unspent')
  ].join('');

  const txCards = txids.length
    ? txids.slice(0, 24).map((txid, index) =>
        '<a class="activity-row" href="/tx/' + encodeURIComponent(txid) + '">' +
          '<span class="activity-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<span><small>TRANSACTION</small><strong class="mono">' + esc(compactHash(txid)) + '</strong></span>' +
          '<span class="activity-arrow">↗</span>' +
        '</a>'
      ).join('')
    : '<div class="empty-state">No indexed transactions returned for this address.</div>';

  const utxoCards = utxos.length
    ? utxos.slice(0, 16).map((utxo) =>
        '<a class="utxo-card" href="/tx/' + encodeURIComponent(utxo.txid) + '">' +
          '<div><span>UNSPENT OUTPUT</span><strong>' + yerb(Number(utxo.satoshis || 0) / 100000000) + ' <small>YERB</small></strong></div>' +
          '<div class="utxo-meta"><span>vout ' + number(utxo.outputIndex) + '</span><span>block ' + number(utxo.height) + '</span></div>' +
          '<code>' + esc(compactHash(utxo.txid)) + '</code>' +
        '</a>'
      ).join('')
    : '<div class="empty-state">No unspent outputs returned for this address.</div>';

  const assetCards = assetBalances.length
    ? assetBalances.map(([name, amount]) =>
        '<a class="portfolio-card" href="/asset/' + encodeURIComponent(name) + '">' +
          '<span class="portfolio-type">' + esc(assetType(name)) + '</span>' +
          '<strong>' + esc(name) + '</strong>' +
          '<span class="portfolio-balance">' + esc(amount) + '</span>' +
        '</a>'
      ).join('')
    : '<div class="empty-state">No indexed asset balances for this address.</div>';

  const historyNotice = data.history?.available
    ? ''
    : '<section class="notice error">Core recognized this address, but indexed address history is not currently available.</section>';

  const actions = '<a class="text-link" href="/">← Live chain</a>';

  app.innerHTML =
    recordHero('Native address index', 'Address portfolio', data.address, 'ADR', actions) +
    historyNotice +
    '<section class="balance-stage">' +
      '<article class="balance-focus">' +
        '<span>CURRENT YERB BALANCE</span>' +
        '<strong>' + yerb(balance?.balanceYerb) + '</strong>' +
        '<small>YERB</small>' +
      '</article>' +
      '<article class="balance-side">' +
        visualFact('Total received', yerb(balance?.receivedYerb) + ' YERB', 'indexed lifetime flow') +
        visualFact('Asset positions', number(assetBalances.length), 'native assets held') +
      '</article>' +
    '</section>' +
    '<section class="metric-strip modern-metrics">' + cards + '</section>' +
    '<section class="section-intro compact"><div><p class="eyebrow">PORTFOLIO</p><h2>Native asset positions</h2></div>' +
      '<p>Holdings reported directly by Core assetindex.</p></section>' +
    '<section class="portfolio-grid">' + assetCards + '</section>' +
    '<section class="two-column-flow">' +
      '<div><div class="section-intro mini"><div><p class="eyebrow">ACTIVITY</p><h2>Recent transactions</h2></div></div>' +
        '<div class="activity-list">' + txCards + '</div></div>' +
      '<div><div class="section-intro mini"><div><p class="eyebrow">AVAILABLE VALUE</p><h2>Unspent outputs</h2></div></div>' +
        '<div class="utxo-grid">' + utxoCards + '</div></div>' +
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
  document.title = 'Yerbas Assets · Explorer Light';

  const assetCards = data.items.length
    ? data.items.map((asset) =>
        '<a class="asset-discovery-card" href="/asset/' + encodeURIComponent(asset.name) + '">' +
          '<div class="asset-discovery-top">' +
            '<span class="asset-badge no-margin">' + esc(asset.type || assetType(asset.name)) + '</span>' +
            '<span class="asset-live-dot">INDEXED</span>' +
          '</div>' +
          '<strong class="asset-discovery-name">' + esc(asset.name) + '</strong>' +
          '<div class="asset-discovery-stats">' +
            '<span><small>SUPPLY</small><b>' + assetAmount(asset.amount, asset.units) + '</b></span>' +
            '<span><small>HOLDERS</small><b>' + (asset.holders === null ? '—' : number(asset.holders)) + '</b></span>' +
            '<span><small>UNITS</small><b>' + number(asset.units) + '</b></span>' +
          '</div>' +
          '<div class="asset-discovery-foot">' +
            '<span>' + (asset.metadataRef?.value ? 'METADATA +' : 'NO METADATA') + '</span>' +
            '<span>' + (Number(asset.reissuable) ? 'REISSUABLE' : 'FIXED') + '</span>' +
            '<b>OPEN ↗</b>' +
          '</div>' +
        '</a>'
      ).join('')
    : '<div class="empty-state wide">No assets matched these filters.</div>';

  const pagination =
    '<div class="asset-pagination modern-pagination">' +
      (data.page > 1
        ? '<a class="text-link" href="' + assetListHref(params, data.page - 1) + '">← Previous</a>'
        : '<span></span>') +
      '<span class="page-status">Page ' + number(data.page) + ' of ' + number(data.totalPages) + '</span>' +
      (data.page < data.totalPages
        ? '<a class="text-link" href="' + assetListHref(params, data.page + 1) + '">Next →</a>'
        : '<span></span>') +
    '</div>';

  const summaryCards = [
    metricCard('01', 'Index status', 'LIVE', 'native Core assetindex'),
    metricCard('02', 'Assets', number(data.total), query || type || metadata || reissuable ? 'matching this view' : 'current directory'),
    metricCard('03', 'Holders', '…', 'aggregate scan loading'),
    metricCard('04', 'Index read', 'NOW', 'direct RPC')
  ].join('');

  const actions = '<a class="text-link" href="/">← Live chain</a>';

  app.innerHTML =
    recordHero('Native asset layer', 'Asset universe', number(data.total) + ' indexed assets', 'AST', actions) +
    '<section id="asset-summary" class="metric-strip modern-metrics">' + summaryCards + '</section>' +
    '<section class="filter-surface">' +
      '<div class="filter-surface-title"><p class="eyebrow">DISCOVER ASSETS</p><h2>Search the on-chain catalog</h2></div>' +
      '<form class="asset-filter-grid" action="/assets" method="get" role="search">' +
        '<input name="q" value="' + esc(query) + '" autocomplete="off" spellcheck="false" placeholder="Search asset names">' +
        '<select name="type" aria-label="Asset type">' +
          '<option value="">All types</option>' +
          ['Root','Sub-asset','Unique','Qualifier','Restricted','Owner'].map((value) =>
            '<option value="' + value + '"' + (type === value ? ' selected' : '') + '>' + value + '</option>'
          ).join('') +
        '</select>' +
        '<select name="metadata" aria-label="Metadata">' +
          '<option value="">Any metadata</option>' +
          '<option value="yes"' + (metadata === 'yes' ? ' selected' : '') + '>Has metadata</option>' +
          '<option value="no"' + (metadata === 'no' ? ' selected' : '') + '>No metadata</option>' +
        '</select>' +
        '<select name="reissuable" aria-label="Reissuable">' +
          '<option value="">Any reissuability</option>' +
          '<option value="yes"' + (reissuable === 'yes' ? ' selected' : '') + '>Reissuable</option>' +
          '<option value="no"' + (reissuable === 'no' ? ' selected' : '') + '>Not reissuable</option>' +
        '</select>' +
        '<select name="sort" aria-label="Sort">' +
          '<option value="name"' + (sort === 'name' ? ' selected' : '') + '>Name</option>' +
          '<option value="supply-desc"' + (sort === 'supply-desc' ? ' selected' : '') + '>Supply: high to low</option>' +
          '<option value="supply-asc"' + (sort === 'supply-asc' ? ' selected' : '') + '>Supply: low to high</option>' +
        '</select>' +
        '<button type="submit">Explore</button>' +
      '</form>' +
    '</section>' +
    '<section class="section-intro compact"><div><p class="eyebrow">ASSET DIRECTORY</p><h2>' + number(data.items.length) + ' assets on this page</h2></div>' +
      '<p>Open a card for supply, metadata, issuance details, and holder distribution.</p></section>' +
    '<section class="asset-discovery-grid">' + assetCards + '</section>' +
    pagination;

  api('/api/assets/stats').then((stats) => {
    const summary = document.querySelector('#asset-summary');
    if (!summary) return;
    summary.innerHTML = [
      metricCard('01', 'Index status', stats.ready ? 'LIVE' : 'CHECK', 'native Core assetindex'),
      metricCard('02', 'Assets', number(stats.indexedAssets), 'whole asset directory'),
      metricCard('03', 'Holders', number(stats.indexedHolders), 'asset/address relationships'),
      metricCard('04', 'Index read', 'NOW', 'direct RPC')
    ].join('');
  }).catch(() => {
    // The page remains useful even if the aggregate holder-count scan is slow.
  });
}


async function renderAsset(name) {
  renderLoading('Reading asset data from Yerbas Core');

  const data = await api('/api/asset/' + encodeURIComponent(name));
  setRpcState('online', 'Core online');
  document.title = data.name + ' · Asset · Yerbas Explorer Light';

  const metadata = data.metadata || {};
  const holders = data.holders?.items || [];
  const supply = Number(metadata.amount || 0);

  const holderData = holders.map((holder, index) => {
    const balance = Number(holder.balance || 0);
    const ownership = supply > 0 ? (balance / supply) * 100 : 0;
    return { holder, index, balance, ownership };
  });
  const maxOwnership = Math.max(0.000001, ...holderData.map((entry) => entry.ownership));

  const holderCards = holderData.length
    ? holderData.map(({ holder, index, ownership }) => {
        const level = scaleLevel(ownership, maxOwnership);
        return '<a class="holder-card" href="/address/' + encodeURIComponent(holder.address) + '">' +
          '<span class="holder-rank">#' + number(index + 1) + '</span>' +
          '<span class="holder-address mono">' + esc(compactMiddle(holder.address, 12, 10)) + '</span>' +
          '<strong>' + assetAmount(holder.balance, metadata.units) + '</strong>' +
          '<span class="holder-percent">' + ownership.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%</span>' +
          '<div class="ownership-meter"><span class="meter-fill level-' + level + '"></span></div>' +
        '</a>';
      }).join('')
    : '<div class="empty-state">' + esc(data.holders?.unavailableReason || 'No holder balances returned for this asset.') + '</div>';

  const ipfsHash = metadata.ipfs_hash || null;
  const txidHash = metadata.txid_hash || metadata.txid || null;
  const metadataValue = ipfsHash || txidHash || null;
  const metadataType = ipfsHash ? 'IPFS' : (txidHash ? 'TXID' : null);
  const ipfsUrl = ipfsHash ? 'https://ipfs.io/ipfs/' + encodeURIComponent(ipfsHash) : null;

  const cards = [
    metricCard('01', 'Supply', assetAmount(metadata.amount, metadata.units), 'current issued amount'),
    metricCard('02', 'Units', number(metadata.units), 'decimal precision'),
    metricCard('03', 'Holders', data.holders?.total === null ? '—' : number(data.holders?.total), 'indexed addresses'),
    metricCard('04', 'Reissuable', Number(metadata.reissuable) ? 'YES' : 'NO', assetType(data.name) + ' asset')
  ].join('');

  const metadataSection = metadataValue
    ? '<section class="panel modern-panel">' +
        panelHeading('AS2', metadataType + ' metadata', metadataType + ' Content', metadataType === 'IPFS' ? 'public gateway' : 'on-chain reference') +
        '<div class="asset-metadata-content">' +
          (ipfsUrl
            ? '<div class="ipfs-preview"><iframe sandbox title="' + esc(data.name) + ' IPFS preview" loading="lazy" src="' + ipfsUrl + '"></iframe></div>' +
              '<div class="ipfs-actions"><a class="text-link" href="' + ipfsUrl + '" target="_blank" rel="noopener noreferrer">Open IPFS content ↗</a></div>'
            : (/^[0-9a-fA-F]{64}$/.test(txidHash || '')
              ? '<a class="text-link" href="/tx/' + encodeURIComponent(txidHash) + '">Open metadata transaction</a>'
              : '')) +
          '<code class="metadata-hash">' + esc(metadataValue) + '</code>' +
        '</div>' +
      '</section>'
    : '';

  const actions = '<a class="text-link" href="/assets">← Asset universe</a><a class="text-link" href="/">Live chain</a>';

  app.innerHTML =
    recordHero('Native Core asset', data.name, assetType(data.name) + ' · on-chain asset', 'AST', actions) +
    '<section class="metric-strip modern-metrics">' + cards + '</section>' +
    '<section class="asset-snapshot-grid">' +
      visualFact('Asset type', assetType(data.name), 'namespace classification') +
      visualFact('Supply', assetAmount(metadata.amount, metadata.units), 'current issued amount') +
      visualFact('Precision', number(metadata.units) + ' units', 'decimal places') +
      visualFact('Issuance block', data.issuance?.blockHeight !== null && data.issuance?.blockHeight !== undefined ? number(data.issuance.blockHeight) : '—', 'origin on chain') +
      visualFact('Reissuable', Number(metadata.reissuable) ? 'YES' : 'NO', 'supply policy') +
      visualFact('Metadata', metadataType || 'NONE', metadataValue ? 'external/on-chain reference' : 'no metadata pointer') +
    '</section>' +
    metadataSection +
    '<section class="section-intro compact"><div><p class="eyebrow">OWNERSHIP MAP</p><h2>Top asset holders</h2></div>' +
      '<p>Bars are scaled against the largest visible holder so concentration is readable at a glance.</p></section>' +
    '<section class="holder-list">' + holderCards + '</section>' +
    (data.holders?.total > holders.length
      ? '<div class="panel-foot modern-foot">Showing first ' + number(holders.length) + ' indexed holders of ' + number(data.holders.total) + '.</div>'
      : '');
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
  renderLoading('Reading active smartnodes from Yerbas Core');

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
  document.title = 'Yerbas Smartnodes · Explorer Light';

  const collateralOptions = Object.entries(data.collateralCounts || {})
    .filter(([amount]) => amount !== 'unknown')
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([amount, count]) =>
      '<option value="' + esc(amount) + '"' +
      (request.get('collateral') === amount ? ' selected' : '') +
      '>' + number(amount) + ' YERB (' + number(count) + ')</option>'
    ).join('');

  const rows = data.items.length
    ? data.items.map((node) => {
        const paid = Number(node.lastPaidTime || 0);
        const registered = Number(node.registeredTime || 0);
        const payout = node.payoutAddress
          ? '<a class="mono smartnode-address" title="' + esc(node.payoutAddress) + '" href="/address/' +
              encodeURIComponent(node.payoutAddress) + '">' + esc(compactMiddle(node.payoutAddress, 10, 7)) + '</a>'
          : '<span class="muted">—</span>';

        const lastPaidCell =
          '<div class="cell-primary">' + (paid > 0 ? esc(isoTime(paid)) : 'Never') + '</div>' +
          '<div class="row-sub">Block ' + number(node.lastPaidBlock) + '</div>';

        const poseCell =
          '<div class="cell-primary">Penalty ' + number(node.PoSePenalty) + '</div>' +
          '<div class="row-sub">Ban ' +
            (Number(node.PoSeBanHeight) >= 0 ? number(node.PoSeBanHeight) : '—') + '</div>';

        const registeredCell =
          '<div class="cell-primary">' +
            (registered > 0
              ? esc(isoTime(registered))
              : (node.registeredHeight !== null ? 'Block ' + number(node.registeredHeight) : '—')) +
          '</div>' +
          (registered > 0 && node.registeredHeight !== null
            ? '<div class="row-sub">Block ' + number(node.registeredHeight) + '</div>'
            : '');

        return '<tr>' +
          '<td class="pay-age-cell">' + (node.paymentAgeRank === null ? '—' : number(node.paymentAgeRank)) + '</td>' +
          '<td><span class="mono service-value" title="' + esc(shortService(node.service)) + '">' +
              esc(shortService(node.service)) + '</span>' +
            '<div class="row-sub mono" title="' + esc(node.proTxHash || node.outpoint || '') + '">' +
              esc(compactHash(node.proTxHash || node.outpoint)) + '</div></td>' +
          '<td>' + payout + '</td>' +
          '<td><span class="collateral-value">' +
            (node.collateralAmount === null ? '—' : number(node.collateralAmount)) +
            '</span><div class="row-sub">YERB</div></td>' +
          '<td>' + lastPaidCell + '</td>' +
          '<td>' + poseCell + '</td>' +
          '<td>' + registeredCell + '</td>' +
          '<td><span class="smartnode-status ' + smartnodeStatusClass(node.status) + '">' + esc(node.status) + '</span></td>' +
        '</tr>';
      }).join('')
    : '<tr><td colspan="8" class="muted">No smartnodes matched these filters.</td></tr>';

  const pageLinks =
    '<div class="asset-pagination">' +
      (data.page > 1
        ? '<a class="text-link" href="' + smartnodeListHref(params, data.page - 1) + '">← Previous</a>'
        : '<span></span>') +
      '<span class="page-status">Page ' + number(data.page) + ' of ' + number(data.totalPages) + '</span>' +
      (data.page < data.totalPages
        ? '<a class="text-link" href="' + smartnodeListHref(params, data.page + 1) + '">Next →</a>'
        : '<span></span>') +
    '</div>';

  const enabled = Number(data.network?.enabled || 0);
  const total = Number(data.network?.total || 0);
  const poseBanned = Number(data.network?.poseBanned || 0);
  const enabledPct = total > 0 ? Math.max(0, Math.min(100, (enabled / total) * 100)) : 0;
  const disabledPct = Math.max(0, 100 - enabledPct);

  const collateralCards = Object.entries(data.collateralCounts || {})
    .filter(([amount]) => amount !== 'unknown')
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .slice(0, 8)
    .map(([amount, count]) =>
      '<article class="collateral-card"><span>' + number(amount) + ' YERB</span><strong>' + number(count) + '</strong><small>nodes</small></article>'
    ).join('');

  app.innerHTML =
    recordHero('Deterministic service layer', 'Smartnode network', number(enabled) + ' enabled · ' + number(total) + ' registered', 'SN', '<a class="text-link" href="/node-map?view=smartnodes">Open network map ↗</a><a class="text-link" href="/">Live chain</a>') +
    '<section class="network-health-grid">' +
      '<article class="network-ring-card">' +
        '<div class="network-ring-wrap">' +
          '<svg class="network-ring" viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle cx="60" cy="60" r="48" pathLength="100" class="ring-track"></circle>' +
            '<circle cx="60" cy="60" r="48" pathLength="100" class="ring-value" stroke-dasharray="' + enabledPct.toFixed(2) + ' ' + disabledPct.toFixed(2) + '" transform="rotate(-90 60 60)"></circle>' +
          '</svg>' +
          '<div class="network-ring-label"><strong>' + enabledPct.toFixed(1) + '%</strong><span>ENABLED</span></div>' +
        '</div>' +
        '<div class="network-ring-copy"><span>NETWORK HEALTH</span><h3>' + number(enabled) + ' active smartnodes</h3><p>Deterministic nodes currently reported ENABLED by Yerbas Core.</p></div>' +
      '</article>' +
      '<article class="network-status-card">' +
        visualFact('Registered', number(total), 'deterministic records') +
        visualFact('PoSe banned', number(poseBanned), 'current Core state') +
        visualFact('Protocol', data.protocolVersion === null ? '—' : number(data.protocolVersion), 'local network protocol') +
      '</article>' +
    '</section>' +
    '<section class="section-intro compact"><div><p class="eyebrow">COLLATERAL LANDSCAPE</p><h2>Node tiers on the network</h2></div>' +
      '<p>Live collateral distribution from the deterministic smartnode set.</p></section>' +
    '<section class="collateral-grid">' + (collateralCards || '<div class="empty-state">No collateral distribution returned.</div>') + '</section>' +
    '<section class="panel modern-panel smartnode-directory-panel">' +
      '<div class="asset-toolbar smartnode-toolbar">' +
        '<div><p class="eyebrow">SMARTNODE DIRECTORY</p><h2>' + number(data.total) + ' matching nodes</h2></div>' +
        '<form class="asset-filter-grid smartnode-filter" action="/smartnodes" method="get" role="search">' +
          '<input name="q" value="' + esc(request.get('q')) + '" autocomplete="off" spellcheck="false" placeholder="IP, payout address, ProTx hash…">' +
          '<select name="status" aria-label="Status">' +
            '<option value="ENABLED"' + (request.get('status') === 'ENABLED' ? ' selected' : '') + '>Active / ENABLED</option>' +
            '<option value="ALL"' + (request.get('status') === 'ALL' ? ' selected' : '') + '>All statuses</option>' +
            '<option value="POSE_BANNED"' + (request.get('status') === 'POSE_BANNED' ? ' selected' : '') + '>PoSe banned</option>' +
          '</select>' +
          '<select name="collateral" aria-label="Collateral">' +
            '<option value="">All collateral</option>' + collateralOptions +
          '</select>' +
          '<select name="sort" aria-label="Sort">' +
            '<option value="pay-age-asc"' + (request.get('sort') === 'pay-age-asc' ? ' selected' : '') + '>Pay age: oldest first</option>' +
            '<option value="pay-age-desc"' + (request.get('sort') === 'pay-age-desc' ? ' selected' : '') + '>Pay age: newest first</option>' +
            '<option value="service-asc"' + (request.get('sort') === 'service-asc' ? ' selected' : '') + '>Service: A → Z</option>' +
            '<option value="service-desc"' + (request.get('sort') === 'service-desc' ? ' selected' : '') + '>Service: Z → A</option>' +
            '<option value="payout-asc"' + (request.get('sort') === 'payout-asc' ? ' selected' : '') + '>Payout: A → Z</option>' +
            '<option value="payout-desc"' + (request.get('sort') === 'payout-desc' ? ' selected' : '') + '>Payout: Z → A</option>' +
            '<option value="collateral-asc"' + (request.get('sort') === 'collateral-asc' ? ' selected' : '') + '>Collateral: low → high</option>' +
            '<option value="collateral-desc"' + (request.get('sort') === 'collateral-desc' ? ' selected' : '') + '>Collateral: high → low</option>' +
            '<option value="last-paid-asc"' + (request.get('sort') === 'last-paid-asc' ? ' selected' : '') + '>Last paid: oldest first</option>' +
            '<option value="last-paid-desc"' + (request.get('sort') === 'last-paid-desc' ? ' selected' : '') + '>Last paid: newest first</option>' +
            '<option value="pose-asc"' + (request.get('sort') === 'pose-asc' ? ' selected' : '') + '>PoSe: low → high</option>' +
            '<option value="pose-desc"' + (request.get('sort') === 'pose-desc' ? ' selected' : '') + '>PoSe: high → low</option>' +
            '<option value="registered-asc"' + (request.get('sort') === 'registered-asc' ? ' selected' : '') + '>Registered: oldest first</option>' +
            '<option value="registered-desc"' + (request.get('sort') === 'registered-desc' ? ' selected' : '') + '>Registered: newest first</option>' +
            '<option value="status-asc"' + (request.get('sort') === 'status-asc' ? ' selected' : '') + '>Status: A → Z</option>' +
            '<option value="status-desc"' + (request.get('sort') === 'status-desc' ? ' selected' : '') + '>Status: Z → A</option>' +
          '</select>' +
          '<button type="submit">Filter</button>' +
        '</form>' +
      '</div>' +
      '<div class="smartnode-note"><strong>Pay age rank</strong> is an informational ordering by oldest last-paid block among currently ENABLED nodes. It is not a prediction of the next payment winner.</div>' +
      '<div class="table-wrap">' +
        '<table class="smartnode-table">' +
          '<thead><tr>' +
            '<th>' + smartnodeSortHeader('Pay age', 'pay-age', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('Service / ProTx', 'service', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('Payout address', 'payout', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('Collateral', 'collateral', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('Last paid / block', 'last-paid', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('PoSe / ban', 'pose', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('Registered', 'registered', request.get('sort')) + '</th>' +
            '<th>' + smartnodeSortHeader('Status', 'status', request.get('sort')) + '</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
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
  document.title = 'Yerbas Network Map · Explorer Light';

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
  document.title = 'Transaction · Yerbas Explorer Light';

  const inputCount = Array.isArray(tx.vin) ? tx.vin.length : 0;
  const outputs = Array.isArray(tx.vout) ? tx.vout : [];
  const totalOutput = outputs.reduce((sum, vout) => sum + Number(vout.value || 0), 0);
  const maxOutput = Math.max(0.00000001, ...outputs.map((vout) => Number(vout.value || 0)));

  const outputCards = outputs.length
    ? outputs.map((vout) => {
        const level = scaleLevel(Number(vout.value || 0), maxOutput);
        return '<article class="output-card">' +
          '<div class="output-card-head"><span>OUTPUT ' + number(vout.n) + '</span><strong>' + number(vout.value, 8) + ' YERB</strong></div>' +
          '<div class="output-destination">' + outputAddresses(vout) + '</div>' +
          '<div class="value-meter"><span class="meter-fill level-' + level + '"></span></div>' +
        '</article>';
      }).join('')
    : '<div class="empty-state">No outputs were returned for this transaction.</div>';

  const metrics = [
    metricCard('01', 'Confirmations', number(tx.confirmations), tx.confirmations ? 'confirmed on chain' : 'mempool / unconfirmed'),
    metricCard('02', 'Total output', number(totalOutput, 8) + ' YERB', 'sum of decoded outputs'),
    metricCard('03', 'Inputs', number(inputCount), 'value sources'),
    metricCard('04', 'Outputs', number(outputs.length), bytes(tx.size))
  ].join('');

  const actions = '<a class="text-link" href="/">← Live chain</a>' +
    (tx.blockhash ? '<a class="text-link" href="/block/' + encodeURIComponent(tx.blockhash) + '">Open block ↗</a>' : '');

  app.innerHTML =
    recordHero(tx.confirmations ? 'Confirmed transaction' : 'Mempool transaction', 'Value transfer', tx.txid, 'TX', actions) +
    '<section class="metric-strip modern-metrics">' + metrics + '</section>' +
    '<section class="value-flow">' +
      '<article class="flow-node source"><span>INPUTS</span><strong>' + number(inputCount) + '</strong><small>sources</small></article>' +
      '<div class="flow-line"><span></span><b>→</b></div>' +
      '<article class="flow-node transaction"><span>TRANSACTION</span><strong>' + number(totalOutput, 8) + '</strong><small>YERB decoded output</small></article>' +
      '<div class="flow-line"><span></span><b>→</b></div>' +
      '<article class="flow-node destination"><span>OUTPUTS</span><strong>' + number(outputs.length) + '</strong><small>destinations</small></article>' +
    '</section>' +
    '<section class="section-intro compact"><div><p class="eyebrow">VALUE DISTRIBUTION</p><h2>Where the transaction goes</h2></div>' +
      '<p>Bar lengths are scaled to the largest output in this transaction.</p></section>' +
    '<section class="output-grid">' + outputCards + '</section>' +
    '<details class="panel raw modern-panel">' +
      '<summary>Raw RPC response</summary>' +
      '<pre id="raw-json"></pre>' +
    '</details>';

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
