import test from 'node:test';
import assert from 'node:assert/strict';
import { lastXeggeXSend, XEGGEX_ADDRESS as address } from '../src/address-watch.js';
const txid = 'a'.repeat(64), hash = 'b'.repeat(64);
const sent = {address, txid, satoshis:-1, height:2, blockindex:1};
function fake(deltas, changed=false) {
  let hashes=0;
  return {call: async method => {
    if (method==='getaddressdeltas') return deltas;
    if (method==='getblockhash') return changed && hashes++ ? 'c'.repeat(64) : hash;
    if (method==='getblock') return {tx:[txid],confirmations:1,time:1664765661};
    throw Error('unexpected method');
  }};
}
test('last sent ignores newer deposits and chooses latest confirmed spend',async()=>{
 const data=await lastXeggeXSend(fake([{...sent,height:1},sent,{...sent,satoshis:10,height:3}]));
 assert.equal(data.lastSent.height,2);
 assert.equal(data.lastSent.txid,txid);
 assert.equal(data.lastSent.time,1664765661);
});
test('no outgoing activity and unavailable indexes remain distinct',async()=>{
 assert.equal((await lastXeggeXSend(fake([{...sent,satoshis:10}]))).lastSent,null);
 await assert.rejects(lastXeggeXSend(fake(null)));
});
test('reorganized history is rejected',async()=>{
 await assert.rejects(lastXeggeXSend(fake([sent],true)));
});
