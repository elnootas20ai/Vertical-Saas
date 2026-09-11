import { describe, expect, it } from 'vitest';
import {
  diffRemovedStoreIngredients,
  findWarehouseItemIdsForStoreIngredients,
} from '../src/app/lib/storeIngredientWarehouseReverse.ts';
import { pruneDeletedIdsFromSupplierCatalogItemIds } from '../src/app/lib/supplierCatalogLinks.ts';

describe('diffRemovedStoreIngredients', () => {
  it('returns ingredients present in previous but not in next (by id)', () => {
    const prev = [
      { id: 'ing-a', name: 'Aceite' },
      { id: 'ing-b', name: 'Tomate' },
      { id: 'ing-c', name: 'Pan' },
    ];
    const next = [
      { id: 'ing-a', name: 'Aceite' },
      { id: 'ing-c', name: 'Pan' },
    ];
    expect(diffRemovedStoreIngredients(prev, next).map((i) => i.id)).toEqual(['ing-b']);
  });

  it('treats empty next as all previous removed', () => {
    const prev = [{ id: 'ing-a', name: 'Aceite' }];
    expect(diffRemovedStoreIngredients(prev, []).map((i) => i.id)).toEqual(['ing-a']);
  });
});

describe('findWarehouseItemIdsForStoreIngredients', () => {
  it('matches warehouse by storeIngredientId and folded name', () => {
    const catalog = [
      {
        _id: 'stock-1',
        name: 'Aceite oliva',
        module: 'stock',
        isStockItem: true,
        customFields: { storeIngredientId: 'ing-aceite' },
      },
      {
        _id: 'stock-2',
        name: 'TOMATE',
        module: 'stock',
        isStockItem: true,
        stockCategory: 'ingredient',
      },
      {
        _id: 'carta-1',
        name: 'Bocata jamón',
        module: 'catalog',
        isStockItem: false,
      },
    ];
    const ids = findWarehouseItemIdsForStoreIngredients(catalog, [
      { id: 'ing-aceite', name: 'Aceite oliva' },
      { id: 'ing-tom', name: 'tomate' },
    ]);
    expect(ids.sort()).toEqual(['stock-1', 'stock-2']);
  });

  it('does not match pure carta dishes without stock flags', () => {
    const ids = findWarehouseItemIdsForStoreIngredients(
      [{ _id: 'c1', name: 'Pizza', module: 'catalog' }],
      [{ id: 'ing-1', name: 'Pizza' }],
    );
    expect(ids).toEqual([]);
  });

  it('does not delete carta dishes that only have isStockItem', () => {
    const ids = findWarehouseItemIdsForStoreIngredients(
      [
        {
          _id: 'dish-1',
          name: 'jamon',
          module: 'catalog',
          isStockItem: true,
          stockCategory: 'finished_product',
        },
      ],
      [{ id: 'ing-jamon', name: 'jamon' }],
    );
    expect(ids).toEqual([]);
  });
});

describe('pruneDeletedIdsFromSupplierCatalogItemIds', () => {
  it('drops deleted ids and keeps the rest', () => {
    expect(
      pruneDeletedIdsFromSupplierCatalogItemIds(
        ['stock-1', 'stock-2', 'stock-3'],
        new Set(['stock-2']),
      ),
    ).toEqual(['stock-1', 'stock-3']);
  });

  it('handles empty / null input', () => {
    expect(pruneDeletedIdsFromSupplierCatalogItemIds(null, ['x'])).toEqual([]);
    expect(pruneDeletedIdsFromSupplierCatalogItemIds([], new Set(['x']))).toEqual([]);
  });
});
