import { describe, expect, it } from 'vitest';
import {
  aggregateStoreOpsPulses,
  buildPdvBrandSameDayCompare,
  buildStoreOpsPulse,
  listMonthToDateDayKeys,
  listPrevMonthToDateDayKeys,
  listSameDayOfMonthKeys,
  listTrailingDayKeys,
  monthOverMonthPct,
  rankStoreOpsPulses,
  resolvePrevComparableDayKeys,
} from '../src/app/lib/portfolioMetrics.ts';

function order({ id, pdv, paidAt, total, items, status = 'entregado', channel }) {
  return {
    _id: id,
    salesPointId: pdv,
    status,
    channel: channel || 'tpv',
    paidAt,
    deliveredAt: paidAt,
    createdAt: paidAt,
    paymentStatus: 'paid',
    totalAmount: total,
    paidAmount: total,
    items: items.map((it, i) => ({
      id: `${id}-${i}`,
      name: it.name,
      category: it.category || '',
      quantity: it.qty ?? 1,
      unitPrice: 10,
      total: 10 * (it.qty ?? 1),
    })),
  };
}

describe('listTrailingDayKeys / listMonthToDateDayKeys', () => {
  it('builds 7 trailing days ending today', () => {
    const keys = listTrailingDayKeys('2026-07-28', 7);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-07-22');
    expect(keys[6]).toBe('2026-07-28');
  });

  it('builds month-to-date keys', () => {
    const keys = listMonthToDateDayKeys('2026-07-03');
    expect(keys).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });
});

describe('listSameDayOfMonthKeys / buildPdvBrandSameDayCompare', () => {
  it('lists same day-of-month going back 3 months', () => {
    expect(listSameDayOfMonthKeys('2026-08-04', 3)).toEqual([
      '2026-05-04',
      '2026-06-04',
      '2026-07-04',
      '2026-08-04',
    ]);
  });

  it('clamps day when month is shorter', () => {
    expect(listSameDayOfMonthKeys('2026-03-31', 1)).toEqual(['2026-02-28', '2026-03-31']);
  });

  it('lists prev month-to-date keys (fair MoM)', () => {
    expect(listPrevMonthToDateDayKeys('2026-08-04')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
    ]);
  });

  it('resolvePrevComparableDayKeys uses MTD for month pulse', () => {
    const keys = listMonthToDateDayKeys('2026-08-04');
    expect(resolvePrevComparableDayKeys(keys, '2026-08-04')).toEqual(
      listPrevMonthToDateDayKeys('2026-08-04'),
    );
  });

  it('monthOverMonthPct: sin baseline no inventa negativo; con baseline sí cae', () => {
    expect(monthOverMonthPct(30, 0)).toBeNull();
    expect(monthOverMonthPct(0, 100)).toBe(-100);
    expect(monthOverMonthPct(50, 100)).toBe(-50);
  });

  it('compares brand units for two PDVs on those days', () => {
    const orders = [
      {
        _id: 'a1',
        salesPointId: 'pdv-a',
        status: 'entregado',
        paymentStatus: 'paid',
        paidAt: '2026-08-04T12:00:00',
        deliveredAt: '2026-08-04T12:00:00',
        createdAt: '2026-08-04T11:00:00',
        totalAmount: 20,
        paidAmount: 20,
        items: [
          {
            id: 'i1',
            name: 'Pizza',
            quantity: 2,
            unitPrice: 10,
            total: 20,
            brandIds: ['brand-mod'],
          },
        ],
      },
      {
        _id: 'b1',
        salesPointId: 'pdv-b',
        status: 'entregado',
        paymentStatus: 'paid',
        paidAt: '2026-07-04T12:00:00',
        deliveredAt: '2026-07-04T12:00:00',
        createdAt: '2026-07-04T11:00:00',
        totalAmount: 30,
        paidAmount: 30,
        items: [
          {
            id: 'i2',
            name: 'Pizza',
            quantity: 3,
            unitPrice: 10,
            total: 30,
            brandIds: ['brand-mod'],
          },
        ],
      },
    ];

    const cmp = buildPdvBrandSameDayCompare(orders, {
      todayKey: '2026-08-04',
      monthsBack: 1,
      storeA: { storeName: 'Test1', pdvId: 'pdv-a', workCenterId: 'wc-a' },
      storeB: { storeName: 'Badalona', pdvId: 'pdv-b', workCenterId: 'wc-b' },
      brands: [{ id: 'brand-mod', name: 'Modomio', color: '#f00' }],
    });

    expect(cmp.dayKeys).toEqual(['2026-07-04', '2026-08-04']);
    expect(cmp.brands).toHaveLength(1);
    // Jul 4: A aún no existía → aActive false; B sí
    expect(cmp.brands[0].points[0]).toMatchObject({
      aUnits: 0,
      bUnits: 3,
      aActive: false,
      bActive: true,
    });
    expect(cmp.brands[0].points[1]).toMatchObject({
      aUnits: 2,
      bUnits: 0,
      aActive: true,
      bActive: true,
    });
  });
});

describe('buildStoreOpsPulse', () => {
  it('aggregates revenue and food by day for a PDV', () => {
    const today = '2026-07-28';
    const dayKeys = listTrailingDayKeys(today, 7);
    const orders = [
      order({
        id: 'a',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-28T12:00:00',
        total: 40,
        items: [
          { name: 'Margarita', category: 'Pizzas', qty: 2 },
          { name: 'Classic Burger', category: 'Burgers', qty: 1 },
        ],
      }),
      order({
        id: 'b',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-27T12:00:00',
        total: 20,
        items: [{ name: 'Taco Pastor', category: 'Tacos', qty: 3 }],
      }),
      order({
        id: 'c',
        pdv: 'pdv-other',
        paidAt: '2026-07-28T12:00:00',
        total: 100,
        items: [{ name: 'Margarita', category: 'Pizzas', qty: 5 }],
      }),
    ];

    const pulse = buildStoreOpsPulse(orders, {
      storeId: 'wc-tiana',
      storeName: 'Tiana',
      businessId: 'biz-1',
      businessName: 'Modomio',
      pdvId: 'pdv-tiana',
      workCenterId: 'wc-tiana',
      todayKey: today,
      dayKeys,
    });

    expect(pulse.revenueToday).toBe(40);
    expect(pulse.revenuePeriod).toBe(60);
    expect(pulse.ordersPeriod).toBe(2);
    expect(pulse.pizza).toBeGreaterThanOrEqual(2);
    expect(pulse.burger).toBeGreaterThanOrEqual(1);
    expect(pulse.taco).toBeGreaterThanOrEqual(3);
    const todayRow = pulse.days.find((d) => d.dayKey === today);
    expect(todayRow?.orders).toBe(1);
    expect(todayRow?.revenueDeltaPct).not.toBeNull();
  });

  it('ranks stores by revenue and sets share', () => {
    const today = '2026-07-28';
    const dayKeys = listTrailingDayKeys(today, 7);
    const orders = [
      order({
        id: 't1',
        pdv: 'pdv-a',
        paidAt: '2026-07-28T10:00:00',
        total: 100,
        items: [{ name: 'Pizza', category: 'Pizzas' }],
      }),
      order({
        id: 't2',
        pdv: 'pdv-b',
        paidAt: '2026-07-28T10:00:00',
        total: 50,
        items: [{ name: 'Burger', category: 'Burgers' }],
      }),
    ];
    const a = buildStoreOpsPulse(orders, {
      storeId: 'a',
      storeName: 'Tiana',
      businessId: 'b',
      businessName: 'X',
      pdvId: 'pdv-a',
      todayKey: today,
      dayKeys,
    });
    const b = buildStoreOpsPulse(orders, {
      storeId: 'b',
      storeName: 'Badalona',
      businessId: 'b',
      businessName: 'X',
      pdvId: 'pdv-b',
      todayKey: today,
      dayKeys,
    });
    const ranked = rankStoreOpsPulses([b, a]);
    expect(ranked[0].storeName).toBe('Tiana');
    expect(ranked[0].sharePercent).toBe(66.7);
    expect(ranked[1].sharePercent).toBe(33.3);
    const tot = aggregateStoreOpsPulses(ranked);
    expect(tot.revenuePeriod).toBe(150);
  });

  it('overlays Glovo/Uber/Just Eat from caja closing (Caja 2 manual)', () => {
    const today = '2026-07-28';
    const dayKeys = listTrailingDayKeys(today, 7);
    const orders = [
      order({
        id: 'local',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-28T12:00:00',
        total: 30,
        items: [{ name: 'Margarita', category: 'Pizzas', qty: 1 }],
      }),
    ];
    const sessions = [
      {
        _id: 'sess-1',
        pointOfSaleId: 'pdv-tiana',
        status: 'closed',
        openedAt: '2026-07-28T09:00:00',
        closedAt: '2026-07-28T23:00:00',
        aggregatorClosingTotals: {
          glovo: 120.5,
          ubereats: 80,
          justeat: 40,
          flipdish: 15,
        },
      },
    ];
    const pulse = buildStoreOpsPulse(orders, {
      storeId: 'wc-tiana',
      storeName: 'Tiana',
      businessId: 'biz-1',
      businessName: 'Modomio',
      pdvId: 'pdv-tiana',
      workCenterId: 'wc-tiana',
      todayKey: today,
      dayKeys,
      sessions,
    });
    expect(pulse.channels.glovo).toBe(120.5);
    expect(pulse.channels.uber).toBe(80);
    expect(pulse.channels.justEat).toBe(40);
    expect(pulse.channels.app).toBe(15);
    // Ventas = canales (30 local + 120.5+80+40+15 integradores)
    expect(pulse.revenuePeriod).toBe(285.5);
    expect(pulse.revenueToday).toBe(285.5);
    const todayRow = pulse.days.find((d) => d.dayKey === today);
    expect(todayRow?.channels.glovo).toBe(120.5);
    expect(todayRow?.revenue).toBe(285.5);
  });

  it('closing channel at 0 does not wipe Vertial orders on that channel', () => {
    const today = '2026-07-28';
    const dayKeys = listTrailingDayKeys(today, 7);
    const orders = [
      order({
        id: 'local',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-28T12:00:00',
        total: 30,
        channel: 'tpv',
        items: [{ name: 'Margarita', category: 'Pizzas', qty: 1 }],
      }),
      order({
        id: 'glovo-vertial',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-28T13:00:00',
        total: 50,
        channel: 'glovo',
        items: [{ name: 'Margarita', category: 'Pizzas', qty: 1 }],
      }),
    ];
    const sessions = [
      {
        _id: 'sess-1',
        pointOfSaleId: 'pdv-tiana',
        status: 'closed',
        openedAt: '2026-07-28T09:00:00',
        closedAt: '2026-07-28T23:00:00',
        aggregatorClosingTotals: {
          glovo: 0,
          ubereats: 80,
          justeat: 0,
          flipdish: 0,
        },
      },
    ];
    const pulse = buildStoreOpsPulse(orders, {
      storeId: 'wc-tiana',
      storeName: 'Tiana',
      businessId: 'biz-1',
      businessName: 'Modomio',
      pdvId: 'pdv-tiana',
      workCenterId: 'wc-tiana',
      todayKey: today,
      dayKeys,
      sessions,
    });
    // Uber del cierre; Glovo a 0 en caja → se conserva el Glovo de Vertial
    expect(pulse.channels.uber).toBe(80);
    expect(pulse.channels.glovo).toBe(50);
    expect(pulse.channels.justEat).toBe(0);
    // 30 TPV + 50 Glovo Vertial + 80 Uber cierre
    expect(pulse.revenueToday).toBe(160);
  });

  it('sums aggregator totals across two cajas the same day', () => {
    const today = '2026-07-28';
    const dayKeys = listTrailingDayKeys(today, 7);
    const orders = [
      order({
        id: 'local',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-28T12:00:00',
        total: 20,
        channel: 'tpv',
        items: [{ name: 'Margarita', category: 'Pizzas', qty: 1 }],
      }),
    ];
    const sessions = [
      {
        _id: 'sess-am',
        pointOfSaleId: 'pdv-tiana',
        status: 'closed',
        openedAt: '2026-07-28T09:00:00',
        closedAt: '2026-07-28T15:00:00',
        aggregatorClosingTotals: { glovo: 40, ubereats: 10, justeat: 0, flipdish: 0 },
      },
      {
        _id: 'sess-pm',
        pointOfSaleId: 'pdv-tiana',
        status: 'closed',
        openedAt: '2026-07-28T16:00:00',
        closedAt: '2026-07-28T23:00:00',
        aggregatorClosingTotals: { glovo: 25, ubereats: 0, justeat: 15, flipdish: 5 },
      },
    ];
    const pulse = buildStoreOpsPulse(orders, {
      storeId: 'wc-tiana',
      storeName: 'Tiana',
      businessId: 'biz-1',
      businessName: 'Modomio',
      pdvId: 'pdv-tiana',
      workCenterId: 'wc-tiana',
      todayKey: today,
      dayKeys,
      sessions,
    });
    expect(pulse.channels.glovo).toBe(65);
    expect(pulse.channels.uber).toBe(10);
    expect(pulse.channels.justEat).toBe(15);
    expect(pulse.channels.app).toBe(5);
    // 20 local + 65+10+15+5 apps
    expect(pulse.revenueToday).toBe(115);
  });

  it('uses closing productClosingCounts for pizza/burger/taco (Excel / integrators)', () => {
    const today = '2026-07-28';
    const dayKeys = listTrailingDayKeys(today, 7);
    const orders = [
      order({
        id: 'local',
        pdv: 'pdv-tiana',
        paidAt: '2026-07-28T12:00:00',
        total: 30,
        items: [{ name: 'Margarita', category: 'Pizzas', qty: 1 }],
      }),
    ];
    const sessions = [
      {
        _id: 'sess-1',
        pointOfSaleId: 'pdv-tiana',
        status: 'closed',
        openedAt: '2026-07-28T09:00:00',
        closedAt: '2026-07-28T23:00:00',
        aggregatorClosingTotals: {
          glovo: 100,
          ubereats: 50,
          justeat: 0,
          flipdish: 0,
        },
        // Top-level = TPV + apps (como guarda el cierre / Excel Uriel)
        productClosingCounts: {
          pizza: 25,
          burger: 4,
          taco: 2,
          byChannel: {
            glovo: { pizza: 10, burger: 2, taco: 1 },
            ubereats: { pizza: 5, burger: 2, taco: 1 },
          },
        },
      },
    ];
    const pulse = buildStoreOpsPulse(orders, {
      storeId: 'wc-tiana',
      storeName: 'Tiana',
      businessId: 'biz-1',
      businessName: 'Modomio',
      pdvId: 'pdv-tiana',
      workCenterId: 'wc-tiana',
      todayKey: today,
      dayKeys,
      sessions,
    });
    const todayRow = pulse.days.find((d) => d.dayKey === today);
    expect(todayRow?.pizza).toBe(25);
    expect(todayRow?.burger).toBe(4);
    expect(todayRow?.taco).toBe(2);
    expect(pulse.pizza).toBe(25);
    expect(pulse.burger).toBe(4);
    expect(pulse.taco).toBe(2);
  });
});
