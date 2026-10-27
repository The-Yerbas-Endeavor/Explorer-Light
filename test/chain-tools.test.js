import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { enrichTransaction, recentMovementBlocks, smartnodeRewards, toDuffs, fromDuffs } from '../src/chain-tools.js';
import { NetworkHistory } from '../src/network-history.js';
const cached = (key, ttl, producer) => producer();
test('input resolution calculates exact fees and preserves unavailable inputs', async () => {
  const tx = { vin: [{ txid: 'previous', vout: 0 }], vout: [{ value: 1.00000001 }] };
  const rpc = { call: async () => ({ vout: [{ n: 0, value: 2, scriptPubKey: { address: 'address' } }] }) };
  const result = await enrichTransaction(rpc, tx, cached);
  assert.equal(result.feeYerb, '0.99999999');
  assert.deepEqual(result.inputDetails[0].addresses, ['address']);
  const unavailable = await enrichTransaction({ call: async () => { throw new Error('No index'); } }, tx, cached);
  assert.equal(unavailable.feeYerb, null);
  assert.equal(unavailable.inputDetails[0].available, false);
  assert.equal((await enrichTransaction(rpc, { vin: [{ coinbase: '00' }], vout: [] }, cached)).inputDetails[0].coinbase, true);
  assert.equal(fromDuffs(toDuffs('120000000.12345678')), '120000000.12345678');
});
test('movement scan excludes coinbase and reports exact output sums', async () => {
  const rpc = { call: async (method, args) => {
    if (method === 'getblockcount') return 2;
    if (method === 'getblockhash') return 'hash' + args[0];
    if (method === 'getblock') return { hash: args[0], height: Number(args[0].slice(4)), time: 1, tx: [
      { txid: 'reward', vin: [{ coinbase: '00' }], vout: [{ value: 50 }] },
      { txid: 'transfer', vin: [{ txid: 'old' }], vout: [{ value: 0.1 }, { value: 0.2 }] }
    ] };
  } };
  const data = await recentMovementBlocks(rpc, 2);
  assert.equal(data.blocksScanned, 2); assert.equal(data.fromHeight, 1);
  assert.equal(data.items.length, 2); assert.equal(data.items[0].outputYerb, '0.30000000');
});
test('payout lookup excludes future winners and ordinary transfers', async () => {
  const rpc = { call: async (method, args) => {
    if (method === 'getblockcount') return 100;
    if (method === 'smartnode') return { 98: 'different-smartnode, payee', 99: 'payee', 100: 'payee', 101: 'payee' };
    if (method === 'getblockhash') return 'hash' + args[0];
    if (method === 'getblock') return { confirmations: 2, time: 123, tx: [
      { txid: 'cb', vin: [{ coinbase: '00' }], vout: [{ value: 16, scriptPubKey: { addresses: ['payee'] } }] },
      { txid: 'deposit', vin: [{ txid: 'ordinary' }], vout: [{ value: 1000, scriptPubKey: { addresses: ['payee'] } }] }
    ] };
  } };
  const data = await smartnodeRewards(rpc, 'payee', 100);
  assert.equal(data.items.length, 2); assert.equal(data.totalYerb, '32.00000000');
  assert.ok(data.items.every(row => row.height <= 100 && row.txid === 'cb'));
});
test('network samples persist, deduplicate buckets and prune old observations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'network-history-'));
  try {
    const file = path.join(directory, 'history.json');
    const store = new NetworkHistory(file);
    await store.record({ time: 1, difficulty: 1, hashrate: 2 });
    await store.record({ time: 2, difficulty: 3, hashrate: 4 });
    assert.equal((await new NetworkHistory(file).read()).length, 1);
    await store.record({ time: 31 * 86400, difficulty: 4, hashrate: 5 });
    assert.equal((await store.read()).length, 1);
    await store.record({ time: NaN, difficulty: 0, hashrate: 0 });
    assert.equal((await store.read()).length, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('large indexed transactions resolve inputs without previous transaction calls', async () => {
  const vin = Array.from({ length: 314 }, (_, i) => ({ txid: 'previous' + i, vout: 0, valueSat: 100000000, address: 'sender' }));
  const result = await enrichTransaction({ call: async () => { throw new Error('Unexpected lookup'); } }, { vin, vout: [{ value: 313.99999, spentTxId: 'next', spentIndex: 2 }] }, cached);
  assert.equal(result.inputDetails.length, 314);
  assert.ok(result.inputDetails.every(input => input.available));
  assert.equal(result.feeYerb, '0.00001000');
  assert.equal(result.vout[0].spentTxId, 'next');
});
