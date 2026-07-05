import { describe, expect, it } from 'vitest';
import {
  buildDiningTableTicketStatDocument,
  sanitizeDiningTableTicketStat,
} from '../services/salaService.js';
import {
  formatDurationMinutes,
  groupTableTicketStatsByTable,
  summarizeTableTicketStats,
} from '../src/app/lib/restaurantTableStats.ts';

describe('buildDiningTableTicketStatDocument', () => {
  it('computes duration from seatedAt to ticketAt', () => {
    const doc = buildDiningTableTicketStatDocument('user1', {
      tableId: 't1',
      tableNumber: 4,
      seatedAt: '2026-07-04T18:00:00.000Z',
      ticketAt: '2026-07-04T19:30:00.000Z',
      amount: 55.5,
    });
    expect(doc.type).toBe('dining_table_ticket_stat');
    expect(doc.durationMinutes).toBe(90);
    expect(doc.calendarDay).toBe('2026-07-04');
  });
});

describe('sanitizeDiningTableTicketStat', () => {
  it('maps stored doc to API shape', () => {
    const raw = buildDiningTableTicketStatDocument('user1', {
      tableNumber: 2,
      amount: 20,
    });
    const out = sanitizeDiningTableTicketStat(raw);
    expect(out.tableNumber).toBe(2);
    expect(out.amount).toBe(20);
    expect(out.userId).toBe('user1');
  });
});

describe('restaurantTableStats aggregates', () => {
  const rows = [
    {
      id: '1',
      tableId: 't1',
      tableNumber: 1,
      tableName: 'Mesa 1',
      seatedAt: '',
      ticketAt: '',
      durationMinutes: 60,
      amount: 40,
      itemCount: 3,
      guestCount: 2,
      calendarDay: '2026-07-04',
      deliveryOrderId: 'o1',
      ticketNumber: 'T1',
      pdvId: 'pdv1',
    },
    {
      id: '2',
      tableId: 't1',
      tableNumber: 1,
      tableName: 'Mesa 1',
      seatedAt: '',
      ticketAt: '',
      durationMinutes: 120,
      amount: 60,
      itemCount: 5,
      guestCount: 4,
      calendarDay: '2026-07-04',
      deliveryOrderId: 'o2',
      ticketNumber: 'T2',
      pdvId: 'pdv1',
    },
    {
      id: '3',
      tableId: 't2',
      tableNumber: 2,
      tableName: 'Mesa 2',
      seatedAt: '',
      ticketAt: '',
      durationMinutes: 45,
      amount: 30,
      itemCount: 2,
      guestCount: 2,
      calendarDay: '2026-07-04',
      deliveryOrderId: 'o3',
      ticketNumber: 'T3',
      pdvId: 'pdv1',
    },
  ];

  it('summarizes ticket count, amount and duration', () => {
    const s = summarizeTableTicketStats(rows);
    expect(s.ticketCount).toBe(3);
    expect(s.totalAmount).toBe(130);
    expect(s.avgDurationMinutes).toBe(75);
    expect(s.avgTicketAmount).toBe(43.3);
  });

  it('groups by table', () => {
    const grouped = groupTableTicketStatsByTable(rows);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].tableNumber).toBe(1);
    expect(grouped[0].ticketCount).toBe(2);
    expect(grouped[1].tableNumber).toBe(2);
  });

  it('formats duration for display', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(90)).toBe('1 h 30 min');
    expect(formatDurationMinutes(120)).toBe('2 h');
  });
});
