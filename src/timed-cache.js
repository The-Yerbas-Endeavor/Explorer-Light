// Bound retained RPC results and deduplicate concurrent requests for the same key.
export function createTimedCache(maxEntries = 128, now = Date.now) {
  const entries = new Map();
  return function cached(key, ttl, producer) {
    const time = now();
    const hit = entries.get(key);
    if (hit && hit.expires > time) return hit.promise;
    for (const [name, entry] of entries) if (entry.expires <= time) entries.delete(name);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
    const entry = { expires: time + ttl, promise: null };
    entry.promise = Promise.resolve().then(producer).catch(error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    entries.set(key, entry);
    return entry.promise;
  };
}
