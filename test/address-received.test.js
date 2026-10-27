import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AddressReceived } from '../src/address-received.js';
const address = 'yaDfcdCupB1T5YoVRjYr8fXCvB8U5AuNX8';
const hash = height => height.toString(16).padStart(64, '0');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'received-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new AddressReceived(directory);
}
test('lifetime total bootstraps once, persists, adds every matching output exactly and never double counts', async t => {
  let tip = 10, bootstraps = 0;
  const rpc = { async call(method, args) {
    if (method === 'getblockcount') return tip;
    if (method === 'getblockhash') return hash(args[0]);
    if (method === 'getaddressbalance') { bootstraps++; return { received: 100000001 }; }
    if (method === 'getblock') return { hash: hash(tip), previousblockhash: hash(tip - 1), height: tip, tx: [
      { vout: [{ valueSat: 200000002, scriptPubKey: { addresses: [address] } }, { value: 0.00000003, scriptPubKey: { address } }, { value: 50, scriptPubKey: { address: 'other' } }] }
    ] };
    throw new Error('Unexpected RPC ' + method);
  } };
  const store = await fixture(t);
  await store.refresh(rpc, address);
  tip = 11;
  await store.refresh(rpc, address); await store.refresh(rpc, address);
  assert.equal(bootstraps, 1);
  assert.equal((await store.snapshot(rpc, address)).receivedYerb, '3.00000006');
  assert.equal((await new AddressReceived(store.directory).snapshot(rpc, address)).height, 11);
});
test('a changing chain or failed update preserves the previous checkpoint', async t => {
  const store = await fixture(t);
  let tip = 10, changing = false;
  const rpc = { async call(method, args) {
    if (method === 'getblockcount') return changing ? ++tip : tip;
    if (method === 'getblockhash') return hash(args[0]);
    if (method === 'getaddressbalance') return { received: 123 };
    throw new Error('Block unavailable');
  } };
  await store.refresh(rpc, address);
  tip = 11;
  await assert.rejects(store.refresh(rpc, address), /Block unavailable/);
  assert.equal((await store.read(address)).height, 10);
  changing = true;
  const empty = await fixture(t);
  await assert.rejects(empty.refresh(rpc, address), /Chain changed/);
  assert.equal(await empty.read(address), null);
  assert.equal(await store.snapshot({ call: async () => hash(999) }, address), null);
});
test('reorganized checkpoint rebuilds from a new stable baseline', async t => {
  const store = await fixture(t);
  let generation = 10;
  const rpc = { async call(method) {
    if (method === 'getblockcount') return 10;
    if (method === 'getblockhash') return hash(generation);
    if (method === 'getaddressbalance') return { received: generation };
  } };
  await store.refresh(rpc, address); generation = 20; await store.refresh(rpc, address);
  assert.equal((await store.read(address)).receivedDuffs, '20');
});
