import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pages = ['public/index.html', 'public/info.html'];

const logoBytes = await readFile(new URL('../public/yerbas-logo.png', import.meta.url));
const logoBase64 = logoBytes.toString('base64');

for (const page of pages) {
  test(`${page} embeds the exact Yerbas logo bytes`, async () => {
    const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    const embeddedLogos = [...html.matchAll(/<img src="data:image\/png;base64,([^"]+)"/g)]
      .map((match) => match[1]);

    assert.ok(embeddedLogos.length >= 2, `${page} should embed header and footer logos`);

    for (const embedded of embeddedLogos) {
      assert.equal(embedded, logoBase64, `${page} embedded logo must match public/yerbas-logo.png exactly`);
    }
  });
}
