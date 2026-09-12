import { describe, expect, it } from 'vitest';
import {
  convertQuantityBetweenUnits,
  quantityInStockUnit,
} from '../shared/stock/unitConversion.js';
import {
  buildRecipeIngredientsFromCostingItem,
  recipeIngredientsNeedUpdate,
} from '../src/app/lib/recipeSyncLogic.ts';
import { mergeHalfHalfIngredientQuantities } from '../services/recipeOrderExpansion.js';
import { buildRecipeDocument } from '../services/recipeModel.js';
import { convertPurchaseLineToCatalogUnit } from '../services/purchaseUnitService.js';

describe('unitConversion stock', () => {
  it('convierte mg y g a kg, y ml a l', () => {
    expect(convertQuantityBetweenUnits(150000, 'mg', 'kg')).toBe(0.15);
    expect(convertQuantityBetweenUnits(150, 'g', 'kg')).toBe(0.15);
    expect(convertQuantityBetweenUnits(500, 'ml', 'l')).toBe(0.5);
    expect(quantityInStockUnit(150, 'g', 'kg')).toBe(0.15);
    expect(quantityInStockUnit(1, 'mg', 'kg')).toBe(0.000001);
  });
});

describe('recipeSyncLogic stock units', () => {
  it('persiste qty en unidad del SKU (150000 mg → 0.15 kg)', () => {
    const ingredients = buildRecipeIngredientsFromCostingItem(
      {
        _id: 'prod',
        name: 'Pizza',
        module: 'catalog',
        customFields: {
          costingType: 'recipe',
          mermaPct: 10,
          costingRecipe: [
            { storeIngredientId: 'ing-moz', name: 'Mozzarella', quantity: 150000, unit: 'mg' },
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

describe('recipe merma and cost sync', () => {
  it('la merma incrementa coste pero no cantidad física de stock', () => {
    const recipe = buildRecipeDocument('user-1', {
      name: 'Pizza',
      catalogItemId: 'pizza-1',
      portions: 1,
      ingredients: [
        {
          catalogItemId: 'stock-moz',
          catalogItemName: 'Mozzarella',
          quantity: 0.2,
          unit: 'kg',
          wastePercent: 10,
          costPerUnit: 10,
        },
      ],
    });
    expect(recipe.ingredients[0].netQuantity).toBe(0.2);
    expect(recipe.ingredients[0].totalCost).toBe(2.2);
    expect(recipe.totalCost).toBe(2.2);
  });

  it('resincroniza receta cuando cambia solo el coste del ingrediente', () => {
    expect(
      recipeIngredientsNeedUpdate(
        [{ catalogItemId: 'stock-1', quantity: 1, unit: 'kg', costPerUnit: 2 }],
        [{
          catalogItemId: 'stock-1',
          catalogItemName: 'Harina',
          quantity: 1,
          unit: 'kg',
          wastePercent: 0,
          netQuantity: 1,
          costPerUnit: 3,
          totalCost: 3,
          stockCategory: 'ingredient',
          optional: false,
          substitutes: [],
        }],
      ),
    ).toBe(true);
  });
});

describe('purchase units', () => {
  it('convierte kg a gramos conservando el importe', () => {
    const converted = convertPurchaseLineToCatalogUnit(2, 10, 'kg', 'g');
    expect(converted.quantity).toBe(2000);
    expect(converted.unitCost).toBe(0.01);
    expect(converted.quantity * converted.unitCost).toBe(20);
  });

  it('rechaza familias incompatibles', () => {
    expect(convertPurchaseLineToCatalogUnit(1, 10, 'l', 'kg')).toBeNull();
  });
});
