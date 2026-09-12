import { describe, expect, it } from 'vitest';
import { buildDiningOrderDocument, computeOrderTotals } from '../services/salaService.js';

function comanda(items) {
  return [{ id: 'c-1', status: 'draft', items }];
}

describe('restaurant dining totals con IVA incluido', () => {
  it('no suma el IVA por encima del precio de carta', () => {
    const totals = computeOrderTotals(comanda([
      { price: 11, quantity: 1, taxRate: 10, status: 'pending' },
    ]), 0, 0);

    expect(totals).toEqual({
      subtotal: 11,
      discount: 0,
      tax: 1,
      total: 11,
    });
  });

  it('desglosa tipos mixtos sin cambiar el total cobrado', () => {
    const totals = computeOrderTotals(comanda([
      { price: 11, quantity: 1, taxRate: 10, status: 'pending' },
      { price: 12.1, quantity: 1, taxRate: 21, status: 'pending' },
    ]), 0, 0);

    expect(totals.subtotal).toBe(23.1);
    expect(totals.tax).toBe(3.1);
    expect(totals.total).toBe(23.1);
  });

  it('prorratea el IVA incluido al aplicar descuento', () => {
    const totals = computeOrderTotals(comanda([
      { price: 11, quantity: 1, taxRate: 10, status: 'pending' },
    ]), 0, 10);

    expect(totals.subtotal).toBe(11);
    expect(totals.discount).toBe(1.1);
    expect(totals.tax).toBe(0.9);
    expect(totals.total).toBe(9.9);
  });

  it('conserva combo y mitad y mitad al sanear la comanda', () => {
    const order = buildDiningOrderDocument('owner-1', {
      businessId: 'biz-1',
      tableId: 'table-1',
      comandas: [{
        id: 'c-1',
        status: 'draft',
        items: [{
          id: 'line-1',
          productId: 'pizza-1',
          name: 'Pizza',
          price: 12,
          quantity: 1,
          taxRate: 10,
          status: 'pending',
          halfHalfPizza: {
            firstProductId: 'pizza-1',
            firstProductName: 'Margarita',
            secondProductId: 'pizza-2',
            secondProductName: 'Vegetal',
          },
          comboSelections: [{
            productId: 'drink-1',
            productName: 'Agua',
            quantity: 1,
            slotKind: 'drink',
            instanceId: 'slot-1',
          }],
        }],
      }],
    });

    expect(order.comandas[0].items[0].halfHalfPizza?.secondProductId).toBe('pizza-2');
    expect(order.comandas[0].items[0].comboSelections).toEqual([{
      productId: 'drink-1',
      productName: 'Agua',
      quantity: 1,
      slotKind: 'drink',
      instanceId: 'slot-1',
    }]);
  });
});
