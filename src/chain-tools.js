export function toDuffs(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return toDuffs(value.toFixed(8));
    throw new Error('Invalid native amount');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
}
export function fromDuffs(value) {
  return (value / 100000000n).toString() + '.' + (value % 100000000n).toString().padStart(8, '0');
}
export function outputDestinations(output) {
  return output?.scriptPubKey?.addresses || (output?.scriptPubKey?.address ? [output.scriptPubKey.address] : []);
}
export async function enrichTransaction(rpc, tx, cached) {
  const inputs = tx.vin || [];
  if (inputs.some(input => input.coinbase)) return { ...tx, inputDetails: [{ coinbase: true }], feeYerb: null, feeReason: 'Newly created coinbase coins do not have a transaction fee.' };
  const details = [];
  for (let i = 0; i < inputs.length; i += 5) {
    details.push(...await Promise.all(inputs.slice(i, i + 5).map(async input => {
      try {
        if (input.value !== undefined || Number.isSafeInteger(input.valueSat)) {
          return { txid: input.txid, vout: input.vout, available: true, amountYerb: Number.isSafeInteger(input.valueSat) ? fromDuffs(BigInt(input.valueSat)) : fromDuffs(toDuffs(input.value)), addresses: input.address ? [input.address] : [] };
        }
        if (inputs.length > 200) return { txid: input.txid, vout: input.vout, available: false };
        const previous = await cached('prevout:' + input.txid, 60000, () => rpc.call('getrawtransaction', [input.txid, true]));
        const output = previous.vout.find(output => output.n === input.vout);
        if (!output) throw new Error('Missing previous output');
        return { txid: input.txid, vout: input.vout, available: true, amountYerb: fromDuffs(toDuffs(output.value)), addresses: outputDestinations(output) };
      } catch { return { txid: input.txid, vout: input.vout, available: false }; }
    })));
  }
  const complete = details.length > 0 && details.every(input => input.available);
  const inputTotal = complete ? details.reduce((sum, input) => sum + toDuffs(input.amountYerb), 0n) : null;
  const outputTotal = (tx.vout || []).reduce((sum, output) => sum + toDuffs(output.value), 0n);
  const fee = complete && inputTotal >= outputTotal ? fromDuffs(inputTotal - outputTotal) : null;
  return { ...tx, inputDetails: details, feeYerb: fee,
    feeReason: fee === null ? 'Fee unavailable: previous outputs could not all be resolved, or this transaction creates additional coins.' : null };
}
export async function recentMovementBlocks(rpc, count = 100) {
  const tip = await rpc.call('getblockcount');
  const blocks = [];
  for (let offset = 0; offset < Math.min(count, tip + 1); offset += 5) {
    const heights = Array.from({ length: Math.min(5, count - offset, tip + 1 - offset) }, (_, i) => tip - offset - i);
    blocks.push(...await Promise.all(heights.map(async height => {
      const hash = await rpc.call('getblockhash', [height]);
      return rpc.call('getblock', [hash, 2]);
    })));
  }
  const endHash = await rpc.call('getblockhash', [tip]);
  if (blocks[0]?.hash !== endHash) throw new Error('Chain changed during scan. Try again.');
  const items = [];
  for (const block of blocks) for (const tx of block.tx || []) {
    if (!tx || typeof tx !== 'object' || tx.vin?.some(input => input.coinbase)) continue;
    items.push({ txid: tx.txid, blockHash: block.hash, height: block.height, time: block.time,
      outputYerb: fromDuffs((tx.vout || []).reduce((sum, output) => sum + toDuffs(output.value), 0n)), outputs: tx.vout?.length || 0 });
  }
  return { tip, fromHeight: blocks.at(-1)?.height ?? tip, blocksScanned: blocks.length, items };
}
export async function smartnodeRewards(rpc, address, count = 1000, cached = (key, ttl, producer) => producer()) {
  const tip = await rpc.call('getblockcount');
  const tipHash = await rpc.call('getblockhash', [tip]);
  const winners = await cached('reward-winners:' + tip + ':' + count, 60000, () => rpc.call('smartnode', ['winners', String(count)]));
  const heights = Object.entries(winners).filter(([height, payees]) => Number(height) <= tip && Number(height) >= Math.max(1, tip - count + 1) && String(payees).split(',')[0].trim() === address)
    .map(([height]) => Number(height)).sort((a, b) => b - a);
  const items = [];
  for (let i = 0; i < Math.min(100, heights.length); i += 5) {
    const rows = await Promise.all(heights.slice(i, Math.min(i + 5, 100)).map(async height => {
      const hash = await rpc.call('getblockhash', [height]);
      const block = await rpc.call('getblock', [hash, 2]);
      const coinbase = block.tx?.find(tx => tx.vin?.some(input => input.coinbase));
      const outputs = coinbase?.vout?.filter(output => outputDestinations(output).includes(address)) || [];
      if (!outputs.length || Number(block.confirmations) < 1) return null;
      return { height, blockHash: hash, txid: coinbase.txid, time: block.time,
        amountYerb: fromDuffs(outputs.reduce((sum, output) => sum + toDuffs(output.value), 0n)) };
    }));
    items.push(...rows.filter(Boolean));
  }
  if (await rpc.call('getblockhash', [tip]) !== tipHash) throw new Error('Chain changed during reward lookup.');
  return { address, fromHeight: Math.max(1, tip - count + 1), toHeight: tip, truncated: heights.length > 100,
    totalYerb: fromDuffs(items.reduce((sum, item) => sum + toDuffs(item.amountYerb), 0n)), items };
}
