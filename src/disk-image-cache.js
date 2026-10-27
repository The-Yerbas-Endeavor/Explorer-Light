import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Single-file atomic entries; total stored bytes are bounded, oldest entries evicted first.
export class DiskImageCache {
  constructor(directory, maxBytes = 512 * 1024 * 1024) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.pending = Promise.resolve();
  }
  file(key) {
    if (!/^[A-Za-z0-9]{32,128}$/.test(key)) throw new Error('Invalid image cache key');
    return path.join(this.directory, key + '.image');
  }
  async get(key) {
    try {
      const file = this.file(key);
      const stat = await fs.stat(file);
      if (stat.size > 64 * 1024 * 1024 + 4096) return null;
      const buffer = await fs.readFile(file);
      const end = buffer.indexOf(10);
      if (end < 0 || end > 4096) return null;
      const meta = JSON.parse(buffer.subarray(0, end).toString());
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(meta.contentType) || !/^https:\/\//.test(meta.gateway)) return null;
      const data = buffer.subarray(end + 1);
      if (data.length !== meta.length) return null;
      return { data, contentType: meta.contentType, gateway: meta.gateway };
    } catch { return null; }
  }
  set(key, image) {
    const write = async () => {
      let temporary;
      try {
        const file = this.file(key);
        const header = Buffer.from(JSON.stringify({ contentType: image.contentType, gateway: image.gateway, length: image.data.length }) + '\n');
        if (header.length + image.data.length > this.maxBytes) return;
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        temporary = file + '.' + randomUUID() + '.tmp';
        await fs.writeFile(temporary, Buffer.concat([header, image.data]), { mode: 0o600 });
        await fs.rename(temporary, file);
        const names = (await fs.readdir(this.directory)).filter(n => /^[A-Za-z0-9]{32,128}\.image$/.test(n));
        const entries = await Promise.all(names.map(async name => ({ name, ...await fs.stat(path.join(this.directory, name)) })));
        let total = entries.reduce((sum, entry) => sum + entry.size, 0);
        for (const entry of entries.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
          if (total <= this.maxBytes) break;
          await fs.unlink(path.join(this.directory, entry.name)); total -= entry.size;
        }
      } catch { /* Disk-cache failure must not break a live preview. */ }
      finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
    };
    this.pending = this.pending.then(write, write);
    return this.pending;
  }
}
