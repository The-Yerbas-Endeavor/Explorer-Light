// Native address-index deltas include change; report the net balance change.
export async function addressActivity(rpc, address, txids, cached) {
  const [deltas, tip] = await Promise.all([
    cached('address-deltas:' + address, 15000, () => rpc.call('getaddressdeltas', [{ addresses: [address] }])),
    cached('activity-tip', 5000, () => rpc.call('getblockcount'))
  ]);
  if (!Array.isArray(deltas)) throw new Error('Address deltas unavailable');
  const wanted = new Set(txids);
  const totals = new Map();
  for (const delta of deltas) {
    if (delta.address !== address || !wanted.has(delta.txid) || !Number.isSafeInteger(delta.satoshis) || !Number.isSafeInteger(delta.height)) continue;
    const row = totals.get(delta.txid) || { net: 0n, height: delta.height };
    row.net += BigInt(delta.satoshis);
    totals.set(delta.txid, row);
  }
  const times = new Map();
  // Bounded batches avoid flooding Core for a page spanning many blocks.
  const heights = [...new Set([...totals.values()].map(row => row.height))];
  for (let i = 0; i < heights.length; i += 5) {
    await Promise.all(heights.slice(i, i + 5).map(async height => {
      try {
        const header = await cached('activity-header:' + height, 15000, async () => {
          const hash = await rpc.call('getblockhash', [height]);
          return rpc.call('getblockheader', [hash]);
        });
        times.set(height, header.time);
      } catch { /* Keep amounts available if a block lookup fails. */ }
    }));
  }
  return txids.map(txid => {
    const row = totals.get(txid);
    if (!row) return { txid, available: false };
    const absolute = row.net < 0n ? -row.net : row.net;
    return { txid, available: true, height: row.height, time: times.get(row.height) ?? null,
      confirmations: Math.max(0, Number(tip) - row.height + 1),
      direction: row.net < 0n ? 'sent' : row.net > 0n ? 'received' : 'unchanged',
      amountYerb: (absolute / 100000000n).toString() + '.' + (absolute % 100000000n).toString().padStart(8, '0') };
  });
}
