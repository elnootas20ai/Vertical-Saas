import { describe, expect, it } from 'vitest';
import {
  aggregateStoreOpsPulses,
  buildStoreOpsPulse,
  listMonthToDateDayKeys,
  listTrailingDayKeys,
  rankStoreOpsPulses,
} from '../src/app/lib/portfolioMetrics.ts';

function order({ id, pdv, paidAt, total, items, status = 'entregado' }) {
  return {
    _id: id,
    salesPointId: pdv,
    status,
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
});
