// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  hydrateTpvCatalogSnapshot,
  tpvCatalogSnapshotNeedsBrandRefetch,
} from '../src/app/lib/tpvCatalogCache.ts';

describe('tpvCatalogCache', () => {
  it('hydrate asigna placeholder a productos sin imagen', () => {
    const snapshot = hydrateTpvCatalogSnapshot({
      items: [{ _id: '1', name: 'Coca-Cola 33cl', category: 'Bebidas', unitPrice: 2 }],
      brands: [],
      fetchedAt: Date.now(),
      catalogBusinessId: 'del-1',
    });
    expect(snapshot.items[0].image).toBe('/catalog-placeholders/photos/cola.webp');
  });

  it('conserva imagen propia del producto', () => {
    const snapshot = hydrateTpvCatalogSnapshot({
      items: [
        {
          _id: '1',
          name: 'Coca-Cola',
          category: 'Bebidas',
          unitPrice: 2,
          image: 'https://cdn.example.com/coke.jpg',
        },
      ],
      brands: [],
      fetchedAt: Date.now(),
      catalogBusinessId: 'del-1',
    });
    expect(snapshot.items[0].image).toBe('https://cdn.example.com/coke.jpg');
  });

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
