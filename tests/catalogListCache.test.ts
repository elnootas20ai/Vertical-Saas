import { describe, expect, it, beforeEach, vi } from 'vitest';
import { invalidateCatalogListCache, listCatalogItemsCached } from '../src/app/lib/catalogListCache';

describe('catalogListCache', () => {
  beforeEach(() => {
    invalidateCatalogListCache();
  });

  it('dedupes concurrent fetches for the same key', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return [{ id: 'a' }];
    });

    const [a, b] = await Promise.all([
      listCatalogItemsCached('u1', fetcher, 'catalog'),
      listCatalogItemsCached('u1', fetcher, 'catalog'),
    ]);

    expect(calls).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('returns cached result within TTL', async () => {
    const fetcher = vi.fn(async () => [{ id: 'x' }]);
    await listCatalogItemsCached('u2', fetcher, 'stock');
    await listCatalogItemsCached('u2', fetcher, 'stock');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidates inflight fetches so stale lists cannot repopulate cache', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return [{ id: 'stale' }];
    });

    const pending = listCatalogItemsCached('u4', fetcher, 'stock');
    invalidateCatalogListCache('u4');
    const freshFetcher = vi.fn(async () => [{ id: 'fresh' }]);
    const result = await listCatalogItemsCached('u4', freshFetcher, 'stock');
    await pending.catch(() => []);

    expect(result).toEqual([{ id: 'fresh' }]);
    expect(freshFetcher).toHaveBeenCalledTimes(1);
  });
});
