export function memoryStore() {
  const data = new Map();
  let version = 0;
  const read = (entry, type) => (type === "json" ? JSON.parse(entry.value) : entry.value);
  const write = (key, value, options = {}) => {
    const current = data.get(key);
    if (options.onlyIfNew && current) return { modified: false };
    if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = `"${++version}"`;
    data.set(key, { value, etag });
    return { modified: true, etag };
  };
  return {
    data,
    async get(key, { type } = {}) { const e = data.get(key); return e ? read(e, type) : null; },
    async getWithMetadata(key, { type } = {}) { const e = data.get(key); return e ? { data: read(e, type), etag: e.etag, metadata: {} } : null; },
    async set(key, value, options) { return write(key, String(value), options); },
    async setJSON(key, value, options) { return write(key, JSON.stringify(value), options); },
    async delete(key) { data.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: data.get(key).etag })) }; },
  };
}
