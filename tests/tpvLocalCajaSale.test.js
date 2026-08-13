import { describe, expect, it } from 'vitest';
import {
  buildTpvSaleTxFromOrder,
  mergeTpvRegisterTransactions,
  sessionHasIdenticalSaleForOrder,
  sessionHasSaleForOrder,
  sessionSaleAmountForOrder,
} from '../src/app/lib/tpvLocalCajaSale.ts';

describe('tpvLocalCajaSale', () => {
  it('detecta venta idéntica (pedido+método+importe)', () => {
    const session = {
      transactions: [
        { id: 'tx1', type: 'sale', orderId: 'dord-a', paymentMethod: 'tarjeta', amount: 46.8, date: '2026-01-01' },
      ],
    };
    expect(sessionHasIdenticalSaleForOrder(session, 'dord-a', 'tarjeta', 46.8)).toBe(true);
    expect(sessionHasIdenticalSaleForOrder(session, 'dord-a', 'efectivo', 46.8)).toBe(false);
    expect(sessionHasIdenticalSaleForOrder(session, 'dord-a', 'tarjeta', 20)).toBe(false);
  });

  it('suma ventas del pedido (orderId o linked) para no doblar airbag', () => {
    const session = {
      transactions: [
        { id: 'tx1', type: 'sale', orderId: 'dord-a', amount: 26, date: '2026-01-01' },
        { id: 'tx2', type: 'sale', linkedDeliveryOrderId: 'dord-a', amount: 26, date: '2026-01-01' },
      ],
    };
    expect(sessionSaleAmountForOrder(session, 'dord-a')).toBe(52);
  });

  it('arma tx de venta desde pedido', () => {
    const tx = buildTpvSaleTxFromOrder(
      {
        _id: 'dord-1',
        orderNumber: 'PED-X',
        customerName: 'Carol',
        channel: 'tpv',
        paymentMethod: 'efectivo',
        paidAmount: 15,
        totalAmount: 15,
      },
      { registeredBy: 'Tablet' },
    );
    expect(tx.type).toBe('sale');
    expect(tx.amount).toBe(15);
    expect(tx.orderId).toBe('dord-1');
    expect(tx.paymentMethod).toBe('efectivo');
  });

  it('merge no duplica ventas del mismo pedido', () => {
    const server = [
      { id: 's1', type: 'sale', orderId: 'dord-1', orderNumber: 'PED-1', amount: 15, date: '2026-01-01T10:00:00Z' },
      { id: 's2', type: 'cash_out', amount: 10, date: '2026-01-01T11:00:00Z' },
    ];
    const local = [
      { id: 'l1', type: 'sale', orderId: 'dord-1', orderNumber: 'PED-1', amount: 15, date: '2026-01-01T10:00:01Z' },
      { id: 'l2', type: 'sale', orderId: 'dord-2', orderNumber: 'PED-2', amount: 20, date: '2026-01-01T12:00:00Z' },
    ];
    const merged = mergeTpvRegisterTransactions(server, local);
    const sales = merged.filter((t) => t.type === 'sale');
    expect(sales).toHaveLength(2);
    expect(sales.some((t) => t.orderId === 'dord-1')).toBe(true);
    expect(sales.some((t) => t.orderId === 'dord-2')).toBe(true);
    expect(merged.some((t) => t.id === 's2')).toBe(true);
  });
});
