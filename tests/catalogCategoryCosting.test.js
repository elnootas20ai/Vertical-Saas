import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryCostingSummaries,
  detectCategoryCostingKind,
  filterProductsForBulkApply,
  suggestCategoryFixedCost,
} from '../src/app/lib/catalogCategoryCosting.ts';
import { applyFixedCostToProduct } from '../src/app/lib/catalogCategoryCosting.ts';

const drinkA = {
  _id: 'a',
  name: 'Coca Cola 33cl',
  category: 'Bebidas',
  module: 'catalog',
  itemType: 'product',
  customFields: {},
  costPrice: 0,
  unitPrice: 2.5,
};

const drinkB = {
  _id: 'b',
  name: 'Agua 50cl',
  category: 'Bebidas',
  module: 'catalog',
  itemType: 'product',
  customFields: {},
  costPrice: 0,
  unitPrice: 1.5,
};

const pizza = {
  _id: 'c',
  name: 'Margarita',
  category: 'Pizzas',
  module: 'catalog',
  itemType: 'product',
  customFields: {},
  costPrice: 0,
  unitPrice: 9,
};

test('detectCategoryCostingKind identifies drinks', () => {
  assert.equal(detectCategoryCostingKind([drinkA, drinkB]), 'drinks');
  assert.equal(detectCategoryCostingKind([pizza]), 'food');
});

test('suggestCategoryFixedCost median for drinks', () => {
  const suggested = suggestCategoryFixedCost([drinkA, drinkB]);
  assert.ok(suggested != null);
  assert.equal(suggested, 0.44);
});

test('buildCategoryCostingSummaries groups by category', () => {
  const summaries = buildCategoryCostingSummaries([drinkA, drinkB, pizza]);
  assert.equal(summaries.length, 2);
  const drinks = summaries.find((s) => s.category === 'Bebidas');
  assert.equal(drinks?.total, 2);
  assert.equal(drinks?.unconfigured, 2);
  assert.equal(drinks?.kind, 'drinks');
});

test('filterProductsForBulkApply respects mode', () => {
  const configured = {
    ...drinkA,
    customFields: { costingType: 'fixed' },
    costPrice: 0.6,
  };
  const unconfigured = [drinkB];
  const all = [configured, drinkB];
  assert.equal(filterProductsForBulkApply(all, 'unconfigured').length, 1);
  assert.equal(filterProductsForBulkApply(all, 'fixed_only').length, 2);
  assert.equal(filterProductsForBulkApply(all, 'all').length, 2);
  assert.equal(filterProductsForBulkApply(unconfigured, 'unconfigured').length, 1);
});

test('applyFixedCostToProduct sets fixed costing', () => {
  const next = applyFixedCostToProduct(drinkB, 0.22);
  assert.equal(next.customFields.costingType, 'fixed');
  assert.equal(next.costPrice, 0.22);
});
