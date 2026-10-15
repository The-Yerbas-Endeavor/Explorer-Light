export const XEGGEX_ADDRESS = 'yYRDT2bovVEJrJ7BbcEXG3FCBwnYdX9Zg7';

export async function lastXeggeXSend(rpc) {
  const deltas = await rpc.call('getaddressdeltas', [{ addresses: [XEGGEX_ADDRESS] }]);
  if (!Array.isArray(deltas)) throw new Error('Address index is unavailable.');
  const outgoing = deltas.filter(item => item.address === XEGGEX_ADDRESS && item.satoshis < 0
    && Number.isSafeInteger(item.height) && item.height > 0 && /^[a-f0-9]{64}$/.test(item.txid));
  outgoing.sort((a, b) => b.height - a.height || b.blockindex - a.blockindex);
  const latest = outgoing[0];
  if (!latest) return { address: XEGGEX_ADDRESS, lastSent: null, checkedAt: new Date().toISOString() };
  const blockHash = await rpc.call('getblockhash', [latest.height]);
  const block = await rpc.call('getblock', [blockHash, 1]);
  if (!block.tx?.includes(latest.txid) || !(block.confirmations > 0)
    || !Number.isSafeInteger(block.time) || block.time <= 0
    || await rpc.call('getblockhash', [latest.height]) !== blockHash) {
    throw new Error('Address history changed during verification. Retry later.');
  }
  return { address: XEGGEX_ADDRESS,
    lastSent: { txid: latest.txid, height: latest.height, blockHash, time: block.time },
    checkedAt: new Date().toISOString() };
}
