# Richest-address snapshots

The rich list ranks confirmed, unspent **native YERB** by address. It includes
immature coinbase rewards and locked smartnode collateral, excludes mempool
changes, and does not treat addresses as individual owners. Native value in
scripts without a single extractable destination is reported separately.
Asset token quantities are not added to YERB balances.

No explorer database, new Core index, or runtime npm package is required.
Core's `getrichlist` RPC scans its existing chainstate. Temporary RAM grows with
the number of funded addresses; the saved explorer file contains only the top
100. A scan is expensive: start with a daily refresh and measure duration,
peak RAM and impact on block processing before increasing frequency.

## Local Core update

Apply the accompanying Core patch to the explorer node's matching source
revision. Build and test using that release's supported dependencies. The patch
adds `getrichlist (count)` with count 1..1000, default 100, and CLI parameter
conversion. It does not change validation or consensus and requires no reindex.
Only the explorer's node needs the patched binary.

Back up the current binary, configuration and service definition. Stop Core
cleanly, replace its binary with the tested build, and restart using the same
data directory. Never replace or delete chainstate. Confirm normal sync and:

```sh
yerbas-cli getrichlist 1
```

This call needs neither a wallet nor addressindex. It should return the snapshot
height/hash, exact decimal-string base-unit totals, and the highest-ranked
address. The scan holds the chain lock only for cursor creation/flush and the
final active-chain check. Concurrent rich-list scans are rejected. A reorg during
the scan aborts the result.

## Explorer update

Deploy the accompanying Explorer patch to `feature/rpc-first-test-build`, run
`npm test` and `npm run check`, then restart the explorer normally. The existing
RPC credentials stay server-side. `npm run richlist:update` performs one scan
and atomically replaces the JSON file only after successful validation. A failed
refresh keeps the previous file. The scan timeout defaults to 30 minutes;
`RICHLIST_SCAN_TIMEOUT_MS` can be raised to two hours after measuring the node.
A timed-out client does not necessarily cancel a running Core scan.

Set in `/opt/yerbas-explorer-light/.env`:

```ini
RICHLIST_FILE=/var/lib/yerbas-explorer-light/richlist.json
RICHLIST_MAX_AGE_MS=172800000
RICHLIST_SCAN_TIMEOUT_MS=1800000
```

The bundled timer assumes the hardened install's `explorer-light` service user,
its existing access to Core RPC, and installation at `/opt/yerbas-explorer-light`.
Adjust User/Group and paths to match older installations. The web process must
run as the same user as the updater because the snapshot is mode 0600.

```sh
sudo install -m 0644 deploy/yerbas-richlist.service /etc/systemd/system/
sudo install -m 0644 deploy/yerbas-richlist.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start yerbas-richlist.service
sudo journalctl -u yerbas-richlist.service -n 30 --no-pager
# Enable after verifying the initial scan and its resource usage:
sudo systemctl enable --now yerbas-richlist.timer
```

Check `/richlist` and `/api/v1/richlist`. Both API aliases serve the saved file;
page visits never invoke the scan RPC. The API verifies the saved block hash
against Core (using the normal short cache), rejects orphaned snapshots, and
labels old snapshots `stale`. Missing/corrupt files or unavailable Core yield 503.
Refresh after a reorg to restore the page. The JSON file may be deleted and
rebuilt from Core without losing blockchain data.

## Rollback

Disable the timer and restore the prior explorer release. If reverting Core,
stop it cleanly and restore the previous binary with the same configuration and
data directory. No chain migration was introduced by this patch.
