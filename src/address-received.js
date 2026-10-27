import fs from 'node:fs/promises';
import path from 'node:path';
import { fromDuffs, toDuffs, outputDestinations } from './chain-tools.js';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export class AddressReceived {
  constructor(directory) { this.directory = directory; this.running = new Set(); }
  file(address) {
    if (!/^[A-Za-z0-9]{20,64}$/.test(address)) throw new Error('Invalid snapshot address');
    return path.join(this.directory, address + '.json');
  }
  async read(address) {
    try {
      const file = this.file(address);
      if ((await fs.stat(file)).size > 4096) return null;
      const row = JSON.parse(await fs.readFile(file, 'utf8'));
      return row.address === address && Number.isSafeInteger(row.height) && row.height >= 0 && hash(row.blockHash) &&
        typeof row.receivedDuffs === 'string' && /^\d+$/.test(row.receivedDuffs) && row.receivedDuffs.length < 32 && Number.isFinite(Date.parse(row.updatedAt)) ? row : null;
    } catch { return null; }
  }
  async snapshot(rpc, address) {
    const row = await this.read(address);
    if (!row || await rpc.call('getblockhash', [row.height]) !== row.blockHash) return null;
    return { ...row, receivedYerb: fromDuffs(BigInt(row.receivedDuffs)) };
  }
  async refresh(rpc, address) {
    if (this.running.has(address)) return;
    this.running.add(address);
    try {
      let row = await this.read(address);
      const tip = await rpc.call('getblockcount');
      if (row && (row.height > tip || await rpc.call('getblockhash', [row.height]) !== row.blockHash)) row = null;
      if (!row) {
        const blockHash = await rpc.call('getblockhash', [tip]);
        // One balance-only bootstrap; never request lifetime transaction/delta arrays.
        const balance = await rpc.call('getaddressbalance', [{ addresses: [address] }]);
        if (!Number.isSafeInteger(balance.received) || balance.received < 0) throw new Error('Invalid lifetime received amount');
        if (await rpc.call('getblockcount') !== tip || await rpc.call('getblockhash', [tip]) !== blockHash) throw new Error('Chain changed during received bootstrap');
        row = { address, height: tip, blockHash, receivedDuffs: String(balance.received) };
      } else {
        if (row.height === tip) return row;
        const anchor = row;
        let total = BigInt(row.receivedDuffs);
        for (let height = row.height + 1; height <= Math.min(tip, anchor.height + 100); height++) {
          const blockHash = await rpc.call('getblockhash', [height]);
          const block = await rpc.call('getblock', [blockHash, 2]);
          if (block.hash !== blockHash || block.height !== height || block.previousblockhash !== row.blockHash || !Array.isArray(block.tx)) throw new Error('Invalid block during received update');
          for (const tx of block.tx) {
            if (!tx || typeof tx !== 'object' || !Array.isArray(tx.vout)) throw new Error('Decoded block transactions unavailable');
            for (const output of tx.vout) if (outputDestinations(output).includes(address)) {
              const amount = Number.isSafeInteger(output.valueSat) && output.valueSat >= 0 ? BigInt(output.valueSat) : toDuffs(output.value);
              total += amount;
            }
          }
          row = { address, height, blockHash, receivedDuffs: total.toString() };
        }
        if (await rpc.call('getblockhash', [anchor.height]) !== anchor.blockHash || await rpc.call('getblockhash', [row.height]) !== row.blockHash) throw new Error('Chain changed during received update');
      }
      row.updatedAt = new Date().toISOString();
      await fs.mkdir(this.directory, { recursive: true });
      const file = this.file(address);
      await fs.writeFile(file + '.tmp', JSON.stringify(row), { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
      return row;
    } finally { this.running.delete(address); }
  }
}
