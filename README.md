# Yerbas Explorer Light

A deliberately small, **RPC-first** block explorer and read-only AI data gateway for Yerbas (YERB).

Explorer Light treats Yerbas Core and the blockchain as the source of truth. It talks directly to \`yerbasd\` over JSON-RPC and does **not** require MongoDB, PostgreSQL, MySQL, SQLite, Redis, Express, React, or runtime npm packages.

## Design goals

- Zero explorer database.
- Zero runtime npm dependencies.
- Blocks and transactions come directly from Yerbas Core.
- Responsive desktop/mobile explorer UI.
- Small in-memory cache for live data only.
- Versioned, machine-readable AI tool API.
- No arbitrary RPC proxy.
- No wallet access, private keys, signing, transaction creation, broadcasting, or shell execution.
- Use native Yerbas Core indexes instead of duplicating blockchain data in an explorer database.

## Requirements

- Node.js 18.18+; Node 24 is used by CI.
- A synced Yerbas Core node with JSON-RPC enabled.
- Yerbas mainnet RPC defaults to port \`9998\`.

### Recommended Core configuration

For the full explorer/AI feature set:

\`\`\`ini
server=1
txindex=1
addressindex=1
assetindex=1
spentindex=1
timestampindex=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
\`\`\`

These are **Yerbas Core indexes**, not Explorer Light databases.

- \`txindex=1\` supports arbitrary historical transaction lookup.
- \`addressindex=1\` supports address balance, transaction IDs, UTXOs, and deltas.
- \`assetindex=1\` supports address asset balances and holder-style asset queries.

Changing index settings on an existing node can require a Core reindex.

If Explorer Light runs as the same OS user as \`yerbasd\`, it automatically tries the RPC cookie at \`~/.yerbascore/.cookie\`. Otherwise configure an RPC user/password in \`.env\`.

## Fresh-server installer

For the `explorer2.yerbas.org` test server, the complete hardened install is now one command:

```bash
curl -fsSL https://raw.githubusercontent.com/The-Yerbas-Endeavor/Explorer-Light/feature/rpc-first-test-build/install.sh | sudo bash
```

That one command downloads and runs the full installer with `explorer2.yerbas.org` and the default `yerbasadmin` sudo/build account.

The default installation performs the **entire explorer-node bootstrap and host hardening**:

- Creates a dedicated sudo/build administrator named `yerbasadmin` by default; override it with `--admin-user NAME`.
- Copies the invoking user's authorized SSH keys, or root's authorized keys when run directly as root.
- Uses that non-root administrator for source builds and Explorer validation.
- Enables UFW with inbound deny-by-default.
- Opens only SSH, HTTP, HTTPS, and Yerbas mainnet P2P `15420/tcp`; Core RPC `9998` is never opened publicly.
- Enables Fail2ban SSH protection.
- Enables unattended security upgrades.
- Applies conservative kernel/network sysctl hardening.
- If SSH key migration is verified, disables root SSH login, password login, keyboard-interactive login, and restricts SSH access to the new administrator.
- If no usable authorized key is found, SSH login policy is deliberately left unchanged to avoid locking the operator out.
- Downloads the latest matching official Yerbas Core Linux release for Ubuntu 22.04, 24.04, or 26.04. If no matching binary exists, it falls back to a headless source build.
- Creates the dedicated `yerbas` Core service user and `explorer-light` web service user.
- Generates localhost-only Core RPC credentials.
- Writes Core configuration to `/home/yerbas/.yerbascore/yerbas.conf`.
- Enables `txindex=1`, `addressindex=1`, `assetindex=1`, `spentindex=1`, and `timestampindex=1`.
- Discovers the latest release from `The-Yerbas-Endeavor/YERB-Bootstrap`.
- Downloads `bootstrap-index.zip` and `powcache.dat`.
- Verifies both files against the SHA-256 digests published by GitHub Releases.
- Extracts the indexed blockchain snapshot into `/home/yerbas/.yerbascore` **before Core starts**.
- Starts Core and waits until its RPC interface is actually responding.
- Clones Explorer Light to `/opt/yerbas-explorer-light`.
- Writes the matching RPC host, port, username, and generated password to `/opt/yerbas-explorer-light/.env`.
- Runs `npm test` and `npm run check` as the non-root build administrator, then locks the deployed tree down for the service account.
- Installs and starts the Explorer Light systemd service.
- Configures nginx as the only public HTTP entry point.
- Optionally requests a Let's Encrypt certificate.

The new administrator account is created as **SSH-key-only** with passwordless sudo so the installer never needs to create, print, or persist a reusable administrator password.

For a custom administrator name:

```bash
sudo /tmp/install-fresh-server.sh \
  --domain explorer2.yerbas.org \
  --admin-user exploreradmin
```

For HTTPS once DNS for `explorer2.yerbas.org` resolves to the server:

```bash
sudo /tmp/install-fresh-server.sh \
  --domain explorer2.yerbas.org \
  --https \
  --email admin@example.org
```

Useful installer options:

```text
--domain NAME
--https
--email ADDRESS
--admin-user NAME
--branch REF
--core-ref REF
--source-build
--skip-bootstrap
--keep-downloads
--jobs N
```

## Run the test build

\`\`\`bash
git clone https://github.com/The-Yerbas-Endeavor/Explorer-Light.git
cd Explorer-Light
git checkout feature/rpc-first-test-build

cp .env.example .env

node --version
npm test
npm run check
npm start
\`\`\`

Open:

\`\`\`text
http://127.0.0.1:3001
\`\`\`

Check Core connectivity:

\`\`\`bash
curl -s http://127.0.0.1:3001/api/health
\`\`\`

Expected shape:

\`\`\`json
{"ok":true,"rpc":true,"height":1234567}
\`\`\`

## Explorer API

The browser never receives Yerbas RPC credentials. Explorer Light exposes a small read-only API:

- \`GET /api/health\`
- \`GET /api/status\`
- \`GET /api/blocks?limit=12\`
- \`GET /api/block/:height-or-hash\`
- \`GET /api/tx/:txid\`
- \`GET /api/search?q=...\`

Transactions opened from a known block do not require \`txindex\`; Explorer Light reads the full transaction from that block. Arbitrary historical TXID lookup is best served with \`txindex=1\`.

## AI gateway

Explorer Light is prepared as the public read-only data boundary for Yerbas AI implementations.

Discovery:

\`\`\`text
GET /.well-known/yerbas-ai.json
\`\`\`

Status:

\`\`\`text
GET /api/ai/v1/status
GET /ext/ai/status
\`\`\`

Tool definitions:

\`\`\`text
GET /api/ai/v1/tools
\`\`\`

Tool invocation:

\`\`\`text
POST /api/ai/v1/query
POST /ext/ai/query
\`\`\`

Example:

\`\`\`bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"tool":"get_smartnodes_by_collateral","arguments":{"amount":69000}}' \
  http://127.0.0.1:3001/api/ai/v1/query
\`\`\`

Current tools:

- \`get_network_summary\`
- \`get_recent_blocks\`
- \`get_block\`
- \`get_transaction\`
- \`get_address\`
- \`get_supply\`
- \`get_emission\`
- \`get_smartnodes\`
- \`get_smartnodes_by_collateral\`
- \`get_asset\`
- \`get_market_price\`

The AI gateway contains no LLM dependency. An external AI or agent chooses among the published tools; Explorer Light executes only the fixed read-only allowlist.

Earlier Yerbas AI prototypes can migrate through the compatibility aliases under \`/ext/ai/*\`.

See [docs/AI_GATEWAY.md](docs/AI_GATEWAY.md) for schemas, examples, security boundaries, Core index requirements, and future MCP/agent integration points.

## AI configuration

\`\`\`ini
AI_API_ENABLED=true
AI_MAX_BODY_BYTES=32768

# Optional trusted read-only JSON market source:
# AI_MARKET_PRICE_URL=https://example.org/yerb-price.json
\`\`\`

Market-price retrieval remains disabled until a source is explicitly configured.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| \`HOST\` | \`127.0.0.1\` | Explorer bind address |
| \`PORT\` | \`3001\` | Explorer HTTP port |
| \`RPC_PROTOCOL\` | \`http\` | Yerbas RPC protocol |
| \`RPC_HOST\` | \`127.0.0.1\` | Yerbas RPC host |
| \`RPC_PORT\` | \`9998\` | Yerbas mainnet RPC port |
| \`RPC_USER\` | empty | Optional RPC username |
| \`RPC_PASSWORD\` | empty | Optional RPC password |
| \`RPC_COOKIE_FILE\` | \`~/.yerbascore/.cookie\` | Cookie-auth path |
| \`RPC_TIMEOUT_MS\` | \`7000\` | RPC timeout |
| \`RECENT_BLOCKS\` | \`12\` | Blocks shown on home page |
| \`CACHE_MS\` | \`5000\` | In-memory live-data cache |
| \`AI_API_ENABLED\` | \`true\` | Enable read-only AI endpoints |
| \`AI_MAX_BODY_BYTES\` | \`32768\` | AI query body limit |
| \`AI_MARKET_PRICE_URL\` | empty | Optional trusted JSON market endpoint |

Explicit RPC credentials override cookie authentication.

## Architecture

\`\`\`text
Browser                        AI / agent / MCP adapter
  |                                      |
  +------------------+-------------------+
                     |
                     v
              Explorer Light
          UI + fixed read-only APIs
                     |
                     v
          Yerbas Core JSON-RPC :9998
                     |
           +---------+---------+
           |         |         |
       blockchain txindex addressindex/assetindex
\`\`\`

Explorer Light database usage: **none**.

## Production notes

The included \`deploy/\` examples provide a local systemd service and nginx reverse proxy.

- Keep Explorer Light bound to \`127.0.0.1\` when nginx is on the same server.
- Keep Yerbas RPC bound to localhost.
- Do not expose RPC port \`9998\` publicly.
- Put HTTPS and any public rate limiting in front of Explorer Light at nginx.
- Do not add RPC credentials to frontend JavaScript.

## Test checklist

1. \`/api/health\` reports the current block height.
2. Home page shows current height, difficulty, peer count, mempool count, and recent blocks.
3. Block and transaction pages resolve against the live Yerbas node.
4. \`/.well-known/yerbas-ai.json\` returns the AI manifest.
5. \`/api/ai/status\` reports a synced, read-only gateway.
6. \`get_network_summary\` returns live Core data.
7. \`get_emission\` returns the Core block subsidy.
8. \`get_smartnodes_by_collateral\` returns public Smartnode data without wallet metadata.
9. With \`addressindex=1\`, \`get_address\` returns address history without an Explorer database.
10. With \`assetindex=1\`, address asset balances become available.
11. Unknown AI tool names such as \`sendrawtransaction\` are rejected.
12. Stop \`yerbasd\` and confirm the explorer reports RPC unavailable without crashing.

## Next AI layers

Explorer Light should remain the read-only data gateway.

Future layers can be separate services:

- MCP adapter over the published tool schemas.
- AI anomaly detection and chain analytics.
- Miner/pool telemetry tools.
- Agent public-key identity and signed messages.
- Explicitly authorized payment agents with strict wallet policy.

Signing keys and spending authority do **not** belong in Explorer Light.
