import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceBackfill } from '../src/reference-backfill.js';

const timestamp = 1794884400;
const quote = (price, denomination = 'USDT') => [{ timestamp, price, quote: denomination }];
const markets = {
  nestex: quote(0.00013081),
  gatevia: quote(0.0017, 'DOGE'),
  neoxex: quote(0.00024),
  filodex: quote(0.00013144),
  spotex: quote(0.00004103),
  'yerb-reference-four': quote(0.0001595582075),
  'yerb-reference-five': quote(0.00013585256600000001)
};

test('recovers the conversion and exchange inputs of both matching averages', () => {
  for (const [exchange, count] of [['yerb-reference-four', 4], ['yerb-reference-five', 5]]) {
    const [point] = referenceBackfill(markets, exchange);
    assert.equal(point.price, markets[exchange][0].price);
    assert.equal(point.sources.length, count);
    assert.equal(point.sources[1].quoteUsdt, 0.0799899);
    assert.equal(point.sources[1].priceUsdt, 0.00013598283);
    assert.equal(point.sources[1].reconstructed, true);
  }
});

test('preserves points with missing inputs, conflicting averages, or existing sources', () => {
  const key = 'yerb-reference-five';
  for (const overrides of [{ spotex: [] }, { 'yerb-reference-four': quote(0.00016) }, {
    [key]: [{ ...markets[key][0], sources: [{ exchange: 'nestex' }] }]
  }]) {
    const state = { ...markets, ...overrides };
    assert.strictEqual(referenceBackfill(state, key)[0], state[key][0]);
  }
});
