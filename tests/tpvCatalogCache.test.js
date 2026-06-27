// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tpvCatalogSnapshotNeedsBrandRefetch } from '../src/app/lib/tpvCatalogCache.ts';

describe('tpvCatalogCache', () => {
  it('invalida caché vacía para volver a pedir catálogo', () => {
    expect(
      tpvCatalogSnapshotNeedsBrandRefetch({
        items: [],
        brands: [],
        fetchedAt: Date.now(),
        catalogBusinessId: 'del-1',
      }),
    ).toBe(true);
  });

  it('conserva caché con productos y marcas', () => {
    expect(
      tpvCatalogSnapshotNeedsBrandRefetch({
        items: [{ _id: '1', name: 'Pizza', brandIds: ['b1'] }],
        brands: [{ _id: 'b1', name: 'Modomio' }],
        fetchedAt: Date.now(),
        catalogBusinessId: 'del-1',
      }),
    ).toBe(false);
  });
});
