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

import vm from 'node:vm';
test('map search combines status, country and case-insensitive node fields', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(app.slice(app.indexOf('function networkMapHasGeo('), app.indexOf('function networkMapFilterLabel(')), context);
  const rows = [
    { service: '1.2.3.4:1234', status: 'online', geo: { latitude: 37, longitude: -122, city: 'San Jose', country: 'United States', countryCode: 'US', isp: 'Example Hosting' } },
    { service: '5.6.7.8:1234', status: 'offline', geo: null },
    { service: '9.9.9.9:1234', status: 'online', geo: { latitude: null, longitude: null } }
  ];
  assert.equal(context.networkMapSearch(rows, 'online', 'HOSTING', 'US').length, 1);
  assert.equal(context.networkMapSearch(rows, 'offline', '', 'US').length, 0);
  assert.equal(context.networkMapSearch(rows, 'unlocated', '', '').length, 2);
  assert.equal(context.networkMapSearch(rows, 'all', '5.6.7.8', '').length, 1);
  assert.equal(context.networkMapSearch(rows, 'all', 'missing', '').length, 0);
  assert.equal(context.networkMapHasGeo({ geo: { latitude: 91, longitude: 0 } }), false);
  assert.equal(context.networkMapHasGeo({ geo: { latitude: 0, longitude: 0 } }), true);
});
