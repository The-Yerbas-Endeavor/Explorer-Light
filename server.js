import fs from 'node:fs/promises';
import http from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AiToolError, AI_API_VERSION, AI_PROTOCOL, AI_TOOL_DEFINITIONS, createAiGateway } from './src/ai.js';
import { config } from './src/config.js';
import { RpcError, YerbasRpc } from './src/rpc.js';
import { classifySearchInput } from './src/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const rpc = new YerbasRpc(config.rpc);
const cache = new Map();
const networkGeoCache = new Map();

function securityHeaders(extra = {}) {
  return {
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://ipfs.io https://upload.wikimedia.org; frame-src https://ipfs.io; base-uri 'none'; frame-ancestors 'none'",
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
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body)
  }));
  res.end(body);
}

function sendText(res, status, data) {
  const body = String(data ?? '');
  res.writeHead(status, securityHeaders({
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body)
  }));
  res.end(body);
}

function apiInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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

const ai = createAiGateway({
  rpc,
  cached,
  marketPriceUrl: config.ai.marketPriceUrl
});

function isHash(value) {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

function isAiPath(pathname) {
  return pathname === '/.well-known/yerbas-ai.json'
    || pathname === '/api/ai/v1/status'
    || pathname === '/api/ai/v1/tools'
    || pathname === '/api/ai/v1/query'
    || pathname === '/api/ai/status'
    || pathname === '/api/ai/tools'
    || pathname === '/api/ai/query'
    || pathname === '/ext/ai/status'
    || pathname === '/ext/ai/query';
}

function isAiQueryPath(pathname) {
  return pathname === '/api/ai/v1/query'
    || pathname === '/api/ai/query'
    || pathname === '/ext/ai/query';
}

async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new AiToolError('AI query body exceeds the configured size limit.', {
        code: 'BODY_TOO_LARGE',
        status: 413
      });
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AiToolError('AI query body must contain valid JSON.', {
      code: 'INVALID_JSON',
      status: 400
    });
  }
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

async function recentBlocks(limit, offset = 0) {
  const tip = await rpc.call('getblockcount');
  const safeOffset = Math.max(0, offset);
  if (safeOffset > tip) return [];
  const start = tip - safeOffset;
  const heights = Array.from({ length: Math.min(limit, start + 1) }, (_, i) => start - i);
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

function assetKind(name) {
  if (name.endsWith('!')) return 'Owner';
  if (name.startsWith('$')) return 'Restricted';
  if (name.startsWith('#')) return 'Qualifier';
  if (name.includes('#')) return 'Unique';
  if (name.includes('/')) return 'Sub-asset';
  return 'Root';
}

function assetMetadataRef(metadata = {}) {
  const ipfs = metadata.ipfs_hash || null;
  const txid = metadata.txid_hash || metadata.txid || null;
  if (ipfs) return { type: 'ipfs', value: ipfs };
  if (txid) return { type: 'txid', value: txid };
  return null;
}

async function loadAssetDirectory() {
  return cached('assets:directory:all', 60000, async () => {
    const assets = await rpc.call('listassets', ['*', true, 50000, 0]);
    if (typeof assets === 'string') {
      throw new RpcError(assets.replace(/^_/, ''), { method: 'listassets' });
    }

    return Object.entries(assets || {}).map(([name, metadata]) => ({
      name,
      type: assetKind(name),
      metadataRef: assetMetadataRef(metadata),
      ...metadata
    }));
  });
}

async function loadHolderCounts(names) {
  if (!names.length) return [];
  const calls = names.map((name) => ({
    method: 'listaddressesbyasset',
    params: [name, true]
  }));

  try {
    return await rpc.batch(calls);
  } catch {
    const values = [];
    for (const name of names) {
      try {
        values.push(await rpc.call('listaddressesbyasset', [name, true]));
      } catch {
        values.push(null);
      }
    }
    return values;
  }
}

async function loadAssetIndexStats() {
  return cached('assets:index-stats', 300000, async () => {
    const assets = await loadAssetDirectory();
    const holderCounts = [];
    const chunkSize = 50;

    for (let offset = 0; offset < assets.length; offset += chunkSize) {
      const chunk = assets.slice(offset, offset + chunkSize);
      const counts = await loadHolderCounts(chunk.map((asset) => asset.name));
      holderCounts.push(...counts);
    }

    const indexedHolders = holderCounts.reduce((sum, value) => {
      const count = Number(value);
      return sum + (Number.isFinite(count) ? count : 0);
    }, 0);

    return {
      ready: true,
      indexedAssets: assets.length,
      indexedHolders,
      generatedAt: new Date().toISOString()
    };
  });
}

async function handleAi(req, res, url) {
  if (!config.ai.enabled) {
    return sendJson(res, 404, { error: 'Not found.' });
  }

  if (url.pathname === '/.well-known/yerbas-ai.json') {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    return sendJson(res, 200, ai.manifest());
  }

  if (url.pathname === '/api/ai/v1/status' || url.pathname === '/api/ai/status' || url.pathname === '/ext/ai/status') {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    return sendJson(res, 200, await ai.status());
  }

  if (url.pathname === '/api/ai/v1/tools' || url.pathname === '/api/ai/tools') {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    return sendJson(res, 200, {
      protocol: AI_PROTOCOL,
      version: AI_API_VERSION,
      readOnly: true,
      tools: AI_TOOL_DEFINITIONS
    });
  }

  if (isAiQueryPath(url.pathname)) {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed. AI tool invocation requires POST.' });
    }

    const body = await readJsonBody(req, config.ai.maxBodyBytes);
    const tool = body.tool || body.name || (typeof body.query === 'string' ? body.query : '');
    const args = body.arguments || body.args || body.params || {};
    const result = await ai.invoke(tool, args);
    return sendJson(res, 200, result);
  }

  return sendJson(res, 404, { error: 'AI route not found.' });
}

function serviceHost(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    return end > 1 ? text.slice(1, end) : '';
  }

  const firstColon = text.indexOf(':');
  const lastColon = text.lastIndexOf(':');

  if (firstColon > 0 && firstColon === lastColon) {
    return text.slice(0, lastColon);
  }

  return text;
}

function isPublicIp(ip) {
  const version = isIP(ip);
  if (!version) return false;

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;

    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
    return true;
  }

  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return false;
  if (lower.startsWith('fe80:')) return false;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
  if (lower.startsWith('2001:db8:')) return false;
  return true;
}

function normalizeGeoResult(row) {
  if (!row || typeof row !== 'object') return null;

  const location = row.location && typeof row.location === 'object' ? row.location : row;
  const ip = row.ip || row.query || row.address || null;
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lon ?? location.lng);

  if (!ip || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    ip: String(ip),
    latitude,
    longitude,
    city: location.city || row.city || null,
    region: location.region || location.region_name || row.region || row.regionName || null,
    countryCode: location.country || location.country_code || row.countryCode || row.country_code || null,
    country: location.country_name || row.country || row.country_name || location.country || null,
    isp: row.network?.isp || row.isp || row.org || null,
    asn: row.network?.asn || row.asn || null
  };
}

async function geolocateIps(ips) {
  if (!config.networkMap.enabled) return new Map();

  const now = Date.now();
  const unique = [...new Set(ips.filter(isPublicIp))];
  const results = new Map();
  const missing = [];

  for (const ip of unique) {
    const cachedGeo = networkGeoCache.get(ip);
    if (cachedGeo && cachedGeo.expiresAt > now) {
      if (cachedGeo.value) results.set(ip, cachedGeo.value);
    } else {
      missing.push(ip);
    }
  }

  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.networkMap.geoTimeoutMs);

      const response = await fetch(config.networkMap.geoUrl, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'user-agent': 'Yerbas-Explorer-Light/1.0'
        },
        body: JSON.stringify({ ips: batch }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) throw new Error('Geolocation HTTP ' + response.status);

      const payload = await response.json();
      const rows = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.data?.results)
          ? payload.data.results
          : (Array.isArray(payload?.results) ? payload.results : []));

      const found = new Set();
      for (const row of rows) {
        const geo = normalizeGeoResult(row);
        if (!geo || !batch.includes(geo.ip)) continue;

        found.add(geo.ip);
        results.set(geo.ip, geo);
        networkGeoCache.set(geo.ip, {
          value: geo,
          expiresAt: now + config.networkMap.geoCacheMs
        });
      }

      for (const ip of batch) {
        if (!found.has(ip)) {
          networkGeoCache.set(ip, {
            value: null,
            expiresAt: now + Math.min(config.networkMap.geoCacheMs, 3600000)
          });
        }
      }
    } catch {
      for (const ip of batch) {
        networkGeoCache.set(ip, {
          value: null,
          expiresAt: now + 300000
        });
      }
    }
  }

  return results;
}

function mapNodeStatus(node, view) {
  if (view === 'peers') {
    return Number(node.pingTime || 0) > 0.5 ? 'slow' : 'online';
  }

  if (node.status === 'POSE_BANNED') return 'pose-banned';
  if (Number(node.PoSePenalty || 0) > 0) return 'penalized';
  if (node.status === 'ENABLED') return 'online';
  return 'offline';
}

async function networkMapData(view) {
  const normalizedView = view === 'peers' ? 'peers' : 'smartnodes';
  let nodes;

  if (normalizedView === 'peers') {
    const peers = await cached('network-map:peers', 15000, currentPeers);
    nodes = peers.map((peer) => ({
      id: peer.address,
      service: peer.address,
      ip: serviceHost(peer.address),
      status: mapNodeStatus(peer, 'peers'),
      inbound: peer.inbound,
      version: peer.version,
      subversion: peer.subversion,
      pingTime: peer.pingTime,
      bytesSent: peer.bytesSent,
      bytesRecv: peer.bytesRecv
    }));
  } else {
    const live = await loadLiveSmartnodes();
    nodes = live.items.map((node) => ({
      id: node.proTxHash || node.outpoint,
      service: node.service,
      ip: serviceHost(node.service),
      status: mapNodeStatus(node, 'smartnodes'),
      payoutAddress: node.payoutAddress,
      collateralAmount: node.collateralAmount,
      PoSePenalty: node.PoSePenalty,
      PoSeBanHeight: node.PoSeBanHeight,
      proTxHash: node.proTxHash
    }));
  }

  const geoByIp = await geolocateIps(nodes.map((node) => node.ip));
  const items = nodes.map((node) => {
    const geo = geoByIp.get(node.ip) || null;
    return {
      ...node,
      geo
    };
  });

  const plotted = items.filter((item) => item.geo);
  const countries = new Set(plotted.map((item) => item.geo.countryCode || item.geo.country).filter(Boolean));

  const counts = {
    online: items.filter((item) => item.status === 'online').length,
    slow: items.filter((item) => item.status === 'slow').length,
    penalized: items.filter((item) => item.status === 'penalized').length,
    offline: items.filter((item) => item.status === 'offline').length,
    poseBanned: items.filter((item) => item.status === 'pose-banned').length
  };

  return {
    view: normalizedView,
    generatedAt: new Date().toISOString(),
    approximate: true,
    source: normalizedView === 'peers'
      ? 'Yerbas Core getpeerinfo'
      : 'Yerbas Core smartnodelist/protx',
    geolocation: {
      enabled: config.networkMap.enabled,
      provider: config.networkMap.enabled ? 'HackMyIP bulk IP geolocation' : null,
      cacheMs: config.networkMap.geoCacheMs
    },
    stats: {
      totalNodes: items.length,
      countries: countries.size,
      reachable: counts.online + counts.slow + counts.penalized,
      offline: counts.offline,
      poseBanned: counts.poseBanned,
      plotted: plotted.length,
      ...counts
    },
    items
  };
}

async function currentPeers() {
  const peers = await rpc.call('getpeerinfo');
  if (!Array.isArray(peers)) return [];

  return peers.map((peer) => ({
    address: peer.addr ?? null,
    addrlocal: peer.addrlocal ?? null,
    services: peer.services ?? null,
    relayTxes: peer.relaytxes ?? null,
    lastSend: peer.lastsend ?? null,
    lastRecv: peer.lastrecv ?? null,
    bytesSent: peer.bytessent ?? null,
    bytesRecv: peer.bytesrecv ?? null,
    connectionTime: peer.conntime ?? null,
    timeOffset: peer.timeoffset ?? null,
    pingTime: peer.pingtime ?? null,
    version: peer.version ?? null,
    subversion: peer.subver ?? null,
    inbound: peer.inbound ?? null,
    startingHeight: peer.startingheight ?? null,
    syncedHeaders: peer.synced_headers ?? null,
    syncedBlocks: peer.synced_blocks ?? null
  }));
}

async function supplyData() {
  const result = await ai.invoke('get_supply', {});
  return result.data;
}

async function smartnodeData(url) {
  const result = await ai.invoke('get_smartnodes', {
    limit: apiInt(url.searchParams.get('limit'), 100, 1, 500),
    offset: apiInt(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
    status: url.searchParams.get('status') || 'ALL',
    collateral_amount: url.searchParams.has('collateral')
      ? Number(url.searchParams.get('collateral'))
      : undefined
  });
  return result.data;
}

async function allSmartnodes() {
  const first = (await ai.invoke('get_smartnodes', { limit: 500, offset: 0 })).data;
  const items = [...first.items];
  for (let offset = 500; offset < first.total; offset += 500) {
    const page = (await ai.invoke('get_smartnodes', { limit: 500, offset })).data;
    items.push(...page.items);
  }
  return { total: first.total, items };
}

async function loadLiveSmartnodes() {
  return cached('smartnodes:live-directory', 15000, async () => {
    const [listResult, protxResult, countResult, networkResult] = await Promise.all([
      rpc.call('smartnodelist', ['json']),
      rpc.call('protx', ['list', 'registered', true]),
      rpc.call('smartnode', ['count']).catch(() => null),
      rpc.call('getnetworkinfo').catch(() => null)
    ]);

    const detailed = Array.isArray(protxResult) ? protxResult : [];
    const byHash = new Map(detailed.map((item) => [String(item?.proTxHash || ''), item]));

    const items = Object.entries(listResult || {}).map(([outpoint, row]) => {
      const protx = byHash.get(String(row?.proTxHash || '')) || null;
      const state = protx?.state || {};
      const poseBanHeight = state.PoSeBanHeight ?? state.poseBanHeight ?? -1;

      return {
        outpoint,
        proTxHash: row?.proTxHash ?? protx?.proTxHash ?? null,
        service: row?.address ?? state.service ?? null,
        payoutAddress: row?.payee ?? state.payoutAddress ?? null,
        ownerAddress: row?.owneraddress ?? state.ownerAddress ?? null,
        votingAddress: row?.votingaddress ?? state.votingAddress ?? null,
        collateralAddress: row?.collateraladdress ?? protx?.collateralAddress ?? null,
        collateralAmount: protx?.collateralAmount ?? null,
        pubKeyOperator: row?.pubkeyoperator ?? state.pubKeyOperator ?? null,
        status: row?.status ?? (poseBanHeight !== -1 ? 'POSE_BANNED' : 'UNKNOWN'),
        lastPaidTime: row?.lastpaidtime ?? null,
        lastPaidBlock: row?.lastpaidblock ?? state.lastPaidHeight ?? null,
        registeredHeight: state.registeredHeight ?? null,
        PoSePenalty: state.PoSePenalty ?? null,
        PoSeRevivedHeight: state.PoSeRevivedHeight ?? null,
        PoSeBanHeight: poseBanHeight,
        confirmations: protx?.confirmations ?? null,
        needToUpgrade: Boolean(protx?.needToUpgrade)
      };
    });

    const total = typeof countResult === 'object' && countResult !== null
      ? Number(countResult.total ?? items.length)
      : items.length;
    const enabled = typeof countResult === 'object' && countResult !== null
      ? Number(countResult.enabled ?? items.filter((item) => item.status === 'ENABLED').length)
      : items.filter((item) => item.status === 'ENABLED').length;

    return {
      generatedAt: new Date().toISOString(),
      protocolVersion: networkResult?.protocolversion ?? null,
      total,
      enabled,
      poseBanned: items.filter((item) => item.status === 'POSE_BANNED').length,
      items
    };
  });
}

async function smartnodeRegisteredTimes(items) {
  const heights = [...new Set(items
    .map((item) => Number(item.registeredHeight))
    .filter((height) => Number.isSafeInteger(height) && height >= 0))];

  if (!heights.length) return new Map();

  try {
    const hashes = await rpc.batch(heights.map((height) => ({ method: 'getblockhash', params: [height] })));
    const blocks = await rpc.batch(hashes.map((hash) => ({ method: 'getblock', params: [hash, 1] })));
    return new Map(heights.map((height, index) => [height, blocks[index]?.time ?? null]));
  } catch {
    return new Map();
  }
}

async function smartnodeDirectory(url) {
  const live = await loadLiveSmartnodes();
  const query = (url.searchParams.get('q') || '').trim().toLowerCase();
  const status = (url.searchParams.get('status') || 'ENABLED').trim().toUpperCase();
  const collateral = (url.searchParams.get('collateral') || '').trim();
  const sort = (url.searchParams.get('sort') || 'pay-age-asc').trim().toLowerCase();
  const count = apiInt(url.searchParams.get('count'), 50, 1, 100);
  const page = apiInt(url.searchParams.get('page'), 1, 1, 1000000);

  let items = [...live.items];

  if (status && status !== 'ALL') {
    items = items.filter((item) => item.status === status);
  }

  if (collateral) {
    const amount = Number(collateral);
    if (Number.isFinite(amount)) {
      items = items.filter((item) => Number(item.collateralAmount) === amount);
    }
  }

  if (query) {
    items = items.filter((item) => [
      item.proTxHash,
      item.outpoint,
      item.service,
      item.payoutAddress,
      item.ownerAddress,
      item.votingAddress,
      item.collateralAddress
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }

  items.sort((a, b) => {
    const dir = sort.endsWith('-desc') ? -1 : 1;
    const numeric = (left, right) => (Number(left || 0) - Number(right || 0)) * dir;
    const text = (left, right) => String(left || '').localeCompare(String(right || '')) * dir;

    if (sort.startsWith('service-') || sort === 'service') {
      return text(a.service, b.service) || text(a.proTxHash, b.proTxHash);
    }

    if (sort.startsWith('payout-')) {
      return text(a.payoutAddress, b.payoutAddress) || text(a.service, b.service);
    }

    if (sort.startsWith('collateral-') || sort === 'collateral-desc') {
      return numeric(a.collateralAmount, b.collateralAmount) || text(a.service, b.service);
    }

    if (sort.startsWith('pose-')) {
      return numeric(a.PoSePenalty, b.PoSePenalty)
        || numeric(a.PoSeBanHeight, b.PoSeBanHeight)
        || text(a.service, b.service);
    }

    if (sort.startsWith('registered-') || sort === 'registered') {
      const aHeight = a.registeredHeight ?? Number.MAX_SAFE_INTEGER;
      const bHeight = b.registeredHeight ?? Number.MAX_SAFE_INTEGER;
      return (Number(aHeight) - Number(bHeight)) * dir || text(a.service, b.service);
    }

    if (sort.startsWith('status-')) {
      return text(a.status, b.status) || text(a.service, b.service);
    }

    if (sort.startsWith('pay-age-') || sort.startsWith('last-paid-') || sort === 'last-paid') {
      return numeric(a.lastPaidBlock, b.lastPaidBlock) || text(a.service, b.service);
    }

    return numeric(a.lastPaidBlock, b.lastPaidBlock) || text(a.service, b.service);
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / count));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * count;
  const pageItems = items.slice(start, start + count);
  const registeredTimes = await smartnodeRegisteredTimes(pageItems);

  const queueRanks = new Map();
  live.items
    .filter((item) => item.status === 'ENABLED')
    .sort((a, b) => Number(a.lastPaidBlock || 0) - Number(b.lastPaidBlock || 0))
    .forEach((item, index) => queueRanks.set(item.proTxHash || item.outpoint, index + 1));

  const collateralCounts = {};
  for (const item of live.items.filter((entry) => entry.status === 'ENABLED')) {
    const key = item.collateralAmount === null || item.collateralAmount === undefined
      ? 'unknown'
      : String(item.collateralAmount);
    collateralCounts[key] = (collateralCounts[key] || 0) + 1;
  }

  return {
    generatedAt: live.generatedAt,
    protocolVersion: live.protocolVersion,
    network: {
      total: live.total,
      enabled: live.enabled,
      poseBanned: live.poseBanned
    },
    collateralCounts,
    filters: {
      q: url.searchParams.get('q') || '',
      status,
      collateral,
      sort
    },
    page: safePage,
    count,
    total,
    totalPages,
    returned: pageItems.length,
    items: pageItems.map((item) => ({
      ...item,
      paymentAgeRank: queueRanks.get(item.proTxHash || item.outpoint) ?? null,
      registeredTime: registeredTimes.get(Number(item.registeredHeight)) ?? null
    }))
  };
}

async function addressData(address, txLimit = 100, utxoLimit = 100) {
  const result = await ai.invoke('get_address', {
    address,
    tx_limit: Math.min(200, Math.max(1, txLimit)),
    utxo_limit: Math.min(200, Math.max(1, utxoLimit))
  });
  return result.data;
}

async function handlePublicApi(req, res, url) {
  const path = url.pathname;

  if (path === '/api/v1') {
    return sendJson(res, 200, {
      name: 'Yerbas Explorer Light Public API',
      version: '1',
      readOnly: true,
      source: 'Yerbas Core RPC / native blockchain indexes',
      documentation: '/info',
      endpoints: {
        status: '/api/v1/status',
        blocks: '/api/v1/blocks?limit=12&offset=0',
        block: '/api/v1/block/:height-or-hash',
        transaction: '/api/v1/tx/:txid',
        address: '/api/v1/address/:address',
        assets: '/api/v1/assets?q=&page=1&count=25&type=&metadata=&reissuable=',
        assetStats: '/api/v1/assets/stats',
        asset: '/api/v1/asset/:asset-name',
        supply: '/api/v1/supply',
        emission: '/api/v1/emission?height=',
        smartnodes: '/api/v1/smartnodes?status=ENABLED&page=1&count=50&collateral=&q=&sort=pay-age-asc',
        networkMap: '/api/v1/network-map?view=smartnodes',
        peers: '/api/v1/network/peers',
        marketPrice: '/api/v1/market-price'
      }
    });
  }

  if (path === '/api/v1/supply') {
    return sendJson(res, 200, await supplyData());
  }

  if (path === '/api/v1/emission') {
    const height = url.searchParams.get('height');
    const result = await ai.invoke('get_emission', height === null ? {} : { height });
    return sendJson(res, 200, result.data);
  }

  if (path === '/api/v1/smartnodes') {
    return sendJson(res, 200, await smartnodeDirectory(url));
  }

  if (path === '/api/v1/network-map') {
    const view = url.searchParams.get('view') === 'peers' ? 'peers' : 'smartnodes';
    return sendJson(res, 200, await networkMapData(view));
  }

  if (path === '/api/v1/network/peers') {
    const peers = await cached('api:peers', 15000, currentPeers);
    return sendJson(res, 200, {
      count: peers.length,
      current: true,
      note: 'Current peers reported by Yerbas Core; no historical/geolocation database is used.',
      items: peers
    });
  }

  if (path === '/api/v1/market-price') {
    const result = await ai.invoke('get_market_price', {});
    return sendJson(res, result.data.available ? 200 : 503, result.data);
  }

  if (path.startsWith('/api/v1/')) {
    const rewritten = new URL(url.toString());
    rewritten.pathname = '/api/' + path.slice('/api/v1/'.length);
    return handleApi(req, res, rewritten);
  }

  if (path === '/api/getdifficulty') {
    const info = await rpc.call('getblockchaininfo');
    return sendText(res, 200, info.difficulty);
  }

  if (path === '/api/getconnectioncount') {
    return sendText(res, 200, await rpc.call('getconnectioncount'));
  }

  if (path === '/api/getblockcount') {
    return sendText(res, 200, await rpc.call('getblockcount'));
  }

  if (path === '/api/getblockhash') {
    const index = apiInt(url.searchParams.get('index'), -1, 0, Number.MAX_SAFE_INTEGER);
    if (index < 0) return sendJson(res, 400, { error: 'index is required.' });
    return sendText(res, 200, await rpc.call('getblockhash', [index]));
  }

  if (path === '/api/getblock') {
    const hash = (url.searchParams.get('hash') || '').trim();
    if (!isHash(hash)) return sendJson(res, 400, { error: 'Valid block hash is required.' });
    return sendJson(res, 200, await rpc.call('getblock', [hash, 1]));
  }

  if (path === '/api/getrawtransaction') {
    const txid = (url.searchParams.get('txid') || '').trim().toLowerCase();
    if (!isHash(txid)) return sendJson(res, 400, { error: 'Valid txid is required.' });
    const decrypt = url.searchParams.get('decrypt') !== '0';
    const tx = await rpc.call('getrawtransaction', [txid, decrypt]);
    return decrypt ? sendJson(res, 200, tx) : sendText(res, 200, tx);
  }

  if (path === '/api/getnetworkhashps') {
    return sendText(res, 200, await rpc.call('getnetworkhashps'));
  }

  if (path === '/api/getmasternodecount') {
    const count = await rpc.call('smartnode', ['count']);
    const total = typeof count === 'object' && count !== null ? (count.total ?? count.enabled ?? 0) : count;
    return sendText(res, 200, total);
  }

  if (path === '/ext/getmoneysupply') {
    const supply = await supplyData();
    return sendText(res, 200, supply.totalAmountYerb ?? 0);
  }

  if (path.startsWith('/ext/getaddress/')) {
    const address = decodeURIComponent(path.slice('/ext/getaddress/'.length));
    return sendJson(res, 200, await addressData(address));
  }

  if (path.startsWith('/ext/getaddresstxs/')) {
    const parts = path.slice('/ext/getaddresstxs/'.length).split('/');
    const address = decodeURIComponent(parts[0] || '');
    const start = apiInt(parts[1], 0, 0, Number.MAX_SAFE_INTEGER);
    const length = apiInt(parts[2], 50, 1, 100);
    const data = await addressData(address, Math.min(200, start + length), 1);
    const txids = data.history?.txids || [];
    return sendJson(res, 200, txids.slice(start, start + length));
  }

  if (path.startsWith('/ext/gettx/')) {
    const txid = decodeURIComponent(path.slice('/ext/gettx/'.length)).toLowerCase();
    if (!isHash(txid)) return sendJson(res, 400, { error: 'Invalid transaction ID.' });
    return sendJson(res, 200, await rpc.call('getrawtransaction', [txid, true]));
  }

  if (path.startsWith('/ext/getbalance/')) {
    const address = decodeURIComponent(path.slice('/ext/getbalance/'.length));
    const data = await addressData(address, 1, 1);
    return sendText(res, 200, data.history?.balance?.balanceYerb ?? '0.00000000');
  }

  if (path === '/ext/getnetworkpeers') {
    return sendJson(res, 200, await cached('legacy:peers', 15000, currentPeers));
  }

  if (path === '/ext/getbasicstats') {
    const [chain, supply, count] = await Promise.all([
      rpc.call('getblockchaininfo'),
      supplyData(),
      rpc.call('smartnode', ['count']).catch(() => null)
    ]);
    const total = typeof count === 'object' && count !== null ? (count.total ?? null) : count;
    return sendJson(res, 200, {
      block_count: chain.blocks,
      money_supply: supply.totalAmountYerb ?? null,
      last_price_usdt: null,
      last_price_usd: null,
      masternode_count: total
    });
  }

  if (path === '/ext/getsummary') {
    const [chain, network, supply, hashRate, count] = await Promise.all([
      rpc.call('getblockchaininfo'),
      rpc.call('getnetworkinfo'),
      supplyData(),
      rpc.call('getnetworkhashps').catch(() => null),
      rpc.call('smartnode', ['count']).catch(() => null)
    ]);
    const total = typeof count === 'object' && count !== null ? (count.total ?? null) : count;
    const enabled = typeof count === 'object' && count !== null ? (count.enabled ?? null) : null;
    return sendJson(res, 200, {
      difficulty: chain.difficulty,
      difficultyHybrid: '',
      supply: supply.totalAmountYerb ?? null,
      hashrate: hashRate,
      lastPrice: null,
      connections: network.connections,
      masternodeCountOnline: enabled,
      masternodeCountOffline: total !== null && enabled !== null ? Math.max(0, total - enabled) : null,
      blockcount: chain.blocks
    });
  }

  if (path === '/ext/getmasternodelist') {
    const nodes = await allSmartnodes();
    return sendJson(res, 200, nodes.items);
  }

  if (path === '/ext/getcurrentprice') {
    const result = await ai.invoke('get_market_price', {});
    if (!result.data.available) {
      return sendJson(res, 503, {
        error: result.data.reason,
        available: false
      });
    }
    return sendJson(res, 200, result.data);
  }

  if (path === '/ext/getdistribution'
      || path.startsWith('/ext/getlasttxs/')
      || path.startsWith('/ext/getmasternoderewards/')
      || path.startsWith('/ext/getmasternoderewardstotal/')) {
    return sendJson(res, 501, {
      error: 'This legacy endpoint depended on the old explorer database and is not implemented in database-free Explorer Light.',
      documentation: '/info'
    });
  }

  return null;
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
    const requestedOffset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(requested) ? Math.min(25, Math.max(1, requested)) : config.recentBlocks;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const data = await cached('blocks:' + limit + ':' + offset, config.cacheMs, () => recentBlocks(limit, offset));
    return sendJson(res, 200, data);
  }

  if (url.pathname.startsWith('/api/block/')) {
    const identifier = decodeURIComponent(url.pathname.slice('/api/block/'.length));
    const hash = await blockHashFromIdentifier(identifier);
    const block = await rpc.call('getblock', [hash, 1]);
    return sendJson(res, 200, block);
  }

  if (url.pathname.startsWith('/api/tx/')) {
    const txid = decodeURIComponent(url.pathname.slice('/api/tx/'.length)).toLowerCase();
    if (!isHash(txid)) return sendJson(res, 400, { error: 'Invalid transaction ID.' });

    const knownBlock = (url.searchParams.get('block') || '').toLowerCase();
    if (knownBlock) {
      if (!isHash(knownBlock)) return sendJson(res, 400, { error: 'Invalid block hash.' });
      const block = await rpc.call('getblock', [knownBlock, 2]);
      const tx = Array.isArray(block.tx)
        ? block.tx.find((item) => item && typeof item === 'object' && item.txid === txid)
        : null;
      if (!tx) return sendJson(res, 404, { error: 'Transaction was not found in the supplied block.' });
      return sendJson(res, 200, {
        ...tx,
        blockhash: tx.blockhash || block.hash || knownBlock,
        confirmations: tx.confirmations ?? block.confirmations,
        blocktime: tx.blocktime || block.time
      });
    }

    try {
      const tx = await rpc.call('getrawtransaction', [txid, true]);
      return sendJson(res, 200, tx);
    } catch (error) {
      if (error instanceof RpcError && error.code === -5) {
        error.message = 'Transaction not found. Direct historical TXID lookup needs txindex=1, but transactions opened from a block work without it.';
      }
      throw error;
    }
  }

  if (url.pathname === '/api/network-map') {
    const view = url.searchParams.get('view') === 'peers' ? 'peers' : 'smartnodes';
    return sendJson(res, 200, await networkMapData(view));
  }

  if (url.pathname === '/api/smartnodes') {
    return sendJson(res, 200, await smartnodeDirectory(url));
  }

  if (url.pathname === '/api/assets/stats') {
    return sendJson(res, 200, await loadAssetIndexStats());
  }

  if (url.pathname === '/api/assets') {
    const rawQuery = (url.searchParams.get('q') || '').trim();
    if (rawQuery.length > 128) {
      return sendJson(res, 400, { error: 'Asset search is too long.' });
    }

    const page = apiInt(url.searchParams.get('page'), 1, 1, 1000000);
    const count = apiInt(url.searchParams.get('count'), 25, 1, 100);
    const type = (url.searchParams.get('type') || '').trim();
    const metadata = (url.searchParams.get('metadata') || '').trim().toLowerCase();
    const reissuable = (url.searchParams.get('reissuable') || '').trim().toLowerCase();
    const sort = (url.searchParams.get('sort') || 'name').trim().toLowerCase();

    let items = await loadAssetDirectory();

    if (rawQuery) {
      const needle = rawQuery.toLowerCase();
      items = items.filter((asset) => asset.name.toLowerCase().includes(needle));
    }

    if (type) {
      items = items.filter((asset) => asset.type.toLowerCase() === type.toLowerCase());
    }

    if (metadata === 'yes') items = items.filter((asset) => Boolean(asset.metadataRef));
    if (metadata === 'no') items = items.filter((asset) => !asset.metadataRef);

    if (reissuable === 'yes') items = items.filter((asset) => Number(asset.reissuable) === 1);
    if (reissuable === 'no') items = items.filter((asset) => Number(asset.reissuable) !== 1);

    items = [...items].sort((a, b) => {
      if (sort === 'supply-desc') return Number(b.amount || 0) - Number(a.amount || 0);
      if (sort === 'supply-asc') return Number(a.amount || 0) - Number(b.amount || 0);
      if (sort === 'holders-desc') return 0;
      return a.name.localeCompare(b.name);
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / count));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * count;
    const pageItems = items.slice(start, start + count);
    const holderCounts = await loadHolderCounts(pageItems.map((asset) => asset.name));

    const enriched = pageItems.map((asset, index) => ({
      ...asset,
      holders: Number.isFinite(Number(holderCounts[index])) ? Number(holderCounts[index]) : null
    }));

    if (sort === 'holders-desc') {
      enriched.sort((a, b) => Number(b.holders || 0) - Number(a.holders || 0));
    }

    return sendJson(res, 200, {
      query: rawQuery,
      filters: { type, metadata, reissuable, sort },
      count,
      page: safePage,
      total,
      totalPages,
      returned: enriched.length,
      items: enriched
    });
  }

  if (url.pathname.startsWith('/api/asset/')) {
    const assetName = decodeURIComponent(url.pathname.slice('/api/asset/'.length)).trim();
    if (!assetName || assetName.length > 128) {
      return sendJson(res, 400, { error: 'Invalid Yerbas asset name.' });
    }

    const [metadataResult, directoryResult, holderCountResult, holdersResult] = await Promise.allSettled([
      rpc.call('getassetdata', [assetName]),
      rpc.call('listassets', [assetName, true, 1, 0]),
      rpc.call('listaddressesbyasset', [assetName, true]),
      rpc.call('listaddressesbyasset', [assetName, false, 100, 0])
    ]);

    const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;
    if (!metadata || typeof metadata !== 'object') {
      return sendJson(res, 404, { error: 'Yerbas asset was not found.' });
    }

    const directory = directoryResult.status === 'fulfilled' && directoryResult.value && typeof directoryResult.value === 'object'
      ? directoryResult.value[assetName] || Object.values(directoryResult.value)[0] || null
      : null;

    const holderCount = holderCountResult.status === 'fulfilled' && Number.isFinite(Number(holderCountResult.value))
      ? Number(holderCountResult.value)
      : null;

    const holderValue = holdersResult.status === 'fulfilled' ? holdersResult.value : null;
    const holdersAvailable = holderValue && typeof holderValue === 'object' && !Array.isArray(holderValue);
    const holders = holdersAvailable
      ? Object.entries(holderValue).map(([address, balance]) => ({ address, balance }))
      : [];

    return sendJson(res, 200, {
      name: metadata.name || assetName,
      metadata,
      issuance: directory ? {
        blockHeight: directory.block_height ?? null,
        blockHash: directory.blockhash ?? null
      } : null,
      holders: {
        available: holdersAvailable,
        total: holderCount,
        returned: holders.length,
        items: holders,
        unavailableReason: typeof holderValue === 'string' ? holderValue.replace(/^_/, '') : null
      }
    });
  }

  if (url.pathname.startsWith('/api/address/')) {
    const address = decodeURIComponent(url.pathname.slice('/api/address/'.length)).trim();
    if (!address || address.length > 128) {
      return sendJson(res, 400, { error: 'Invalid Yerbas address.' });
    }

    const result = await ai.invoke('get_address', {
      address,
      tx_limit: 100,
      utxo_limit: 100
    });

    if (!result.data?.isValid) {
      return sendJson(res, 404, { error: 'Invalid Yerbas address.' });
    }

    return sendJson(res, 200, result.data);
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
          supported: true
        });
      }
    } catch {
      // Older nodes may not expose validateaddress. Continue to asset lookup.
    }

    try {
      const asset = await rpc.call('getassetdata', [classified.value]);
      if (asset && typeof asset === 'object' && asset.name) {
        return sendJson(res, 200, {
          type: 'asset',
          target: asset.name
        });
      }
    } catch {
      // Not an asset. Fall through to the normal not-found response.
    }

    return sendJson(res, 404, { error: 'No block, transaction, Yerbas address, or asset matched that search.' });
  }

  return sendJson(res, 404, { error: 'API route not found.' });
}

const staticFiles = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/yerbas-logo.png', ['yerbas-logo.png', 'image/png']]
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
    const url = new URL(req.url || '/', 'http://localhost');

    if (isAiPath(url.pathname)) {
      return await handleAi(req, res, url);
    }

    if (req.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ext/'))) {
      res.writeHead(204, securityHeaders({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'content-type, accept',
        'access-control-max-age': '86400'
      }));
      return res.end();
    }

    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ext/')) {
      const publicResult = await handlePublicApi(req, res, url);
      if (publicResult !== null) return publicResult;
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return sendJson(res, 404, { error: 'Legacy API route not found.', documentation: '/info' });
    }

    const staticFile = staticFiles.get(url.pathname);
    if (staticFile) return await sendFile(req, res, staticFile[0], staticFile[1]);

    if (url.pathname === '/info') {
      return await sendFile(req, res, 'info.html', 'text/html; charset=utf-8', 'no-cache');
    }

    if (url.pathname === '/'
      || url.pathname.startsWith('/block/')
      || url.pathname.startsWith('/tx/')
      || url.pathname.startsWith('/address/')
      || url.pathname === '/assets'
      || url.pathname.startsWith('/asset/')
      || url.pathname === '/smartnodes'
      || url.pathname === '/masternodes'
      || url.pathname === '/node-map') {
      return await sendFile(req, res, 'index.html', 'text/html; charset=utf-8', 'no-cache');
    }

    return sendJson(res, 404, { error: 'Page not found.' });
  } catch (error) {
    if (error instanceof AiToolError) {
      return sendJson(res, error.status, {
        ok: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

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
  console.log('AI gateway: ' + (config.ai.enabled ? 'enabled (read-only)' : 'disabled'));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
