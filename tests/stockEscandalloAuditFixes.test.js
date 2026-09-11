import { describe, expect, it } from 'vitest';
import {
  convertQuantityBetweenUnits,
  quantityInStockUnit,
} from '../shared/stock/unitConversion.js';
import { buildRecipeIngredientsFromCostingItem } from '../src/app/lib/recipeSyncLogic.ts';
import { mergeHalfHalfIngredientQuantities } from '../services/recipeOrderExpansion.js';

describe('unitConversion stock', () => {
  it('convierte g a kg y ml a l', () => {
    expect(convertQuantityBetweenUnits(150, 'g', 'kg')).toBe(0.15);
    expect(convertQuantityBetweenUnits(500, 'ml', 'l')).toBe(0.5);
    expect(quantityInStockUnit(150, 'g', 'kg')).toBe(0.15);
  });
});

describe('recipeSyncLogic stock units', () => {
  it('persiste qty en unidad del SKU (150 g → 0.15 kg)', () => {
    const ingredients = buildRecipeIngredientsFromCostingItem(
      {
        _id: 'prod',
        name: 'Pizza',
        module: 'catalog',
        customFields: {
          costingType: 'recipe',
          mermaPct: 10,
          costingRecipe: [
            { storeIngredientId: 'ing-moz', name: 'Mozzarella', quantity: 150, unit: 'g' },
          ],
        },
      },
      [
        {
          _id: 'stock-moz',
          name: 'Mozzarella',
          module: 'stock',
          unit: 'kg',
          costPrice: 8,
          lastPurchasePrice: 8,
          stockCategory: 'ingredient',
          customFields: { storeIngredientId: 'ing-moz' },
        },
      ],
    );
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0].quantity).toBe(0.15);
    expect(ingredients[0].unit).toBe('kg');
    expect(ingredients[0].wastePercent).toBe(10);
    expect(ingredients[0].netQuantity).toBe(0.15);
    expect(ingredients[0].totalCost).toBe(1.2);
  });
});

describe('half-half merma', () => {
  it('no aplica gross-up de wastePercent al mezclar', () => {
    const merged = mergeHalfHalfIngredientQuantities({
      baseRecipe: {
        ingredients: [
          {
            catalogItemId: 'stock-masa',
            catalogItemName: 'Masa',
            quantity: 0.2,
            wastePercent: 10,
            costPerUnit: 1,
          },
        ],
      },
      firstRecipe: { ingredients: [] },
      secondRecipe: { ingredients: [] },
      quantitySold: 1,
    });
    expect(merged.get('stock-masa')?.quantity).toBe(0.2);
  });
});
