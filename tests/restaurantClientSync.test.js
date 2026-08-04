import { describe, expect, it } from 'vitest';
import {
  enrichClientRowWithLiveDiningStats,
  filterCrmDiningOrders,
  mergeClientLiveStats,
} from '../services/restaurantClientSync.js';

describe('restaurantClientSync', () => {
  it('filtra solo cuentas de mesa cobradas/cerradas del negocio', () => {
    const rows = filterCrmDiningOrders(
      [
        { _id: '1', status: 'closed', total: 20, businessId: 'biz-a', clientId: 'c1' },
        { _id: '2', status: 'open', total: 10, businessId: 'biz-a', clientId: 'c1' },
        { _id: '3', status: 'paid', total: 15, businessId: 'biz-b', clientId: 'c1' },
        { _id: '4', status: 'cancelled', total: 9, businessId: 'biz-a', clientId: 'c1' },
      ],
      'biz-a',
    );
    expect(rows.map((r) => r._id)).toEqual(['1']);
  });

  it('enriquece fila CRM con gasto de sala', () => {
    const row = enrichClientRowWithLiveDiningStats(
      { id: 'c1', phone: '600111222', stats: {}, loyalty: {} },
      [
        {
          clientId: 'c1',
          status: 'closed',
          total: 33.5,
          closedAt: '2026-08-01T12:00:00.000Z',
          payments: [{ amount: 33.5 }],
        },
      ],
    );
    expect(row.stats.totalOrders).toBe(1);
    expect(row.stats.totalSpent).toBe(33.5);
    expect(row.stats.lastOrderDate).toBe('2026-08-01T12:00:00.000Z');
  });

  it('suma stats delivery + sala', () => {
    const base = { id: 'c1', stats: {}, loyalty: {} };
    const fromDelivery = {
      ...base,
      stats: { totalOrders: 2, totalSpent: 40, lastOrderDate: '2026-07-01T10:00:00.000Z' },
      loyalty: { enrolled: true, points: 40 },
    };
    const fromDining = {
      ...base,
      stats: { totalOrders: 1, totalSpent: 12, lastOrderDate: '2026-08-01T10:00:00.000Z' },
      loyalty: { enrolled: true, points: 12 },
    };
    const merged = mergeClientLiveStats(base, fromDelivery, fromDining);
    expect(merged.stats.totalOrders).toBe(3);
    expect(merged.stats.totalSpent).toBe(52);
    expect(merged.stats.lastOrderDate).toBe('2026-08-01T10:00:00.000Z');
  });
});
