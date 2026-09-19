# Yerbas Explorer Light

A deliberately small, **RPC-first** block explorer for Yerbas (YERB).

Explorer Light treats the Yerbas blockchain as the source of truth. It talks directly to `yerbasd` over JSON-RPC and does **not** use MongoDB, PostgreSQL, MySQL, SQLite, Redis, or a JavaScript framework in the first test build.

## Test-build goals

- Zero explorer database.
- Zero runtime npm dependencies.
- Blocks come directly from Yerbas Core.
- Transactions come directly from Yerbas Core.
- Search block height, block hash, transaction ID, and validate Yerbas addresses.
- Responsive desktop/mobile UI.
- Small in-memory cache only for live status and recent-block requests.
- Clear path to add an optional SQLite address index later without duplicating the blockchain.

## Requirements

- Node.js 18.18+ (Node 24 recommended for a new public deployment).
- A synced Yerbas Core node with JSON-RPC enabled.
- Yerbas mainnet RPC defaults to port `9998`.

For historical transaction lookups, enable `txindex=1`. If it was previously disabled, Yerbas Core may require a reindex before old transactions become available through `getrawtransaction`.

Example `~/.yerbascore/yerbas.conf`:

```ini
server=1
txindex=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```

If Explorer Light runs as the same OS user as `yerbasd`, it will automatically try the standard RPC cookie at `~/.yerbascore/.cookie`. Otherwise configure an RPC user/password in `.env`.

## Run the test build

```bash
git clone https://github.com/The-Yerbas-Endeavor/Explorer-Light.git
cd Explorer-Light
git checkout feature/rpc-first-test-build
cp .env.example .env
node --version
npm test
npm run check
npm start
```

Then open:

```text
http://127.0.0.1:3001
```

Check RPC connectivity directly:

```bash
curl -s http://127.0.0.1:3001/api/health
```

Expected shape:

```json
{"ok":true,"rpc":true,"height":1234567}
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Explorer bind address |
| `PORT` | `3001` | Explorer HTTP port |
| `RPC_PROTOCOL` | `http` | Yerbas RPC protocol |
| `RPC_HOST` | `127.0.0.1` | Yerbas RPC host |
| `RPC_PORT` | `9998` | Yerbas mainnet RPC port |
| `RPC_USER` | empty | Optional RPC username |
| `RPC_PASSWORD` | empty | Optional RPC password |
| `RPC_COOKIE_FILE` | `~/.yerbascore/.cookie` | Cookie-auth path |
| `RPC_TIMEOUT_MS` | `7000` | RPC timeout |
| `RECENT_BLOCKS` | `12` | Blocks shown on home page |
| `CACHE_MS` | `5000` | In-memory live-data cache |

Explicit RPC credentials override cookie authentication.

## API

The browser never receives Yerbas RPC credentials. Explorer Light exposes only a small read-only API:

- `GET /api/health`
- `GET /api/status`
- `GET /api/blocks?limit=12`
- `GET /api/block/:height-or-hash`
- `GET /api/tx/:txid`
- `GET /api/search?q=...`

There is intentionally **no arbitrary RPC proxy**.

## Address search

The RPC-only test build can validate whether an input is a Yerbas address, but it does not pretend that Core can efficiently return complete address history when no address index exists.

The intended next layer is a tiny optional SQLite index containing only searchable address-to-transaction metadata. Full blocks and transactions will remain in the blockchain and continue to be fetched from Yerbas Core on demand.

## Architecture

```text
Browser
  |
  v
Explorer Light (Node built-ins only)
  |
  v
Yerbas Core JSON-RPC :9998
  |
  v
Yerbas blockchain
```

Current explorer database usage: **none**.

## Production notes

The included `deploy/` examples show a local systemd service and nginx reverse proxy. Keep Explorer Light bound to `127.0.0.1` when nginx is on the same server. Keep Yerbas RPC bound to localhost; do not expose port `9998` publicly.

## Test checklist

1. `/api/health` reports the current block height.
2. Home page shows current height, difficulty, peer count, mempool count, and recent blocks.
3. Click a recent block and confirm its hash/height against `yerbas-cli getblock`.
4. Open a transaction from that block.
5. Search by block height.
6. Search by block hash.
7. Search by transaction ID.
8. Search a valid Yerbas address and confirm the UI explains that history indexing is not enabled yet.
9. Stop `yerbasd` and confirm the UI reports RPC unavailable without crashing.
10. Restart `yerbasd` and reload the explorer.

## Next layer after RPC testing

Once the RPC-only build is proven against a live Yerbas node, the next useful addition is the optional SQLite address index. It should be disposable and rebuildable from the chain, not a second authoritative copy of blockchain data.
