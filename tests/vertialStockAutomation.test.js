import { describe, expect, it } from 'vitest';
import { collectInventoryCandidates } from '../src/app/lib/inventorySyncLogic.ts';
import {
  resolveProductPackagingLines,
  resolveVertialMinStock,
  VERTIAL_DELIVERY_STOCK_TEMPLATES,
} from '../src/app/lib/vertialStockDefaults.ts';
import { buildRecipeIngredientsFromCostingItem } from '../src/app/lib/recipeSyncLogic.ts';

describe('collectInventoryCandidates extended', () => {
  it('no inyecta plantillas Vertial de envases; sí reventa e ingredientes de carta', () => {
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
    expect(names).not.toContain('Caja pizza M');
    expect(names).not.toContain('Bolsa para llevar');
    expect(names).toContain('Coca-Cola 33cl');
    expect(names).toContain('Mozzarella');
  });

  it('puede incluir plantillas Vertial solo si se pide explícito', () => {
    const candidates = collectInventoryCandidates([], [], { includeVertialTemplates: true });
    const names = candidates.map((c) => c.name);
    expect(names).toContain('Caja pizza M');
    expect(names).toContain('Bolsa para llevar');
  });
});

describe('vertialStockDefaults', () => {
  it('assigns min stock by category', () => {
    expect(resolveVertialMinStock('packaging')).toBe(20);
    expect(resolveVertialMinStock('beverage')).toBe(24);
  });

  it('ya no asigna packaging automático por tipo de producto', () => {
    expect(
      resolveProductPackagingLines({ name: 'Margarita', category: 'Pizzas' }, 'pizza'),
    ).toEqual([]);
    expect(
      resolveProductPackagingLines({ name: 'Cheese Burger', category: 'Burgers' }, 'burger_fastfood'),
    ).toEqual([]);
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
    expect(ingredients[0]?.wastePercent).toBe(0);
  });

  it('maps mermaPct to wastePercent on every line', () => {
    const inventory = [
      {
        _id: 'stock-moz',
        name: 'Mozzarella',
        module: 'stock',
        costPrice: 5.5,
        stockCategory: 'ingredient',
        customFields: { storeIngredientId: 'ing-moz' },
      },
    ];
    const catalogItem = {
      _id: 'prod-marg',
      name: 'Margarita',
      module: 'catalog',
      customFields: {
        costingType: 'recipe',
        mermaPct: 12,
        costingRecipe: [
          { storeIngredientId: 'ing-moz', name: 'Mozzarella', quantity: 0.15, unit: 'kg' },
        ],
      },
    };
    const ingredients = buildRecipeIngredientsFromCostingItem(catalogItem, inventory);
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0]?.wastePercent).toBe(12);
  });
});

describe('VERTIAL_DELIVERY_STOCK_TEMPLATES', () => {
  it('has bag delivery template', () => {
    expect(VERTIAL_DELIVERY_STOCK_TEMPLATES.some((t) => t.templateId === 'bag-delivery')).toBe(true);
  });
});
