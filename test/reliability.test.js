import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedCache } from '../src/timed-cache.js';
import { YerbasRpc } from '../src/rpc.js';
test('RPC errors preserve Core codes even with HTTP 500', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => new Response(JSON.stringify({ id: JSON.parse(options.body).id, error: { code: -5, message: 'No such transaction' }, result: null }), { status: 500 });
  try {
    const rpc = new YerbasRpc({ protocol: 'http', host: 'localhost', port: 1, user: 'test', password: 'test', timeoutMs: 1000 });
    await assert.rejects(rpc.call('getrawtransaction'), error => error.code === -5 && error.method === 'getrawtransaction' && error.message === 'No such transaction');
    globalThis.fetch = async () => new Response('not JSON', { status: 503 });
    await assert.rejects(rpc.call('getblockcount'), /invalid response/);
  } finally { globalThis.fetch = original; }
});
test('RPC cache is bounded, deduplicates, expires and recovers from failure', async () => {
  let time = 0, calls = 0;
  const cache = createTimedCache(2, () => time);
  const producer = () => ++calls;
  const a = cache('a', 10, producer);
  assert.equal(a, cache('a', 10, producer));
  assert.equal(await a, 1);
  await cache('b', 10, producer); await cache('c', 10, producer);
  assert.equal(await cache('a', 10, producer), 4);
  time = 11;
  assert.equal(await cache('a', 10, producer), 5);
  await assert.rejects(cache('failed', 10, () => { throw new Error('offline'); }));
  assert.equal(await cache('failed', 10, () => 'recovered'), 'recovered');
});
