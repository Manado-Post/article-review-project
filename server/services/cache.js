// Cache berbasis in-memory Map, key = hash artikel.
// TTL default 7 hari, max 5000 entry, auto-eviction oldest.

import crypto from "crypto";

export const CACHE_SCHEMA_VERSION = 5;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_COUNT = 5000;

const cache = new Map();

export const hashText = (text) =>
  crypto.createHash("sha256").update(text.trim()).digest("hex");

export const migrateCache = (cached) => {
  if (!cached) {
    return { wordCount: 0, charCount: 0, extracted_body: null, cacheVersion: null };
  }

  let wordCount = cached.wordCount || 0;
  let charCount = cached.charCount || 0;
  const sourceText = cached.extracted_body || cached.articleText;

  if (sourceText) {
    wordCount = sourceText.trim().split(/\s+/).filter(Boolean).length;
    charCount = sourceText.length;
  }

  return {
    ...cached,
    wordCount,
    charCount,
    extracted_body: cached.extracted_body || cached.articleText || null,
  };
}

// Cek apakah cache ada dan belum expired.
export const getCached = (key, ttlMs = CACHE_TTL_MS) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

export const setCached = (key, value, ttlMs = CACHE_TTL_MS) => {
  cache.set(key, {
    data: { ...value, cacheVersion: String(CACHE_SCHEMA_VERSION), cachedAt: new Date().toISOString() },
    cachedAt: Date.now(),
  });
  if (cache.size > MAX_CACHE_COUNT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
};

// Hapus semua cache.
export const clearAllCache = () => {
  const count = cache.size;
  cache.clear();
  return count;
};

// Hitung jumlah entry cache.
export const getCacheStats = () => {
  let versionCounts = {};
  for (const [, entry] of cache) {
    const version = entry.data?.cacheVersion || "unknown";
    versionCounts[version] = (versionCounts[version] || 0) + 1;
  }
  return {
    count: cache.size,
    versions: versionCounts,
  };
};
