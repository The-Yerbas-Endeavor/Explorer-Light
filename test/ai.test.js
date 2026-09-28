import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiToolError,
  AI_TOOL_DEFINITIONS,
  createAiGateway
} from '../src/ai.js';

function fakeRpc(handlers) {
  return {
    async call(method, params = []) {
      if (!(method in handlers)) throw new Error('Unexpected RPC method: ' + method);
      const handler = handlers[method];
      return typeof handler === 'function' ? handler(params) : handler;
    },
    async batch(calls) {
      return Promise.all(calls.map((call) => this.call(call.method, call.params || [])));
    }
  };
}

test('publishes the planned read-only AI tool surface', () => {
  const names = AI_TOOL_DEFINITIONS.map((tool) => tool.name);
  assert.deepEqual(names, [
    'get_network_summary',
    'get_recent_blocks',
    'get_block',
    'get_transaction',
    'get_address',
    'get_supply',
    'get_emission',
    'get_smartnodes',
    'get_smartnodes_by_collateral',
    'get_asset',
    'get_market_price'
  ]);
});

test('rejects arbitrary or unknown RPC-style tool names', async () => {
  const gateway = createAiGateway({ rpc: fakeRpc({}) });

  await assert.rejects(
    () => gateway.invoke('sendrawtransaction', {}),
    (error) => error instanceof AiToolError
      && error.code === 'UNKNOWN_TOOL'
      && error.status === 404
  );
});

test('smartnode results omit wallet ownership metadata and filter collateral', async () => {
  const gateway = createAiGateway({
    rpc: fakeRpc({
      protx: [
        {
          proTxHash: 'a'.repeat(64),
          collateralHash: 'b'.repeat(64),
          collateralIndex: 1,
          collateralAddress: 'yCollateral',
          collateralAmount: 69000,
          needToUpgrade: false,
          confirmations: 123,
          operatorReward: 0,
          state: {
            service: '127.0.0.1:9999',
            registeredHeight: 100,
            lastPaidHeight: 200,
            PoSePenalty: 0,
            PoSeRevivedHeight: -1,
            PoSeBanHeight: -1,
            ownerAddress: 'yOwner',
            votingAddress: 'yVoting',
            payoutAddress: 'yPayee',
            pubKeyOperator: 'operator-public-key'
          },
          wallet: {
            hasOwnerKey: true,
            ownsCollateral: true
          }
        },
        {
          proTxHash: 'c'.repeat(64),
          collateralHash: 'd'.repeat(64),
          collateralIndex: 0,
          collateralAddress: 'yOtherCollateral',
          collateralAmount: 100000,
          needToUpgrade: false,
          state: { PoSeBanHeight: -1 }
        }
      ]
    })
  });

  const response = await gateway.invoke('get_smartnodes_by_collateral', { amount: 69000 });
  assert.equal(response.data.total, 1);
  assert.equal(response.data.items[0].collateral.amount, 69000);
  assert.equal(response.data.items[0].status, 'ENABLED');
  assert.equal('wallet' in response.data.items[0], false);
  assert.equal('hasOwnerKey' in response.data.items[0], false);
});

test('invalid address lookup does not expose wallet metadata or require indexes', async () => {
  const calls = [];
  const gateway = createAiGateway({
    rpc: fakeRpc({
      validateaddress(params) {
        calls.push(['validateaddress', params]);
        return { isvalid: false, ismine: true, account: 'must-not-leak' };
      }
    })
  });

  const response = await gateway.invoke('get_address', { address: 'not-a-valid-address' });
  assert.deepEqual(response.data, {
    address: 'not-a-valid-address',
    isValid: false,
    history: { available: false }
  });
  assert.equal(calls.length, 1);
});

test('manifest explicitly denies signing, broadcasting, wallet, and shell capabilities', () => {
  const gateway = createAiGateway({ rpc: fakeRpc({}) });
  const manifest = gateway.manifest();

  assert.equal(manifest.readOnly, true);
  assert.equal(manifest.endpoints.status, '/api/ai/v1/status');
  assert.equal(manifest.endpoints.tools, '/api/ai/v1/tools');
  assert.equal(manifest.endpoints.query, '/api/ai/v1/query');
  for (const capability of [
    'wallet_access',
    'private_keys',
    'signing',
    'transaction_creation',
    'transaction_broadcast',
    'shell_execution',
    'arbitrary_rpc'
  ]) {
    assert.ok(manifest.prohibitedCapabilities.includes(capability));
  }
});
