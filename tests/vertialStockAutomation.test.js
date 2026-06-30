import { describe, expect, it } from 'vitest';
import { collectInventoryCandidates } from '../src/app/lib/inventorySyncLogic.ts';
import {
  resolveProductPackagingLines,
  resolveVertialMinStock,
  VERTIAL_DELIVERY_STOCK_TEMPLATES,
} from '../src/app/lib/vertialStockDefaults.ts';
import { buildRecipeIngredientsFromCostingItem } from '../src/app/lib/recipeSyncLogic.ts';

describe('collectInventoryCandidates extended', () => {
  it('includes vertial packaging templates and catalog resale', () => {
    const candidates = collectInventoryCandidates([], [
      {
        _id: 'cat-coca',
        name: 'Coca-Cola 33cl',
        module: 'catalog',
        itemType: 'product',
        category: 'Bebidas',
        costPrice: 0.65,
      },
      {
        name: 'Margarita',
        module: 'catalog',
        itemType: 'product',
        customFields: { ingredients: 'Mozzarella, Tomate' },
      },
    ]);

    const names = candidates.map((c) => c.name);
    expect(names).toContain('Caja pizza M');
    expect(names).toContain('Bolsa delivery');
    expect(names).toContain('Coca-Cola 33cl');
    expect(names).toContain('Mozzarella');
  });
});

describe('vertialStockDefaults', () => {
  it('assigns min stock by category', () => {
    expect(resolveVertialMinStock('packaging')).toBe(20);
    expect(resolveVertialMinStock('beverage')).toBe(24);
  });

  it('maps pizza to box template', () => {
    const lines = resolveProductPackagingLines(
      { name: 'Margarita', category: 'Pizzas' },
      'pizza',
    );
    expect(lines[0]?.templateId).toBe('box-pizza-m');
  });

  it('maps burger to burger box', () => {
    const lines = resolveProductPackagingLines(
      { name: 'Cheese Burger', category: 'Burgers' },
      'burger_fastfood',
    );
    expect(lines[0]?.templateId).toBe('box-burger');
  });
});

describe('buildRecipeIngredientsFromCostingItem', () => {
  it('maps costing recipe lines to stock catalog ids', () => {
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
    expect(ingredients[1]?.catalogItemId).toBe('stock-box');
    expect(ingredients[1]?.optional).toBe(true);
  });
});

describe('VERTIAL_DELIVERY_STOCK_TEMPLATES', () => {
  it('has bag delivery template', () => {
    expect(VERTIAL_DELIVERY_STOCK_TEMPLATES.some((t) => t.templateId === 'bag-delivery')).toBe(true);
  });
});
