import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const amount = (value) => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value);
export function validateRichlist(data) {
  if (!data || !Number.isSafeInteger(data.height) || data.height < 0
    || !/^[a-f0-9]{64}$/.test(data.bestblock)
    || !Number.isSafeInteger(data.addresses) || data.addresses < 0
    || !Number.isSafeInteger(data.txouts) || data.txouts < 0
    || !amount(data.totalSatoshis) || !amount(data.unattributedSatoshis)
    || BigInt(data.unattributedSatoshis) > BigInt(data.totalSatoshis)
    || !Array.isArray(data.items) || data.items.length > 1000
    || data.items.length !== Math.min(100, data.addresses)) {
    throw new Error('Invalid rich list snapshot.');
  }
  const seen = new Set();
  let previous = null;
  let sum = 0n;
  for (const [index, item] of data.items.entries()) {
    if (item.rank !== index + 1 || typeof item.address !== 'string'
      || !/^[1-9A-HJ-NP-Za-km-z]{20,128}$/.test(item.address)
      || seen.has(item.address) || !amount(item.balanceSatoshis) || BigInt(item.balanceSatoshis) === 0n
      || (previous && (BigInt(previous.balanceSatoshis) < BigInt(item.balanceSatoshis)
        || (previous.balanceSatoshis === item.balanceSatoshis && previous.address >= item.address)))) {
      throw new Error('Invalid rich list rankings.');
    }
    seen.add(item.address);
    previous = item;
    sum += BigInt(item.balanceSatoshis);
  }
  if (sum + BigInt(data.unattributedSatoshis) > BigInt(data.totalSatoshis)) {
    throw new Error('Invalid rich list total.');
  }
  return data;
}

export async function refreshRichlist(rpc, file, now = () => new Date()) {
  const status = await rpc.call('getblockchaininfo');
  if (status.initialblockdownload !== false) throw new Error('Core must finish syncing before a rich list scan.');
  const result = validateRichlist(await rpc.call('getrichlist', [100]));
  if (await rpc.call('getblockhash', [result.height]) !== result.bestblock) {
    throw new Error('Rich list snapshot reorganized; keeping the previous file.');
  }
  const snapshot = { ...result, generatedAt: now().toISOString(), schemaVersion: 1 };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify(snapshot) + '\n', { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return snapshot;
}

export async function readRichlist(file, maxAgeMs, now = Date.now()) {
  const handle = await fs.open(file, 'r');
  let data;
  try {
    if ((await handle.stat()).size > 1024 * 1024) throw new Error('Rich list snapshot exceeds size limit.');
    data = JSON.parse(await handle.readFile('utf8'));
  } finally { await handle.close(); }
  validateRichlist(data);
  const timestamp = Date.parse(data.generatedAt);
  if (data.schemaVersion !== 1 || !Number.isFinite(timestamp) || timestamp > now + 60000) {
    throw new Error('Invalid rich list snapshot metadata.');
  }
  return { ...data, stale: now - timestamp > maxAgeMs,
    policy: 'Confirmed unspent native YERB, including immature rewards and locked collateral. Excludes mempool changes. Addresses are not individual owners.' };
}
