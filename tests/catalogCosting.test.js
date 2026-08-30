import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMermaToCost,
  calculateRecipeTotalCost,
  foodRecipeLines,
  normalizeProductRecipeLines,
  productCostingStatus,
  readProductMermaPct,
  resolveIngredientUnitCost,
  resolveProductUnitCost,
  resolveStoreIngredientBaseCost,
  formatEscandalloFoodCost,
  formatEscandalloMargin,
  escandalloMarginTone,
  stockItemsByStoreIngredientId,
  storeIngredientsById,
  withProductCosting,
} from '../src/app/lib/catalogCosting.ts';

test('resolveStoreIngredientBaseCost uses stored or Vertial fallback', () => {
  assert.equal(resolveStoreIngredientBaseCost({ name: 'desconocido xyz' }), 5);
  assert.equal(resolveStoreIngredientBaseCost({ name: 'Mozzarella', baseCost: 2 }), 2);
  assert.equal(resolveStoreIngredientBaseCost({ name: 'Mozzarella', baseCost: -1 }), 5.5);
});

test('calculateRecipeTotalCost sums quantity × base cost', () => {
  const ingredients = storeIngredientsById([
    { id: 'a', name: 'Mozzarella', baseCost: 2 },
    { id: 'b', name: 'Bacon', baseCost: 5 },
  ]);
  const total = calculateRecipeTotalCost(
    [
      { storeIngredientId: 'a', name: 'Mozzarella', quantity: 0.2, unit: 'kg' },
      { storeIngredientId: 'b', name: 'Bacon', quantity: 2, unit: 'ud' },
    ],
    ingredients,
  );
  assert.equal(total, 10.4);
});

test('merma scales recipe total cost', () => {
  const ingredients = storeIngredientsById([{ id: 'a', name: 'Masa', baseCost: 2 }]);
  const lines = [{ storeIngredientId: 'a', name: 'Masa', quantity: 1, unit: 'ud' }];
  assert.equal(calculateRecipeTotalCost(lines, ingredients), 2);
  assert.equal(calculateRecipeTotalCost(lines, ingredients, undefined, undefined, { mermaPct: 10 }), 2.2);
  assert.equal(applyMermaToCost(10, 10), 11);
});

test('resolveIngredientUnitCost prefers last purchase over ficha', () => {
  const ing = { id: 'a', name: 'Mozzarella', baseCost: 5 };
  const purchase = resolveIngredientUnitCost(ing, { lastPurchasePrice: 7.2, costPrice: 5 });
  assert.equal(purchase.source, 'purchase');
  assert.equal(purchase.effective, 7.2);
  assert.equal(purchase.fromFicha, 5);

  const ficha = resolveIngredientUnitCost(ing, { costPrice: 5 });
  assert.equal(ficha.source, 'ficha');
  assert.equal(ficha.effective, 5);
});

test('calculateRecipeTotalCost uses purchase from stock map', () => {
  const ingredients = storeIngredientsById([{ id: 'a', name: 'Mozzarella', baseCost: 5 }]);
  const stockByStoreIngredientId = stockItemsByStoreIngredientId([
    {
      _id: 'stock-a',
      name: 'Mozzarella',
      module: 'stock',
      costPrice: 5,
      lastPurchasePrice: 8,
      customFields: { storeIngredientId: 'a' },
    },
  ]);
  const total = calculateRecipeTotalCost(
    [{ storeIngredientId: 'a', name: 'Mozzarella', quantity: 0.5, unit: 'kg' }],
    ingredients,
    undefined,
    undefined,
    { stockByStoreIngredientId },
  );
  assert.equal(total, 4);
});

test('foodRecipeLines excludes packaging', () => {
  const lines = [
    { storeIngredientId: 'a', name: 'Mozzarella', quantity: 1, unit: 'kg', stockCategory: 'ingredient' },
    { storeIngredientId: 'b', name: 'Caja', quantity: 1, unit: 'ud', stockCategory: 'packaging' },
  ];
  const food = foodRecipeLines(lines);
  assert.equal(food.length, 1);
  assert.equal(food[0].name, 'Mozzarella');
});

test('withProductCosting recipe keeps previous packaging when patch is food-only', () => {
  const item = {
    _id: 'p1',
    costPrice: 0,
    customFields: {
      costingType: 'recipe',
      costingRecipe: [
        { storeIngredientId: 'ing-1', name: 'Masa', quantity: 1, unit: 'ud' },
        {
          catalogItemId: 'cat-box',
          name: 'Caja pizza',
          quantity: 1,
          unit: 'ud',
          stockCategory: 'packaging',
        },
      ],
    },
  };
  const byId = storeIngredientsById([{ id: 'ing-1', name: 'Masa', baseCost: 2 }]);
  const next = withProductCosting(
    item,
    {
      costingType: 'recipe',
      recipeLines: [{ storeIngredientId: 'ing-1', name: 'Masa', quantity: 2, unit: 'ud' }],
    },
    byId,
  );
  const recipe = next.customFields.costingRecipe;
  assert.equal(recipe.length, 2);
  assert.equal(recipe[0].quantity, 2);
  assert.equal(recipe[1].stockCategory, 'packaging');
  assert.equal(recipe[1].catalogItemId, 'cat-box');
  assert.equal(next.costPrice, 4);
});

test('withProductCosting fixed keeps packaging lines for stock deduct', () => {
  const item = {
    _id: 'p1',
    costPrice: 3,
    customFields: {
      costingType: 'recipe',
      costingRecipe: [
        { storeIngredientId: 'ing-1', name: 'Masa', quantity: 1, unit: 'ud' },
        {
          catalogItemId: 'cat-box',
          name: 'Caja',
          quantity: 1,
          unit: 'ud',
          stockCategory: 'packaging',
        },
      ],
    },
  };
  const next = withProductCosting(item, { costingType: 'fixed', fixedCost: 1.25 }, new Map());
  assert.equal(next.customFields.costingType, 'fixed');
  assert.equal(next.costPrice, 1.25);
  assert.equal(next.customFields.costingRecipe.length, 1);
  assert.equal(next.customFields.costingRecipe[0].stockCategory, 'packaging');
});

test('withProductCosting fixed updates costPrice', () => {
  const item = {
    _id: 'p1',
    costPrice: 0,
    customFields: {},
  };
  const next = withProductCosting(
    item,
    { costingType: 'fixed', fixedCost: 1.25 },
    new Map(),
  );
  assert.equal(next.customFields.costingType, 'fixed');
  assert.equal(next.costPrice, 1.25);
  assert.equal(next.customFields.costingRecipe, undefined);
});

test('withProductCosting recipe calculates costPrice with merma', () => {
  const item = { _id: 'p1', costPrice: 0, customFields: {} };
  const byId = storeIngredientsById([{ id: 'ing-1', name: 'Masa', baseCost: 0.5 }]);
  const next = withProductCosting(
    item,
    {
      costingType: 'recipe',
      recipeLines: [{ storeIngredientId: 'ing-1', name: 'Masa', quantity: 3, unit: 'ud' }],
      mermaPct: 10,
    },
    byId,
  );
  assert.equal(next.costPrice, 1.65);
  assert.equal(readProductMermaPct(next), 10);
  assert.equal(productCostingStatus(next), 'recipe');
});

test('resolveProductUnitCost applies merma and does not cap at 42% of PVP', () => {
  const byId = storeIngredientsById([{ id: 'ing-1', name: 'Masa', baseCost: 8 }]);
  const item = {
    _id: 'p1',
    unitPrice: 10,
    costPrice: 0,
    customFields: {
      costingType: 'recipe',
      mermaPct: 10,
      costingRecipe: [{ storeIngredientId: 'ing-1', name: 'Masa', quantity: 1, unit: 'ud' }],
    },
  };
  // 8 € + 10% merma = 8.8 € (antes un tope falso lo bajaba a 4.2 €)
  assert.equal(resolveProductUnitCost(item, byId), 8.8);
});

test('resolveStoreIngredientBaseCost ignores TPV extra price for escandallo', () => {
  assert.equal(
    resolveStoreIngredientBaseCost({ name: 'Mozzarella', baseCost: 2.5, role: 'extra' }),
    5.5,
  );
});

test('formatEscandalloMargin and food cost helpers', () => {
  assert.equal(formatEscandalloMargin(2, 10), '80.0%');
  assert.equal(formatEscandalloMargin(12, 10), '-20.0%');
  assert.equal(formatEscandalloFoodCost(4.5, 10), '45.0%');
  assert.equal(escandalloMarginTone(12, 10), 'negative');
});

test('normalizeProductRecipeLines skips invalid rows', () => {
  assert.deepEqual(
    normalizeProductRecipeLines([
      { storeIngredientId: 'x', name: 'Ok', quantity: 1, unit: 'kg' },
      { storeIngredientId: '', name: 'Bad', quantity: 1 },
      { storeIngredientId: 'y', name: 'Zero', quantity: 0 },
    ]),
    [{ storeIngredientId: 'x', name: 'Ok', quantity: 1, unit: 'kg' }],
  );
});
