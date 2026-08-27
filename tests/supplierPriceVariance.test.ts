import { describe, expect, it } from 'vitest';
import {
  detectSupplierPriceVariance,
  isUnitPriceVariance,
  resolveExpectedUnitCost,
} from '../src/app/lib/supplierPriceVariance.ts';

describe('supplierPriceVariance', () => {
  it('detecta variación relativa > 2%', () => {
    expect(isUnitPriceVariance(0.22, 0.22)).toBe(false);
    expect(isUnitPriceVariance(0.22, 0.224)).toBe(false);
    expect(isUnitPriceVariance(0.22, 0.68)).toBe(true);
    expect(isUnitPriceVariance(1, 1.01)).toBe(false);
    expect(isUnitPriceVariance(1, 1.03)).toBe(true);
  });

  it('prioriza costPrice del proveedor sobre lastPurchase y pedido', () => {
    expect(
      resolveExpectedUnitCost(
        { costPrice: 0.22, lastPurchasePrice: 0.5 },
        { unitCost: 0.4 },
      ),
    ).toBe(0.22);
    expect(resolveExpectedUnitCost({ lastPurchasePrice: 0.5 }, { unitCost: 0.4 })).toBe(0.5);
    expect(resolveExpectedUnitCost({}, { unitCost: 0.4 })).toBe(0.4);
  });

  it('marca líneas de factura con precio distinto al coste esperado', () => {
    const variance = detectSupplierPriceVariance({
      catalogItems: [
        { _id: 'c1', name: 'Agua Mineral', costPrice: 0.22 },
        { _id: 'c2', name: 'Coca-Cola', costPrice: 0.45 },
      ],
      lines: [
        { catalogItemId: 'c1', itemName: 'Agua Mineral', quantity: 24, unitPrice: 0.68, total: 16.32 },
        { catalogItemId: 'c2', itemName: 'Coca-Cola', quantity: 12, unitPrice: 0.45, total: 5.4 },
        { itemName: 'Sin match', quantity: 1, unitPrice: 9.99, total: 9.99 },
      ],
      now: '2026-08-26T00:00:00.000Z',
    });

    expect(variance.hasVariance).toBe(true);
    expect(variance.lines).toHaveLength(1);
    expect(variance.lines[0].catalogItemId).toBe('c1');
    expect(variance.lines[0].expectedUnitCost).toBe(0.22);
    expect(variance.lines[0].invoiceUnitCost).toBe(0.68);
  });

  it('usa unitCost del pedido si no hay costPrice', () => {
    const variance = detectSupplierPriceVariance({
      catalogItems: [{ _id: 'c1', name: 'Arroz' }],
      orderItems: [{ catalogItemId: 'c1', name: 'Arroz', unitCost: 1.1 }],
      lines: [{ catalogItemId: 'c1', itemName: 'Arroz', quantity: 10, unitPrice: 1.5, total: 15 }],
    });
    expect(variance.hasVariance).toBe(true);
    expect(variance.lines[0].expectedUnitCost).toBe(1.1);
  });

  it('deriva unitario desde total/cantidad', () => {
    const variance = detectSupplierPriceVariance({
      catalogItems: [{ _id: 'c1', name: 'Tomate', costPrice: 1 }],
      lines: [{ catalogItemId: 'c1', itemName: 'Tomate', quantity: 2, total: 3 }],
    });
    expect(variance.hasVariance).toBe(true);
    expect(variance.lines[0].invoiceUnitCost).toBe(1.5);
  });
});
