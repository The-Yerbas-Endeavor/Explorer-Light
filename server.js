import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './src/config.js';
import { RpcError, YerbasRpc } from './src/rpc.js';
import { classifySearchInput } from './src/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const rpc = new YerbasRpc(config.rpc);
const cache = new Map();

function securityHeaders(extra = {}) {
  return {
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...extra
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, securityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  }));
  res.end(body);
}

function cached(key, ttl, producer) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.promise;

  const promise = Promise.resolve().then(producer).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { expires: now + ttl, promise });
  return promise;
}

function isHash(value) {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

async function blockHashFromIdentifier(identifier) {
  if (/^\d+$/.test(identifier)) {
    const height = Number.parseInt(identifier, 10);
    if (!Number.isSafeInteger(height) || height < 0) throw new RpcError('Invalid block height.', { code: -8 });
    return rpc.call('getblockhash', [height]);
  }
  if (!isHash(identifier)) throw new RpcError('Invalid block hash.', { code: -8 });
  return identifier.toLowerCase();
}

async function statusPayload() {
  const [chain, network, mempool] = await Promise.all([
    rpc.call('getblockchaininfo'),
    rpc.call('getnetworkinfo'),
    rpc.call('getmempoolinfo')
  ]);

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
    }
  };
}

async function recentBlocks(limit) {
  const tip = await rpc.call('getblockcount');
  const heights = Array.from({ length: Math.min(limit, tip + 1) }, (_, i) => tip - i);
  const hashes = await rpc.batch(heights.map((height) => ({ method: 'getblockhash', params: [height] })));
  const blocks = await rpc.batch(hashes.map((hash) => ({ method: 'getblock', params: [hash, 1] })));

  return blocks.map((block, index) => ({
    height: block.height ?? heights[index],
    hash: block.hash ?? hashes[index],
    time: block.time,
    confirmations: block.confirmations,
    transactions: Array.isArray(block.tx) ? block.tx.length : (block.nTx ?? null),
    size: block.size,
    difficulty: block.difficulty,
    previousBlockHash: block.previousblockhash ?? null
  }));
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    const height = await rpc.call('getblockcount');
    return sendJson(res, 200, { ok: true, rpc: true, height });
  }

  if (url.pathname === '/api/status') {
    const data = await cached('status', config.cacheMs, statusPayload);
    return sendJson(res, 200, data);
  }

  if (url.pathname === '/api/blocks') {
    const requested = Number.parseInt(url.searchParams.get('limit') || String(config.recentBlocks), 10);
    const limit = Number.isFinite(requested) ? Math.min(25, Math.max(1, requested)) : config.recentBlocks;
    const data = await cached('blocks:' + limit, config.cacheMs, () => recentBlocks(limit));
    return sendJson(res, 200, data);
  }

  if (url.pathname.startsWith('/api/block/')) {
    const identifier = decodeURIComponent(url.pathname.slice('/api/block/'.length));
    const hash = await blockHashFromIdentifier(identifier);
    const block = await rpc.call('getblock', [hash, 1]);
    return sendJson(res, 200, block);
  }

  if (url.pathname.startsWith('/api/tx/')) {
    const txid = decodeURIComponent(url.pathname.slice('/api/tx/'.length));
    if (!isHash(txid)) return sendJson(res, 400, { error: 'Invalid transaction ID.' });
    try {
      const tx = await rpc.call('getrawtransaction', [txid.toLowerCase(), true]);
      return sendJson(res, 200, tx);
    } catch (error) {
      if (error instanceof RpcError && error.code === -5) {
        error.message = 'Transaction not found. For historical transaction lookup, enable txindex=1 in yerbas.conf and reindex the node.';
      }
      throw error;
    }
  }

  if (url.pathname === '/api/search') {
    const query = url.searchParams.get('q') || '';
    const classified = classifySearchInput(query);
    if (classified.kind === 'empty') return sendJson(res, 400, { error: 'Enter a block height, block hash, transaction ID, or Yerbas address.' });

    if (classified.kind === 'height') {
      await rpc.call('getblockhash', [classified.value]);
      return sendJson(res, 200, { type: 'block', target: String(classified.value) });
    }

    if (classified.kind === 'hash') {
      try {
        await rpc.call('getblock', [classified.value, 1]);
        return sendJson(res, 200, { type: 'block', target: classified.value });
      } catch (blockError) {
        try {
          await rpc.call('getrawtransaction', [classified.value, true]);
          return sendJson(res, 200, { type: 'tx', target: classified.value });
        } catch {
          throw blockError;
        }
      }
    }

    try {
      const validation = await rpc.call('validateaddress', [classified.value]);
      if (validation?.isvalid) {
        return sendJson(res, 200, {
          type: 'address',
          target: classified.value,
          supported: false,
          message: 'This is a valid Yerbas address. Address history is intentionally not indexed in the RPC-only test build.'
        });
      }
    } catch {
      // Older nodes may not expose validateaddress. Fall through to a normal not-found response.
    }

    return sendJson(res, 404, { error: 'No block, transaction, or valid Yerbas address matched that search.' });
  }

  return sendJson(res, 404, { error: 'API route not found.' });
}

const staticFiles = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);

async function sendFile(req, res, fileName, contentType, cacheControl = 'public, max-age=300') {
  const data = await fs.readFile(path.join(publicDir, fileName));
  res.writeHead(200, securityHeaders({
    'content-type': contentType,
    'cache-control': cacheControl,
    'content-length': data.length
  }));
  if (req.method === 'HEAD') return res.end();
  res.end(data);
}

async function requestHandler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }

    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    const staticFile = staticFiles.get(url.pathname);
    if (staticFile) return await sendFile(req, res, staticFile[0], staticFile[1]);

    if (url.pathname === '/' || url.pathname.startsWith('/block/') || url.pathname.startsWith('/tx/')) {
      return await sendFile(req, res, 'index.html', 'text/html; charset=utf-8', 'no-cache');
    }

    return sendJson(res, 404, { error: 'Page not found.' });
  } catch (error) {
    const isRpc = error instanceof RpcError;
    const notFound = isRpc && [-5, -8].includes(error.code);
    const status = notFound ? 404 : (isRpc ? 502 : 500);
    console.error(error);
    return sendJson(res, status, {
      error: error.message || 'Unexpected explorer error.',
      rpcCode: isRpc ? error.code : undefined
    });
  }
}

const server = http.createServer(requestHandler);
server.listen(config.port, config.host, () => {
  console.log('Yerbas Explorer Light listening on http://' + config.host + ':' + config.port);
  console.log('Yerbas RPC target: ' + config.rpc.protocol + '://' + config.rpc.host + ':' + config.rpc.port);
  console.log('Database: disabled (RPC-only mode)');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
