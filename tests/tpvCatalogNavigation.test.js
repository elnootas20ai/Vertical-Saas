// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { categoriesForTpvScope } from '../src/app/lib/tpvCatalogNavigation';

describe('categoriesForTpvScope', () => {
  it('incluye categorías de items aunque no estén en catalogCategories de la marca', () => {
    const brands = [
      {
        _id: 'brand-modomio',
        catalogCategories: ['Pizzas', 'Bebidas'],
      },
    ];
    const catalog = [
      {
        _id: 'combo-1',
        itemType: 'combo',
        category: 'Combos',
        active: true,
        brandIds: ['brand-modomio'],
        unitPrice: 12,
      },
      {
        _id: 'pizza-1',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['brand-modomio'],
        unitPrice: 10,
      },
    ];

    const cats = categoriesForTpvScope(
      { kind: 'brand', brandId: 'brand-modomio' },
      brands,
      catalog,
    );

    expect(cats).toEqual(['Pizzas', 'Combos']);
  });
});
