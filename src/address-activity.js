// Native address-index deltas include change; report the net balance change.
export async function addressActivity(rpc, address, txids, cached, range = null) {
  if (!txids.length) return [];
  const [deltas, tip] = await Promise.all([
    cached('address-deltas:' + address + ':' + (range ? range.start + ':' + range.end : 'all'), 15000, () => rpc.call('getaddressdeltas', [{ addresses: [address], ...(range || {}) }])),
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

// A fixed block scan avoids lifetime address-index queries, even on older Core builds.
export async function recentAddressHistory(rpc, address, offset, limit, cached) {
  const tip = await cached('recent-address-tip', 10000, () => rpc.call('getblockcount'));
  const start = Math.max(0, tip - 99);
  const blocks = await cached('recent-address-blocks:' + tip, 30000, async () => {
    const result = [];
    for (let height = tip; height >= start; height--) {
      const hash = await rpc.call('getblockhash', [height]);
      result.push(await rpc.call('getblock', [hash, 2]));
    }
    if (await rpc.call('getblockhash', [tip]) !== result[0].hash) throw new Error('Chain changed during recent activity scan');
    return result;
  });
  const rows = [];
  for (const block of blocks) for (const tx of [...(block.tx || [])].reverse()) {
    const destinations = output => output.scriptPubKey?.addresses || (output.scriptPubKey?.address ? [output.scriptPubKey.address] : []);
    const incoming = (tx.vout || []).filter(output => destinations(output).includes(address));
    const outgoing = (tx.vin || []).filter(input => input.address === address);
    if (!incoming.length && !outgoing.length) continue;
    const coinbase = tx.vin?.some(input => input.coinbase);
    const complete = coinbase || tx.vin?.every(input => typeof input.address === 'string' && Number.isSafeInteger(input.valueSat));
    const amount = output => Number.isSafeInteger(output.valueSat) ? BigInt(output.valueSat) : BigInt(Math.round(Number(output.value) * 100000000));
    const net = incoming.reduce((sum, output) => sum + amount(output), 0n) - outgoing.reduce((sum, input) => sum + BigInt(input.valueSat || 0), 0n);
    const absolute = net < 0n ? -net : net;
    rows.push({ txid: tx.txid, available: Boolean(complete), height: block.height, blockHash: block.hash, time: block.time,
      confirmations: Math.max(0, tip - block.height + 1), direction: net < 0n ? 'sent' : net > 0n ? 'received' : 'unchanged',
      amountYerb: (absolute / 100000000n).toString() + '.' + (absolute % 100000000n).toString().padStart(8, '0') });
  }
  const pageOffset = Math.min(offset, Math.max(0, Math.ceil(rows.length / limit) - 1) * limit);
  return { transactions: rows.slice(pageOffset, pageOffset + limit), txids: rows.slice(pageOffset, pageOffset + limit).map(row => row.txid),
    txidsTotal: rows.length, txOffset: pageOffset, txidsAvailable: true, recentAvailable: true, startHeight: start, endHeight: tip };
}
