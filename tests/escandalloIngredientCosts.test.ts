import { describe, expect, it } from 'vitest';
import { buildEscandalloIngredientCostRows } from '../src/app/lib/escandalloIngredientCosts';

describe('buildEscandalloIngredientCostRows', () => {
  it('prefers last purchase and supplier', () => {
    const rows = buildEscandalloIngredientCostRows(
      [{ id: 'ing-1', name: 'Mozzarella', baseCost: 5, unit: 'kg' }],
      [
        {
          _id: 'stock-1',
          name: 'Mozzarella',
          costPrice: 5,
          lastPurchasePrice: 7.5,
          stockQuantity: 12,
          supplierId: 'sup-1',
          supplierName: 'Makro',
          customFields: { storeIngredientId: 'ing-1' },
          active: true,
        } as any,
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('purchase');
    expect(rows[0].effectiveCost).toBe(7.5);
    expect(rows[0].supplierName).toBe('Makro');
    expect(rows[0].linkedStock).toBe(true);
    expect(rows[0].stockQty).toBe(12);
  });

  it('marks missing stock link', () => {
    const rows = buildEscandalloIngredientCostRows(
      [{ id: 'ing-2', name: 'Bacon', baseCost: 3, unit: 'kg' }],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].linkedStock).toBe(false);
    expect(rows[0].source).toBe('ficha');
    expect(rows[0].supplierName).toBe('');
  });
});
