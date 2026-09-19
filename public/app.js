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

  const cards = [
    metricCard('01', 'Block height', number(status.blocks), status.chain || 'mainnet'),
    metricCard('02', 'Difficulty', number(status.difficulty, 4), 'network target'),
    metricCard('03', 'Connections', number(status.network?.connections), 'active peers'),
    metricCard('04', 'Mempool', number(status.mempool?.transactions), bytes(status.mempool?.bytes))
  ].join('');

  const rows = blocks.map((block) =>
    '<tr>' +
      '<td><a class="height-link" href="/block/' + block.height + '">' + number(block.height) + '</a></td>' +
      '<td>' + esc(timeAgo(block.time)) + '</td>' +
      '<td>' + number(block.transactions) + '</td>' +
      '<td>' + bytes(block.size) + '</td>' +
      '<td>' + hashLink('block', block.hash) + '</td>' +
    '</tr>'
  ).join('');

  app.innerHTML =
    '<section class="metric-strip">' + cards + '</section>' +
    '<section class="panel">' +
      panelHeading('A1', 'Live block stream', 'Recent blocks', 'Yerbas Core · direct') +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr><th>Height</th><th>Age</th><th>Transactions</th><th>Size</th><th>Block hash</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>';
}

async function renderBlock(identifier) {
  renderLoading('Resolving block from Yerbas Core');
  const block = await api('/api/block/' + encodeURIComponent(identifier));
  setRpcState('online', 'Core online');
  document.title = 'Block ' + block.height + ' · Yerbas Explorer Light';

  const txRows = (block.tx || []).map((txid, index) =>
    '<tr>' +
      '<td>' + number(index + 1) + '</td>' +
      '<td><a class="mono break" href="/tx/' + encodeURIComponent(txid) +
        '?block=' + encodeURIComponent(block.hash) + '">' + esc(txid) + '</a></td>' +
    '</tr>'
  ).join('');

  app.innerHTML =
    '<section class="detail-hero">' +
      '<div class="detail-kicker">Block record / confirmed ledger entry</div>' +
      '<h2>#' + number(block.height) + '</h2>' +
      '<div class="detail-hash">' + esc(block.hash) + '</div>' +
      '<div class="detail-actions"><a class="text-link" href="/">← Back to live chain</a></div>' +
    '</section>' +

    '<section class="panel">' +
      panelHeading('B1', 'Block anatomy', 'Chain data', number(block.confirmations) + ' confirmations') +
      '<dl class="detail-grid">' +
        '<dt>Block hash</dt><dd class="mono break">' + esc(block.hash) + '</dd>' +
        '<dt>Confirmations</dt><dd>' + number(block.confirmations) + '</dd>' +
        '<dt>Timestamp</dt><dd>' + esc(isoTime(block.time)) + '</dd>' +
        '<dt>Transactions</dt><dd>' + number(block.tx?.length) + '</dd>' +
        '<dt>Size</dt><dd>' + bytes(block.size) + '</dd>' +
        '<dt>Difficulty</dt><dd>' + number(block.difficulty, 8) + '</dd>' +
        '<dt>Previous block</dt><dd>' +
          (block.previousblockhash ? hashLink('block', block.previousblockhash, block.previousblockhash) : 'Genesis') +
        '</dd>' +
        '<dt>Next block</dt><dd>' +
          (block.nextblockhash ? hashLink('block', block.nextblockhash, block.nextblockhash) : 'Current tip') +
        '</dd>' +
      '</dl>' +
    '</section>' +

    '<section class="panel">' +
      panelHeading('B2', 'Block contents', 'Transactions', number(block.tx?.length) + ' total') +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr><th>#</th><th>Transaction ID</th></tr></thead>' +
          '<tbody>' + txRows + '</tbody>' +
        '</table>' +
      '</div>' +
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
  document.title = 'Address ' + data.address + ' · Yerbas Explorer Light';

  const balance = data.history?.balance;
  const txids = Array.isArray(data.history?.txids) ? data.history.txids : [];
  const utxos = Array.isArray(data.history?.utxos) ? data.history.utxos : [];
  const assetBalances = data.assets?.available && data.assets?.balances && typeof data.assets.balances === 'object'
    ? Object.entries(data.assets.balances)
    : [];

  const cards = [
    metricCard('01', 'Balance', yerb(balance?.balanceYerb) + ' YERB', 'current spendable index balance'),
    metricCard('02', 'Total received', yerb(balance?.receivedYerb) + ' YERB', 'including change'),
    metricCard('03', 'Transactions', number(txids.length), 'latest indexed transactions'),
    metricCard('04', 'UTXOs', number(utxos.length), 'unspent outputs returned')
  ].join('');

  const txRows = txids.length
    ? txids.map((txid, index) =>
        '<tr>' +
          '<td>' + number(index + 1) + '</td>' +
          '<td><a class="mono break" href="/tx/' + encodeURIComponent(txid) + '">' + esc(txid) + '</a></td>' +
        '</tr>'
      ).join('')
    : '<tr><td colspan="2" class="muted">No indexed transactions returned for this address.</td></tr>';

  const utxoRows = utxos.length
    ? utxos.map((utxo) =>
        '<tr>' +
          '<td><a class="mono" href="/tx/' + encodeURIComponent(utxo.txid) + '">' + esc(compactHash(utxo.txid)) + '</a></td>' +
          '<td>' + number(utxo.outputIndex) + '</td>' +
          '<td>' + yerb(Number(utxo.satoshis || 0) / 100000000) + ' YERB</td>' +
          '<td>' + number(utxo.height) + '</td>' +
        '</tr>'
      ).join('')
    : '<tr><td colspan="4" class="muted">No unspent outputs returned for this address.</td></tr>';

  const assetRows = assetBalances.length
    ? assetBalances.map(([name, amount]) =>
        '<tr><td><a class="mono asset-name" href="/asset/' + encodeURIComponent(name) + '">' + esc(name) + '</a></td><td>' + esc(amount) + '</td></tr>'
      ).join('')
    : '<tr><td colspan="2" class="muted">No asset balances returned for this address.</td></tr>';

  const historyNotice = data.history?.available
    ? ''
    : '<section class="notice error">Core recognized this address, but address history is not currently available from the address index.</section>';

  app.innerHTML =
    '<section class="detail-hero">' +
      '<div class="detail-kicker">Address record / native Core address index</div>' +
      '<h2>Yerbas address</h2>' +
      '<div class="detail-hash">' + esc(data.address) + '</div>' +
      '<div class="detail-actions"><a class="text-link" href="/">← Back to live chain</a></div>' +
    '</section>' +
    historyNotice +
    '<section class="metric-strip">' + cards + '</section>' +
    '<section class="panel">' +
      panelHeading('A1', 'Address history', 'Transactions', txids.length + ' shown') +
      '<div class="table-wrap">' +
        '<table><thead><tr><th>#</th><th>Transaction ID</th></tr></thead><tbody>' + txRows + '</tbody></table>' +
      '</div>' +
    '</section>' +
    '<section class="panel">' +
      panelHeading('A2', 'Unspent outputs', 'UTXOs', utxos.length + ' shown') +
      '<div class="table-wrap">' +
        '<table><thead><tr><th>Transaction</th><th>Output</th><th>Value</th><th>Height</th></tr></thead><tbody>' + utxoRows + '</tbody></table>' +
      '</div>' +
    '</section>' +
    '<section class="panel">' +
      panelHeading('A3', 'Asset index', 'Asset balances', assetBalances.length + ' assets') +
      '<div class="table-wrap">' +
        '<table><thead><tr><th>Asset</th><th>Balance</th></tr></thead><tbody>' + assetRows + '</tbody></table>' +
      '</div>' +
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

  const rows = data.items.length
    ? data.items.map((asset) =>
        '<tr>' +
          '<td><a class="asset-name" href="/asset/' + encodeURIComponent(asset.name) + '">' + esc(asset.name) + '</a></td>' +
          '<td><span class="asset-badge no-margin">' + esc(asset.type || assetType(asset.name)) + '</span></td>' +
          '<td>' + assetAmount(asset.amount, asset.units) + '</td>' +
          '<td>' + (asset.holders === null ? '—' : number(asset.holders)) + '</td>' +
          '<td>' + number(asset.units) + '</td>' +
          '<td>' + assetMetadataLink(asset) + '</td>' +
          '<td>' + (Number(asset.reissuable) ? 'Yes' : 'No') + '</td>' +
        '</tr>'
      ).join('')
    : '<tr><td colspan="7" class="muted">No assets matched these filters.</td></tr>';

  const pagination =
    '<div class="asset-pagination">' +
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
    metricCard('02', 'Indexed assets', number(data.total), query || type || metadata || reissuable ? 'matching current filters' : 'current directory'),
    metricCard('03', 'Indexed holders', '…', 'loading aggregate count'),
    metricCard('04', 'Last index read', 'NOW', 'no explorer sync database')
  ].join('');

  app.innerHTML =
    '<section class="detail-hero asset-hero">' +
      '<div class="detail-kicker">Yerbas native asset index</div>' +
      '<h2>Yerbas Assets</h2>' +
      '<div class="detail-hash">' + number(data.total) + ' assets in the current view · live from Yerbas Core</div>' +
      '<div class="detail-actions"><a class="text-link" href="/">← Back to live chain</a></div>' +
    '</section>' +

    '<section id="asset-summary" class="metric-strip">' + summaryCards + '</section>' +

    '<section class="panel">' +
      '<div class="asset-toolbar asset-toolbar-oldstyle">' +
        '<div><p class="eyebrow">ASSET DIRECTORY</p><h2>Browse indexed assets</h2></div>' +
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
          '<button type="submit">Search</button>' +
        '</form>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr><th>Asset</th><th>Type</th><th>Supply</th><th>Holders</th><th>Units</th><th>Metadata</th><th>Reissuable</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      pagination +
    '</section>';

  api('/api/assets/stats').then((stats) => {
    const summary = document.querySelector('#asset-summary');
    if (!summary) return;
    summary.innerHTML = [
      metricCard('01', 'Index status', stats.ready ? 'LIVE' : 'CHECK', 'native Core assetindex'),
      metricCard('02', 'Indexed assets', number(stats.indexedAssets), 'whole Core asset directory'),
      metricCard('03', 'Indexed holders', number(stats.indexedHolders), 'asset/address relationships'),
      metricCard('04', 'Last index read', 'NOW', 'live RPC · no sync database')
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

  const holderRows = holders.length
    ? holders.map((holder, index) => {
        const balance = Number(holder.balance || 0);
        const ownership = supply > 0 ? (balance / supply) * 100 : 0;
        return '<tr>' +
          '<td>' + number(index + 1) + '</td>' +
          '<td><a class="mono" href="/address/' + encodeURIComponent(holder.address) + '">' + esc(holder.address) + '</a> ' +
            '<a class="portfolio-link" href="/address/' + encodeURIComponent(holder.address) + '">portfolio</a></td>' +
          '<td>' + assetAmount(holder.balance, metadata.units) + '</td>' +
          '<td>' + ownership.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%</td>' +
        '</tr>';
      }).join('')
    : '<tr><td colspan="4" class="muted">' +
        esc(data.holders?.unavailableReason || 'No holder balances returned for this asset.') +
      '</td></tr>';

  const ipfsHash = metadata.ipfs_hash || null;
  const txidHash = metadata.txid_hash || metadata.txid || null;
  const metadataValue = ipfsHash || txidHash || null;
  const metadataType = ipfsHash ? 'IPFS' : (txidHash ? 'TXID' : null);
  const ipfsUrl = ipfsHash ? 'https://ipfs.io/ipfs/' + encodeURIComponent(ipfsHash) : null;

  const cards = [
    metricCard('01', 'Supply', assetAmount(metadata.amount, metadata.units), 'current issued amount'),
    metricCard('02', 'Units', number(metadata.units), 'decimal precision'),
    metricCard('03', 'Holders', data.holders?.total === null ? '—' : number(data.holders?.total), 'asset-index addresses'),
    metricCard('04', 'Reissuable', Number(metadata.reissuable) ? 'YES' : 'NO', assetType(data.name) + ' asset')
  ].join('');

  const metadataSection = metadataValue
    ? '<section class="panel">' +
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

  app.innerHTML =
    '<section class="detail-hero asset-hero">' +
      '<div class="detail-kicker">Yerbas asset / native Core metadata</div>' +
      '<div class="asset-title-row"><h2>' + esc(data.name) + '</h2><span class="asset-badge large">' + esc(assetType(data.name)) + '</span></div>' +
      '<div class="detail-hash">Asset data is read directly from Yerbas Core and assetindex.</div>' +
      '<div class="detail-actions">' +
        '<a class="text-link" href="/assets">← All assets</a>' +
        '<a class="text-link" href="/">Live chain</a>' +
      '</div>' +
    '</section>' +

    '<section class="metric-strip">' + cards + '</section>' +

    '<section class="panel">' +
      panelHeading('AS1', 'Asset anatomy', 'Metadata', 'Core getassetdata') +
      '<dl class="detail-grid">' +
        '<dt>Asset name</dt><dd class="mono break">' + esc(data.name) + '</dd>' +
        '<dt>Type</dt><dd>' + esc(assetType(data.name)) + '</dd>' +
        '<dt>Supply</dt><dd>' + assetAmount(metadata.amount, metadata.units) + '</dd>' +
        '<dt>Units</dt><dd>' + number(metadata.units) + '</dd>' +
        '<dt>Reissuable</dt><dd>' + (Number(metadata.reissuable) ? 'Yes' : 'No') + '</dd>' +
        '<dt>Metadata</dt><dd class="mono break">' +
          (metadataValue
            ? (ipfsUrl
              ? '<a href="' + ipfsUrl + '" target="_blank" rel="noopener noreferrer">' + esc(metadataType) + ' · ' + esc(metadataValue) + '</a>'
              : esc(metadataType) + ' · ' + esc(metadataValue))
            : '—') +
        '</dd>' +
        '<dt>Verifier</dt><dd class="mono break">' + esc(metadata.verifier_string || '—') + '</dd>' +
        '<dt>Issuance block</dt><dd>' +
          (data.issuance?.blockHeight !== null && data.issuance?.blockHeight !== undefined
            ? '<a href="/block/' + encodeURIComponent(data.issuance.blockHeight) + '">' + number(data.issuance.blockHeight) + '</a>'
            : '—') +
        '</dd>' +
        '<dt>Issuance block hash</dt><dd class="mono break">' +
          (data.issuance?.blockHash
            ? '<a href="/block/' + encodeURIComponent(data.issuance.blockHash) + '">' + esc(data.issuance.blockHash) + '</a>'
            : '—') +
        '</dd>' +
      '</dl>' +
    '</section>' +

    metadataSection +

    '<section class="panel">' +
      panelHeading(metadataValue ? 'AS3' : 'AS2', 'Asset index', 'Top Asset Holders', data.holders?.total === null ? 'availability unknown' : number(data.holders?.total) + ' total') +
      '<div class="table-wrap">' +
        '<table><thead><tr><th>Rank</th><th>Address</th><th>Balance</th><th>Ownership</th></tr></thead><tbody>' + holderRows + '</tbody></table>' +
      '</div>' +
      (data.holders?.total > holders.length
        ? '<div class="panel-foot">Showing first ' + number(holders.length) + ' indexed holders.</div>'
        : '') +
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

  const cards = [
    metricCard('01', 'Active smartnodes', number(data.network?.enabled), 'ENABLED at current chain tip'),
    metricCard('02', 'Registered total', number(data.network?.total), 'deterministic smartnodes'),
    metricCard('03', 'PoSe banned', number(data.network?.poseBanned), 'current Core state'),
    metricCard('04', 'Protocol', data.protocolVersion === null ? '—' : number(data.protocolVersion), 'local Core network protocol')
  ].join('');

  app.innerHTML =
    '<section class="detail-hero smartnode-hero">' +
      '<div class="detail-kicker">Yerbas deterministic smartnode network</div>' +
      '<h2>Yerbas Smartnodes</h2>' +
      '<div class="detail-hash">A listing of smartnodes known to Yerbas Core. The default view shows nodes currently reported as ENABLED.</div>' +
      '<div class="detail-actions"><a class="text-link" href="/">← Back to live chain</a></div>' +
    '</section>' +

    '<section class="metric-strip">' + cards + '</section>' +

    '<section class="panel">' +
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

      '<div class="smartnode-note">' +
        '<strong>Pay age rank</strong> is an informational ordering by oldest last-paid block among currently ENABLED nodes. ' +
        'It is not a prediction of the next payment winner.' +
      '</div>' +

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

function networkMapClusters(items) {
  const groups = new Map();

  for (const item of items) {
    if (!item?.geo) continue;

    const latitude = Number(item.geo.latitude);
    const longitude = Number(item.geo.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

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

function networkMapPinStyle(latitude, longitude) {
  const left = ((Number(longitude) + 180) / 360) * 100;
  const top = ((90 - Number(latitude)) / 180) * 100;
  return 'left:' + Math.max(0, Math.min(100, left)).toFixed(4) + '%;top:' +
    Math.max(0, Math.min(100, top)).toFixed(4) + '%;';
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
  const data = await api('/api/network-map?view=' + encodeURIComponent(view));

  setRpcState('online', 'Core online');
  document.title = 'Yerbas Network Map · Explorer Light';

  const clusters = networkMapClusters(data.items || []);
  const pins = clusters.map((cluster, index) => {
    const label = networkMapLocationLabel(cluster);
    const count = cluster.nodes.length;
    return '<button class="network-pin status-' + esc(cluster.status) + (count > 1 ? ' cluster' : '') + '"' +
      ' type="button" data-map-cluster="' + index + '" style="' +
      networkMapPinStyle(cluster.latitude, cluster.longitude) + '"' +
      ' title="' + esc(label + ' · ' + count + (count === 1 ? ' node' : ' nodes')) + '">' +
      (count > 1 ? '<span>' + number(count) + '</span>' : '') +
    '</button>';
  }).join('');

  const stats = data.stats || {};
  const statCards = [
    ['Total nodes', stats.totalNodes],
    ['Countries', stats.countries],
    ['Reachable', stats.reachable],
    ['Offline', stats.offline],
    ['PoSe banned', stats.poseBanned],
    ['Plotted', stats.plotted]
  ].map(([label, value]) =>
    '<article class="network-stat"><span>' + esc(label) + '</span><strong>' + number(value) + '</strong></article>'
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
      '<div class="network-map-canvas">' +
        '<img class="network-map-base" src="https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg" alt="" aria-hidden="true">' +
        '<div class="network-map-grid" aria-hidden="true"></div>' +
        '<div class="network-map-pins">' + pins + '</div>' +
        '<aside id="network-map-detail" class="network-map-detail hidden"></aside>' +
      '</div>' +
      '<div class="network-map-foot">' +
        '<span>' + esc(data.source) + '</span>' +
        '<span>Node locations are approximate and derived from IP geolocation. Exact operator locations are not exposed.</span>' +
        '<span>Geo: HackMyIP · Map: Wikimedia Commons CC0</span>' +
      '</div>' +
    '</section>';

  const detail = document.querySelector('#network-map-detail');

  document.querySelectorAll('[data-map-cluster]').forEach((button) => {
    button.addEventListener('click', () => {
      const cluster = clusters[Number(button.dataset.mapCluster)];
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
    });
  });
}

async function renderTransaction(txid) {
  renderLoading('Resolving transaction from Yerbas Core');

  const knownBlock = new URLSearchParams(location.search).get('block');
  const query = knownBlock ? '?block=' + encodeURIComponent(knownBlock) : '';
  const tx = await api('/api/tx/' + encodeURIComponent(txid) + query);

  setRpcState('online', 'Core online');
  document.title = 'Transaction · Yerbas Explorer Light';

  const outputs = (tx.vout || []).map((vout) =>
    '<tr>' +
      '<td>' + number(vout.n) + '</td>' +
      '<td>' + number(vout.value, 8) + ' YERB</td>' +
      '<td class="mono">' + outputAddresses(vout) + '</td>' +
    '</tr>'
  ).join('');

  const inputCount = Array.isArray(tx.vin) ? tx.vin.length : 0;

  app.innerHTML =
    '<section class="detail-hero">' +
      '<div class="detail-kicker">Transaction record / Yerbas Core</div>' +
      '<h2>Transaction</h2>' +
      '<div class="detail-hash">' + esc(tx.txid) + '</div>' +
      '<div class="detail-actions"><a class="text-link" href="/">← Back to live chain</a></div>' +
    '</section>' +

    '<section class="panel">' +
      panelHeading('T1', 'Transaction anatomy', 'Ledger data',
        tx.confirmations ? number(tx.confirmations) + ' confirmations' : 'unconfirmed') +
      '<dl class="detail-grid">' +
        '<dt>Transaction ID</dt><dd class="mono break">' + esc(tx.txid) + '</dd>' +
        '<dt>Block</dt><dd>' +
          (tx.blockhash
            ? hashLink('block', tx.blockhash, tx.blockhash)
            : '<span class="pending">Mempool / unconfirmed</span>') +
        '</dd>' +
        '<dt>Confirmations</dt><dd>' + number(tx.confirmations) + '</dd>' +
        '<dt>Size</dt><dd>' + bytes(tx.size) + '</dd>' +
        '<dt>Inputs</dt><dd>' + number(inputCount) + '</dd>' +
        '<dt>Outputs</dt><dd>' + number(tx.vout?.length) + '</dd>' +
        '<dt>Time</dt><dd>' + esc(isoTime(tx.blocktime || tx.time)) + '</dd>' +
      '</dl>' +
    '</section>' +

    '<section class="panel">' +
      panelHeading('T2', 'Value distribution', 'Outputs', 'reported by Core') +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr><th>#</th><th>Value</th><th>Address / script</th></tr></thead>' +
          '<tbody>' + outputs + '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>' +

    '<details class="panel raw">' +
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
