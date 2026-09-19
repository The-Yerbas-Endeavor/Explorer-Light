import { RpcError } from './rpc.js';

export const AI_API_VERSION = '0.1.0';
export const AI_PROTOCOL = 'yerbas-ai-tools';

export class AiToolError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AiToolError';
    this.code = options.code || 'AI_TOOL_ERROR';
    this.status = options.status || 400;
  }
}

const HASH_RE = /^[0-9a-fA-F]{64}$/;
const DUFFS_PER_YERB = 100000000;

function intArg(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AiToolError(name + ' must be an integer between ' + min + ' and ' + max + '.', {
      code: 'INVALID_ARGUMENT'
    });
  }
  return parsed;
}

function numberArg(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AiToolError(name + ' must be a non-negative number.', { code: 'INVALID_ARGUMENT' });
  }
  return parsed;
}

function stringArg(value, name, maxLength = 256) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) {
    throw new AiToolError(name + ' is required and must be at most ' + maxLength + ' characters.', {
      code: 'INVALID_ARGUMENT'
    });
  }
  return text;
}

function hashArg(value, name) {
  const hash = stringArg(value, name, 64).toLowerCase();
  if (!HASH_RE.test(hash)) {
    throw new AiToolError(name + ' must be a 64-character hexadecimal hash.', { code: 'INVALID_ARGUMENT' });
  }
  return hash;
}

function duffsToYerb(value) {
  if (!Number.isFinite(Number(value))) return null;
  return (Number(value) / DUFFS_PER_YERB).toFixed(8);
}

function normalizeSmartnode(item) {
  const state = item?.state || {};
  const poseBanHeight = state.PoSeBanHeight ?? state.poseBanHeight ?? -1;
  const needToUpgrade = Boolean(item?.needToUpgrade);
  const status = poseBanHeight !== -1
    ? 'POSE_BANNED'
    : (needToUpgrade ? 'COLLATERAL_NOT_PAYABLE' : 'ENABLED');

  return {
    proTxHash: item?.proTxHash ?? null,
    status,
    service: state.service ?? null,
    collateral: {
      txid: item?.collateralHash ?? null,
      index: item?.collateralIndex ?? null,
      address: item?.collateralAddress ?? null,
      amount: item?.collateralAmount ?? null
    },
    confirmations: item?.confirmations ?? null,
    needToUpgrade,
    operatorReward: item?.operatorReward ?? null,
    registeredHeight: state.registeredHeight ?? null,
    lastPaidHeight: state.lastPaidHeight ?? null,
    PoSePenalty: state.PoSePenalty ?? null,
    PoSeRevivedHeight: state.PoSeRevivedHeight ?? null,
    PoSeBanHeight: poseBanHeight,
    ownerAddress: state.ownerAddress ?? null,
    votingAddress: state.votingAddress ?? null,
    payoutAddress: state.payoutAddress ?? null,
    pubKeyOperator: state.pubKeyOperator ?? null
  };
}

function rpcReason(error) {
  if (error instanceof RpcError) {
    return {
      rpcCode: error.code,
      message: error.message
    };
  }
  return { message: error?.message || 'Unavailable.' };
}

export const AI_TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'get_network_summary',
    description: 'Return a compact live Yerbas chain, peer, mempool, smartnode, and current-emission summary.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_recent_blocks',
    description: 'Return compact summaries for the most recent Yerbas blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 25, default: 10 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_block',
    description: 'Return a Yerbas block by height or hash. Full transaction objects are optional.',
    inputSchema: {
      type: 'object',
      properties: {
        height: { type: 'integer', minimum: 0 },
        hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
        include_transactions: { type: 'boolean', default: false }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_transaction',
    description: 'Return a public Yerbas transaction. Supplying block_hash avoids requiring txindex for historical transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        txid: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
        block_hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }
      },
      required: ['txid'],
      additionalProperties: false
    }
  },
  {
    name: 'get_address',
    description: 'Validate a Yerbas address and, when Core addressindex is enabled, return balance, txids, and UTXOs.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', minLength: 1, maxLength: 128 },
        start_height: { type: 'integer', minimum: 0 },
        end_height: { type: 'integer', minimum: 0 },
        tx_limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        utxo_limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
      },
      required: ['address'],
      additionalProperties: false
    }
  },
  {
    name: 'get_supply',
    description: 'Return the current UTXO-set supply snapshot reported by Yerbas Core.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_emission',
    description: 'Return the block subsidy/emission for a requested height, or the current tip when omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        height: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_smartnodes',
    description: 'Return sanitized public deterministic smartnode data with optional status/collateral filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['ALL', 'ENABLED', 'POSE_BANNED', 'COLLATERAL_NOT_PAYABLE'],
          default: 'ALL'
        },
        collateral_amount: { type: 'number', minimum: 0 },
        offset: { type: 'integer', minimum: 0, default: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_smartnodes_by_collateral',
    description: 'Return sanitized public smartnodes matching an exact collateral amount.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 0 },
        offset: { type: 'integer', minimum: 0, default: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 500 }
      },
      required: ['amount'],
      additionalProperties: false
    }
  },
  {
    name: 'get_asset',
    description: 'Return public Yerbas asset metadata from the Core asset registry.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', minLength: 1, maxLength: 64 }
      },
      required: ['asset_id'],
      additionalProperties: false
    }
  },
  {
    name: 'get_market_price',
    description: 'Return market price data from an administrator-configured read-only JSON endpoint, when configured.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
]);

const PROHIBITED_CAPABILITIES = Object.freeze([
  'arbitrary_rpc',
  'wallet_access',
  'private_keys',
  'signing',
  'transaction_creation',
  'transaction_broadcast',
  'shell_execution'
]);

export function createAiGateway({ rpc, cached, marketPriceUrl = '' }) {
  if (!rpc || typeof rpc.call !== 'function') throw new Error('createAiGateway requires an RPC client.');
  const cache = typeof cached === 'function'
    ? cached
    : async (_key, _ttl, producer) => producer();

  async function getNetworkSummary() {
    return cache('ai:network-summary', 5000, async () => {
      const [chain, network, mempool, smartnodes] = await Promise.all([
        rpc.call('getblockchaininfo'),
        rpc.call('getnetworkinfo'),
        rpc.call('getmempoolinfo'),
        rpc.call('smartnode', ['count']).catch(() => null)
      ]);

      let emission = null;
      try {
        const stats = await rpc.call('getblockstats', [
          chain.blocks,
          ['height', 'blockhash', 'time', 'subsidy', 'txs']
        ]);
        emission = {
          height: stats.height,
          blockHash: stats.blockhash,
          subsidyDuffs: stats.subsidy,
          subsidyYerb: duffsToYerb(stats.subsidy),
          transactionsExcludingCoinbase: stats.txs,
          time: stats.time
        };
      } catch {
        // Older nodes may not expose getblockstats. Network summary still remains useful.
      }

      return {
        chain: chain.chain,
        blocks: chain.blocks,
        headers: chain.headers,
        bestBlockHash: chain.bestblockhash,
        difficulty: chain.difficulty,
        verificationProgress: chain.verificationprogress,
        initialBlockDownload: chain.initialblockdownload,
        network: {
          version: network.version,
          subversion: network.subversion,
          protocolVersion: network.protocolversion,
          connections: network.connections,
          relayFee: network.relayfee
        },
        mempool: {
          transactions: mempool.size,
          bytes: mempool.bytes,
          usage: mempool.usage
        },
        smartnodes,
        emission
      };
    });
  }

  async function getRecentBlocks(args) {
    const limit = intArg(args.limit, 10, 1, 25, 'limit');
    return cache('ai:recent-blocks:' + limit, 5000, async () => {
      const tip = await rpc.call('getblockcount');
      const heights = Array.from({ length: Math.min(limit, tip + 1) }, (_, index) => tip - index);
      const hashes = await rpc.batch(heights.map((height) => ({ method: 'getblockhash', params: [height] })));
      const blocks = await rpc.batch(hashes.map((hash) => ({ method: 'getblock', params: [hash, 1] })));

      return blocks.map((block, index) => ({
        height: block.height ?? heights[index],
        hash: block.hash ?? hashes[index],
        time: block.time,
        confirmations: block.confirmations,
        transactions: Array.isArray(block.tx) ? block.tx.length : (block.nTx ?? null),
        size: block.size,
        difficulty: block.difficulty
      }));
    });
  }

  async function getBlock(args) {
    const hasHeight = args.height !== undefined && args.height !== null;
    const hasHash = args.hash !== undefined && args.hash !== null;
    if (hasHeight === hasHash) {
      throw new AiToolError('Supply exactly one of height or hash.', { code: 'INVALID_ARGUMENT' });
    }

    const hash = hasHeight
      ? await rpc.call('getblockhash', [intArg(args.height, null, 0, Number.MAX_SAFE_INTEGER, 'height')])
      : hashArg(args.hash, 'hash');
    const verbosity = args.include_transactions === true ? 2 : 1;
    return rpc.call('getblock', [hash, verbosity]);
  }

  async function getTransaction(args) {
    const txid = hashArg(args.txid, 'txid');
    if (args.block_hash) {
      const blockHash = hashArg(args.block_hash, 'block_hash');
      const block = await rpc.call('getblock', [blockHash, 2]);
      const tx = Array.isArray(block.tx)
        ? block.tx.find((entry) => entry && typeof entry === 'object' && entry.txid === txid)
        : null;
      if (!tx) {
        throw new AiToolError('Transaction was not found in the supplied block.', {
          code: 'NOT_FOUND',
          status: 404
        });
      }
      return {
        ...tx,
        blockhash: tx.blockhash || block.hash || blockHash,
        confirmations: tx.confirmations ?? block.confirmations,
        blocktime: tx.blocktime || block.time
      };
    }

    try {
      return await rpc.call('getrawtransaction', [txid, true]);
    } catch (error) {
      if (error instanceof RpcError && error.code === -5) {
        throw new AiToolError(
          'Historical transaction lookup by TXID requires Core txindex=1. Supply block_hash when the containing block is already known.',
          { code: 'TXINDEX_REQUIRED', status: 409 }
        );
      }
      throw error;
    }
  }

  async function getAddress(args) {
    const address = stringArg(args.address, 'address', 128);
    const validation = await rpc.call('validateaddress', [address]);
    if (!validation?.isvalid) {
      return {
        address,
        isValid: false,
        history: { available: false }
      };
    }

    const txLimit = intArg(args.tx_limit, 50, 1, 200, 'tx_limit');
    const utxoLimit = intArg(args.utxo_limit, 50, 1, 200, 'utxo_limit');
    const start = args.start_height === undefined
      ? null
      : intArg(args.start_height, null, 0, Number.MAX_SAFE_INTEGER, 'start_height');
    const end = args.end_height === undefined
      ? null
      : intArg(args.end_height, null, 0, Number.MAX_SAFE_INTEGER, 'end_height');

    if ((start === null) !== (end === null)) {
      throw new AiToolError('start_height and end_height must be supplied together.', { code: 'INVALID_ARGUMENT' });
    }
    if (start !== null && end < start) {
      throw new AiToolError('end_height must be greater than or equal to start_height.', {
        code: 'INVALID_ARGUMENT'
      });
    }

    const addressParams = { addresses: [address] };
    if (start !== null) {
      addressParams.start = start;
      addressParams.end = end;
    }

    const [balanceResult, txidResult, utxoResult, assetResult] = await Promise.allSettled([
      rpc.call('getaddressbalance', [{ addresses: [address] }]),
      rpc.call('getaddresstxids', [addressParams]),
      rpc.call('getaddressutxos', [{ addresses: [address] }]),
      rpc.call('listassetbalancesbyaddress', [address, false, 500, 0])
    ]);

    const indexed = [balanceResult, txidResult, utxoResult].some((result) => result.status === 'fulfilled');
    const txids = txidResult.status === 'fulfilled' && Array.isArray(txidResult.value)
      ? txidResult.value.slice(-txLimit).reverse()
      : [];
    const utxos = utxoResult.status === 'fulfilled' && Array.isArray(utxoResult.value)
      ? utxoResult.value.slice(-utxoLimit).reverse()
      : [];

    let assetBalances = null;
    let assetIndexAvailable = false;
    if (assetResult.status === 'fulfilled' && typeof assetResult.value !== 'string') {
      assetBalances = assetResult.value;
      assetIndexAvailable = true;
    }

    return {
      address,
      isValid: true,
      history: {
        available: indexed,
        startHeight: start,
        endHeight: end,
        balance: balanceResult.status === 'fulfilled'
          ? {
              balanceDuffs: balanceResult.value.balance,
              balanceYerb: duffsToYerb(balanceResult.value.balance),
              receivedDuffs: balanceResult.value.received,
              receivedYerb: duffsToYerb(balanceResult.value.received)
            }
          : null,
        txids,
        txidsReturned: txids.length,
        utxos,
        utxosReturned: utxos.length,
        unavailableReason: indexed
          ? null
          : rpcReason(
              balanceResult.status === 'rejected'
                ? balanceResult.reason
                : (txidResult.status === 'rejected' ? txidResult.reason : utxoResult.reason)
            )
      },
      assets: {
        available: assetIndexAvailable,
        balances: assetBalances
      }
    };
  }

  async function getSupply() {
    return cache('ai:supply', 60000, async () => {
      const stats = await rpc.call('gettxoutsetinfo');
      return {
        height: stats.height,
        bestBlock: stats.bestblock,
        transactions: stats.transactions,
        txouts: stats.txouts,
        totalAmountYerb: stats.total_amount,
        hashSerialized: stats.hash_serialized_2 ?? stats.hash_serialized ?? null
      };
    });
  }

  async function getEmission(args) {
    const height = args.height === undefined
      ? await rpc.call('getblockcount')
      : intArg(args.height, null, 0, Number.MAX_SAFE_INTEGER, 'height');

    return cache('ai:emission:' + height, 30000, async () => {
      const stats = await rpc.call('getblockstats', [
        height,
        ['height', 'blockhash', 'time', 'subsidy', 'txs']
      ]);
      return {
        height: stats.height,
        blockHash: stats.blockhash,
        time: stats.time,
        subsidyDuffs: stats.subsidy,
        subsidyYerb: duffsToYerb(stats.subsidy),
        transactionsExcludingCoinbase: stats.txs
      };
    });
  }

  async function loadSmartnodes() {
    return cache('ai:smartnodes:registered', 15000, async () => {
      const rows = await rpc.call('protx', ['list', 'registered', true]);
      if (!Array.isArray(rows)) return [];
      return rows.map(normalizeSmartnode);
    });
  }

  async function getSmartnodes(args) {
    const limit = intArg(args.limit, 100, 1, 500, 'limit');
    const offset = intArg(args.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset');
    const status = String(args.status || 'ALL').toUpperCase();
    const allowedStatuses = new Set(['ALL', 'ENABLED', 'POSE_BANNED', 'COLLATERAL_NOT_PAYABLE']);
    if (!allowedStatuses.has(status)) {
      throw new AiToolError('Unknown smartnode status filter.', { code: 'INVALID_ARGUMENT' });
    }

    const collateralAmount = args.collateral_amount === undefined
      ? null
      : numberArg(args.collateral_amount, 'collateral_amount');

    let rows = await loadSmartnodes();
    if (status !== 'ALL') rows = rows.filter((row) => row.status === status);
    if (collateralAmount !== null) {
      rows = rows.filter((row) => Number(row.collateral.amount) === collateralAmount);
    }

    const total = rows.length;
    const items = rows.slice(offset, offset + limit);
    return {
      total,
      returned: items.length,
      offset,
      limit,
      truncated: offset + items.length < total,
      items
    };
  }

  async function getSmartnodesByCollateral(args) {
    const amount = numberArg(args.amount, 'amount');
    return getSmartnodes({
      collateral_amount: amount,
      status: 'ALL',
      offset: args.offset,
      limit: args.limit ?? 500
    });
  }

  async function getAsset(args) {
    const assetId = stringArg(args.asset_id, 'asset_id', 64);
    return cache('ai:asset:' + assetId, 30000, async () => {
      const data = await rpc.call('getassetdata', [assetId]);
      if (data === null || data === undefined) {
        throw new AiToolError('Asset was not found.', { code: 'NOT_FOUND', status: 404 });
      }
      return {
        assetId,
        data
      };
    });
  }

  async function getMarketPrice() {
    if (!marketPriceUrl) {
      return {
        available: false,
        reason: 'No market price endpoint is configured for Explorer Light.'
      };
    }

    let url;
    try {
      url = new URL(marketPriceUrl);
    } catch {
      throw new AiToolError('AI_MARKET_PRICE_URL is invalid.', { code: 'SERVER_CONFIGURATION', status: 500 });
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new AiToolError('AI_MARKET_PRICE_URL must use HTTP or HTTPS.', {
        code: 'SERVER_CONFIGURATION',
        status: 500
      });
    }

    return cache('ai:market-price', 15000, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: controller.signal
        });
        if (!response.ok) {
          throw new AiToolError('Market price endpoint returned HTTP ' + response.status + '.', {
            code: 'MARKET_SOURCE_ERROR',
            status: 502
          });
        }
        return {
          available: true,
          source: url.toString(),
          data: await response.json()
        };
      } finally {
        clearTimeout(timer);
      }
    });
  }

  const handlers = {
    get_network_summary: getNetworkSummary,
    get_recent_blocks: getRecentBlocks,
    get_block: getBlock,
    get_transaction: getTransaction,
    get_address: getAddress,
    get_supply: getSupply,
    get_emission: getEmission,
    get_smartnodes: getSmartnodes,
    get_smartnodes_by_collateral: getSmartnodesByCollateral,
    get_asset: getAsset,
    get_market_price: getMarketPrice
  };

  async function invoke(name, args = {}) {
    if (typeof name !== 'string' || !(name in handlers)) {
      throw new AiToolError('Unknown AI tool.', { code: 'UNKNOWN_TOOL', status: 404 });
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new AiToolError('Tool arguments must be a JSON object.', { code: 'INVALID_ARGUMENT' });
    }

    const data = await handlers[name](args);
    return {
      ok: true,
      tool: name,
      data,
      meta: {
        protocol: AI_PROTOCOL,
        version: AI_API_VERSION,
        readOnly: true,
        source: 'Yerbas Core RPC / public blockchain data',
        generatedAt: new Date().toISOString()
      }
    };
  }

  function manifest() {
    return {
      protocol: AI_PROTOCOL,
      version: AI_API_VERSION,
      name: 'Yerbas Explorer Light AI Gateway',
      readOnly: true,
      sourceOfTruth: 'Yerbas Core / Yerbas blockchain',
      endpoints: {
        manifest: '/.well-known/yerbas-ai.json',
        status: '/api/ai/status',
        tools: '/api/ai/tools',
        query: '/api/ai/query',
        legacyStatus: '/ext/ai/status',
        legacyQuery: '/ext/ai/query'
      },
      tools: AI_TOOL_DEFINITIONS,
      marketPriceConfigured: Boolean(marketPriceUrl),
      nativeCoreIndexes: {
        txindex: 'recommended for arbitrary historical TXID lookup',
        addressindex: 'recommended for address balances, txids, and UTXOs',
        assetindex: 'recommended for address asset balances and holder-style queries'
      },
      prohibitedCapabilities: PROHIBITED_CAPABILITIES,
      future: {
        mcpAdapter: 'schema-ready; protocol adapter not yet enabled',
        agentIdentity: 'not implemented',
        signedAgentMessages: 'not implemented',
        payments: 'not implemented'
      }
    };
  }

  async function status() {
    const [height, chain] = await Promise.all([
      rpc.call('getblockcount'),
      rpc.call('getblockchaininfo')
    ]);
    return {
      ok: true,
      service: 'Yerbas Explorer Light AI Gateway',
      protocol: AI_PROTOCOL,
      version: AI_API_VERSION,
      readOnly: true,
      chain: chain.chain,
      height,
      synced: !chain.initialblockdownload && chain.blocks === chain.headers,
      tools: AI_TOOL_DEFINITIONS.length,
      marketPriceConfigured: Boolean(marketPriceUrl),
      prohibitedCapabilities: PROHIBITED_CAPABILITIES
    };
  }

  return { invoke, manifest, status };
}
