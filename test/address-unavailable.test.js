import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('async function renderAddress(address)'), source.indexOf('\n\nfunction assetType'));
async function page(data) {
  const app = { innerHTML: '' };
  const context = vm.createContext({ app, URLSearchParams, location: { search: '', hash: '' }, document: {},
    api: async () => data, renderLoading() {}, setRpcState() {}, updateWatchedAddressNote() {}, watchedAddressNote: () => '',
    addressLabel: () => '', addressPager: () => '', ledgerHeader: () => '', copyButton: () => '', railHeading: (...args) => args.join(' '),
    telemetryRail: rows => rows.map(row => row.label + ': ' + row.value).join('\n'),
    esc: String, number: String, yerb: value => Number(value || 0).toFixed(8) });
  await vm.runInContext(render + '\nrenderAddress("address")', context);
  return app.innerHTML;
}
test('unavailable address data is distinct from verified zero balances and empty indexes', async () => {
  const unavailable = await page({ address: 'address', history: { balance: null }, assets: { available: false } });
  assert.match(unavailable, /BALANCE: Unavailable/);
  assert.match(unavailable, /RECEIVED: Unavailable/);
  assert.match(unavailable, /ASSETS: Unavailable/);
  assert.match(unavailable, /Unspent outputs unavailable/);
  assert.doesNotMatch(unavailable, /0\.00000000 YERB|No unspent outputs/);
  const empty = await page({ address: 'address', history: { balance: { balanceYerb: '0.00000000', receivedYerb: '0.00000000' }, txidsAvailable: true, utxosAvailable: true, txidsTotal: 0, utxosTotal: 0 }, assets: { available: true, balances: {} } });
  assert.match(empty, /BALANCE: 0\.00000000 YERB/);
  assert.match(empty, /No unspent outputs/);
});
