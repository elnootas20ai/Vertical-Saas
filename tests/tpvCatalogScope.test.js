// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  collectComboReferencedProductIds,
  filterTpvCatalogItems,
  isTpvWarehouseOnlyCatalogItem,
  resolveTpvCatalogLoadScope,
  tpvCatalogCacheKey,
} from '../src/app/lib/tpvCatalogScope.ts';

describe('tpvCatalogScope', () => {
  const businesses = [
    { business_id: 'clean-1', businessType: 'cleaning' },
    { business_id: 'del-1', businessType: 'delivery' },
  ];

  it('resolveTpvCatalogLoadScope usa la empresa delivery si el selector apunta a otra vertical', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(scope.catalogBusinessId).toBe('del-1');
    expect(scope.scopeBusinessId).toBe('clean-1');
    expect(scope.activeBusinessType).toBe('delivery');
    expect(scope.accountBusinessCount).toBe(2);
  });

  it('tpvCatalogCacheKey usa catalogBusinessId resuelto (delivery)', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(tpvCatalogCacheKey('user-1', scope)).toBe('user-1:del-1');
  });

  it('filterTpvCatalogItems incluye legacy sin business_id por linea comercial', () => {
    const rawItems = [
      { _id: 'p1', name: 'Burger', brandIds: ['brand-modomio'], itemType: 'product', active: true },
    ];
    const scope = resolveTpvCatalogLoadScope('del-1', businesses, 2);
    const brands = [{ _id: 'brand-modomio', name: 'Modomio' }];

    const items = filterTpvCatalogItems(rawItems, scope, brands);
    expect(items).toHaveLength(1);
  });

  it('filterTpvCatalogItems oculta productos de otra vertical aunque compartan cuenta', () => {
    const rawItems = [
      { _id: 'p1', name: 'Menú eventos', brandIds: [], vertical: 'events', itemType: 'product', active: true },
    ];
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);

    const items = filterTpvCatalogItems(rawItems, scope, []);
    expect(items).toEqual([]);
  });

  it('filterTpvCatalogItems incluye carta con isStockItem (control stock)', () => {
    const rawItems = [
      {
        _id: 'crispy',
        name: 'Crispy Chicken',
        brandIds: ['brand-bb'],
        itemType: 'product',
        module: 'catalog',
        active: true,
        isStockItem: true,
        stockCategory: 'finished_product',
      },
      {
        _id: 'flour',
        name: 'Harina',
        brandIds: [],
        itemType: 'product',
        module: 'catalog',
        active: true,
        isStockItem: true,
        stockCategory: 'ingredient',
      },
    ];
    const scope = resolveTpvCatalogLoadScope('del-1', businesses, 2);
    const brands = [{ _id: 'brand-bb', name: 'blackburger' }];
    const items = filterTpvCatalogItems(rawItems, scope, brands);
    expect(items.map((i) => i._id)).toEqual(['crispy']);
  });

  it('carta vendible (Carbonara/Monalisa/mitad) no desaparece por isStockItem ni categoría carta', () => {
    expect(
      isTpvWarehouseOnlyCatalogItem({
        module: 'catalog',
        itemType: 'product',
        category: 'Pizzas',
        unitPrice: 12,
        isStockItem: true,
        stockCategory: 'other',
      }),
    ).toBe(false);
    expect(
      isTpvWarehouseOnlyCatalogItem({
        module: 'catalog',
        itemType: 'product',
        category: 'Complementos',
        unitPrice: 4.5,
        isStockItem: true,
        stockCategory: 'beverage',
      }),
    ).toBe(false);
    expect(
      isTpvWarehouseOnlyCatalogItem({
        module: 'catalog',
        itemType: 'product',
        category: 'Premium',
        unitPrice: 14,
        isStockItem: true,
        stockCategory: 'finished_product',
        customFields: { halfHalf: true },
      }),
    ).toBe(false);
    expect(
      isTpvWarehouseOnlyCatalogItem({
        module: 'catalog',
        itemType: 'combo',
        category: 'Combos',
        unitPrice: 18,
        isStockItem: true,
      }),
    ).toBe(false);
    // Almacén puro sigue oculto
    expect(
      isTpvWarehouseOnlyCatalogItem({
        module: 'stock',
        itemType: 'product',
        isStockItem: true,
        stockCategory: 'ingredient',
      }),
    ).toBe(true);
    expect(
      isTpvWarehouseOnlyCatalogItem({
        module: 'catalog',
        itemType: 'product',
        category: 'Ingredientes',
        unitPrice: 0,
        isStockItem: true,
        stockCategory: 'ingredient',
      }),
    ).toBe(true);
  });

  it('filterTpvCatalogItems conserva complementos de allowlist/suplemento de menú con isStockItem', () => {
    const rawItems = [
      {
        _id: 'menu-duo',
        name: 'Dúo',
        business_id: 'del-1',
        brandIds: [],
        itemType: 'combo',
        module: 'catalog',
        active: true,
        customFields: {
          comboSlotAllowlists: { side: ['monalisa', 'salchi'] },
          comboSlotSurcharges: { side: { salchi: 1, teq: 1.5 } },
        },
      },
      {
        _id: 'monalisa',
        name: 'Patatas Monalisa',
        business_id: 'del-1',
        brandIds: [],
        itemType: 'product',
        module: 'catalog',
        active: true,
        isStockItem: true,
        stockCategory: 'other',
      },
      {
        _id: 'salchi',
        name: 'Salchipapas Supreme',
        business_id: 'del-1',
        brandIds: [],
        itemType: 'product',
        module: 'catalog',
        active: true,
        isStockItem: true,
      },
      {
        _id: 'teq',
        name: 'Tequeños',
        business_id: 'del-1',
        brandIds: [],
        itemType: 'product',
        module: 'catalog',
        active: true,
        isStockItem: true,
        stockCategory: 'beverage',
      },
      {
        _id: 'harina',
        name: 'Harina',
        business_id: 'del-1',
        brandIds: [],
        itemType: 'product',
        module: 'stock',
        active: true,
        isStockItem: true,
        stockCategory: 'ingredient',
        customFields: {},
      },
    ];
    expect([...collectComboReferencedProductIds(rawItems)].sort()).toEqual([
      'monalisa',
      'salchi',
      'teq',
    ]);
    expect(isTpvWarehouseOnlyCatalogItem(rawItems[1], { comboMenuReferenced: true })).toBe(false);
    expect(isTpvWarehouseOnlyCatalogItem(rawItems[4], { comboMenuReferenced: true })).toBe(true);

    const scope = resolveTpvCatalogLoadScope('del-1', businesses, 2);
    const items = filterTpvCatalogItems(rawItems, scope, []);
    expect(items.map((i) => i._id).sort()).toEqual(['menu-duo', 'monalisa', 'salchi', 'teq']);
  });
});
