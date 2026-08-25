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
  findLastClosedTpvSessionForStoreOpening,
  resolveOpeningFondoHint,
  pickNewestClosedTpvSession,
  resolvePreviousCloseCashAmount,
  previousCloseCashIsNextDayInitial,
  cashWithdrawnAtClose,
  sumCashWithdrawnAtClose,
  sessionActiveOnCalendarDay,
  sessionBelongsToCajaDay,
  sessionWorkDayKey,
  buildTpvRegisterSummaryForDay,
  shouldKeepTpvSessionInClientList,
  tpvSessionBelongsToBusiness,
  tpvSessionMatchesStoreRef,
  canEnterTpvOrderFlow,
  writeTpvOpenRegisterLatch,
  pickNewestOpenRegisterSessionForStore,
  filterSessionsForTabletStore,
  resolveTpvStoreAlternateRefs,
} from '../src/app/lib/tpvCajaScope.js';
import { filterTpvRegisterSessionsForBusiness } from '../services/couchdb.js';

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

  it('drops stale open when a newer closed session exists for the same store', () => {
    const staleOpen = {
      _id: 's-stale-open',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: '2026-07-19T08:00:00.000Z',
    };
    const newerClosed = {
      _id: 's-closed-today',
      status: 'closed',
      pointOfSaleId: 'pdv-1',
      openedAt: '2026-07-19T08:00:00.000Z',
      closedAt: '2026-07-20T22:00:00.000Z',
    };
    const merged = mergeTpvRegisterSessionsPreservingOpen([staleOpen], [newerClosed]);
    expect(merged.find((s) => s._id === 's-stale-open')).toBeUndefined();
    expect(merged).toEqual([newerClosed]);
  });
});

describe('resolveActiveTpvRegisterSession', () => {
  const pdvs = [{ _id: 'pdv-1', workCenterId: 'wc-1' }, { _id: 'pdv-2', workCenterId: 'wc-2' }];
  const todayIso = new Date().toISOString();
  const openPdv1 = { _id: 's1', status: 'open', pointOfSaleId: 'pdv-1', openedAt: todayIso };
  const openWc1 = { _id: 's1', status: 'open', pointOfSaleId: 'wc-1', openedAt: todayIso };

  it('empareja sesión por workCenterId extra (binding tablet antes de hidratar PDV)', () => {
    const session = { pointOfSaleId: 'wc-real-mataro', status: 'open' };
    const stubPdvs = [{ _id: 'pdv-mataro', workCenterId: 'wc-tablet-pdv-mataro' }];
    expect(
      tpvSessionMatchesStoreRef(session, 'pdv-mataro', stubPdvs, ['wc-real-mataro']),
    ).toBe(true);
    expect(tpvSessionMatchesStoreRef(session, 'pdv-mataro', stubPdvs, [])).toBe(false);
  });

  it('pickNewest matchea por alternateRefs sin PDVs hidratados', () => {
    const session = {
      _id: 's1',
      status: 'open',
      pointOfSaleId: 'wc-real-mataro',
      openedAt: '2026-08-12T10:00:00.000Z',
    };
    const found = pickNewestOpenRegisterSessionForStore(
      [session],
      'pdv-mataro',
      [],
      ['wc-real-mataro', 'pdv-mataro'],
    );
    expect(found?._id).toBe('s1');
  });

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

  it('CEO: pick desconocido no suelta la caja (evita parpadeo)', () => {
    const r = resolveActiveTpvRegisterSession({
      sessions: [openPdv1],
      sticky: openPdv1,
      pickId: 'pdv-missing',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: false,
    });
    expect(r.session?._id).toBe('s1');
    expect(r.nextSticky?._id).toBe('s1');
  });

  it('CEO: sin PDVs cargados no suelta sticky (match WC↔PDV incompleto)', () => {
    const r = resolveActiveTpvRegisterSession({
      sessions: [openWc1],
      sticky: openWc1,
      pickId: 'pdv-1',
      pointsOfSale: [],
      holdStickyWhileOpen: false,
    });
    expect(r.session?._id).toBe('s1');
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
    const now = new Date();
    const todayIso = now.toISOString();
    const old = new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000).toISOString();
    const july6 = {
      _id: 's-old',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: old,
    };
    const today = {
      _id: 's-new',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: todayIso,
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

  it('after exit (no sticky), still picks newest even if ancient open is listed first', () => {
    const now = new Date();
    const todayIso = now.toISOString();
    const old = new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000).toISOString();
    const july6 = {
      _id: 's-old',
      status: 'open',
      pointOfSaleId: 'wc-1',
      openedAt: old,
    };
    const today = {
      _id: 's-new',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: todayIso,
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

  it('keeps remembering open session until closed (even multi-day)', () => {
    const old = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    const july6 = {
      _id: 's-old',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: old,
    };
    const r = resolveActiveTpvRegisterSession({
      sessions: [july6],
      sticky: july6,
      pickId: 'pdv-1',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: true,
    });
    expect(r.session?._id).toBe('s-old');
    expect(r.nextSticky?._id).toBe('s-old');
  });

  it('recovers open session from last night (past midnight)', () => {
    const lastNight = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const overnight = {
      _id: 's-night',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      openedAt: lastNight,
    };
    const r = resolveActiveTpvRegisterSession({
      sessions: [overnight],
      sticky: null,
      pickId: 'pdv-1',
      pointsOfSale: pdvs,
      holdStickyWhileOpen: true,
    });
    expect(r.session?._id).toBe('s-night');
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

describe('sessionBelongsToCajaDay / cierre al día siguiente', () => {
  it('caja cerrada al día siguiente solo cuenta en el día de apertura', () => {
    const closed = {
      openedAt: '2026-06-16T18:00:00.000+02:00',
      closedAt: '2026-06-17T01:30:00.000+02:00',
      status: 'closed',
      transactions: [
        { type: 'sale', amount: 40, date: '2026-06-16T20:00:00.000+02:00' },
        { type: 'sale', amount: 10, date: '2026-06-17T00:45:00.000+02:00' },
      ],
    };
    expect(sessionWorkDayKey(closed)).toBe('2026-06-16');
    expect(sessionBelongsToCajaDay(closed, '2026-06-16')).toBe(true);
    expect(sessionBelongsToCajaDay(closed, '2026-06-17')).toBe(false);
    // Totales del turno completo en el día de apertura
    const summary = buildTpvRegisterSummaryForDay(closed, '2026-06-16');
    expect(summary.totalSales).toBe(50);
  });

  it('caja aún abierta sigue visible al día siguiente para poder cerrarla', () => {
    const open = {
      openedAt: '2026-06-16T18:00:00.000+02:00',
      closedAt: '',
      status: 'open',
      transactions: [],
    };
    expect(sessionBelongsToCajaDay(open, '2026-06-16', new Date('2026-06-17T10:00:00+02:00'))).toBe(true);
    expect(sessionBelongsToCajaDay(open, '2026-06-17', new Date('2026-06-17T10:00:00+02:00'))).toBe(true);
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

  it('fechas inválidas no meten el pedido en el turno', () => {
    expect(orderInRegisterSession(
      { createdAt: 'no-es-fecha' },
      { openedAt: '2026-06-16T20:00:00.000Z', status: 'open' },
    )).toBe(false);
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

  it('no reaparece montaje/reparto del turno anterior al reabrir (createdAt < openedAt)', () => {
    expect(
      orderOnOpenTpvOpsBoard(
        { createdAt: '2026-06-16T15:00:00.000Z', status: 'en_reparto' },
        session,
      ),
    ).toBe(false);
    expect(
      orderOnOpenTpvOpsBoard(
        { createdAt: '2026-06-16T20:30:00.000Z', status: 'listo' },
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
    expect(
      tpvSessionBelongsToBusiness(
        { business_id: 'business:biz-a', pointOfSaleId: 'pdv-modomio' },
        'biz-a',
        pdvIds,
      ),
    ).toBe(true);
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

describe('shouldKeepTpvSessionInClientList + filter open with wrong business_id', () => {
  const pdvs = [{ _id: 'pdv-pizzeria', workCenterId: 'wc-pizzeria' }];

  it('keeps open session on visible PDV even if business_id is another vertical', () => {
    const openWrongBiz = {
      _id: 's-open',
      status: 'open',
      pointOfSaleId: 'pdv-pizzeria',
      business_id: 'biz-realsate',
    };
    expect(shouldKeepTpvSessionInClientList(openWrongBiz, pdvs, 'biz-pizzeria')).toBe(true);
    expect(
      filterTpvRegisterSessionsForBusiness([openWrongBiz], 'biz-pizzeria', new Set(['pdv-pizzeria'])),
    ).toEqual([openWrongBiz]);
  });

  it('keeps closed session on visible PDV for fondo (business_id desincronizado)', () => {
    const closedWrongBiz = {
      _id: 's-closed',
      status: 'closed',
      pointOfSaleId: 'pdv-pizzeria',
      business_id: 'biz-realsate',
      closedAt: '2026-08-23T22:00:00.000Z',
      nextDayInitialCash: 120,
    };
    expect(shouldKeepTpvSessionInClientList(closedWrongBiz, pdvs, 'biz-pizzeria')).toBe(true);
    expect(
      filterTpvRegisterSessionsForBusiness([closedWrongBiz], 'biz-pizzeria', new Set(['pdv-pizzeria', 'wc-pizzeria'])),
    ).toEqual([closedWrongBiz]);
  });

  it('keeps closed session keyed by workCenterId on scoped PDV', () => {
    const closedWc = {
      _id: 's-closed-wc',
      status: 'closed',
      pointOfSaleId: 'wc-pizzeria',
      closedAt: '2026-08-23T22:00:00.000Z',
      nextDayInitialCash: 85,
    };
    expect(shouldKeepTpvSessionInClientList(closedWc, pdvs, 'biz-pizzeria')).toBe(true);
  });
});

describe('isLocalCalendarDay', () => {
  it('matches local calendar day key', () => {
    const key = localCalendarDayKey(new Date(2026, 5, 17, 15, 0, 0));
    expect(isLocalCalendarDay(new Date(2026, 5, 17, 1, 0, 0).toISOString(), key)).toBe(true);
  });
});

describe('filterSessionsForTabletStore', () => {
  it('keeps open session when pointOfSaleId is workCenterId and pick is pdv', () => {
    const pdvs = [{ _id: 'pdv-tiana', workCenterId: 'wc-real-tiana' }];
    const open = {
      _id: 's1',
      status: 'open',
      pointOfSaleId: 'wc-real-tiana',
      openedAt: '2026-08-24T08:00:00.000Z',
    };
    const filtered = filterSessionsForTabletStore([open], 'pdv-tiana', pdvs, 'wc-real-tiana');
    expect(filtered).toEqual([open]);
  });

  it('keeps yesterday closed for fondo on tablet store', () => {
    const pdvs = [{ _id: 'pdv-tiana', workCenterId: 'wc-real-tiana' }];
    const closed = {
      _id: 's-closed',
      status: 'closed',
      pointOfSaleId: 'wc-real-tiana',
      closedAt: '2026-08-23T22:00:00.000Z',
      nextDayInitialCash: 150,
    };
    const filtered = filterSessionsForTabletStore([closed], 'pdv-tiana', pdvs, 'wc-real-tiana');
    expect(filtered).toEqual([closed]);
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

  it('matchea cierre cuando pointOfSaleId es workCenterId (tablet)', () => {
    const closedOnWc = {
      _id: 'c-wc',
      status: 'closed',
      pointOfSaleId: 'wc-1',
      closedAt: '2026-08-23T22:00:00.000Z',
      nextDayInitialCash: 85.5,
    };
    const last = findLastClosedTpvSession(
      [closedOnWc],
      'pdv-1',
      'tablet-pdv-1',
      [],
      ['wc-1', 'pdv-1'],
    );
    expect(last?._id).toBe('c-wc');
    expect(resolvePreviousCloseCashAmount(last)).toBe(85.5);
  });

  it('prefers nextDayInitialCash over finalCashAmount for next open', () => {
    const last = {
      ...closedTpv,
      finalCashAmount: 200,
      nextDayInitialCash: 120,
    };
    expect(resolvePreviousCloseCashAmount(last)).toBe(120);
    expect(previousCloseCashIsNextDayInitial(last)).toBe(true);
  });

  it('allows nextDayInitialCash 0 (empty drawer left)', () => {
    const last = {
      ...closedTpv,
      finalCashAmount: 200,
      nextDayInitialCash: 0,
    };
    expect(resolvePreviousCloseCashAmount(last)).toBe(0);
    expect(previousCloseCashIsNextDayInitial(last)).toBe(true);
  });
});

describe('findLastClosedTpvSessionForStoreOpening', () => {
  const pdvs = [{ _id: 'pdv-1', workCenterId: 'wc-1' }];
  const closedTablet = {
    _id: 'c-tablet',
    status: 'closed',
    pointOfSaleId: 'pdv-1',
    terminalId: 'tablet-pdv-1',
    closedAt: '2026-08-24T22:02:00.000Z',
    nextDayInitialCash: 99.3,
    finalCashAmount: 99.3,
  };
  const closedTpvOlder = {
    _id: 'c-tpv',
    status: 'closed',
    pointOfSaleId: 'pdv-1',
    terminalId: 'term-1',
    closedAt: '2026-08-23T21:36:00.000Z',
    nextDayInitialCash: 93.5,
    finalCashAmount: 93.5,
  };

  it('ignores terminal and picks newest store close for opening fondo', () => {
    const last = findLastClosedTpvSessionForStoreOpening(
      [closedTpvOlder, closedTablet],
      'pdv-1',
      pdvs,
    );
    expect(last?._id).toBe('c-tablet');
    expect(resolvePreviousCloseCashAmount(last)).toBe(99.3);
  });

  it('resolveOpeningFondoHint uses newest store close (99.30), not stale cache (93.50)', () => {
    const hint = resolveOpeningFondoHint({
      sessions: [closedTpvOlder, closedTablet],
      pdvId: 'pdv-1',
      pointsOfSale: pdvs,
      suggestedFondo: 93.5,
      lastClosedSession: closedTpvOlder,
    });
    expect(hint?.amount).toBe(99.3);
    expect(hint?.sessionId).toBe('c-tablet');
  });

  it('resolveOpeningFondoHint uses suggestedFondo only before sessions load', () => {
    const hint = resolveOpeningFondoHint({
      sessions: [],
      pdvId: 'pdv-1',
      suggestedFondo: 99.3,
      lastClosedSession: closedTablet,
    });
    expect(hint?.amount).toBe(99.3);
  });
});

describe('cashWithdrawnAtClose', () => {
  it('contado − fondo = se retira', () => {
    expect(cashWithdrawnAtClose({
      status: 'closed',
      finalCashAmount: 160.35,
      nextDayInitialCash: 10,
    })).toBe(150.35);
  });

  it('null sin fondo declarado o si sigue abierta', () => {
    expect(cashWithdrawnAtClose({ status: 'closed', finalCashAmount: 100 })).toBeNull();
    expect(cashWithdrawnAtClose({
      status: 'open',
      finalCashAmount: 100,
      nextDayInitialCash: 10,
    })).toBeNull();
  });

  it('suma retirados del mes / filtro', () => {
    const sessions = [
      { status: 'closed', finalCashAmount: 100, nextDayInitialCash: 20, openedAt: '2026-08-01T10:00:00.000Z' },
      { status: 'closed', finalCashAmount: 50, nextDayInitialCash: 50, openedAt: '2026-08-02T10:00:00.000Z' },
      { status: 'closed', finalCashAmount: 80, nextDayInitialCash: 10, openedAt: '2026-07-30T10:00:00.000Z' },
    ];
    expect(sumCashWithdrawnAtClose(sessions)).toBe(150);
    expect(sumCashWithdrawnAtClose(sessions, (s) => String(s.openedAt || '').startsWith('2026-08'))).toBe(80);
  });
});

describe('canEnterTpvOrderFlow', () => {
  it('permite entrar con latch aunque el Context parpadee', () => {
    const store = new Map();
    const prev = global.sessionStorage;
    global.sessionStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, v); },
      removeItem: (k) => { store.delete(k); },
    };
    try {
      writeTpvOpenRegisterLatch({ _id: 'sess-1', status: 'open' });
      expect(canEnterTpvOrderFlow({ registerOpen: false, stickyOpen: false, boardReady: false })).toBe(true);
      writeTpvOpenRegisterLatch(null);
    } finally {
      global.sessionStorage = prev;
    }
  });

  it('permite entrar con boardReady sin latch', () => {
    expect(canEnterTpvOrderFlow({ boardReady: true })).toBe(true);
  });

  it('bloquea pedidos en modo consulta (sin caja abierta)', () => {
    expect(canEnterTpvOrderFlow({ boardReady: true, browseOnly: true })).toBe(false);
  });
});
