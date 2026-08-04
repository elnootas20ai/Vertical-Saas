/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  linesFromSaleItems,
  linesFromDiningOrder,
  linesFromDeliveryOrder,
} from '../services/verifactuIssueService.js';
import { calcLineTotals } from '../services/verifactuEngine.js';

describe('verifactuIssueService lines', () => {
  it('desglosa precio con IVA incluido', () => {
    const lines = linesFromSaleItems(
      [{ name: 'Menú', quantity: 1, unitPrice: 11 }],
      { pricesIncludeTax: true, defaultTaxRate: 10 },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBeCloseTo(10, 3);
    const t = calcLineTotals(lines);
    expect(t.total).toBeCloseTo(11, 1);
  });

  it('acepta precio neto si pricesIncludeTax=false', () => {
    const lines = linesFromSaleItems(
      [{ name: 'Producto', quantity: 2, unitPrice: 10, taxRate: 21 }],
      { pricesIncludeTax: false, defaultTaxRate: 21 },
    );
    const t = calcLineTotals(lines);
    expect(t.base).toBe(20);
    expect(t.tax).toBe(4.2);
    expect(t.total).toBe(24.2);
  });

  it('extrae líneas de pedido delivery', () => {
    const lines = linesFromDeliveryOrder(
      {
        items: [
          { name: 'Pizza', quantity: 1, unitPrice: 12 },
          { name: '', quantity: 1, unitPrice: 5 },
        ],
      },
      { pricesIncludeTax: true, defaultTaxRate: 10 },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe('Pizza');
  });

  it('extrae líneas de comanda sala e ignora canceladas', () => {
    const lines = linesFromDiningOrder(
      {
        comandas: [
          {
            status: 'served',
            items: [
              { name: 'Café', quantity: 2, price: 1.5, status: 'served' },
              { name: 'Anulado', quantity: 1, price: 9, status: 'cancelled' },
            ],
          },
          { status: 'cancelled', items: [{ name: 'X', quantity: 1, price: 3 }] },
        ],
      },
      { pricesIncludeTax: true, defaultTaxRate: 10 },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe('Café');
    expect(lines[0].quantity).toBe(2);
  });
});
