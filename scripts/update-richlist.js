import { config } from '../src/config.js';
import { YerbasRpc } from '../src/rpc.js';
import { refreshRichlist } from '../src/richlist.js';

// Run through the supplied systemd timer; the web server never starts scans.
const rpc = new YerbasRpc({ ...config.rpc, timeoutMs: config.richlist.scanTimeoutMs });
try {
  const snapshot = await refreshRichlist(rpc, config.richlist.file);
  console.log('Rich list saved at height ' + snapshot.height + ': ' + snapshot.items.length + ' addresses.');
} catch (error) {
  console.error('Rich list refresh failed: ' + error.message);
  process.exitCode = 1;
}
