import assert from 'node:assert/strict';
import test from 'node:test';

import { classifySearchInput } from '../src/search.js';

test('classifies a block height', () => {
  assert.deepEqual(classifySearchInput(' 12345 '), { kind: 'height', value: 12345 });
});

test('classifies a 64-character hash', () => {
  const hash = 'AB'.repeat(32);
  assert.deepEqual(classifySearchInput(hash), { kind: 'hash', value: hash.toLowerCase() });
});

test('leaves address-like input for RPC validation', () => {
  assert.deepEqual(classifySearchInput('yExampleAddress'), { kind: 'address-or-unknown', value: 'yExampleAddress' });
});

test('classifies empty input', () => {
  assert.deepEqual(classifySearchInput('   '), { kind: 'empty', value: '' });
});
