import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const logoPath = '/yerbas-logo.png?v=1a98ac7f97c926099fe420b121fccd27ab164038';
const pages = ['public/index.html', 'public/info.html'];

for (const page of pages) {
  test(`${page} references the served Yerbas logo asset`, async () => {
    const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    const matches = html.split(logoPath).length - 1;
    assert.ok(matches >= 3, `${page} should reference logo for favicon, header, and footer`);
  });
}

test('server whitelists the Yerbas logo PNG', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("['/yerbas-logo.png', ['yerbas-logo.png', 'image/png']]"));
});

test('Yerbas logo file is a PNG', async () => {
  const logo = await readFile(new URL('../public/yerbas-logo.png', import.meta.url));
  assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
