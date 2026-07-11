// Cache berbasis file JSON, key = hash artikel.
// Tujuan: hindari panggil LLM berulang untuk teks yang sama
// (hemat biaya saat testing/revisi berulang).
// 
// Cache versioning: ketika schema berubah, increment CACHE_SCHEMA_VERSION
// untuk auto-migrate data lama.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.resolve("server/.cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Current schema version - increment when adding new fields
export const CACHE_SCHEMA_VERSION = 5;

// Default fields for backward compatibility
// Add new fields here when schema changes
export const DEFAULT_CACHE_FIELDS = {
  wordCount: 0,
  charCount: 0,
  extracted_body: null,
  cacheVersion: null,
};

export const hashText = (text) =>
  crypto.createHash("sha256").update(text.trim()).digest("hex");

/**
 * Migrate old cache data to current schema
 * Handles missing fields by adding defaults
 * @param {object} cached - Raw cached data
 * @returns {object} Migrated cache with all required fields
 */
export const migrateCache = (cached) => {
  if (!cached) return { ...DEFAULT_CACHE_FIELDS };
  
  // Recalculate wordCount from extracted_body if available
  let wordCount = cached.wordCount || 0;
  let charCount = cached.charCount || 0;
  
  if (cached.extracted_body) {
    const words = cached.extracted_body.trim().split(/\s+/).filter(Boolean);
    wordCount = words.length;
    charCount = cached.extracted_body.length;
  } else if (cached.articleText) {
    // Fallback: try to get from articleText
    const words = cached.articleText.trim().split(/\s+/).filter(Boolean);
    wordCount = words.length;
    charCount = cached.articleText.length;
  }
  
  // Merge defaults with cached data, preferring cached values
  return {
    ...DEFAULT_CACHE_FIELDS,
    ...cached,
    // Always recalculate these from available text
    wordCount,
    charCount,
    // Ensure extracted_body exists (use articleText as fallback)
    extracted_body: cached.extracted_body || cached.articleText || null,
  };
};

/**
 * Check if cache is from current schema version
 * @param {object} cached - Cached data
 * @returns {boolean}
 */
export const isCurrentVersion = (cached) => {
  return cached?.cacheVersion === String(CACHE_SCHEMA_VERSION);
};

export const getCached = (key) => {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(filePath)) return null;
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data;
  } catch (e) {
    console.error(`Cache read error for ${key}:`, e.message);
    return null;
  }
};

export const setCached = (key, value) => {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  
  // Add schema version to cached data
  const dataToSave = {
    ...value,
    cacheVersion: String(CACHE_SCHEMA_VERSION),
    cachedAt: new Date().toISOString(),
  };
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
  } catch (e) {
    console.error(`Cache write error for ${key}:`, e.message);
  }
};

/**
 * Clear all cached data
 * Use when schema changes break old cache
 */
export const clearAllCache = () => {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      files.forEach(file => {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      });
      return files.length;
    }
    return 0;
  } catch (e) {
    console.error("Clear cache error:", e.message);
    return 0;
  }
};

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
export const getCacheStats = () => {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return { count: 0, size: 0 };
    }
    
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    let totalSize = 0;
    let versionCounts = {};
    
    files.forEach(file => {
      try {
        const stat = fs.statSync(path.join(CACHE_DIR, file));
        totalSize += stat.size;
        
        const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8'));
        const version = data.cacheVersion || 'unknown';
        versionCounts[version] = (versionCounts[version] || 0) + 1;
      } catch (e) {
        // Skip corrupted files
      }
    });
    
    return {
      count: files.length,
      size: totalSize,
      sizeFormatted: formatBytes(totalSize),
      versions: versionCounts,
    };
  } catch (e) {
    return { count: 0, size: 0, error: e.message };
  }
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
