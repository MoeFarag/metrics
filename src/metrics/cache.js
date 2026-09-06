const IMMUTABLE_TTL = Infinity;

class MemoCache {
  constructor({ enabled = true, defaultTtlMs = 60_000, now = () => Date.now() } = {}) {
    this.enabled = enabled;
    this.defaultTtlMs = defaultTtlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    if (!this.enabled) {
      return undefined;
    }

    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== Infinity && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (!this.enabled) {
      return value;
    }

    this.entries.set(key, {
      value,
      expiresAt: ttlMs === Infinity ? Infinity : this.now() + ttlMs,
    });
    return value;
  }

  async memoize(key, load, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await load();
    this.set(key, value, ttlMs);
    return value;
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

function createRequestKey(method, url, body = null) {
  return JSON.stringify({
    method: String(method || "GET").toUpperCase(),
    url: String(url),
    body,
  });
}

module.exports = {
  IMMUTABLE_TTL,
  MemoCache,
  createRequestKey,
};
