import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { refreshRichlist, readRichlist, validateRichlist } from '../src/richlist.js';
const hash = 'a'.repeat(64);
const result = () => ({ height: 42, bestblock: hash, addresses: 1, txouts: 2,
  totalSatoshis: '9007199254740999', unattributedSatoshis: '1',
  items: [{ rank: 1, address: 'y' + 'A'.repeat(33), balanceSatoshis: '9007199254740998' }] });
const now = () => new Date('2026-10-14T12:00:00Z');
const rpc = () => ({ call: async method => {
  if (method === 'getblockchaininfo') return { initialblockdownload: false };
  if (method === 'getblockhash') return hash;
  if (method === 'getrichlist') return result();
  throw new Error('Unexpected RPC');
} });
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'richlist-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'richlist.json');
}
test('exact balances survive disk persistence; old snapshots are labelled', async t => {
  const file = await fixture(t);
  await refreshRichlist(rpc(), file, now);
  const data = await readRichlist(file, 1000, now().getTime() + 500);
  assert.equal(data.items[0].balanceSatoshis, '9007199254740998');
  assert.equal(data.stale, false);
  assert.equal((await readRichlist(file, 1000, now().getTime() + 2000)).stale, true);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['richlist.json']);
});
test('failed, unsynced, or reorganized scans preserve the previous file', async t => {
  const file = await fixture(t);
  await refreshRichlist(rpc(), file, now);
  const before = await fs.readFile(file, 'utf8');
  for (const target of ['getblockchaininfo', 'getrichlist', 'getblockhash']) {
    const broken = rpc(), call = broken.call;
    broken.call = async name => {
      if (name !== target) return call(name);
      if (name === 'getblockchaininfo') return { initialblockdownload: true };
      if (name === 'getblockhash') return 'b'.repeat(64);
      throw new Error('Scan failed');
    };
    await assert.rejects(refreshRichlist(broken, file, now));
    assert.equal(await fs.readFile(file, 'utf8'), before);
  }
});
test('invalid totals, ranks, duplicates, incomplete lists and order are rejected', () => {
  for (const mutate of [
    x => { x.totalSatoshis = '2'; },
    x => { x.items[0].balanceSatoshis = 123; },
    x => { x.items[0].rank = 0; },
    x => { x.items[0].address = '<script>'; },
    x => { x.addresses = 200; },
    x => { x.addresses = 2; x.items.push({ ...x.items[0], rank: 2 }); },
    x => { x.addresses = 2; x.items.push({ rank: 2, address: 'y' + 'B'.repeat(33), balanceSatoshis: '9007199254740999' }); }
  ]) { const data = result(); mutate(data); assert.throws(() => validateRichlist(data)); }
});
test('corrupt, future-dated and oversized files fail closed', async t => {
  const file = await fixture(t);
  for (const content of ['{', ' '.repeat(1048577), JSON.stringify({ ...result(), schemaVersion: 1, generatedAt: '2099-01-01' })]) {
    await fs.writeFile(file, content);
    await assert.rejects(readRichlist(file, 1000, now().getTime()));
  }
});

test('public HTTP routes serve snapshots without starting scans and reject a reorg', async t => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const http = await import('node:http');
  const file = await fixture(t);
  let canonical = hash;
  const calls = [];
  const fake = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body); calls.push(payload.method);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: payload.id, result: canonical, error: null }));
  });
  fake.listen(0, '127.0.0.1'); await once(fake, 'listening');
  t.after(() => new Promise(resolve => fake.close(resolve)));
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), RPC_HOST: '127.0.0.1', RPC_PROTOCOL: 'http',
      RPC_PORT: String(fake.address().port), RPC_USER: 'test', RPC_PASSWORD: 'test', RICHLIST_FILE: file,
      CACHE_MS: '0', MARKETS_ENABLED: 'false', MARKETS_HISTORY_FILE: file + '.markets' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + output)), 5000);
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('listening on')) { clearTimeout(timer); resolve(); } });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited before startup (' + code + '): ' + output)); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  const get = route => fetch('http://127.0.0.1:' + port + route);
  assert.equal((await get('/api/v1/richlist')).status, 503);
  await refreshRichlist(rpc(), file, () => new Date());
  const response = await get('/api/v1/richlist');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items[0].balanceSatoshis, '9007199254740998');
  assert.equal((await get('/richlist')).status, 200);
  canonical = 'b'.repeat(64);
  assert.equal((await get('/api/richlist')).status, 503);
  assert.ok(!calls.includes('getrichlist'));
});
