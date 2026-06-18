import { describe, expect, it } from 'vitest';
import {
  buildTpvRegisterSummaryForDay,
  filterSessionTransactionsForDay,
  isLocalCalendarDay,
  localCalendarDayKey,
  orderInRegisterSession,
  orderLoadBoundsForOpenSession,
  sessionActiveOnCalendarDay,
} from '../src/app/lib/tpvCajaScope.js';

describe('sessionActiveOnCalendarDay', () => {
  const session = {
    openedAt: '2026-06-16T20:00:00.000Z',
    closedAt: '',
    status: 'open',
    transactions: [],
  };

  it('includes intermediate days while session stays open', () => {
    expect(sessionActiveOnCalendarDay(session, '2026-06-16', new Date('2026-06-18T10:00:00'))).toBe(true);
    expect(sessionActiveOnCalendarDay(session, '2026-06-17', new Date('2026-06-18T10:00:00'))).toBe(true);
    expect(sessionActiveOnCalendarDay(session, '2026-06-18', new Date('2026-06-18T10:00:00'))).toBe(true);
    expect(sessionActiveOnCalendarDay(session, '2026-06-15', new Date('2026-06-18T10:00:00'))).toBe(false);
  });
});

describe('orderInRegisterSession', () => {
  const session = {
    openedAt: '2026-06-16T20:00:00.000Z',
    closedAt: '',
    status: 'open',
  };

  it('excludes orders when there is no open register session', () => {
    expect(orderInRegisterSession({ createdAt: '2026-06-17T12:00:00.000Z' }, null)).toBe(false);
    expect(orderInRegisterSession({ createdAt: '2026-06-17T12:00:00.000Z' }, { openedAt: '', closedAt: '', status: 'open' })).toBe(false);
  });

  it('includes orders after session open even on another calendar day', () => {
    expect(orderInRegisterSession({ createdAt: '2026-06-17T12:00:00.000Z' }, session)).toBe(true);
    expect(orderInRegisterSession({ createdAt: '2026-06-16T10:00:00.000Z' }, session)).toBe(false);
  });
});

describe('orderLoadBoundsForOpenSession', () => {
  it('starts at session open, not midnight today', () => {
    const bounds = orderLoadBoundsForOpenSession('2026-06-16T20:00:00.000Z');
    expect(bounds.from).toBe('2026-06-16T20:00:00.000Z');
    expect(bounds.to).toBeTruthy();
  });
});

describe('buildTpvRegisterSummaryForDay', () => {
  it('only sums transactions on the selected day', () => {
    const session = {
      initialCashAmount: 0,
      transactions: [
        { type: 'sale', paymentMethod: 'efectivo', amount: 10, date: '2026-06-16T21:00:00.000Z' },
        { type: 'sale', paymentMethod: 'efectivo', amount: 20, date: '2026-06-17T21:00:00.000Z' },
      ],
    };
    const day16 = buildTpvRegisterSummaryForDay(session, '2026-06-16');
    const day17 = buildTpvRegisterSummaryForDay(session, '2026-06-17');
    expect(day16.totalSales).toBe(10);
    expect(day17.totalSales).toBe(20);
    expect(filterSessionTransactionsForDay(session, '2026-06-17')).toHaveLength(1);
  });
});

describe('isLocalCalendarDay', () => {
  it('matches local calendar day key', () => {
    const key = localCalendarDayKey(new Date(2026, 5, 17, 15, 0, 0));
    expect(isLocalCalendarDay(new Date(2026, 5, 17, 1, 0, 0).toISOString(), key)).toBe(true);
  });
});
