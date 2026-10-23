import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('async function fetchIpfsGateway('), source.indexOf('function tarOctal('));

test('a stalled IPFS gateway times out and the next gateway is used', async () => {
  const calls = [];
  const context = vm.createContext({
    AbortController,
    setTimeout: (fn) => setTimeout(fn, 5), clearTimeout,
    config: { ipfs: { previewGateways: ['stalled', 'working'] } },
    ipfsGatewayUrl: (gateway) => gateway,
    cancelResponseBody: async () => {},
    fetch: async (url, { signal }) => {
      calls.push(url);
      if (url === 'working') return { ok: true };
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
        const error = new Error('timed out'); error.name = 'AbortError'; reject(error);
      }, { once: true }));
    }
  });
  vm.runInContext(functions, context);
  const result = await context.fetchIpfsPreviewResponse('cid', null, new AbortController().signal);
  assert.equal(result.gateway, 'working');
  assert.deepEqual(calls, ['stalled', 'working']);
});

test('overall cancellation stops IPFS fallback requests', async () => {
  const controller = new AbortController(); controller.abort();
  const context = vm.createContext({
    AbortController, setTimeout, clearTimeout,
    config: { ipfs: { previewGateways: ['first', 'second'] } },
    ipfsGatewayUrl: (gateway) => gateway,
    fetch: async (url, { signal }) => { signal.throwIfAborted(); }
  });
  vm.runInContext(functions, context);
  await assert.rejects(context.fetchIpfsPreviewResponse('cid', null, controller.signal));
});
