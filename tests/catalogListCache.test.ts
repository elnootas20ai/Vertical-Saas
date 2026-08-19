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

  it('invalidates by userId', async () => {
    const fetcher = vi.fn(async () => [{ id: 'y' }]);
    await listCatalogItemsCached('u3', fetcher, 'catalog');
    invalidateCatalogListCache('u3');
    await listCatalogItemsCached('u3', fetcher, 'catalog');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
