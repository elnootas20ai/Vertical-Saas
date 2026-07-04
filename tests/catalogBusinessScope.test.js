// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  catalogItemBelongsToBusinessScope,
  dedupeCatalogItemsForDisplay,
  expandCatalogItemsForDeletion,
  filterCatalogItemsForBusinessScope,
} from '../src/app/lib/catalogBusinessScope.ts';

const brandA = { _id: 'brand-a', name: 'Modomio' };
const brandB = { _id: 'brand-b', name: 'Black Burger' };

describe('catalogBusinessScope', () => {
  it('prioriza business_id sobre marcas de otra empresa', () => {
    const item = {
      _id: '1',
      name: 'Pizza',
      business_id: 'biz-a',
      brandIds: ['brand-b'],
    };
    const brandIds = new Set(['brand-a']);
    expect(catalogItemBelongsToBusinessScope(item, 'biz-a', brandIds)).toBe(true);
    expect(catalogItemBelongsToBusinessScope(item, 'biz-b', brandIds)).toBe(false);
  });

  it('filtra por línea comercial de la empresa activa', () => {
    const items = [
      { _id: '1', name: 'Pizza A', brandIds: ['brand-a'] },
      { _id: '2', name: 'Burger B', brandIds: ['brand-b'] },
      { _id: '3', name: 'Bebida', category: 'Pizzas', brandIds: [] },
    ];
    const scoped = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 2,
    });
    expect(scoped.map((i) => i._id)).toEqual(['1']);
  });

  it('bebidas y complementos sin línea visibles en empresa delivery (multi-cuenta)', () => {
    const items = [
      { _id: 'p1', name: 'Margarita', category: 'Pizzas', brandIds: ['brand-a'] },
      { _id: 'b1', name: 'Coca-Cola', category: 'Bebidas', brandIds: [] },
      { _id: 'c1', name: 'Patatas', category: 'Complementos', brandIds: [] },
    ];
    const scoped = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 2,
      activeBusinessType: 'delivery',
    });
    expect(scoped.map((i) => i._id).sort()).toEqual(['b1', 'c1', 'p1']);
  });

  it('bebidas y complementos sin línea visibles en empresa restaurante (multi-cuenta)', () => {
    const items = [
      { _id: 'p1', name: 'Bravas', category: 'Tapas', brandIds: ['brand-a'] },
      { _id: 'b1', name: 'Caña', category: 'Bebidas', brandIds: [] },
      { _id: 'c1', name: 'Patatas', category: 'Complementos', brandIds: [] },
    ];
    const scoped = filterCatalogItemsForBusinessScope(items, 'biz-rest', [brandA], {
      accountBusinessCount: 2,
      activeBusinessType: 'restaurant',
    });
    expect(scoped.map((i) => i._id).sort()).toEqual(['b1', 'c1', 'p1']);
  });

  it('oculta catálogo delivery en empresa events', () => {
    const items = [
      { _id: 'p1', name: 'Napolitana', category: 'Pizzas', vertical: 'delivery', brandIds: ['brand-a'] },
      { _id: 'e1', name: 'Menú catering', category: 'Servicios', vertical: 'events' },
    ];
    const scoped = filterCatalogItemsForBusinessScope(items, 'biz-events', [], {
      accountBusinessCount: 2,
      activeBusinessType: 'events',
    });
    expect(scoped.map((i) => i._id)).toEqual(['e1']);
  });

  it('aisla carta restaurante de delivery en multi-cuenta', () => {
    const items = [
      { _id: 'r1', name: 'Caña', category: 'Bebidas', vertical: 'restaurant', business_id: 'biz-rest' },
      { _id: 'd1', name: 'Pizza', category: 'Pizzas', vertical: 'delivery', business_id: 'biz-del' },
    ];
    const scopedRest = filterCatalogItemsForBusinessScope(items, 'biz-rest', [brandA], {
      accountBusinessCount: 2,
      activeBusinessType: 'restaurant',
    });
    expect(scopedRest.map((i) => i._id)).toEqual(['r1']);

    const scopedDel = filterCatalogItemsForBusinessScope(items, 'biz-del', [brandB], {
      accountBusinessCount: 2,
      activeBusinessType: 'delivery',
    });
    expect(scopedDel.map((i) => i._id)).toEqual(['d1']);
  });

  it('no mezcla legacy sin business_id entre varias empresas', () => {
    const items = [{ _id: 'beb', name: 'Coca-Cola', category: 'Bebidas', brandIds: [] }];
    const multi = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 2,
    });
    expect(multi).toHaveLength(0);

    const delivery = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 2,
      activeBusinessType: 'delivery',
    });
    expect(delivery).toHaveLength(1);

    const restaurant = filterCatalogItemsForBusinessScope(items, 'biz-rest', [brandA], {
      accountBusinessCount: 2,
      activeBusinessType: 'restaurant',
    });
    expect(restaurant).toHaveLength(1);

    const single = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 1,
    });
    expect(single).toHaveLength(1);
  });

  it('dedupeCatalogItemsForDisplay keeps one row per sku or name', () => {
    const items = [
      {
        _id: 'old',
        name: 'Napolitana',
        category: 'Pizzas',
        sku: 'PIZ-001',
        business_id: 'biz-a',
        customFields: { costingType: 'fixed' },
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        _id: 'new',
        name: 'Napolitana',
        category: 'Pizzas',
        sku: 'PIZ-001',
        business_id: 'biz-a',
        customFields: {
          costingType: 'recipe',
          costingRecipe: [{ storeIngredientId: 'a', name: 'Masa', quantity: 1, unit: 'ud' }],
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        _id: 'other',
        name: 'Cheese Burger',
        category: 'Burgers',
        sku: 'BRG-01',
        business_id: 'biz-a',
      },
    ];
    const deduped = dedupeCatalogItemsForDisplay(items, 'biz-a');
    expect(deduped).toHaveLength(2);
    expect(deduped.find((i) => i.name === 'Napolitana')?._id).toBe('new');
  });

  it('dedupeCatalogItemsForDisplay colapsa legacy sin SKU y reimport VT', () => {
    const items = [
      {
        _id: 'legacy',
        name: 'Margarita',
        category: 'Pizzas',
        sku: '',
        customFields: { costingType: 'fixed' },
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        _id: 'imported',
        name: 'Margarita',
        category: 'Pizzas',
        sku: 'VT-pizzas-margarita',
        business_id: 'biz-a',
        customFields: {
          costingType: 'recipe',
          costingRecipe: [{ storeIngredientId: 'a', name: 'Masa', quantity: 1, unit: 'ud' }],
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const deduped = dedupeCatalogItemsForDisplay(items, 'biz-a');
    expect(deduped).toHaveLength(1);
    expect(deduped[0]._id).toBe('imported');
  });

  it('expandCatalogItemsForDeletion incluye duplicados legacy con la misma identidad', () => {
    const raw = [
      { _id: '1', module: 'catalog', name: 'Burger', category: 'Burgers', sku: 'B1' },
      { _id: '2', module: 'catalog', name: 'Burger', category: 'Burgers', sku: 'VT-burgers-burger' },
      { _id: '3', module: 'stock', name: 'Carne', category: 'Ingredientes' },
    ];
    const expanded = expandCatalogItemsForDeletion([raw[0]], raw);
    expect(expanded.map((i) => i._id).sort()).toEqual(['1', '2']);
  });
});
