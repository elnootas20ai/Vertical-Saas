import { describe, expect, it } from 'vitest';
import { buildPurchaseListFromStockCount } from '../services/stockPurchaseListService.js';

describe('buildPurchaseListFromStockCount', () => {
  it('pide solo hasta el mínimo según stock contado (no abs(diff) de merma)', () => {
    const list = buildPurchaseListFromStockCount(
      {
        _id: 'sc-1',
        name: 'Revisión test',
        lines: [
          {
            catalogItemId: 'oil',
            catalogItemName: 'Aceite',
            theoreticalStock: 10,
            countedStock: 3,
            difference: -7,
            minStock: 5,
            unit: 'ud',
            costPrice: 2,
          },
        ],
      },
      [{ _id: 'oil', name: 'Aceite', costPrice: 2, supplierId: 's1', supplierName: 'Prov' }],
    );

    expect(list.itemCount).toBe(1);
    expect(list.items[0].suggestedQuantity).toBe(2); // 5 - 3, no 7
    expect(list.items[0].reasons).toContain('bajo_minimo');
    expect(list.items[0].reasons).not.toContain('inventario_faltante');
    expect(list.items[0].currentStock).toBe(3);
  });

  it('agotado sin mínimo pide 1', () => {
    const list = buildPurchaseListFromStockCount(
      {
        _id: 'sc-2',
        lines: [
          {
            catalogItemId: 'water',
            catalogItemName: 'Agua',
            theoreticalStock: 0,
            countedStock: 0,
            difference: 0,
            minStock: 0,
            unit: 'ud',
            costPrice: 1,
          },
        ],
      },
      [],
    );
    expect(list.items[0].suggestedQuantity).toBe(1);
    expect(list.items[0].reasons).toContain('agotado');
  });

  it('no sugiere compra si contado >= mínimo aunque haya merma negativa', () => {
    const list = buildPurchaseListFromStockCount(
      {
        _id: 'sc-3',
        lines: [
          {
            catalogItemId: 'flour',
            catalogItemName: 'Harina',
            theoreticalStock: 20,
            countedStock: 12,
            difference: -8,
            minStock: 10,
            unit: 'kg',
            costPrice: 1,
          },
        ],
      },
      [],
    );
    expect(list.itemCount).toBe(0);
  });
});
