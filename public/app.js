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
  if (!response.ok) throw new Error(data.error || 'Request failed with HTTP ' + response.status + '.');
  return data;
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
  return '<a class="mono" href="/' + type + '/' + encodeURIComponent(value) + '">' + esc(label || compactHash(value)) + '</a>';
}

function statCard(label, value, foot = '') {
  return '<article class="stat-card"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(foot) + '</small></article>';
}

async function renderHome() {
  app.innerHTML = '<section class="loading-card">Loading live blockchain data…</section>';
  const [status, blocks] = await Promise.all([api('/api/status'), api('/api/blocks')]);
  rpcState.textContent = 'RPC connected';
  rpcState.className = 'status-pill online';

  const cards = [
    statCard('Block height', number(status.blocks), status.chain || 'main'),
    statCard('Difficulty', number(status.difficulty, 4), 'current network'),
    statCard('Connections', number(status.network?.connections), 'Yerbas peers'),
    statCard('Mempool', number(status.mempool?.transactions), bytes(status.mempool?.bytes))
  ].join('');

  const rows = blocks.map((block) => '<tr>' +
    '<td><a class="height-link" href="/block/' + block.height + '">' + number(block.height) + '</a></td>' +
    '<td>' + esc(timeAgo(block.time)) + '</td>' +
    '<td>' + number(block.transactions) + '</td>' +
    '<td>' + bytes(block.size) + '</td>' +
    '<td>' + hashLink('block', block.hash) + '</td>' +
    '</tr>').join('');

  app.innerHTML = '<section class="stats-grid">' + cards + '</section>' +
    '<section class="panel"><div class="panel-head"><div><p class="eyebrow">LIVE FROM YERBAS CORE</p><h2>Recent blocks</h2></div><span class="muted">No explorer database</span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Height</th><th>Age</th><th>Tx</th><th>Size</th><th>Hash</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

async function renderBlock(identifier) {
  app.innerHTML = '<section class="loading-card">Loading block…</section>';
  const block = await api('/api/block/' + encodeURIComponent(identifier));
  document.title = 'Block ' + block.height + ' · Yerbas Explorer Light';

  const txRows = (block.tx || []).map((txid, index) => '<tr><td>' + (index + 1) + '</td><td>' + hashLink('tx', txid, txid) + '</td></tr>').join('');
  app.innerHTML = '<section class="panel detail"><div class="panel-head"><div><p class="eyebrow">BLOCK</p><h2>#' + number(block.height) + '</h2></div><a href="/">← Recent blocks</a></div>' +
    '<dl class="detail-grid">' +
      '<dt>Hash</dt><dd class="mono break">' + esc(block.hash) + '</dd>' +
      '<dt>Confirmations</dt><dd>' + number(block.confirmations) + '</dd>' +
      '<dt>Timestamp</dt><dd>' + esc(isoTime(block.time)) + '</dd>' +
      '<dt>Transactions</dt><dd>' + number(block.tx?.length) + '</dd>' +
      '<dt>Size</dt><dd>' + bytes(block.size) + '</dd>' +
      '<dt>Difficulty</dt><dd>' + number(block.difficulty, 8) + '</dd>' +
      '<dt>Previous block</dt><dd>' + (block.previousblockhash ? hashLink('block', block.previousblockhash, block.previousblockhash) : 'Genesis') + '</dd>' +
      '<dt>Next block</dt><dd>' + (block.nextblockhash ? hashLink('block', block.nextblockhash, block.nextblockhash) : 'Tip') + '</dd>' +
    '</dl></section>' +
    '<section class="panel"><div class="panel-head"><h2>Transactions</h2><span class="muted">' + number(block.tx?.length) + ' total</span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>#</th><th>Transaction ID</th></tr></thead><tbody>' + txRows + '</tbody></table></div></section>';
}

function outputAddresses(vout) {
  const script = vout?.scriptPubKey || {};
  const addresses = script.addresses || (script.address ? [script.address] : []);
  return addresses.length ? addresses.map(esc).join('<br>') : '<span class="muted">' + esc(script.type || 'script') + '</span>';
}

async function renderTransaction(txid) {
  app.innerHTML = '<section class="loading-card">Loading transaction…</section>';
  const tx = await api('/api/tx/' + encodeURIComponent(txid));
  document.title = 'Transaction · Yerbas Explorer Light';

  const outputs = (tx.vout || []).map((vout) => '<tr><td>' + number(vout.n) + '</td><td>' + number(vout.value, 8) + ' YERB</td><td class="mono">' + outputAddresses(vout) + '</td></tr>').join('');
  const inputCount = Array.isArray(tx.vin) ? tx.vin.length : 0;

  app.innerHTML = '<section class="panel detail"><div class="panel-head"><div><p class="eyebrow">TRANSACTION</p><h2>Transaction details</h2></div><a href="/">← Explorer</a></div>' +
    '<dl class="detail-grid">' +
      '<dt>TXID</dt><dd class="mono break">' + esc(tx.txid) + '</dd>' +
      '<dt>Block</dt><dd>' + (tx.blockhash ? hashLink('block', tx.blockhash, tx.blockhash) : '<span class="pending">Mempool / unconfirmed</span>') + '</dd>' +
      '<dt>Confirmations</dt><dd>' + number(tx.confirmations) + '</dd>' +
      '<dt>Size</dt><dd>' + bytes(tx.size) + '</dd>' +
      '<dt>Inputs</dt><dd>' + number(inputCount) + '</dd>' +
      '<dt>Outputs</dt><dd>' + number(tx.vout?.length) + '</dd>' +
      '<dt>Time</dt><dd>' + esc(isoTime(tx.blocktime || tx.time)) + '</dd>' +
    '</dl></section>' +
    '<section class="panel"><div class="panel-head"><h2>Outputs</h2><span class="muted">Values reported by Yerbas Core</span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>#</th><th>Value</th><th>Address / script</th></tr></thead><tbody>' + outputs + '</tbody></table></div></section>' +
    '<details class="panel raw"><summary>Raw RPC response</summary><pre id="raw-json"></pre></details>';
  document.querySelector('#raw-json').textContent = JSON.stringify(tx, null, 2);
}

async function route() {
  clearNotice();
  const parts = location.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'block' && parts[1]) return await renderBlock(decodeURIComponent(parts[1]));
    if (parts[0] === 'tx' && parts[1]) return await renderTransaction(decodeURIComponent(parts[1]));
    return await renderHome();
  } catch (error) {
    rpcState.textContent = 'RPC unavailable';
    rpcState.className = 'status-pill offline';
    app.innerHTML = '<section class="error-card"><h2>Explorer request failed</h2><p>' + esc(error.message) + '</p><a class="button-link" href="/">Return home</a></section>';
  }
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice();
  const query = searchInput.value.trim();
  if (!query) return showNotice('Enter something to search for.', 'error');

  try {
    const result = await api('/api/search?q=' + encodeURIComponent(query));
    if (result.type === 'block') location.href = '/block/' + encodeURIComponent(result.target);
    else if (result.type === 'tx') location.href = '/tx/' + encodeURIComponent(result.target);
    else if (result.type === 'address') showNotice(result.message, 'info');
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

route();
