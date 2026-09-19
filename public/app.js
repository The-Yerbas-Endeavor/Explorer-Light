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
  if (!Number.isFinite(parsed)) return esc(value);
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
        '<tr><td class="mono">' + esc(name) + '</td><td>' + esc(amount) + '</td></tr>'
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
    showNotice('Enter a block height, block hash, transaction ID, or Yerbas address.', 'error');
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
    }
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

route();
