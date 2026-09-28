import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('network map pins counter-scale against map zoom', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(app.includes('const screenPinScale = Math.min(1.7, 1 + (mapView.scale - 1) * 0.1)'));
  assert.ok(app.includes("pinsElement.style.setProperty('--network-pin-scale'"));
  assert.ok(app.includes("pinsElement.style.setProperty('--network-pin-hover-scale'"));
  assert.ok(css.includes('scale(var(--network-pin-scale, 1))'));
  assert.ok(css.includes('scale(var(--network-pin-hover-scale, 1.16))'));
});
