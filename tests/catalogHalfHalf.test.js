import { describe, expect, it } from 'vitest';
import {
  catalogPizzasForHalfHalf,
  customizationSignature,
  isTpvBuildYourOwnCatalogItem,
  isTpvHalfHalfCatalogItem,
} from '../src/app/lib/catalogCustomization.js';

describe('isTpvHalfHalfCatalogItem', () => {
  it('detects flag in customFields', () => {
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'product',
        name: 'Especial',
        category: 'Pizzas',
        customFields: { halfHalf: true },
      }),
    ).toBe(true);
  });

  it('detects by name', () => {
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'product',
        name: 'Pizza Mitad y mitad',
        category: 'Pizzas',
        customFields: {},
      }),
    ).toBe(true);
  });

  it('ignores combos', () => {
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'combo',
        name: 'Mitad y mitad',
        category: 'Combos',
        customFields: {},
      }),
    ).toBe(false);
  });
});

describe('isTpvBuildYourOwnCatalogItem', () => {
  it('detects flag in customFields', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Especial',
        category: 'Pizzas',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(true);
  });

  it('detects by name', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Pizza al gusto',
        category: 'Pizzas',
        customFields: {},
      }),
    ).toBe(true);
  });

  it('does not overlap with half-half', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Pizzas',
        customFields: { halfHalf: true },
      }),
    ).toBe(false);
  });
});

describe('catalogPizzasForHalfHalf', () => {
  const catalog = [
    { _id: 'hh', name: 'Mitad y mitad', category: 'Pizzas', itemType: 'product', active: true, customFields: { halfHalf: true } },
    { _id: 'p1', name: 'Margarita', category: 'Pizzas', itemType: 'product', active: true, customFields: {} },
    { _id: 'p2', name: 'Barbacoa', category: 'Pizzas', itemType: 'product', active: true, customFields: {} },
    { _id: 'c1', name: 'Menú 1', category: 'Combos', itemType: 'combo', active: true, customFields: {} },
    { _id: 'b1', name: 'Coca-Cola', category: 'Bebidas', itemType: 'product', active: true, customFields: {} },
  ];

  it('lists pizzas excluding half-half product and combos', () => {
    const list = catalogPizzasForHalfHalf(catalog, 'hh');
    expect(list.map((p) => p._id)).toEqual(['p2', 'p1']);
  });
});

describe('isTpvComboCatalogItem half-half', () => {
  it('does not treat half-half product as combo', async () => {
    const { isTpvComboCatalogItem } = await import('../src/app/lib/catalogComboSlots.js');
    expect(
      isTpvComboCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Pizzas',
        comboItems: [],
        customFields: { halfHalf: true },
      }),
    ).toBe(false);
  });
});

describe('customizationSignature half-half', () => {
  it('includes both pizza ids', () => {
    const a = customizationSignature({
      removedIngredients: [],
      addedSupplements: [],
      notes: '',
      halfHalfPizza: {
        firstProductId: 'p1',
        firstProductName: 'A',
        secondProductId: 'p2',
        secondProductName: 'B',
      },
    });
    const b = customizationSignature({
      removedIngredients: [],
      addedSupplements: [],
      notes: '',
      halfHalfPizza: {
        firstProductId: 'p1',
        firstProductName: 'A',
        secondProductId: 'p2',
        secondProductName: 'B',
      },
    });
    expect(a).toBe(b);
    expect(a).toContain('p1|p2');
  });
});
