import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pages = ['public/index.html', 'public/info.html'];

for (const page of pages) {
  test(`${page} embeds the visible Yerbas logo`, async () => {
    const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    const embeddedLogos = html.match(/<img src="data:image\/png;base64,/g) ?? [];

    assert.ok(embeddedLogos.length >= 2, `${page} should embed header and footer logos`);
  });
}
