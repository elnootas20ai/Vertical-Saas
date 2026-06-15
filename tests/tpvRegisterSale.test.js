import { describe, expect, it } from 'vitest';
import { sumTpvRegisterSaleAmountForOrder, sumTpvRegisterReturnAmountForOrder } from '../services/couchdb.js';

describe('sumTpvRegisterSaleAmountForOrder', () => {
  it('sums sale transactions for the same order id', () => {
    const txs = [
      { type: 'sale', orderId: 'order-1', amount: 12.5 },
      { type: 'sale', orderId: 'order-2', amount: 8 },
      { type: 'sale', orderId: 'order-1', amount: 2.5 },
      { type: 'cash_in', orderId: 'order-1', amount: 50 },
    ];
    expect(sumTpvRegisterSaleAmountForOrder(txs, 'order-1')).toBe(15);
    expect(sumTpvRegisterSaleAmountForOrder(txs, 'order-2')).toBe(8);
    expect(sumTpvRegisterSaleAmountForOrder(txs, 'missing')).toBe(0);
  });

  it('returns 0 for empty or invalid input', () => {
    expect(sumTpvRegisterSaleAmountForOrder(null, 'order-1')).toBe(0);
    expect(sumTpvRegisterSaleAmountForOrder([], '')).toBe(0);
  });
});

describe('delivery payment → caja (targetTotal delta)', () => {
  it('does not double-count when TPV already registered the sale at creation', () => {
    const orderTotal = 24.9;
    const txs = [{ type: 'sale', orderId: 'ord-abc', amount: orderTotal }];
    const already = sumTpvRegisterSaleAmountForOrder(txs, 'ord-abc');
    const toRegister = orderTotal - already;
    expect(toRegister).toBe(0);
  });

  it('registers full amount when cobro happens at delivery', () => {
    const orderTotal = 18;
    const txs = [];
    const already = sumTpvRegisterSaleAmountForOrder(txs, 'ord-web');
    const toRegister = orderTotal - already;
    expect(toRegister).toBe(18);
  });

  it('registers only the remaining partial payment', () => {
    const orderTotal = 30;
    const txs = [{ type: 'sale', orderId: 'ord-partial', amount: 10 }];
    const already = sumTpvRegisterSaleAmountForOrder(txs, 'ord-partial');
    const toRegister = orderTotal - already;
    expect(toRegister).toBe(20);
  });
});

describe('sumTpvRegisterReturnAmountForOrder', () => {
  it('sums return transactions for the same order id', () => {
    const txs = [
      { type: 'return', orderId: 'order-1', amount: 5 },
      { type: 'return', orderId: 'order-1', amount: 3 },
      { type: 'sale', orderId: 'order-1', amount: 20 },
    ];
    expect(sumTpvRegisterReturnAmountForOrder(txs, 'order-1')).toBe(8);
  });
});
