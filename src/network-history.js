import fs from 'node:fs/promises';
import path from 'node:path';
export class NetworkHistory {
  constructor(file) { this.file = file; this.chain = Promise.resolve(); }
  async read() {
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 3 * 1024 * 1024) return [];
      const value = JSON.parse(await fs.readFile(this.file, 'utf8'));
      return Array.isArray(value) ? value.filter(row => Number.isFinite(row.time) && Number.isFinite(row.difficulty) && Number.isFinite(row.hashrate)) : [];
    } catch { return []; }
  }
  record(sample) {
    const write = async () => {
      if (![sample.time, sample.difficulty, sample.hashrate].every(Number.isFinite) || sample.hashrate < 0 || sample.difficulty < 0) return;
      const rows = (await this.read()).filter(row => row.time >= sample.time - 30 * 86400 && Math.floor(row.time / 300) !== Math.floor(sample.time / 300));
      rows.push(sample); rows.sort((a,b) => a.time - b.time);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(rows.slice(-8641)), { mode: 0o600 });
      await fs.rename(temporary, this.file);
    };
    this.chain = this.chain.catch(() => {}).then(write);
    return this.chain;
  }
}
