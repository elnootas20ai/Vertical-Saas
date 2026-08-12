import { describe, expect, it } from 'vitest';
import {
  buildDeliveryOpsInsights,
  isQuickAttentionLostOrder,
  peakOverlap,
  unionBusyMinutes,
} from '../src/app/verticals/delivery/deliveryOpsInsights.ts';

describe('deliveryOpsInsights', () => {
  it('detecta pérdida atención rápida solo nombre', () => {
    expect(
      isQuickAttentionLostOrder({
        clientId: '',
        customerName: 'Ana',
        customerPhone: '',
      }),
    ).toBe(true);
    expect(
      isQuickAttentionLostOrder({
        clientId: 'client:1',
        customerName: 'Ana',
        customerPhone: '612345678',
      }),
    ).toBe(false);
  });

  it('une intervalos solapados (10 pedidos en ~30 min de reloj)', () => {
    const t0 = Date.parse('2026-08-04T12:00:00.000Z');
    const intervals = Array.from({ length: 10 }, (_, i) => ({
      startMs: t0 + i * 60_000, // cada uno empieza 1 min después
      endMs: t0 + i * 60_000 + 20 * 60_000, // 20 min prep cada uno
    }));
    // Primer start 12:00, último end 12:09+20 = 12:29 → ~29 min busy
    const busy = unionBusyMinutes(intervals);
    expect(busy).toBeGreaterThan(25);
    expect(busy).toBeLessThan(35);
    expect(peakOverlap(intervals)).toBeGreaterThanOrEqual(9);
  });

  it('desglosa por tienda y calcula ritmo con solape', () => {
    const today = '2026-08-04';
    const base = {
      status: 'entregado',
      kitchenStartedAt: '2026-08-04T12:00:00.000Z',
      kitchenCompletedAt: '2026-08-04T12:15:00.000Z',
      assemblyStartedAt: '2026-08-04T12:15:00.000Z',
      assemblyCompletedAt: '2026-08-04T12:20:00.000Z',
      departedAt: '2026-08-04T12:20:00.000Z',
      deliveredAt: '2026-08-04T12:35:00.000Z',
      createdAt: '2026-08-04T11:55:00.000Z',
      customerName: 'A',
      customerPhone: '612345678',
      clientId: 'c1',
      items: [{ name: 'Margarita', category: 'Pizzas', quantity: 1 }],
    };

    const insights = buildDeliveryOpsInsights(
      [
        { ...base, salesPointId: 'pdv-a', salesPointName: 'Tienda A' },
        {
          ...base,
          salesPointId: 'pdv-a',
          salesPointName: 'Tienda A',
          kitchenStartedAt: '2026-08-04T12:05:00.000Z',
          kitchenCompletedAt: '2026-08-04T12:20:00.000Z',
          assemblyStartedAt: '2026-08-04T12:20:00.000Z',
          assemblyCompletedAt: '2026-08-04T12:25:00.000Z',
          departedAt: '2026-08-04T12:25:00.000Z',
          deliveredAt: '2026-08-04T12:40:00.000Z',
          createdAt: '2026-08-04T12:00:00.000Z',
        },
        {
          ...base,
          salesPointId: 'pdv-b',
          salesPointName: 'Tienda B',
          kitchenStartedAt: '2026-08-04T12:00:00.000Z',
          kitchenCompletedAt: '2026-08-04T12:10:00.000Z',
          assemblyStartedAt: '2026-08-04T12:10:00.000Z',
          assemblyCompletedAt: '2026-08-04T12:15:00.000Z',
          departedAt: '2026-08-04T12:15:00.000Z',
          deliveredAt: '2026-08-04T12:30:00.000Z',
          createdAt: '2026-08-04T11:50:00.000Z',
        },
      ],
      'day',
      today,
      [
        { id: 'pdv-a', name: 'Tienda A' },
        { id: 'pdv-b', name: 'Tienda B' },
      ],
    );

    expect(insights.byStore).toHaveLength(2);
    expect(insights.byStore.map((s) => s.storeName).sort()).toEqual(['Tienda A', 'Tienda B']);
    expect(insights.overall.deliveredCount).toBe(3);

    const storeA = insights.byStore.find((s) => s.storeId === 'pdv-a');
    expect(storeA?.deliveredCount).toBe(2);
    expect(storeA?.parallelFactor).toBeGreaterThan(1);
    expect(storeA?.ordersPerBusyHour).not.toBeNull();
    expect(insights.prepBaselineMin).toBe(20);
    expect(insights.orderBaselineMin).toBe(30);
  });

  it('rango semana compara vs 7 días anteriores', () => {
    const today = '2026-08-04';
    const mk = (day, salesPointId = 'pdv-a') => ({
      status: 'entregado',
      salesPointId,
      salesPointName: 'Tienda A',
      kitchenStartedAt: `${day}T12:00:00.000Z`,
      kitchenCompletedAt: `${day}T12:15:00.000Z`,
      assemblyStartedAt: `${day}T12:15:00.000Z`,
      assemblyCompletedAt: `${day}T12:20:00.000Z`,
      departedAt: `${day}T12:20:00.000Z`,
      deliveredAt: `${day}T12:35:00.000Z`,
      createdAt: `${day}T11:55:00.000Z`,
      customerName: 'A',
      customerPhone: '612345678',
      clientId: 'c1',
      items: [{ name: 'Margarita', category: 'Pizzas', quantity: 1 }],
    });

    const insights = buildDeliveryOpsInsights(
      [
        mk('2026-08-04'), // semana actual
        mk('2026-08-01'), // semana actual
        mk('2026-07-28'), // semana anterior (hoy-7)
        mk('2026-07-25'), // semana anterior
        mk('2026-07-20'), // fuera
      ],
      'week',
      today,
      [{ id: 'pdv-a', name: 'Tienda A' }],
    );

    expect(insights.range).toBe('week');
    expect(insights.vsLabel).toBe('vs sem. ant.');
    expect(insights.overall.deliveredCount).toBe(2);
    expect(insights.overall.deliveredPrevCount).toBe(2);
  });
});
