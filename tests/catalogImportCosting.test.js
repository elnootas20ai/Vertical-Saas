import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVertialAutoCostingBatch,
  applyVertialAutoCostingToCatalogItem,
  findStoreIngredientForCosting,
  inferImportCostingLineKind,
  isHalfHalfCatalogProduct,
} from '../src/app/lib/catalogImportCosting.ts';
import { explicitProductCostingStatus } from '../src/app/lib/catalogCategoryCosting.ts';
import { productCostingStatus, readProductRecipeLines } from '../src/app/lib/catalogCosting.ts';

const brands = [
  { _id: 'brand-pizza', deliveryLineKind: 'pizza' },
  { _id: 'brand-burger', deliveryLineKind: 'burger_fastfood' },
];

const storeIngredients = [
  { id: 'ing-masa', name: 'Masa', brandIds: ['brand-pizza'], baseCost: 1.8 },
  { id: 'ing-moz', name: 'Mozzarella', brandIds: ['brand-pizza'], baseCost: 5.5 },
  { id: 'ing-bacon', name: 'Bacon', brandIds: ['brand-pizza', 'brand-burger'], baseCost: 12 },
  { id: 'ing-pan', name: 'Pan brioche', brandIds: ['brand-burger'], baseCost: 0.45 },
  { id: 'ing-carne', name: 'Carne burger', brandIds: ['brand-burger'], baseCost: 8.5 },
];

test('findStoreIngredientForCosting matches by name within brand', () => {
  const hit = findStoreIngredientForCosting('mozzarella', storeIngredients, ['brand-pizza']);
  assert.equal(hit?.id, 'ing-moz');
});

test('findStoreIngredientForCosting picks best match when duplicate names across brands', () => {
  const multiBrand = [
    ...storeIngredients,
    { id: 'ing-moz-burger', name: 'Mozzarella', brandIds: ['brand-burger'], baseCost: 5.8 },
  ];
  const hit = findStoreIngredientForCosting('Mozzarella', multiBrand, ['brand-pizza']);
  assert.equal(hit?.id, 'ing-moz');
});

test('inferImportCostingLineKind uses brand deliveryLineKind', () => {
  assert.equal(
    inferImportCostingLineKind({ category: 'Premium', brandIds: ['brand-pizza'], name: 'BBQ' }, brands),
    'pizza',
  );
});

test('applyVertialAutoCostingToCatalogItem builds recipe for pizza with ingredients', () => {
  const item = {
    _id: 'p1',
    name: 'Margarita',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 10,
    costPrice: 0,
    customFields: { ingredients: 'Tomate, Mozzarella, Albahaca' },
  };
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands);
  assert.equal(mode, 'recipe');
  assert.equal(productCostingStatus(next), 'recipe');
  assert.ok(next.costPrice > 0);
});

test('applyVertialAutoCostingToCatalogItem fixed cost for drinks', () => {
  const item = {
    _id: 'b1',
    name: 'Coca-Cola 33cl',
    category: 'Bebidas',
    brandIds: [],
    unitPrice: 2.5,
    costPrice: 0,
    customFields: {},
  };
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands);
  assert.equal(mode, 'fixed');
  assert.equal(next.costPrice, 0.65);
});

test('applyVertialAutoCostingToCatalogItem builds recipe for pizza without ingredients column', () => {
  const item = {
    _id: 'p3',
    name: 'Barbacoa',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 11,
    costPrice: 3.2,
    customFields: { costingType: 'fixed' },
  };
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands, {
    upgradeAutoFixedFood: true,
  });
  assert.equal(mode, 'recipe');
  assert.equal(productCostingStatus(next), 'recipe');
  assert.ok(readProductRecipeLines(next).length >= 2);
});

test('applyVertialAutoCostingToCatalogItem builds recipe for pizza with no customFields', () => {
  const item = {
    _id: 'p4',
    name: 'Cuatro quesos',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 12,
    costPrice: 0,
    customFields: {},
  };
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands);
  assert.equal(mode, 'recipe');
  assert.ok(next.costPrice > 0);
});

test('applyVertialAutoCostingToCatalogItem skips already configured', () => {
  const item = {
    _id: 'p2',
    name: 'Custom',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 12,
    costPrice: 4,
    customFields: { costingType: 'fixed' },
  };
  const { mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands);
  assert.equal(mode, 'skipped');
  assert.equal(explicitProductCostingStatus(item), 'fixed');
});

test('half-half costs like one pizza', () => {
  const pizza = {
    _id: 'p1',
    name: 'Margarita',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 10,
    costPrice: 0,
    customFields: { ingredients: 'Tomate, Mozzarella' },
  };
  const halfHalf = {
    _id: 'hh1',
    name: 'Mitad y mitad',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 11,
    costPrice: 0,
    customFields: { halfHalf: true },
  };
  const catalog = [pizza, halfHalf];
  const results = applyVertialAutoCostingBatch([pizza, halfHalf], catalog, storeIngredients, brands);
  const pizzaResult = results.find((r) => r.item._id === 'p1');
  const hhResult = results.find((r) => r.item._id === 'hh1');
  assert.ok(pizzaResult && pizzaResult.item.costPrice > 0);
  assert.ok(hhResult && hhResult.item.costPrice > 0);
  assert.equal(isHalfHalfCatalogProduct(halfHalf), true);
});

test('combo sums pizza + drink + dessert from structure', () => {
  const pizza = {
    _id: 'p1',
    name: 'Margarita',
    category: 'Pizzas',
    brandIds: ['brand-pizza'],
    unitPrice: 10,
    costPrice: 0,
    customFields: { ingredients: 'Tomate, Mozzarella' },
  };
  const drink = {
    _id: 'b1',
    name: 'Coca-Cola 33cl',
    category: 'Bebidas',
    brandIds: [],
    unitPrice: 2.5,
    costPrice: 0,
    customFields: {},
  };
  const dessert = {
    _id: 'd1',
    name: 'Tiramisú',
    category: 'Postres',
    brandIds: [],
    unitPrice: 4.5,
    costPrice: 0,
    customFields: {},
  };
  const combo = {
    _id: 'c1',
    name: 'Individual',
    category: 'Combos',
    itemType: 'combo',
    brandIds: ['brand-pizza'],
    unitPrice: 15,
    costPrice: 0,
    customFields: {
      comboStructure: [
        { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
        { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
        { slotKind: 'dessert', label: 'Postre', required: true, expectedCount: 1 },
      ],
      comboStructureConfirmed: true,
    },
  };

  const catalog = [pizza, drink, dessert, combo];
  const results = applyVertialAutoCostingBatch([pizza, drink, dessert, combo], catalog, storeIngredients, brands);
  const comboResult = results.find((r) => r.item._id === 'c1');
  assert.ok(comboResult);
  assert.equal(comboResult.mode, 'fixed');
  assert.ok(comboResult.item.costPrice > 0);

  const pizzaCost = results.find((r) => r.item._id === 'p1')?.item.costPrice ?? 0;
  const drinkCost = results.find((r) => r.item._id === 'b1')?.item.costPrice ?? 0;
  const dessertCost = results.find((r) => r.item._id === 'd1')?.item.costPrice ?? 0;
  const expected = Math.round((pizzaCost + drinkCost + dessertCost) * 100) / 100;
  assert.equal(comboResult.item.costPrice, expected);
  assert.ok(comboResult.item.costPrice > 0.65 + 1.2);
});
