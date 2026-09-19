# Yerbas Explorer Light AI Gateway

Explorer Light includes a deliberately small, read-only machine interface for Yerbas AI integrations.

The AI gateway is **not** part of consensus. It does not hold keys, sign transactions, create transactions, broadcast transactions, open wallets, execute shell commands, or proxy arbitrary JSON-RPC methods.

## Architecture

\`\`\`text
AI / agent / MCP adapter / application
              |
              | HTTPS JSON
              v
      Explorer Light AI Gateway
              |
              | fixed read-only RPC allowlist
              v
          Yerbas Core
              |
              v
      Yerbas blockchain / Core indexes
\`\`\`

Yerbas Core and the blockchain remain the source of truth. Explorer Light does not create a second blockchain database.

## Discovery and status

### Manifest

\`\`\`http
GET /.well-known/yerbas-ai.json
\`\`\`

Returns the protocol version, tool schemas, endpoint locations, Core index recommendations, denied capabilities, and future integration flags.

### Status

\`\`\`http
GET /api/ai/status
GET /ext/ai/status
\`\`\`

The \`/ext/ai/status\` route is a compatibility alias for earlier Yerbas AI prototypes.

### Tools

\`\`\`http
GET /api/ai/tools
\`\`\`

Returns the machine-readable tool definitions.

## Tool invocation

\`\`\`http
POST /api/ai/query
Content-Type: application/json
\`\`\`

Request:

\`\`\`json
{
  "tool": "get_network_summary",
  "arguments": {}
}
\`\`\`

Response shape:

\`\`\`json
{
  "ok": true,
  "tool": "get_network_summary",
  "data": {},
  "meta": {
    "protocol": "yerbas-ai-tools",
    "version": "0.1.0",
    "readOnly": true,
    "source": "Yerbas Core RPC / public blockchain data",
    "generatedAt": "..."
  }
}
\`\`\`

The compatibility route below accepts the same payload:

\`\`\`http
POST /ext/ai/query
\`\`\`

For migration convenience, \`name\` may be used instead of \`tool\`, and \`args\` or \`params\` may be used instead of \`arguments\`.

There is no natural-language execution endpoint in Explorer Light. A language model or agent may choose a tool externally, but the explorer itself executes only a fixed allowlist.

## Tools

### get_network_summary

Compact live chain, peer, mempool, Smartnode-count, and current-emission data.

\`\`\`json
{"tool":"get_network_summary","arguments":{}}
\`\`\`

### get_recent_blocks

\`\`\`json
{"tool":"get_recent_blocks","arguments":{"limit":10}}
\`\`\`

Maximum: 25.

### get_block

By height:

\`\`\`json
{"tool":"get_block","arguments":{"height":1234567}}
\`\`\`

By hash:

\`\`\`json
{"tool":"get_block","arguments":{"hash":"<64-char hash>"}}
\`\`\`

To include full transaction objects:

\`\`\`json
{"tool":"get_block","arguments":{"height":1234567,"include_transactions":true}}
\`\`\`

### get_transaction

\`\`\`json
{"tool":"get_transaction","arguments":{"txid":"<64-char txid>"}}
\`\`\`

When the containing block is already known, supply \`block_hash\`. Explorer Light can then read the transaction directly from that block without depending on \`txindex\`.

\`\`\`json
{
  "tool":"get_transaction",
  "arguments":{
    "txid":"<64-char txid>",
    "block_hash":"<64-char block hash>"
  }
}
\`\`\`

### get_address

\`\`\`json
{
  "tool":"get_address",
  "arguments":{
    "address":"<Yerbas address>",
    "tx_limit":50,
    "utxo_limit":50
  }
}
\`\`\`

With \`addressindex=1\`, Core can provide the balance, transaction IDs, and UTXOs directly. Optional \`start_height\` and \`end_height\` can constrain transaction history.

With \`assetindex=1\`, the same response can also include public asset balances for the address.

If an index is unavailable, the tool reports that fact instead of fabricating data.

### get_supply

\`\`\`json
{"tool":"get_supply","arguments":{}}
\`\`\`

Uses Core's UTXO-set snapshot from \`gettxoutsetinfo\`.

### get_emission

Current tip:

\`\`\`json
{"tool":"get_emission","arguments":{}}
\`\`\`

Historical height:

\`\`\`json
{"tool":"get_emission","arguments":{"height":1234567}}
\`\`\`

Uses Core's \`getblockstats\` subsidy value and returns both duffs and YERB.

### get_smartnodes

\`\`\`json
{
  "tool":"get_smartnodes",
  "arguments":{
    "status":"ENABLED",
    "limit":100,
    "offset":0
  }
}
\`\`\`

Optional status values:

- \`ALL\`
- \`ENABLED\`
- \`POSE_BANNED\`
- \`COLLATERAL_NOT_PAYABLE\`

An exact \`collateral_amount\` may also be supplied.

The source is \`protx list registered true\`, but Explorer Light removes Core's wallet-ownership metadata before returning a result.

### get_smartnodes_by_collateral

\`\`\`json
{
  "tool":"get_smartnodes_by_collateral",
  "arguments":{"amount":69000}
}
\`\`\`

This is intended for questions such as how many Smartnodes currently use 69,000 YERB collateral.

### get_asset

\`\`\`json
{
  "tool":"get_asset",
  "arguments":{"asset_id":"ASSET_NAME"}
}
\`\`\`

Uses Core's public asset registry through \`getassetdata\`.

### get_market_price

\`\`\`json
{"tool":"get_market_price","arguments":{}}
\`\`\`

Explorer Light does not hard-code an exchange or external market service. An administrator may configure a trusted read-only JSON endpoint with \`AI_MARKET_PRICE_URL\`. Until then this tool reports \`available: false\`.

## Recommended Yerbas Core indexes

Explorer Light itself remains database-free. For a public AI/explorer node, enable the indexes already supported by Yerbas Core:

\`\`\`ini
server=1
txindex=1
addressindex=1
assetindex=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
\`\`\`

Changing an index setting on an existing node can require a Core reindex.

Purpose:

- \`txindex=1\`: arbitrary historical transaction lookup.
- \`addressindex=1\`: public address balances, txids, UTXOs, and deltas.
- \`assetindex=1\`: public asset balances/holder-style queries.

These are Core indexes, not an Explorer Light database.

## Security boundary

The manifest explicitly declares these capabilities unavailable:

\`\`\`text
arbitrary_rpc
wallet_access
private_keys
signing
transaction_creation
transaction_broadcast
shell_execution
\`\`\`

Additional design rules:

1. RPC credentials never leave the server.
2. The public API maps to explicit read-only handlers; users cannot supply an RPC method name.
3. AI POST bodies are capped by \`AI_MAX_BODY_BYTES\`.
4. Smartnode wallet-ownership flags returned internally by \`protx\` are discarded.
5. \`validateaddress\` results are reduced to public validation information; wallet ownership fields are not forwarded.
6. Market data is disabled until an administrator explicitly configures a source.
7. No LLM package or external AI dependency runs inside Explorer Light.

## Configuration

\`\`\`ini
AI_API_ENABLED=true
AI_MAX_BODY_BYTES=32768

# Optional
# AI_MARKET_PRICE_URL=https://trusted.example/yerb-price.json
\`\`\`

Set \`AI_API_ENABLED=false\` to remove the AI routes from the public interface.

## Curl examples

Discovery:

\`\`\`bash
curl -s http://127.0.0.1:3001/.well-known/yerbas-ai.json | python3 -m json.tool
\`\`\`

Status:

\`\`\`bash
curl -s http://127.0.0.1:3001/api/ai/status | python3 -m json.tool
\`\`\`

Network summary:

\`\`\`bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"tool":"get_network_summary","arguments":{}}' \
  http://127.0.0.1:3001/api/ai/query | python3 -m json.tool
\`\`\`

69,000 YERB Smartnodes:

\`\`\`bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"tool":"get_smartnodes_by_collateral","arguments":{"amount":69000}}' \
  http://127.0.0.1:3001/api/ai/query | python3 -m json.tool
\`\`\`

Address:

\`\`\`bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"tool":"get_address","arguments":{"address":"<address>"}}' \
  http://127.0.0.1:3001/api/ai/query | python3 -m json.tool
\`\`\`

## Future adapters

The discovery manifest identifies future adapter points without enabling privileged functionality.

A future MCP adapter can translate MCP tool calls to the fixed tool set above. A future Yerbas agent identity layer can use public keys and signed messages outside consensus. Any future payment-capable agent must be a separate, explicitly authorized service with strict wallet policy; spending authority does not belong in Explorer Light.
