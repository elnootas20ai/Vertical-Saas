import { describe, expect, it } from 'vitest';
import { computeCompanyBillingBreakdown } from '../src/app/lib/portfolioMetrics.ts';
import {
  buildShiftAppsBrandTotals,
  buildShiftBrandRevenue,
  getOrderBrandShares,
} from '../src/app/lib/registerShiftBrandBilling.ts';

function paidOrder(partial) {
  return {
    _id: 'o1',
    status: 'delivered',
    paymentStatus: 'paid',
    paymentCollected: true,
    paidAt: '2026-07-15T12:00:00.000Z',
    deliveredAt: '2026-07-15T12:00:00.000Z',
    createdAt: '2026-07-15T11:00:00.000Z',
    channel: 'tpv',
    pointOfSaleId: 'pdv1',
    workCenterId: 'wc1',
    totalAmount: 0,
    paidAmount: 0,
    items: [],
    ...partial,
  };
}

describe('computeCompanyBillingBreakdown — reglas Facturación', () => {
  it('mono-marca: bebida va a la marca', () => {
    const orders = [
      paidOrder({
        totalAmount: 25,
        paidAmount: 25,
        items: [
          { brandIds: ['modo'], quantity: 2, total: 20 },
          { category: 'Bebidas', quantity: 1, total: 5 },
        ],
      }),
    ];
    const billing = computeCompanyBillingBreakdown(
      orders,
      ['modo', 'bb'],
      [{ id: 'wc1', pdvId: 'pdv1' }],
      ['pdv1'],
      'pdv1',
      new Map([['pdv1', 'wc1']]),
      '2026-07-15',
    );
    const modo = billing.brands.find((b) => b.brandId === 'modo');
    expect(modo?.revenueMonth).toBe(25);
    expect(billing.unbrandedRevenueMonth).toBe(0);
  });

  it('cruzado: compartidos enteros a la marca dominante (empate uds → más €)', () => {
    const orders = [
      paidOrder({
        totalAmount: 44,
        paidAmount: 44,
        items: [
          { brandIds: ['modo'], quantity: 2, total: 20 },
          { brandIds: ['bb'], quantity: 2, total: 18 },
          { category: 'Bebidas', quantity: 1, total: 2 },
          { category: 'Postres', quantity: 1, total: 4 },
        ],
      }),
    ];
    const billing = computeCompanyBillingBreakdown(
      orders,
      ['modo', 'bb'],
      [{ id: 'wc1', pdvId: 'pdv1' }],
      ['pdv1'],
      'pdv1',
      new Map([['pdv1', 'wc1']]),
      '2026-07-15',
    );
    // 2=2 uds, modo factura más (20>18) → 20+6=26, bb=18
    expect(billing.brands.find((b) => b.brandId === 'modo')?.revenueMonth).toBe(26);
    expect(billing.brands.find((b) => b.brandId === 'bb')?.revenueMonth).toBe(18);
    expect(billing.unbrandedRevenueMonth).toBe(0);
  });
});

describe('buildShiftBrandRevenue', () => {
  it('agrupa € del turno por marca', () => {
    const session = {
      openedAt: '2026-07-15T09:00:00.000Z',
      closedAt: '2026-07-15T22:00:00.000Z',
      status: 'closed',
      pointOfSaleId: 'pdv1',
    };
    const orders = [
      paidOrder({
        _id: 'a',
        totalAmount: 12,
        paidAmount: 12,
        paymentMethod: 'efectivo',
        items: [
          { brandIds: ['modo'], quantity: 1, total: 10 },
          { category: 'Bebidas', quantity: 1, total: 2 },
        ],
      }),
    ];
    const { rows, unbranded } = buildShiftBrandRevenue(session, orders, { modo: 'Modomio' });
    expect(unbranded).toBe(0);
    expect(rows[0].name).toBe('Modomio');
    expect(rows[0].revenue).toBe(12);
    expect(rows[0].revenueEfectivo).toBe(12);
    expect(rows[0].revenueTarjeta).toBe(0);
  });

  it('separa efectivo y tarjeta por marca activa (p. ej. Modomio + otra)', () => {
    const session = {
      openedAt: '2026-07-15T09:00:00.000Z',
      closedAt: '2026-07-15T22:00:00.000Z',
      status: 'closed',
      pointOfSaleId: 'pdv1',
    };
    const orders = [
      paidOrder({
        _id: 'cash-modo',
        totalAmount: 20,
        paidAmount: 20,
        paymentMethod: 'efectivo',
        items: [{ brandIds: ['modo'], quantity: 1, total: 20 }],
      }),
      paidOrder({
        _id: 'card-bb',
        totalAmount: 15,
        paidAmount: 15,
        paymentMethod: 'tarjeta',
        items: [{ brandIds: ['bb'], quantity: 1, total: 15 }],
      }),
      paidOrder({
        _id: 'card-modo',
        totalAmount: 10,
        paidAmount: 10,
        paymentMethod: 'tarjeta',
        items: [{ brandIds: ['modo'], quantity: 1, total: 10 }],
      }),
    ];
    const { rows } = buildShiftBrandRevenue(session, orders, {
      modo: 'Modomio',
      bb: 'Burger Brother',
    });
    const modo = rows.find((r) => r.brandId === 'modo');
    const bb = rows.find((r) => r.brandId === 'bb');
    expect(modo?.revenue).toBe(30);
    expect(modo?.revenueEfectivo).toBe(20);
    expect(modo?.revenueTarjeta).toBe(10);
    expect(bb?.revenue).toBe(15);
    expect(bb?.revenueEfectivo).toBe(0);
    expect(bb?.revenueTarjeta).toBe(15);
  });

  it('marcas TPV no mezclan pedidos Glovo (otra caja)', () => {
    const session = {
      openedAt: '2026-07-15T09:00:00.000Z',
      closedAt: '2026-07-15T22:00:00.000Z',
      status: 'closed',
      pointOfSaleId: 'pdv1',
      transactions: [
        {
          id: 't-tpv',
          type: 'sale',
          paymentMethod: 'tarjeta',
          amount: 40,
          channel: 'tpv',
          linkedDeliveryOrderId: 'tpv1',
          orderId: 'tpv1',
          date: '2026-07-15T12:00:00.000Z',
        },
      ],
    };
    const orders = [
      paidOrder({
        _id: 'tpv1',
        channel: 'tpv',
        totalAmount: 40,
        paidAmount: 40,
        paymentMethod: 'tarjeta',
        items: [{ brandIds: ['modo'], quantity: 1, total: 40 }],
      }),
      paidOrder({
        _id: 'g1',
        channel: 'glovo',
        totalAmount: 100,
        paidAmount: 100,
        items: [{ brandIds: ['modo'], quantity: 1, total: 100 }],
      }),
    ];
    const store = buildShiftBrandRevenue(session, orders, { modo: 'Modomio' });
    expect(store.total).toBe(40);
    expect(store.rows[0]?.revenueTarjeta).toBe(40);
    const apps = buildShiftAppsBrandTotals(session, orders, { modo: 'Modomio' });
    expect(apps.total).toBe(100);
    expect(apps.rows[0]?.revenue).toBe(100);
  });

  it('total apps por marca (Glovo/Uber) con reglas Facturación', () => {
    const session = {
      openedAt: '2026-07-15T09:00:00.000Z',
      closedAt: '2026-07-15T22:00:00.000Z',
      status: 'closed',
      pointOfSaleId: 'pdv1',
    };
    const orders = [
      paidOrder({
        _id: 'g1',
        channel: 'glovo',
        totalAmount: 30,
        paidAmount: 30,
        items: [{ brandIds: ['modo'], quantity: 1, total: 30 }],
      }),
      paidOrder({
        _id: 'u1',
        channel: 'ubereats',
        totalAmount: 20,
        paidAmount: 20,
        items: [{ brandIds: ['bb'], quantity: 1, total: 20 }],
      }),
      paidOrder({
        _id: 'tpv1',
        channel: 'tpv',
        totalAmount: 99,
        paidAmount: 99,
        items: [{ brandIds: ['modo'], quantity: 1, total: 99 }],
      }),
    ];
    const { rows, total } = buildShiftAppsBrandTotals(session, orders, {
      modo: 'Modomio',
      bb: 'Blackburger',
    });
    expect(total).toBe(50);
    expect(rows.find((r) => r.brandId === 'modo')?.revenue).toBe(30);
    expect(rows.find((r) => r.brandId === 'bb')?.name).toBe('Blackburger');
    expect(rows.find((r) => r.brandId === 'bb')?.revenue).toBe(20);
  });

  it('tarjeta desde txs de caja aunque el pedido diga mixto sin payments', () => {
    const session = {
      openedAt: '2026-07-15T09:00:00.000Z',
      closedAt: '2026-07-15T22:00:00.000Z',
      status: 'closed',
      pointOfSaleId: 'pdv1',
      transactions: [
        {
          id: 't1',
          type: 'sale',
          paymentMethod: 'tarjeta',
          amount: 25,
          linkedDeliveryOrderId: 'broken-mix',
          orderId: 'broken-mix',
          date: '2026-07-15T12:00:00.000Z',
        },
      ],
    };
    const orders = [
      paidOrder({
        _id: 'broken-mix',
        totalAmount: 25,
        paidAmount: 25,
        paymentMethod: 'mixto',
        payments: [],
        items: [{ brandIds: ['modo'], quantity: 1, total: 25 }],
      }),
    ];
    const { rows } = buildShiftBrandRevenue(session, orders, { modo: 'Modomio' });
    expect(rows[0]?.revenueTarjeta).toBe(25);
    expect(rows[0]?.revenueEfectivo).toBe(0);
  });
});

describe('getOrderBrandShares — porqué por marca', () => {
  it('cruzado: dominante lleva compartidos y explica ambos', () => {
    const order = paidOrder({
      totalAmount: 44,
      paidAmount: 44,
      items: [
        { brandIds: ['modo'], name: 'Pizza', quantity: 2, total: 20 },
        { brandIds: ['bb'], name: 'Burger', quantity: 2, total: 18 },
        { category: 'Bebidas', quantity: 1, total: 2 },
        { category: 'Postres', quantity: 1, total: 4 },
      ],
    });
    const shares = getOrderBrandShares(order, { modo: 'Modomio', bb: 'Burger' });
    expect(shares).toHaveLength(2);
    const modo = shares.find((s) => s.brandId === 'modo');
    const bb = shares.find((s) => s.brandId === 'bb');
    expect(modo?.amount).toBe(26);
    expect(modo?.ownRevenue).toBe(20);
    expect(modo?.sharedAssigned).toBe(6);
    expect(modo?.why).toMatch(/productos/);
    expect(modo?.why).toMatch(/compartidos/);
    expect(modo?.why).toMatch(/dominante/);
    expect(bb?.amount).toBe(18);
    expect(bb?.ownRevenue).toBe(18);
    expect(bb?.sharedAssigned).toBe(0);
    expect(bb?.why).toMatch(/18,00 € productos/);
  });
});
