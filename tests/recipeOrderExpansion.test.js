import { describe, expect, it } from 'vitest';
import {
  expandOrderLineForRecipeDeduction,
  expandOrderItemsForRecipeDeduction,
  isPizzaBaseIngredientName,
  mergeHalfHalfIngredientQuantities,
} from '../services/recipeOrderExpansion.js';

describe('recipeOrderExpansion', () => {
  it('expande combo con comboSelections del pedido', () => {
    const catalogById = new Map([
      ['menu-2x2', { _id: 'menu-2x2', category: 'Combos', itemType: 'combo' }],
      ['pizza-m', { _id: 'pizza-m', name: 'Margarita' }],
      ['cola', { _id: 'cola', name: 'Cola' }],
    ]);
    const expanded = expandOrderLineForRecipeDeduction(
      {
        catalogItemId: 'menu-2x2',
        quantity: 2,
        comboSelections: [
          { productId: 'pizza-m', productName: 'Margarita', quantity: 1 },
          { productId: 'cola', productName: 'Cola', quantity: 1 },
        ],
      },
      catalogById,
    );
    expect(expanded).toEqual([
      { catalogItemId: 'pizza-m', quantity: 2, parentCatalogItemId: 'menu-2x2' },
      { catalogItemId: 'cola', quantity: 2, parentCatalogItemId: 'menu-2x2' },
    ]);
  });

  it('expande combo desde comboItems del catálogo si no hay selección en pedido', () => {
    const catalogById = new Map([
      [
        'menu-fam',
        {
          _id: 'menu-fam',
          category: 'Menus',
          comboItems: [
            { productId: 'p1', quantity: 2 },
            { productId: 'beb', quantity: 2 },
          ],
        },
      ],
    ]);
    const expanded = expandOrderLineForRecipeDeduction(
      { catalogItemId: 'menu-fam', quantity: 1 },
      catalogById,
    );
    expect(expanded).toHaveLength(2);
    expect(expanded[0]).toMatchObject({ catalogItemId: 'p1', quantity: 2 });
    expect(expanded[1]).toMatchObject({ catalogItemId: 'beb', quantity: 2 });
  });

  it('mitad y mitad conserva selección en la línea', () => {
    const expanded = expandOrderLineForRecipeDeduction(
      {
        catalogItemId: 'hh-pizza',
        quantity: 1,
        halfHalfPizza: {
          firstProductId: 'p1',
          firstProductName: 'Margarita',
          secondProductId: 'p2',
          secondProductName: 'Prosciutto',
        },
      },
      new Map(),
    );
    expect(expanded).toHaveLength(1);
    expect(expanded[0].halfHalf).toMatchObject({
      firstProductId: 'p1',
      secondProductId: 'p2',
    });
  });

  it('mezcla mitad y mitad: base entera + toppings al 50 %', () => {
    expect(isPizzaBaseIngredientName('Masa pizza')).toBe(true);
    expect(isPizzaBaseIngredientName('Mozzarella')).toBe(false);

    const merged = mergeHalfHalfIngredientQuantities({
      baseRecipe: {
        portions: 1,
        ingredients: [
          { catalogItemId: 'masa', catalogItemName: 'Masa', quantity: 0.25 },
        ],
      },
      firstRecipe: {
        portions: 1,
        ingredients: [
          { catalogItemId: 'moz', catalogItemName: 'Mozzarella', quantity: 0.12 },
          { catalogItemId: 'jam', catalogItemName: 'Jamón', quantity: 0.05 },
        ],
      },
      secondRecipe: {
        portions: 1,
        ingredients: [
          { catalogItemId: 'moz', catalogItemName: 'Mozzarella', quantity: 0.12 },
          { catalogItemId: 'pep', catalogItemName: 'Pepperoni', quantity: 0.06 },
        ],
      },
      quantitySold: 2,
    });

    expect(merged.get('masa')?.quantity).toBe(0.5);
    expect(merged.get('moz')?.quantity).toBe(0.24);
    expect(merged.get('jam')?.quantity).toBe(0.05);
    expect(merged.get('pep')?.quantity).toBe(0.06);
  });

  it('expandOrderItemsForRecipeDeduction procesa varias líneas', () => {
    const catalogById = new Map();
    const out = expandOrderItemsForRecipeDeduction(
      [
        { catalogItemId: 'prod-a', quantity: 1 },
        { catalogItemId: 'prod-b', quantity: 3 },
      ],
      catalogById,
    );
    expect(out).toHaveLength(2);
    expect(out[1].quantity).toBe(3);
  });
});
