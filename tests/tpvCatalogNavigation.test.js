// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildTpvCatalogSections,
  categoriesForTpvScope,
  defaultTpvSectionId,
  searchTpvProducts,
  buildTpvProductSearchIndex,
} from '../src/app/lib/tpvCatalogNavigation';

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

  it('pestaña Todos incluye productos huérfanos de marca inactiva', () => {
    const brands = [{ _id: 'brand-active', active: true, name: 'Activa' }];
    const catalog = [
      {
        _id: 'orphan-1',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['brand-deleted'],
        unitPrice: 9,
      },
    ];
    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections[0]?.label).toBe('Todos');
    expect(defaultTpvSectionId(sections)).toBe('all');
    const index = buildTpvProductSearchIndex(catalog);
    const visible = searchTpvProducts(index, catalog, '', { kind: 'all' }, null, {});
    expect(visible.map((i) => i._id)).toEqual(['orphan-1']);
  });
});
