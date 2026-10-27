export function metadataImageTarget(buffer, cid) {
  if (buffer.length > 2 * 1024 * 1024) return null;
  let metadata;
  try { metadata = JSON.parse(buffer.toString('utf8')); } catch { return null; }
  let ref = metadata?.image || metadata?.image_url;
  if (typeof ref !== 'string' || ref.length > 2048) return null;
  ref = ref.trim();
  let targetCid = cid;
  let targetPath = ref;
  if (ref.startsWith('ipfs://')) {
    const parts = ref.slice(7).replace(/^ipfs\//, '').split('/');
    targetCid = parts.shift(); targetPath = parts.join('/');
  } else if (ref.startsWith('/ipfs/')) {
    const parts = ref.slice(6).split('/'); targetCid = parts.shift(); targetPath = parts.join('/');
  } else if (/^https:\/\//i.test(ref)) {
    let url;
    try { url = new URL(ref); } catch { return null; }
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname.startsWith('/ipfs/')) {
      const parts = url.pathname.slice(6).split('/'); targetCid = parts.shift(); targetPath = parts.join('/');
    } else if (/^[a-z0-9]+\.ipfs\./i.test(url.hostname)) {
      targetCid = url.hostname.split('.')[0]; targetPath = url.pathname.slice(1);
    } else return null;
  } else if (/^[a-z]+:|^\/\//i.test(ref)) return null;
  try { targetPath = decodeURIComponent(targetPath); } catch { return null; }
  targetPath = targetPath.replace(/^\.\//, '');
  if (!/^[A-Za-z0-9]{32,128}$/.test(targetCid) || targetPath.startsWith('/') || targetPath.split('/').some(p => p === '..' || p === '.') || /[\\?#\x00-\x1f]/.test(targetPath)) return null;
  return { cid: targetCid, path: targetPath || null };
}
