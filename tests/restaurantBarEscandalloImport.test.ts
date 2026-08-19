import { describe, expect, it } from 'vitest';
import {
  applyVertialAutoCostingBatch,
  ensureVertialEscandalloBaseStoreIngredients,
  inferImportCostingLineKind,
} from '../src/app/lib/catalogImportCosting';
import { productCostingStatus, readProductRecipeLines } from '../src/app/lib/catalogCosting';

describe('escandallo bar/restaurante Excel', () => {
  it('mixed_restaurant: aproxima escandallo de comida (no solo bebidas)', () => {
    const brands = [{ _id: 'b1', name: 'Bar Casa', deliveryLineKind: 'mixed_restaurant' }];
    const { items: store } = ensureVertialEscandalloBaseStoreIngredients([], brands);

    const items = [
      {
        _id: '1',
        name: 'Patatas bravas',
        category: 'Tapas',
        brandIds: ['b1'],
        unitPrice: 5,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '2',
        name: 'Bocadillo mixto',
        category: 'Bocadillos',
        brandIds: ['b1'],
        unitPrice: 4.5,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '3',
        name: 'Plato del dia',
        category: 'Principales',
        brandIds: ['b1'],
        unitPrice: 12,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '4',
        name: 'Coca Cola',
        category: 'Bebidas',
        brandIds: ['b1'],
        unitPrice: 2.5,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '5',
        name: 'Ensalada cesar',
        category: 'Ensaladas',
        brandIds: ['b1'],
        unitPrice: 8,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '6',
        name: 'Solomillo',
        category: 'Carnes',
        brandIds: ['b1'],
        unitPrice: 18,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
    ];

    expect(inferImportCostingLineKind(items[0], brands)).toBe('tapas_bar');
    expect(inferImportCostingLineKind(items[2], brands)).toBe('prepared_meals');
    expect(inferImportCostingLineKind(items[4], brands)).toBe('prepared_meals');
    expect(inferImportCostingLineKind(items[5], brands)).toBe('prepared_meals');

    const results = applyVertialAutoCostingBatch(items, items, store, brands);
    const byName = Object.fromEntries(results.map((r) => [r.item.name, r]));

    for (const name of [
      'Patatas bravas',
      'Bocadillo mixto',
      'Plato del dia',
      'Ensalada cesar',
      'Solomillo',
      'Coca Cola',
    ]) {
      expect(byName[name]?.mode, name).not.toBe('skipped');
      expect(productCostingStatus(byName[name].item), name).not.toBe('none');
      expect(Number(byName[name].item.costPrice) || 0, name).toBeGreaterThan(0);
    }

    expect(readProductRecipeLines(byName['Patatas bravas'].item).length).toBeGreaterThanOrEqual(2);
  });

  it('crea ingredientes base de bar también con marca mixed_restaurant', () => {
    const brands = [{ _id: 'b1', deliveryLineKind: 'mixed_restaurant' }];
    const { items, added } = ensureVertialEscandalloBaseStoreIngredients([], brands);
    expect(added).toBeGreaterThan(5);
    expect(items.some((i) => /patata/i.test(i.name))).toBe(true);
    expect(items.some((i) => /pan barra/i.test(i.name))).toBe(true);
  });

  it('marca sin lineKind: Ensaladas/Carnes quedan con coste aprox guardado', () => {
    const brands = [{ _id: 'b1', name: 'Mi Bar' }];
    const { items: store } = ensureVertialEscandalloBaseStoreIngredients([], brands);

    const items = [
      {
        _id: '2',
        name: 'Ensalada cesar',
        category: 'Ensaladas',
        brandIds: ['b1'],
        unitPrice: 8,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '3',
        name: 'Solomillo',
        category: 'Carnes',
        brandIds: ['b1'],
        unitPrice: 18,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
      {
        _id: '4',
        name: 'Agua 50cl',
        category: 'Bebidas',
        brandIds: ['b1'],
        unitPrice: 1.5,
        costPrice: 0,
        customFields: {},
        module: 'catalog',
        itemType: 'product',
      },
    ];

    expect(inferImportCostingLineKind(items[0], brands)).toBe('prepared_meals');
    expect(inferImportCostingLineKind(items[1], brands)).toBe('prepared_meals');

    const results = applyVertialAutoCostingBatch(items, items, store, brands);
    const byName = Object.fromEntries(results.map((r) => [r.item.name, r]));

    for (const name of ['Ensalada cesar', 'Solomillo', 'Agua 50cl']) {
      expect(productCostingStatus(byName[name].item), name).not.toBe('none');
      expect(Number(byName[name].item.costPrice) || 0, name).toBeGreaterThan(0);
    }
  });
});
