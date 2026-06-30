import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVertialDefaultsToStoreIngredients,
  resolveVertialDefaultBaseCost,
  resolveVertialDefaultDrinkCost,
  resolveVertialDefaultRetailCost,
} from '../src/app/lib/vertialDefaultCosts.ts';

test('resolveVertialDefaultDrinkCost matches cola', () => {
  assert.equal(resolveVertialDefaultDrinkCost({ name: 'Coca Cola 33cl', category: 'Bebidas' }), 0.65);
});

test('resolveVertialDefaultBaseCost uses pizza line', () => {
  assert.equal(resolveVertialDefaultBaseCost('Mozzarella', 'pizza'), 5.5);
  assert.equal(resolveVertialDefaultBaseCost('Masa pizza', 'pizza'), 1.8);
});

test('resolveVertialDefaultBaseCost uses burger line', () => {
  assert.equal(resolveVertialDefaultBaseCost('Pan brioche', 'burger_fastfood'), 0.45);
  assert.equal(resolveVertialDefaultBaseCost('Carne vacuno', 'burger_fastfood'), 8.5);
});

test('applyVertialDefaultsToStoreIngredients fills missing baseCost', () => {
  const brands = [{ _id: 'b1', deliveryLineKind: 'pizza' }];
  const { items, appliedCount } = applyVertialDefaultsToStoreIngredients(
    [{ id: 'i1', name: 'Mozzarella', brandIds: ['b1'] }],
    brands,
  );
  assert.equal(appliedCount, 1);
  assert.equal(items[0].baseCost, 5.5);
});

test('resolveVertialDefaultRetailCost for dessert', () => {
  assert.equal(
    resolveVertialDefaultRetailCost({ name: 'Tarta de queso', category: 'Postres' }),
    1.2,
  );
});
