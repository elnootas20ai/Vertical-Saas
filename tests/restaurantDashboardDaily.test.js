import { describe, expect, it } from 'vitest';
import { buildRestaurantDailyRows } from '../src/app/verticals/restaurant/dashboard/RestaurantDailyPerformancePanel.tsx';

function order(overrides = {}) {
  return {
    _id: overrides._id || 'order-1',
    status: 'paid',
    businessId: 'biz-restaurant',
    paidAt: '2026-09-10T20:00:00.000Z',
    total: 50,
    guests: 2,
    ...overrides,
  };
}

describe('restaurant dashboard día a día', () => {
  it('rellena los siete días y agrega ventas, cuentas, comensales y ticket medio', () => {
    const rows = buildRestaurantDailyRows(
      [
        order(),
        order({ _id: 'order-2', total: 30, guests: 3 }),
        order({ _id: 'order-3', paidAt: '2026-09-11T13:00:00.000Z', total: 20, guests: 1 }),
      ],
      'biz-restaurant',
      7,
      '2026-09-11',
    );

    expect(rows).toHaveLength(7);
    expect(rows.at(-2)).toMatchObject({
      day: '2026-09-10',
      sales: 80,
      tickets: 2,
      guests: 5,
      avgTicket: 40,
    });
    expect(rows.at(-1)).toMatchObject({ day: '2026-09-11', sales: 20, tickets: 1 });
  });

  it('excluye otra empresa, anuladas y fechas fuera del rango', () => {
    const rows = buildRestaurantDailyRows(
      [
        order({ businessId: 'otra-empresa', total: 100 }),
        order({ status: 'cancelled', total: 100 }),
        order({ paidAt: '2026-08-01T10:00:00.000Z', total: 100 }),
      ],
      'biz-restaurant',
      7,
      '2026-09-11',
    );

    expect(rows.reduce((sum, row) => sum + row.sales, 0)).toBe(0);
  });
});
