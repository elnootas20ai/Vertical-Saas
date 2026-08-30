import { describe, expect, it } from 'vitest';
import {
  buildRecipeIngredientsFromCostingItem,
} from '../services/recipeCostingFallback.js';

describe('recipeCostingFallback', () => {
  it('resuelve ingredientes de escandallo del catálogo a ids de stock', () => {
    const inventory = [
      {
        _id: 'stock-moz',
        name: 'Mozzarella',
        module: 'stock',
        costPrice: 5.5,
        stockCategory: 'ingredient',
        customFields: { storeIngredientId: 'ing-moz' },
      },
      {
        _id: 'stock-box',
        name: 'Caja pizza M',
        module: 'stock',
        costPrice: 0.32,
        stockCategory: 'packaging',
        customFields: { vertialStockTemplateId: 'box-pizza-m' },
      },
    ];
    const catalogItem = {
      _id: 'prod-marg',
      name: 'Margarita',
      module: 'catalog',
      customFields: {
        costingType: 'recipe',
        costingRecipe: [
          { storeIngredientId: 'ing-moz', name: 'Mozzarella', quantity: 0.15, unit: 'kg' },
          {
            catalogItemId: 'stock-box',
            name: 'Caja pizza M',
            quantity: 1,
            unit: 'ud',
            stockCategory: 'packaging',
          },
        ],
      },
    };

    const ingredients = buildRecipeIngredientsFromCostingItem(catalogItem, inventory);
    expect(ingredients).toHaveLength(2);
    expect(ingredients[0]?.catalogItemId).toBe('stock-moz');
    expect(ingredients[1]?.catalogItemId).toBe('stock-box');
    expect(ingredients[1]?.optional).toBe(true);
    expect(ingredients[0]?.wastePercent).toBe(0);
  });

  it('usa mermaPct del producto como wastePercent', () => {
    const ingredients = buildRecipeIngredientsFromCostingItem(
      {
        _id: 'prod',
        customFields: {
          costingType: 'recipe',
          mermaPct: 8,
          costingRecipe: [
            { storeIngredientId: 'ing-moz', name: 'Mozzarella', quantity: 0.1, unit: 'kg' },
          ],
        },
      },
      [
        {
          _id: 'stock-moz',
          name: 'Mozzarella',
          module: 'stock',
          costPrice: 5,
          customFields: { storeIngredientId: 'ing-moz' },
        },
      ],
    );
    expect(ingredients[0]?.wastePercent).toBe(8);
  });

  it('devuelve vacío si no hay escandallo recipe', () => {
    expect(
      buildRecipeIngredientsFromCostingItem(
        { _id: 'x', customFields: { costingType: 'fixed', fixedCost: 3 } },
        [],
      ),
    ).toEqual([]);
  });
});
