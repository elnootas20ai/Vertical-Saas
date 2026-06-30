import { LRUCache } from 'lru-cache';
import logger from './logger.js';

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 2000;
const MAX_ENTRY_SIZE_BYTES = 5 * 1024 * 1024;

const cache = new LRUCache({
  max: MAX_ENTRIES,
  ttl: DEFAULT_TTL_MS,
  maxEntrySize: MAX_ENTRY_SIZE_BYTES,
  sizeCalculation: (value) => {
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      return 1;
    }
  },
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  evictions: 0,
};

const TTL_PRESETS = {
  KPI: 30_000,
  VIEW: 60_000,
  DOCS_LIST: 30_000,
  DB_LIST: 120_000,
  SINGLE_DOC: 15_000,
  SETTINGS: 300_000,
  SUMMARY: 120_000,
};

function buildKey(...parts) {
  return parts.filter(Boolean).join(':');
}

function get(key) {
  const value = cache.get(key);
  if (value !== undefined) {
    stats.hits += 1;
    return value;
  }
  stats.misses += 1;
  return undefined;
}

function set(key, value, ttlMs) {
  const opts = {};
  if (typeof ttlMs === 'number' && ttlMs > 0) {
    opts.ttl = ttlMs;
  }
  cache.set(key, value, opts);
  stats.sets += 1;
}

function invalidate(key) {
  const deleted = cache.delete(key);
  if (deleted) {
    stats.invalidations += 1;
  }
  return deleted;
}

function invalidateByPrefix(prefix) {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      count += 1;
    }
  }
  stats.invalidations += count;
  if (count > 0) {
    logger.debug({ tag: 'CACHE', prefix, count }, `Invalidated ${count} entries by prefix`);
  }
  return count;
}

const dbGenerations = new Map();

function getDbGeneration(dbName) {
  return dbGenerations.get(dbName) || 0;
}

function bumpDbGeneration(dbName) {
  dbGenerations.set(dbName, getDbGeneration(dbName) + 1);
}

function invalidateDb(dbName) {
  bumpDbGeneration(dbName);
  return invalidateByPrefix(`db:${dbName}`);
}

function getStats() {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    size: cache.size,
    maxSize: MAX_ENTRIES,
    hitRate: total > 0 ? Number(((stats.hits / total) * 100).toFixed(2)) : 0,
    calculatedSize: cache.calculatedSize,
  };
}

function clear() {
  cache.clear();
  logger.info({ tag: 'CACHE' }, 'Cache cleared');
}

async function getOrFetch(key, fetchFn, ttlMs) {
  const cached = get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = await fetchFn();
  if (result !== undefined && result !== null) {
    set(key, result, ttlMs);
  }
  return result;
}

export {
  cache,
  get,
  set,
  invalidate,
  invalidateByPrefix,
  invalidateDb,
  getDbGeneration,
  bumpDbGeneration,
  getStats,
  clear,
  getOrFetch,
  buildKey,
  TTL_PRESETS,
};
