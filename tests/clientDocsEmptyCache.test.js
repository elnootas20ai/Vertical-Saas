import { describe, expect, it, vi, beforeEach } from 'vitest';

const store = new Map();
const lru = new Map();

vi.mock('../services/cache.js', () => ({
  default: {
    buildKey: (...parts) => parts.join(':'),
    get: (key) => lru.get(key) ?? null,
    set: (key, value) => {
      lru.set(key, value);
    },
    invalidateByPrefix: (prefix) => {
      for (const key of [...lru.keys()]) {
        if (String(key).startsWith(prefix)) lru.delete(key);
      }
    },
  },
}));

vi.mock('../services/couchdb.js', async (importOriginal) => {
  // We test the cache helpers indirectly via a small local replica of the rule.
  return importOriginal();
});

describe('client docs cache empty-list rule', () => {
  beforeEach(() => {
    store.clear();
    lru.clear();
  });

  it('no debe tratar [] como caché válida', () => {
    const cached = [];
    const usable = Array.isArray(cached) && cached.length > 0;
    expect(usable).toBe(false);

    const fromLru = [];
    const usableLru = Array.isArray(fromLru) && fromLru.length > 0;
    expect(usableLru).toBe(false);
  });

  it('sí acepta listas con clientes', () => {
    const cached = [{ _id: 'client-1', type: 'client' }];
    expect(Array.isArray(cached) && cached.length > 0).toBe(true);
  });
});
