import { describe, expect, it } from 'vitest';
import {
  buildRestaurantOpsSnapshot,
  formatDwellMinutes,
} from '../src/app/verticals/restaurant/restaurantOpsSnapshot.ts';

function table(partial) {
  return {
    _id: 't1',
    id: 't1',
    type: 'dining_table',
    userId: 'u',
    businessId: 'biz',
    number: 1,
    name: 'M1',
    zone: '',
    zoneResponsible: '',
    capacity: 4,
    currentGuests: 0,
    gridW: 1,
    gridH: 1,
    x: 0,
    y: 0,
    status: 'available',
    occupiedAt: '',
    occupiedBy: '',
    sortOrder: 0,
    active: true,
    tags: [],
    ...partial,
  };
}

function order(partial) {
  return {
    _id: 'o1',
    id: 'o1',
    type: 'dining_order',
    userId: 'u',
    businessId: 'biz',
    tableId: 't1',
    tableNumber: 1,
    tableName: 'M1',
    zone: '',
    section: '',
    status: 'open',
    guests: 2,
    items: [],
    comandas: [],
    payments: [],
    ...partial,
  };
}

describe('buildRestaurantOpsSnapshot', () => {
  it('cuenta pipeline sala/cocina y alerta caja cerrada con mesas ocupadas', () => {
    const snap = buildRestaurantOpsSnapshot({
      dayKey: '2026-07-31',
      businessId: 'biz',
      nowMs: Date.parse('2026-07-31T12:00:00'),
      tables: [
        table({ _id: 'a', status: 'available' }),
        table({ _id: 'b', status: 'occupied', currentGuests: 3 }),
        table({ _id: 'c', status: 'pending_payment', currentGuests: 2 }),
      ],
      orders: [
        order({
          tableId: 'b',
          status: 'open',
          total: 10,
          comandas: [{
            id: 'c1',
            orderNumber: 1,
            status: 'in_preparation',
            sentToKitchenAt: '2026-07-31T11:30:00',
            readyAt: '',
            servedAt: '',
            createdBy: '',
            createdByName: '',
            createdAt: '',
            notes: '',
            items: [{ id: 'i1', name: 'Pasta', quantity: 1, status: 'pending', notes: '', modifiers: [], price: 10, productId: '', category: '', cancelledReason: '', cancelledBy: '' }],
          }],
        }),
        order({
          _id: 'o2',
          tableId: 'c',
          status: 'pending_payment',
          total: 8,
          comandas: [{
            id: 'c2',
            orderNumber: 2,
            status: 'served',
            sentToKitchenAt: '',
            readyAt: '',
            servedAt: '',
            createdBy: '',
            createdByName: '',
            createdAt: '',
            notes: '',
            items: [{ id: 'i2', name: 'Cafe', quantity: 1, status: 'served', notes: '', modifiers: [], price: 8, productId: '', category: '', cancelledReason: '', cancelledBy: '' }],
          }],
        }),
      ],
      sessions: [],
      waitlistActiveCount: 1,
    });

    expect(snap.pipeline.free).toBe(1);
    expect(snap.pipeline.occupied).toBe(2);
    expect(snap.pipeline.kitchen).toBe(1);
    expect(snap.pipeline.to_pay).toBeGreaterThanOrEqual(2);
    expect(snap.guests).toBe(5);
    expect(snap.cashOpen).toBe(0);
    expect(snap.alerts.some((a) => a.id === 'cash-closed')).toBe(true);
    expect(snap.alerts.find((a) => a.id === 'cash-closed')?.href).toBe('/saas/caja/tpv');
    expect(snap.alerts.find((a) => a.id === 'to-pay')?.href).toBe('/saas/caja/tpv');
    expect(snap.alerts.some((a) => a.id === 'waitlist')).toBe(true);
  });

  it('con 1 marca asigna todo el cobrado de hoy a esa marca', () => {
    const snap = buildRestaurantOpsSnapshot({
      dayKey: '2026-07-31',
      businessId: 'biz',
      nowMs: Date.parse('2026-07-31T14:00:00'),
      tables: [],
      orders: [
        order({
          _id: 'paid1',
          status: 'paid',
          total: 40,
          closedAt: '2026-07-31T13:00:00',
          paidAt: '2026-07-31T13:00:00',
          payments: [{ amount: 40, paidAt: '2026-07-31T13:00:00', method: 'card' }],
        }),
      ],
      sessions: [{ status: 'open', businessId: 'biz' }],
      brands: [{ _id: 'b1', id: 'b1', name: 'Casa', businessId: 'biz', active: true }],
      waitlistActiveCount: 0,
    });
    expect(snap.brands).toHaveLength(1);
    expect(snap.brands[0].label).toBe('Casa');
    expect(snap.brands[0].amount).toBe(40);
  });

  it('con varias marcas reparte por brandIds de líneas', () => {
    const snap = buildRestaurantOpsSnapshot({
      dayKey: '2026-07-31',
      businessId: 'biz',
      nowMs: Date.parse('2026-07-31T14:00:00'),
      tables: [],
      orders: [
        order({
          _id: 'paid2',
          status: 'paid',
          total: 30,
          closedAt: '2026-07-31T13:00:00',
          paidAt: '2026-07-31T13:00:00',
          payments: [{ amount: 30, paidAt: '2026-07-31T13:00:00', method: 'cash' }],
          comandas: [{
            id: 'c1',
            orderNumber: 1,
            status: 'served',
            sentToKitchenAt: '',
            readyAt: '',
            servedAt: '',
            createdBy: '',
            createdByName: '',
            createdAt: '',
            notes: '',
            items: [
              {
                id: 'i1', name: 'Burger', quantity: 1, status: 'served', notes: '', modifiers: [],
                price: 20, productId: '', category: '', cancelledReason: '', cancelledBy: '',
                brandIds: ['brand-a'],
              },
              {
                id: 'i2', name: 'Taco', quantity: 1, status: 'served', notes: '', modifiers: [],
                price: 10, productId: '', category: '', cancelledReason: '', cancelledBy: '',
                brandIds: ['brand-b'],
              },
            ],
          }],
        }),
      ],
      sessions: [{ status: 'open', businessId: 'biz' }],
      brands: [
        { _id: 'brand-a', id: 'brand-a', name: 'Burger', businessId: 'biz', active: true },
        { _id: 'brand-b', id: 'brand-b', name: 'Tacos', businessId: 'biz', active: true },
      ],
      waitlistActiveCount: 0,
    });
    expect(snap.brands).toHaveLength(2);
    const byId = Object.fromEntries(snap.brands.map((b) => [b.id, b.amount]));
    expect(byId['brand-a']).toBe(20);
    expect(byId['brand-b']).toBe(10);
  });

  it('cuenta minutos en mesa abiertas y cerradas hoy', () => {
    const snap = buildRestaurantOpsSnapshot({
      dayKey: '2026-07-31',
      businessId: 'biz',
      nowMs: Date.parse('2026-07-31T13:00:00'),
      tables: [
        table({
          _id: 't-open',
          status: 'occupied',
          currentGuests: 2,
          occupiedAt: '2026-07-31T12:15:00',
        }),
      ],
      orders: [
        order({
          _id: 'o-open',
          tableId: 't-open',
          status: 'open',
          createdAt: '2026-07-31T12:20:00',
          guests: 2,
          total: 12,
          comandas: [{
            id: 'c1',
            orderNumber: 1,
            status: 'open',
            sentToKitchenAt: '',
            readyAt: '',
            servedAt: '',
            createdBy: '',
            createdByName: '',
            createdAt: '',
            notes: '',
            items: [{ id: 'i1', name: 'Tapa', quantity: 1, status: 'pending', notes: '', modifiers: [], price: 12, productId: '', category: '', cancelledReason: '', cancelledBy: '' }],
          }],
        }),
        order({
          _id: 'o-closed',
          tableId: 't2',
          tableName: 'M2',
          status: 'closed',
          createdAt: '2026-07-31T11:00:00',
          closedAt: '2026-07-31T12:00:00',
          paidAt: '2026-07-31T12:00:00',
          guests: 4,
        }),
      ],
      sessions: [{ status: 'open', businessId: 'biz' }],
      brands: [],
      waitlistActiveCount: 0,
    });

    const open = snap.tableDwells.find((d) => d.status === 'open');
    const closed = snap.tableDwells.find((d) => d.status === 'closed');
    expect(open?.minutes).toBe(45); // occupiedAt 12:15 → 13:00
    expect(closed?.minutes).toBe(60);
    expect(snap.avgClosedDwellMinutes).toBe(60);
    expect(formatDwellMinutes(75)).toBe('1h 15m');
  });

  it('no cuenta mesa ocupada sin pedido TPV (status colgado)', () => {
    const snap = buildRestaurantOpsSnapshot({
      dayKey: '2026-08-19',
      businessId: 'biz',
      nowMs: Date.parse('2026-08-19T12:00:00'),
      tables: [
        table({
          _id: 'ghost',
          status: 'occupied',
          currentGuests: 2,
          occupiedAt: '2026-08-18T20:32:00',
        }),
      ],
      orders: [
        order({
          tableId: 'ghost',
          status: 'open',
          total: 0,
          comandas: [],
        }),
      ],
      sessions: [],
      waitlistActiveCount: 0,
    });
    expect(snap.pipeline.occupied).toBe(0);
    expect(snap.pipeline.free).toBe(1);
    expect(snap.guests).toBe(0);
    expect(snap.tableDwells.filter((d) => d.status === 'open')).toHaveLength(0);
    expect(snap.alerts.some((a) => a.id === 'cash-closed')).toBe(false);
  });
});

describe('scopeRestaurantOpsByPdv', () => {
  it('filtra mesas y turnos por PDV de la zona', async () => {
    const { scopeRestaurantOpsByPdv } = await import(
      '../src/app/verticals/restaurant/restaurantOpsSnapshot.ts'
    );
    const rooms = [
      { id: 'r1', name: 'Salón A', pdvId: 'pdv-a' },
      { id: 'r2', name: 'Salón B', pdvId: 'pdv-b' },
    ];
    const scoped = scopeRestaurantOpsByPdv({
      tables: [
        table({ _id: 't-a', roomId: 'r1', status: 'occupied' }),
        table({ _id: 't-b', roomId: 'r2', status: 'available' }),
      ],
      orders: [
        order({ _id: 'o-a', tableId: 't-a' }),
        order({ _id: 'o-b', tableId: 't-b' }),
      ],
      sessions: [
        { status: 'open', pointOfSaleId: 'pdv-a', businessId: 'biz' },
        { status: 'open', pointOfSaleId: 'pdv-b', businessId: 'biz' },
      ],
      rooms,
      pdvId: 'pdv-a',
    });
    expect(scoped.tables.map((t) => t._id)).toEqual(['t-a']);
    expect(scoped.orders.map((o) => o._id)).toEqual(['o-a']);
    expect(scoped.sessions).toHaveLength(1);
    expect(scoped.sessions[0].pointOfSaleId).toBe('pdv-a');
  });
});
