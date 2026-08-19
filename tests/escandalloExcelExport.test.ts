import { describe, expect, it } from 'vitest';
import { buildEscandalloExportRows } from '../src/app/lib/escandalloExcelExport';
import type { CatalogItem } from '../src/app/lib/deliveryApi';
import type { StoreIngredient } from '../src/app/lib/catalogCustomization';

const ingredient = (partial: Partial<StoreIngredient> = {}): StoreIngredient => ({
  id: 'ing-1',
  name: 'Mozzarella',
  unit: 'kg',
  baseCost: 8,
  brandIds: [],
  ...partial,
});

const product = (partial: Partial<CatalogItem> = {}): CatalogItem =>
  ({
    _id: 'p1',
    name: 'Pizza Margarita',
    category: 'Pizzas',
    unitPrice: 12,
    costPrice: 0,
    customFields: {
      costingType: 'recipe',
      costingRecipe: [
        {
          storeIngredientId: 'ing-1',
          name: 'Mozzarella',
          quantity: 0.2,
          unit: 'kg',
        },
      ],
    },
    ...partial,
  }) as CatalogItem;

describe('buildEscandalloExportRows', () => {
  it('exporta ingredientes y costes de cada producto', () => {
    const rows = buildEscandalloExportRows(
      [product()],
      [ingredient()],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].producto).toBe('Pizza Margarita');
    expect(rows[0].tipo).toBe('Escandallo');
    expect(rows[0].ingrediente).toBe('Mozzarella');
    expect(rows[0].cantidad).toBe(0.2);
    expect(rows[0].costeUdIngrediente).toBe(8);
    expect(rows[0].costeLinea).toBe(1.6);
    expect(rows[0].costeTotalProducto).toBe(1.6);
  });

  it('incluye coste fijo sin desglose de ingredientes', () => {
    const rows = buildEscandalloExportRows(
      [
        product({
          name: 'Coca-Cola',
          category: 'Bebidas',
          costPrice: 0.45,
          customFields: { costingType: 'fixed' },
        }),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('Coste fijo');
    expect(rows[0].costeTotalProducto).toBe(0.45);
    expect(rows[0].ingrediente).toBe('—');
  });
});
