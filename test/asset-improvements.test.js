import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DiskImageCache } from '../src/disk-image-cache.js';
import { metadataImageTarget } from '../src/ipfs-metadata.js';
const cid = 'QmXLQDDQytNd4THUzgQgWdpXMBU5UXTqSgXv41uHUdyGtx';
const metadata = image => Buffer.from(JSON.stringify({ image }));

test('JSON metadata resolves only IPFS and safe relative image references', () => {
  assert.deepEqual(metadataImageTarget(metadata('ipfs://' + cid + '/image.png'), cid), { cid, path: 'image.png' });
  assert.deepEqual(metadataImageTarget(metadata('https://example.org/ipfs/' + cid + '/image.png'), cid), { cid, path: 'image.png' });
  assert.deepEqual(metadataImageTarget(metadata('./image.png'), cid), { cid, path: 'image.png' });
  for (const value of ['http://127.0.0.1/a', 'https://example.org/private', 'file:///etc/passwd', '../a.png', '%2e%2e/a.png', '//example.org/a', 'data:image/png;base64,aaa']) {
    assert.equal(metadataImageTarget(metadata(value), cid), null, value);
  }
  assert.equal(metadataImageTarget(Buffer.from('not json'), cid), null);
});

test('persistent image cache survives restart and enforces stored-byte budget', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yerbas-images-'));
  try {
    const image = { data: Buffer.from('GIF89a1234'), contentType: 'image/gif', gateway: 'https://ipfs.io' };
    const first = new DiskImageCache(directory, 200);
    await first.set(cid, image);
    const restarted = new DiskImageCache(directory, 200);
    assert.deepEqual(await restarted.get(cid), image);
    await restarted.set('b'.repeat(40), image);
    const files = await fs.readdir(directory);
    const sizes = await Promise.all(files.map(async file => (await fs.stat(path.join(directory, file))).size));
    assert.ok(sizes.reduce((a, b) => a + b, 0) <= 200);
    assert.equal(await restarted.get('../bad'), null);
    await fs.writeFile(path.join(directory, 'c'.repeat(40) + '.image'), 'corrupt');
    assert.equal(await restarted.get('c'.repeat(40)), null);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
