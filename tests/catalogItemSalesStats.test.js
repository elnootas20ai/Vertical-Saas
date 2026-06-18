import { describe, expect, it } from 'vitest';
import { computeCatalogItemSalesStats } from '../src/app/lib/catalogItemSalesStats.ts';

describe('catalogItemSalesStats', () => {
  it('suma unidades e ingresos por catalogItemId', () => {
    const item = { _id: 'p1', name: 'Margarita', category: 'Pizzas' };
    const orders = [
      {
        status: 'entregado',
        createdAt: '2026-06-18T12:00:00.000Z',
        items: [{ catalogItemId: 'p1', name: 'Margarita', quantity: 2, unitPrice: 9.5, total: 19 }],
      },
      {
        status: 'cancelled',
        createdAt: '2026-06-18T13:00:00.000Z',
        items: [{ catalogItemId: 'p1', name: 'Margarita', quantity: 5, unitPrice: 9.5, total: 47.5 }],
      },
    ];
    const stats = computeCatalogItemSalesStats(item, orders, new Date('2026-06-18T15:00:00.000Z'));
    expect(stats.totalUnits).toBe(2);
    expect(stats.totalRevenue).toBe(19);
    expect(stats.orderCount).toBe(1);
    expect(stats.todayUnits).toBe(2);
  });
});
