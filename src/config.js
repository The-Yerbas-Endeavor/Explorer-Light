import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function loadDotEnv(filePath = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;

    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function intEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function csvEnv(name, fallback) {
  const raw = process.env[name] || fallback;
  return String(raw)
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function defaultMarketHistoryFile() {
  const stateDir = '/var/lib/yerbas-explorer-light';
  if (fs.existsSync(stateDir)) {
    return path.join(stateDir, 'market-history.json');
  }
  return path.join(os.tmpdir(), 'yerbas-explorer-light-market-history.json');
}

loadDotEnv();

export const config = Object.freeze({
  host: process.env.HOST || '127.0.0.1',
  port: intEnv('PORT', 3001, 1, 65535),
  rpc: Object.freeze({
    protocol: process.env.RPC_PROTOCOL === 'https' ? 'https' : 'http',
    host: process.env.RPC_HOST || '127.0.0.1',
    port: intEnv('RPC_PORT', 9998, 1, 65535),
    user: process.env.RPC_USER || '',
    password: process.env.RPC_PASSWORD || '',
    cookieFile: process.env.RPC_COOKIE_FILE || path.join(os.homedir(), '.yerbascore', '.cookie'),
    timeoutMs: intEnv('RPC_TIMEOUT_MS', 7000, 1000, 60000)
  }),
  ai: Object.freeze({
    enabled: boolEnv('AI_API_ENABLED', true),
    maxBodyBytes: intEnv('AI_MAX_BODY_BYTES', 32768, 1024, 262144),
    marketPriceUrl: process.env.AI_MARKET_PRICE_URL || ''
  }),
  networkMap: Object.freeze({
    enabled: boolEnv('NETWORK_MAP_ENABLED', true),
    geoUrl: process.env.NETWORK_MAP_GEO_URL || 'https://hackmyip.com/api/bulk',
    geoCacheMs: intEnv('NETWORK_MAP_GEO_CACHE_MS', 86400000, 60000, 604800000),
    geoTimeoutMs: intEnv('NETWORK_MAP_GEO_TIMEOUT_MS', 12000, 1000, 60000)
  }),
  ipfs: Object.freeze({
    previewGateways: Object.freeze(csvEnv(
      'IPFS_PREVIEW_GATEWAYS',
      'https://ipfs.io,https://ipfs.filebase.io,https://gateway.pinata.cloud'
    ))
  }),
  markets: Object.freeze({
    enabled: boolEnv('MARKETS_ENABLED', true),
    nestexApiBase: process.env.NESTEX_API_BASE || 'https://api.nestex.one',
    gateviaApiBase: process.env.GATEVIA_API_BASE || 'https://api.gatevia.io',
    cacheMs: intEnv('MARKETS_CACHE_MS', 30000, 5000, 300000),
    timeoutMs: intEnv('MARKETS_TIMEOUT_MS', 10000, 1000, 30000),
    historyFile: process.env.MARKETS_HISTORY_FILE || defaultMarketHistoryFile(),
    historySnapshotMs: intEnv('MARKETS_HISTORY_SNAPSHOT_MS', 3600000, 600000, 21600000),
    historyRetentionDays: intEnv('MARKETS_HISTORY_RETENTION_DAYS', 30, 7, 90)
  }),
  recentBlocks: intEnv('RECENT_BLOCKS', 12, 5, 25),
  cacheMs: intEnv('CACHE_MS', 5000, 0, 60000)
});

export { loadDotEnv };
