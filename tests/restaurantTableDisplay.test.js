import { describe, expect, it } from 'vitest';
import { resolveRestaurantTableLiveInfo, openOrdersByTableId } from '../src/app/lib/restaurantTableDisplay.ts';

describe('resolveRestaurantTableLiveInfo', () => {
  it('shows cuenta abierta when open dining order exists', () => {
    const table = {
      _id: 't1',
      status: 'occupied',
      number: 5,
      capacity: 4,
      occupiedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    };
    const live = resolveRestaurantTableLiveInfo(table, {
      id: 'o1',
      _id: 'o1',
      tableId: 't1',
      status: 'open',
      total: 42.5,
      comandas: [{ items: [{ quantity: 2 }] }],
    });
    expect(live.visualStatus).toBe('pending_payment');
    expect(live.hasOpenAccount).toBe(true);
    expect(live.openTotal).toBe(42.5);
  });

  it('maps occupied table without order', () => {
    const live = resolveRestaurantTableLiveInfo({
      _id: 't2',
      status: 'occupied',
      number: 2,
      capacity: 2,
      occupiedAt: new Date().toISOString(),
    });
    expect(live.visualStatus).toBe('occupied');
    expect(live.hasOpenAccount).toBe(false);
  });
});

describe('openOrdersByTableId', () => {
  it('keeps latest open order per table', () => {
    const map = openOrdersByTableId([
      { tableId: 't1', status: 'open', total: 10, createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z' },
      { tableId: 't1', status: 'open', total: 20, createdAt: '2026-01-01T11:00:00Z', updatedAt: '2026-01-01T11:00:00Z' },
      { tableId: 't2', status: 'closed', total: 5, createdAt: '2026-01-01T09:00:00Z' },
    ]);
    expect(map.get('t1')?.total).toBe(20);
    expect(map.has('t2')).toBe(false);
  });
});
