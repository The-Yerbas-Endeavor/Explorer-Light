import test from 'node:test';
import assert from 'node:assert/strict';
import { addressActivity } from '../src/address-activity.js';
import { createAiGateway } from '../src/ai.js';

test('address activity uses exact native net amounts, block dates and confirmations', async () => {
  const rpc = { async call(method) {
    if (method === 'getaddressdeltas') return [
      { address: 'a', txid: 'sent', satoshis: -900000000, height: 10 },
      { address: 'a', txid: 'sent', satoshis: 300000000, height: 10 },
      { address: 'a', txid: 'received', satoshis: 1, height: 11 },
      { address: 'other', txid: 'received', satoshis: 999, height: 11 }
    ];
    if (method === 'getblockcount') return 12;
    if (method === 'getblockhash') return 'hash';
    if (method === 'getblockheader') return { time: 123456 };
  } };
  const rows = await addressActivity(rpc, 'a', ['sent', 'received', 'missing'], (key, ttl, producer) => producer());
  assert.equal(rows[0].direction, 'sent');
  assert.equal(rows[0].amountYerb, '6.00000000');
  assert.equal(rows[0].confirmations, 3);
  assert.equal(rows[0].time, 123456);
  assert.equal(rows[1].amountYerb, '0.00000001');
  assert.equal(rows[2].available, false);
});

test('unspent-output pages cover the full index independently of transaction pages', async () => {
  const outputs = Array.from({ length: 67 }, (_, n) => ({ txid: String(n), outputIndex: 0 }));
  const rpc = { async call(method) {
    return { validateaddress: { isvalid: true }, getaddressbalance: { balance: 0, received: 0 },
      getaddresstxids: [], getaddressutxos: outputs, listassetbalancesbyaddress: {} }[method];
  } };
  const gateway = createAiGateway({ rpc });
  const all = [];
  for (const offset of [0, 30, 60]) {
    const { data } = await gateway.invoke('get_address', { address: 'yauGhoF3Gve84SssUBpeKGGtmWR7MYzQ9N', utxo_limit: 30, utxo_offset: offset });
    assert.equal(data.history.utxosTotal, 67);
    assert.equal(data.history.utxoOffset, offset);
    all.push(...data.history.utxos);
  }
  assert.deepEqual(all, [...outputs].reverse());
});
test('empty activity never scans history and recent activity keeps its range', async () => {
  const cache = (key, ttl, producer) => producer();
  assert.deepEqual(await addressActivity({ call() { throw new Error('Unexpected full scan'); } }, 'a', [], cache), []);
  const rpc = { async call(method, params) {
    if (method === 'getaddressdeltas') { assert.deepEqual(params, [{ addresses: ['a'], start: 100, end: 200 }]); return []; }
    if (method === 'getblockcount') return 200;
    throw new Error('Unexpected RPC');
  } };
  assert.deepEqual(await addressActivity(rpc, 'a', ['tx'], cache, { start: 100, end: 200 }), [{ txid: 'tx', available: false }]);
});
