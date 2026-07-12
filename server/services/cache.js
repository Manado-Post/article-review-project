// Cache berbasis file JSON, key = hash artikel.
// TTL default 7 hari, max 5000 entry / 200MB, auto-eviction oldest.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "./logger.js";

const CACHE_DIR = path.resolve("server/.cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

export const CACHE_SCHEMA_VERSION = 5;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE_MB = 200;
const MAX_CACHE_COUNT = 5000;
const EVICT_PERCENT = 0.2; // delete oldest 20% when full

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

// Cek apakah cache ada dan belum expired. Hapus file kalau sudah lewat TTL.
export const getCached = (key, ttlMs = CACHE_TTL_MS) => {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (data.cachedAt && (Date.now() - new Date(data.cachedAt).getTime()) > ttlMs) {
      fs.unlinkSync(filePath);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
};

export const setCached = (key, value, ttlMs = CACHE_TTL_MS) => {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  const dataToSave = { ...value, cacheVersion: String(CACHE_SCHEMA_VERSION), cachedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
    evictIfNeeded(); // check size after write
  } catch (e) {
    // silently ignore write errors — cache miss is acceptable
  }
};

// Delete oldest entries when cache exceeds limits
const evictIfNeeded = () => {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith(".json"));
    let totalSize = 0;
    const fileData = [];
    for (const file of files) {
      try {
        const stat = fs.statSync(path.join(CACHE_DIR, file));
        const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf-8"));
        fileData.push({ file, size: stat.size, cachedAt: data.cachedAt || 0 });
        totalSize += stat.size;
      } catch (e) {
        // skip corrupted
      }
    }
    if (totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024 || fileData.length > MAX_CACHE_COUNT) {
      fileData.sort((a, b) => a.cachedAt - b.cachedAt);
      const toDelete = Math.ceil(fileData.length * EVICT_PERCENT);
      for (let i = 0; i < toDelete; i++) {
        try { fs.unlinkSync(path.join(CACHE_DIR, fileData[i].file)); } catch (e) {}
      }
      logger.info({ deleted: toDelete, remaining: fileData.length - toDelete }, "Cache eviction");
    }
  } catch (e) {
    // non-fatal
  }
};

// Hapus semua file cache. Buat endpoint admin atau script cleanup.
export const clearAllCache = () => {
  try {
    if (!fs.existsSync(CACHE_DIR)) return 0;
    const files = fs.readdirSync(CACHE_DIR);
    files.forEach(file => { try { fs.unlinkSync(path.join(CACHE_DIR, file)); } catch (e) {} });
    return files.length;
  } catch (e) {
    return 0;
  }
};

// Hitung jumlah file dan total ukuran cache. Buat monitoring via /api/metrics.
export const getCacheStats = () => {
  try {
    if (!fs.existsSync(CACHE_DIR)) return { count: 0, size: 0 };
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith(".json"));
    let totalSize = 0;
    let versionCounts = {};
    for (const file of files) {
      try {
        const stat = fs.statSync(path.join(CACHE_DIR, file));
        totalSize += stat.size;
        const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf-8"));
        const version = data.cacheVersion || "unknown";
        versionCounts[version] = (versionCounts[version] || 0) + 1;
      } catch (e) {}
    }
    return {
      count: files.length,
      size: totalSize,
      sizeFormatted: totalSize < 1024 ? `${totalSize} B` : totalSize < 1048576 ? `${(totalSize / 1024).toFixed(1)} KB` : `${(totalSize / 1048576).toFixed(1)} MB`,
      versions: versionCounts,
    };
  } catch (e) {
    return { count: 0, size: 0 };
  }
};
