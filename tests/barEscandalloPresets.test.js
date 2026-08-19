import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBarEscandalloFixedCost,
  resolveBarEscandalloDefaultIngredients,
  isBarBocataCategory,
  matchBarCategoryPreset,
  resolveBocataIngredientQuantity,
} from '../src/app/lib/barEscandalloPresets.ts';
import { applyVertialAutoCostingToCatalogItem } from '../src/app/lib/catalogImportCosting.ts';
import { productCostingStatus, readProductRecipeLines } from '../src/app/lib/catalogCosting.ts';
import { isCatalogResaleStockProduct } from '../src/app/lib/vertialStockDefaults.ts';

test('resolveBarEscandalloFixedCost by category', () => {
  assert.equal(resolveBarEscandalloFixedCost('Complementos', 'Patatas fritas'), 1.15);
  assert.equal(resolveBarEscandalloFixedCost('Tapas', 'Tapa genérica'), 2.2);
  assert.equal(resolveBarEscandalloFixedCost('Tapas', 'Croquetas'), 1.8);
  assert.equal(resolveBarEscandalloFixedCost('Bocadillos', 'Genérico'), 2.4);
});

test('resolveBarEscandalloFixedCost by product name', () => {
  assert.equal(resolveBarEscandalloFixedCost('Bebidas', 'Caña'), 0.35);
  assert.equal(resolveBarEscandalloFixedCost('Bebidas', 'Jarra cerveza'), 1.05);
  assert.equal(resolveBarEscandalloFixedCost('Tapas', 'Patatas bravas'), 1.8);
});

test('resolveBarEscandalloDefaultIngredients for bocadillo', () => {
  const ings = resolveBarEscandalloDefaultIngredients('Bocadillos', 'Bocadillo mixto');
  assert.ok(ings.some((i) => /pan/i.test(i)));
  assert.ok(ings.some((i) => /jamón|jamon/i.test(i)));
});

test('isBarBocataCategory detects bocadillos', () => {
  assert.equal(isBarBocataCategory('Bocadillos'), true);
  assert.equal(isBarBocataCategory('Tapas'), false);
});

test('resolveBocataIngredientQuantity includes pan and tortilla', () => {
  assert.deepEqual(resolveBocataIngredientQuantity('Pan'), { quantity: 1, unit: 'ud' });
  assert.deepEqual(resolveBocataIngredientQuantity('tortilla de patatas'), {
    quantity: 0.12,
    unit: 'kg',
  });
});

test('isCatalogResaleStockProduct excludes bocadillos', () => {
  assert.equal(
    isCatalogResaleStockProduct({ name: 'Bocadillo de tortilla', category: 'Bocadillos' }),
    false,
  );
  assert.equal(
    isCatalogResaleStockProduct({
      name: 'Bocadillo de tortilla',
      category: 'Carta',
      stockCategory: 'finished_product',
    }),
    false,
  );
});

test('matchBarCategoryPreset covers bebidas and complementos', () => {
  assert.ok(matchBarCategoryPreset('Bebidas'));
  assert.ok(matchBarCategoryPreset('Complementos'));
});

test('applyVertialAutoCosting assigns fixed cost to caña', () => {
  const item = {
    _id: 'b1',
    name: 'Caña',
    category: 'Bebidas',
    brandIds: ['brand-bar'],
    unitPrice: 1.8,
    costPrice: 0,
    customFields: {},
  };
  const brands = [{ _id: 'brand-bar', deliveryLineKind: 'tapas_bar' }];
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, [], brands);
  assert.equal(mode, 'fixed');
  assert.equal(next.costPrice, 0.35);
});

test('applyVertialAutoCosting builds recipe for bocadillo without ingredients', () => {
  const brands = [{ _id: 'brand-bar', deliveryLineKind: 'tapas_bar' }];
  const storeIngredients = [
    { id: 'ing-pan', name: 'Pan barra', brandIds: ['brand-bar'], baseCost: 0.35 },
    { id: 'ing-jam', name: 'Jamón serrano', brandIds: ['brand-bar'], baseCost: 28 },
    { id: 'ing-tom', name: 'Tomate', brandIds: ['brand-bar'], baseCost: 2.5 },
    { id: 'ing-aceite', name: 'Aceite de oliva', brandIds: ['brand-bar'], baseCost: 8 },
  ];
  const item = {
    _id: 'boc1',
    name: 'Bocadillo mixto',
    category: 'Bocadillos',
    brandIds: ['brand-bar'],
    unitPrice: 5.5,
    costPrice: 0,
    customFields: {},
  };
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands);
  assert.equal(mode, 'recipe');
  assert.equal(productCostingStatus(next), 'recipe');
  assert.ok(next.costPrice > 0);
});

test('applyVertialAutoCosting uses ingredient quantities, not warehouse clone, for bocadillo', () => {
  const brands = [{ _id: 'brand-bar', deliveryLineKind: 'tapas_bar' }];
  const storeIngredients = [
    { id: 'ing-pan', name: 'Pan', brandIds: ['brand-bar'], baseCost: 0.35 },
    { id: 'ing-tortilla', name: 'Tortilla de patatas', brandIds: ['brand-bar'], baseCost: 4.5 },
  ];
  const item = {
    _id: 'boc-tortilla',
    name: 'Bocadillo de tortilla',
    category: 'Bocadillos',
    brandIds: ['brand-bar'],
    unitPrice: 5.5,
    costPrice: 0,
    customFields: { ingredients: 'Pan, tortilla de patatas' },
  };
  const inventoryClone = {
    _id: 'stock-boc-tortilla',
    name: 'Bocadillo de tortilla',
    module: 'stock',
    stockCategory: 'finished_product',
    unit: 'ud',
    costPrice: 0.18,
    customFields: { linkedCatalogItemId: 'boc-tortilla' },
  };
  const { item: next, mode } = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands, {
    overwrite: true,
    inventoryItems: [inventoryClone],
  });
  assert.equal(mode, 'recipe');
  const lines = readProductRecipeLines(next);
  assert.equal(lines.some((l) => l.catalogItemId === 'stock-boc-tortilla'), false);
  const pan = lines.find((l) => /pan/i.test(l.name));
  const tortilla = lines.find((l) => /tortilla/i.test(l.name));
  assert.ok(pan);
  assert.ok(tortilla);
  assert.equal(pan.quantity, 1);
  assert.equal(pan.unit, 'ud');
  assert.equal(tortilla.quantity, 0.12);
  assert.equal(tortilla.unit, 'kg');
});
