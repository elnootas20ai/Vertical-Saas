import { describe, expect, it } from 'vitest';
import {
  buildTpvRegisterSummaryForDay,
  filterSessionTransactionsForDay,
  isLocalCalendarDay,
  isTpvMontajeBoardOrder,
  isTpvRepartoBoardOrder,
  localCalendarDayKey,
  orderInRegisterSession,
  orderLoadBoundsForOpenSession,
  orderOnOpenTpvOpsBoard,
  sessionActiveOnCalendarDay,
  tpvSessionBelongsToBusiness,
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
  it('starts at local midnight of the open day, not the exact openedAt clock', () => {
    const openedAt = '2026-06-16T20:00:00.000Z';
    const bounds = orderLoadBoundsForOpenSession(openedAt);
    expect(new Date(bounds.from).getTime()).toBeLessThanOrEqual(new Date(openedAt).getTime());
    expect(bounds.from).not.toBe(openedAt);
    expect(bounds.to).toBeTruthy();
  });
});

describe('orderOnOpenTpvOpsBoard', () => {
  const session = {
    openedAt: '2026-06-16T20:00:00.000Z',
    closedAt: '',
    status: 'open',
  };

  it('keeps open reparto orders created before openedAt but same local day', () => {
    // 15:00Z same calendar day in most EU timezones as 20:00Z open
    expect(
      orderOnOpenTpvOpsBoard(
        { createdAt: '2026-06-16T15:00:00.000Z', status: 'en_reparto' },
        session,
      ),
    ).toBe(true);
  });

  it('hides delivered / closed statuses from ops board', () => {
    expect(
      orderOnOpenTpvOpsBoard(
        { createdAt: '2026-06-16T21:00:00.000Z', status: 'entregado' },
        session,
      ),
    ).toBe(false);
  });
});

describe('isTpvMontajeBoardOrder / isTpvRepartoBoardOrder', () => {
  it('sends listo+assemblyCompletedAt to reparto column', () => {
    expect(isTpvMontajeBoardOrder({ status: 'listo' })).toBe(true);
    expect(isTpvRepartoBoardOrder({ status: 'listo' })).toBe(false);
    expect(isTpvMontajeBoardOrder({ status: 'listo', assemblyCompletedAt: '2026-06-16T21:00:00.000Z' })).toBe(false);
    expect(isTpvRepartoBoardOrder({ status: 'listo', assemblyCompletedAt: '2026-06-16T21:00:00.000Z' })).toBe(true);
    expect(isTpvRepartoBoardOrder({ status: 'en_reparto' })).toBe(true);
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

describe('tpvSessionBelongsToBusiness', () => {
  it('matches by business_id on session', () => {
    const pdvIds = new Set(['pdv-modomio']);
    expect(tpvSessionBelongsToBusiness({ business_id: 'biz-a', pointOfSaleId: 'pdv-modomio' }, 'biz-a', pdvIds)).toBe(true);
    expect(tpvSessionBelongsToBusiness({ business_id: 'biz-a', pointOfSaleId: 'pdv-modomio' }, 'biz-b', pdvIds)).toBe(false);
  });

  it('legacy session without business_id only if PDV belongs to company', () => {
    const modomioPdvs = new Set(['pdv-modomio']);
    expect(tpvSessionBelongsToBusiness({ pointOfSaleId: 'pdv-modomio', status: 'open' }, 'biz-modomio', modomioPdvs)).toBe(true);
    expect(
      tpvSessionBelongsToBusiness(
        { pointOfSaleId: 'pdv-modomio', status: 'open' },
        'biz-blackburger',
        new Set(['pdv-blackburger']),
      ),
    ).toBe(false);
  });
});

describe('isLocalCalendarDay', () => {
  it('matches local calendar day key', () => {
    const key = localCalendarDayKey(new Date(2026, 5, 17, 15, 0, 0));
    expect(isLocalCalendarDay(new Date(2026, 5, 17, 1, 0, 0).toISOString(), key)).toBe(true);
  });
});
