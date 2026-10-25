import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageCache } from '../src/image-cache.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('image cache enforces byte budget, expiry and least recently used eviction', () => {
  const cache = new ImageCache(10, 100);
  const image = { data: Buffer.alloc(4), contentType: 'image/png' };
  cache.set('a', image, 0); cache.set('b', image, 0);
  assert.equal(cache.get('a', 1), image);
  cache.set('c', image, 1);
  assert.equal(cache.get('b', 2), null);
  assert.equal(cache.bytes, 8);
  cache.set('large', { data: Buffer.alloc(11) }, 2);
  assert.equal(cache.bytes, 8);
  assert.equal(cache.get('a', 100), null);
  assert.equal(cache.bytes, 4);
  cache.set('c', image, 3);
  assert.equal(cache.bytes, 4);
});

test('browser IPFS URLs preserve the two reported on-chain CIDs', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function browserIpfsUrl('), source.indexOf('function initializeAssetPreview(')), context);
  assert.equal(context.browserIpfsUrl('QmXLQDDQytNd4THUzgQgWdpXMBU5UXTqSgXv41uHUdyGtx'), 'https://bafybeiefvdfax2nn7c5mtsclp62hqrucoucezp3mm5vvk7jygsxjopnpye.ipfs.inbrowser.link/');
  assert.equal(context.browserIpfsUrl('QmbVUC8MYghmpCAyf8cc7xrgDjMvaPXUh6Z6b7nHDHSSHT'), 'https://bafybeigdnjca5rlshwgmsf5sb7iyd2dk4vxwqaf4u5o4hsbxugudmzfjey.ipfs.inbrowser.link/');
  assert.equal(context.browserIpfsUrl('bafybeiefvdfax2nn7c5mtsclp62hqrucoucezp3mm5vvk7jygsxjopnpye'), 'https://bafybeiefvdfax2nn7c5mtsclp62hqrucoucezp3mm5vvk7jygsxjopnpye.ipfs.inbrowser.link/');
});
