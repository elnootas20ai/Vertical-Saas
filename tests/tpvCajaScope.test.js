import { describe, expect, it } from 'vitest';
import {
  buildTpvRegisterSummaryForDay,
  filterSessionTransactionsForDay,
  isLocalCalendarDay,
  isTpvMontajeBoardOrder,
  isTpvRepartoBoardOrder,
  localCalendarDayKey,
  mergeTpvRegisterSessionsPreservingOpen,
  orderInRegisterSession,
  orderLoadBoundsForOpenSession,
  orderOnOpenTpvOpsBoard,
  resolveActiveTpvRegisterSession,
  findLastClosedTpvSession,
  resolvePreviousCloseCashAmount,
  sessionActiveOnCalendarDay,
  tpvSessionBelongsToBusiness,
} from '../src/app/lib/tpvCajaScope.js';

describe('mergeTpvRegisterSessionsPreservingOpen', () => {
  const openA = { _id: 's-open', status: 'open', pointOfSaleId: 'pdv-1', openedAt: '2026-07-20T08:00:00.000Z' };
  const closedA = { _id: 's-open', status: 'closed', pointOfSaleId: 'pdv-1', openedAt: '2026-07-20T08:00:00.000Z' };
  const closedOther = { _id: 's-old', status: 'closed', pointOfSaleId: 'pdv-1', openedAt: '2026-07-19T08:00:00.000Z' };

  it('keeps previous list when next is empty', () => {
    expect(mergeTpvRegisterSessionsPreservingOpen([openA], [])).toEqual([openA]);
  });

  it('keeps a locally open session missing from next (API/filter glitch)', () => {
    const merged = mergeTpvRegisterSessionsPreservingOpen([openA], [closedOther]);
    expect(merged).toEqual([closedOther, openA]);
  });

  it('respects server close when the same id comes back closed', () => {
    const merged = mergeTpvRegisterSessionsPreservingOpen([openA], [closedA, closedOther]);
    expect(merged.find((s) => s._id === 's-open')?.status).toBe('closed');
    expect(merged.filter((s) => s._id === 's-open')).toHaveLength(1);
  });
});

describe('resolveActiveTpvRegisterSession', () => {
  const pdvs = [{ _id: 'pdv-1', workCenterId: 'wc-1' }, { _id: 'pdv-2', workCenterId: 'wc-2' }];
  const openPdv1 = { _id: 's1', status: 'open', pointOfSaleId: 'pdv-1', openedAt: '2026-07-20T08:00:00.000Z' };
  const openWc1 = { _id: 's1', status: 'open', pointOfSaleId: 'wc-1', openedAt: '2026-07-20T08:00:00.000Z' };

  it('holds sticky on tablet even when pick momentarily fails to match', () => {
    const r = resolveActiveTpvRegisterSession({
      sessions: [openPdv1],
      sticky: openPdv1,
      pickId: 'pdv-missing',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: true,
    });
    expect(r.session?._id).toBe('s1');
  });

  it('matches workCenterId ↔ pdvId', () => {
    const r = resolveActiveTpvRegisterSession({
      sessions: [openWc1],
      sticky: null,
      pickId: 'pdv-1',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: false,
    });
    expect(r.session?._id).toBe('s1');
  });

  it('CEO without order flow: other store without open caja → null session', () => {
    const r = resolveActiveTpvRegisterSession({
      sessions: [openPdv1],
      sticky: openPdv1,
      pickId: 'pdv-2',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: false,
    });
    expect(r.session).toBeNull();
    expect(r.nextSticky?._id).toBe('s1');
  });

  it('CEO mid-order (holdSticky): keeps caja when pick flickers to another store', () => {
    const r = resolveActiveTpvRegisterSession({
      sessions: [openPdv1],
      sticky: openPdv1,
      pickId: 'pdv-2',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: true,
    });
    expect(r.session?._id).toBe('s1');
  });

  it('prefers newest open session for the same store (not an ancient July open)', () => {
    const july6 = {
      _id: 's-old',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: '2026-07-06T10:00:00.000Z',
    };
    const today = {
      _id: 's-new',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: '2026-07-22T09:00:00.000Z',
    };
    const r = resolveActiveTpvRegisterSession({
      sessions: [july6, today],
      sticky: null,
      pickId: 'pdv-1',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: false,
    });
    expect(r.session?._id).toBe('s-new');
  });

  it('after exit (no sticky), still picks newest even if July 6 is listed first', () => {
    const july6 = {
      _id: 's-old',
      status: 'open',
      pointOfSaleId: 'wc-1',
      openedAt: '2026-07-06T10:00:00.000Z',
    };
    const today = {
      _id: 's-new',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: '2026-07-22T11:00:00.000Z',
    };
    const r = resolveActiveTpvRegisterSession({
      sessions: [july6, today],
      sticky: null,
      pickId: 'pdv-1',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: true,
    });
    expect(r.session?._id).toBe('s-new');
  });
});

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

  it('keeps recogida in montaje until delivered (no repartidor)', () => {
    expect(isTpvMontajeBoardOrder({ status: 'listo', deliveryType: 'recogida' })).toBe(true);
    expect(isTpvRepartoBoardOrder({ status: 'listo', deliveryType: 'recogida', assemblyCompletedAt: '2026-06-16T21:00:00.000Z' })).toBe(false);
    expect(isTpvMontajeBoardOrder({ status: 'en_reparto', deliveryType: 'recogida' })).toBe(true);
    expect(isTpvRepartoBoardOrder({ status: 'en_reparto', deliveryType: 'recogida' })).toBe(false);
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

describe('findLastClosedTpvSession', () => {
  const pdvs = [{ _id: 'pdv-1', workCenterId: 'wc-1' }];
  const closedTablet = {
    _id: 'c1',
    status: 'closed',
    pointOfSaleId: 'pdv-1',
    terminalId: 'tablet-pdv-1',
    closedAt: '2026-07-20T22:00:00.000Z',
    finalCashAmount: 50,
  };
  const closedTpv = {
    _id: 'c2',
    status: 'closed',
    pointOfSaleId: 'pdv-1',
    terminalId: 'term-1',
    closedAt: '2026-07-21T08:00:00.000Z',
    finalCashAmount: 80,
  };

  it('prefers same terminal when available', () => {
    const last = findLastClosedTpvSession([closedTablet, closedTpv], 'pdv-1', 'tablet-pdv-1', pdvs);
    expect(last?._id).toBe('c1');
    expect(resolvePreviousCloseCashAmount(last)).toBe(50);
  });

  it('falls back to latest close of the same store if terminal differs', () => {
    const last = findLastClosedTpvSession([closedTablet], 'pdv-1', 'term-1', pdvs);
    expect(last?._id).toBe('c1');
    expect(resolvePreviousCloseCashAmount(last)).toBe(50);
  });

  it('picks most recent store close when no terminal match', () => {
    const last = findLastClosedTpvSession([closedTablet, closedTpv], 'pdv-1', 'other-term', pdvs);
    expect(last?._id).toBe('c2');
    expect(resolvePreviousCloseCashAmount(last)).toBe(80);
  });
});
