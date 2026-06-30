import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRecipeTotalCost,
  normalizeProductRecipeLines,
  productCostingStatus,
  resolveStoreIngredientBaseCost,
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

test('withProductCosting recipe calculates costPrice', () => {
  const item = { _id: 'p1', costPrice: 0, customFields: {} };
  const byId = storeIngredientsById([{ id: 'ing-1', name: 'Masa', baseCost: 0.5 }]);
  const next = withProductCosting(
    item,
    {
      costingType: 'recipe',
      recipeLines: [{ storeIngredientId: 'ing-1', name: 'Masa', quantity: 3, unit: 'ud' }],
    },
    byId,
  );
  assert.equal(next.costPrice, 1.5);
  assert.equal(productCostingStatus(next), 'recipe');
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
