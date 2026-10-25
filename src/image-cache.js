// Cache only successful immutable images, with a strict byte budget.
export class ImageCache {
  constructor(maxBytes = 128 * 1024 * 1024, ttl = 86400000) {
    this.maxBytes = maxBytes;
    this.ttl = ttl;
    this.bytes = 0;
    this.entries = new Map();
  }
  get(key, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expires <= now) {
      this.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  delete(key) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.value.data.length;
    this.entries.delete(key);
  }
  set(key, value, now = Date.now()) {
    if (value.data.length > this.maxBytes) return;
    this.delete(key);
    while (this.bytes + value.data.length > this.maxBytes && this.entries.size) {
      this.delete(this.entries.keys().next().value);
    }
    this.entries.set(key, { value, expires: now + this.ttl });
    this.bytes += value.data.length;
  }
}
