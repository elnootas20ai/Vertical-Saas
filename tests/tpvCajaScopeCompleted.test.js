import {
  cancelledOrderHistoryLabel,
  isCompletedHistoryBoardOrder,
  isCompletedShiftOrder,
  isDeliveredBoardOrder,
  isRefundedDeliveryOrder,
  orderAlreadyCobrado,
  registerSessionOrderLoadBounds,
} from '../src/app/lib/tpvCajaScope.js';

describe('isDeliveredBoardOrder', () => {
  it('solo entregados, no cobrados en montaje/reparto', () => {
    expect(isDeliveredBoardOrder({ status: 'entregado' })).toBe(true);
    expect(isDeliveredBoardOrder({
      status: 'nuevo',
      paymentCollected: true,
      paymentStatus: 'paid',
    })).toBe(false);
    expect(isDeliveredBoardOrder({
      status: 'en_reparto',
      paymentCollected: true,
      paymentStatus: 'paid',
    })).toBe(false);
    expect(isDeliveredBoardOrder({ status: 'cancelled' })).toBe(false);
  });
});

describe('isCompletedHistoryBoardOrder', () => {
  it('incluye entregados y cualquier eliminado del turno', () => {
    expect(isCompletedHistoryBoardOrder({ status: 'entregado' })).toBe(true);
    expect(isCompletedHistoryBoardOrder({
      status: 'cancelled',
      deliveredAt: '2026-07-23T12:00:00.000Z',
      paymentStatus: 'refunded',
    })).toBe(true);
    expect(isCompletedHistoryBoardOrder({
      status: 'cancelled',
      stageHistory: [{ status: 'entregado', date: '2026-07-23T12:00:00.000Z' }],
    })).toBe(true);
    expect(isCompletedHistoryBoardOrder({
      status: 'cancelled',
      stageHistory: [{ status: 'nuevo', date: '2026-07-23T10:00:00.000Z' }],
    })).toBe(true);
    expect(isCompletedHistoryBoardOrder({
      status: 'cancelled',
      stageHistory: [{ status: 'en_reparto', date: '2026-07-23T11:00:00.000Z' }],
    })).toBe(true);
  });
});

describe('cancelledOrderHistoryLabel', () => {
  it('distingue eliminado entregado, reparto y montaje', () => {
    expect(cancelledOrderHistoryLabel({
      status: 'cancelled',
      deliveredAt: '2026-07-23T12:00:00.000Z',
    })).toBe('Eliminado · entregado');
    expect(cancelledOrderHistoryLabel({
      status: 'cancelled',
      stageHistory: [{ status: 'en_reparto', date: '2026-07-23T11:00:00.000Z' }],
    })).toBe('Eliminado · reparto');
    expect(cancelledOrderHistoryLabel({
      status: 'cancelled',
      stageHistory: [{ status: 'listo', date: '2026-07-23T10:00:00.000Z' }],
    })).toBe('Eliminado · montaje');
  });
});

describe('isCompletedShiftOrder', () => {
  it('cuenta entregados y cobrados', () => {
    expect(isCompletedShiftOrder({ status: 'entregado' })).toBe(true);
    expect(isCompletedShiftOrder({
      status: 'en_reparto',
      paymentCollected: true,
      paymentStatus: 'paid',
      totalAmount: 20,
      paidAmount: 20,
    })).toBe(true);
    expect(isCompletedShiftOrder({ status: 'en_montaje', totalAmount: 10, paidAmount: 0 })).toBe(false);
    expect(isCompletedShiftOrder({ status: 'cancelled' })).toBe(false);
  });

  it('excluye devueltos y reembolsados', () => {
    expect(isRefundedDeliveryOrder({ status: 'devuelto', paymentStatus: 'refunded' })).toBe(true);
    expect(isCompletedShiftOrder({
      status: 'devuelto',
      paymentStatus: 'refunded',
      paymentCollected: true,
      totalAmount: 20,
      paidAmount: 20,
    })).toBe(false);
  });
});

describe('orderAlreadyCobrado', () => {
  it('detecta cobro completo', () => {
    expect(orderAlreadyCobrado({ paymentCollected: true, totalAmount: 10, paidAmount: 0 })).toBe(true);
    expect(orderAlreadyCobrado({ totalAmount: 10, paidAmount: 10 })).toBe(true);
    expect(orderAlreadyCobrado({ totalAmount: 10, paidAmount: 5 })).toBe(false);
  });

  it('no cuenta reembolsados como cobrados', () => {
    expect(orderAlreadyCobrado({
      paymentStatus: 'refunded',
      paymentCollected: true,
      totalAmount: 10,
      paidAmount: 10,
    })).toBe(false);
  });
});

describe('registerSessionOrderLoadBounds', () => {
  it('usa closedAt al cerrar y fin de jornada si sigue abierta', () => {
    const closed = registerSessionOrderLoadBounds({
      openedAt: '2026-06-17T08:00:00.000Z',
      closedAt: '2026-06-17T22:00:00.000Z',
      status: 'closed',
    });
    expect(closed.from).toBe('2026-06-17T08:00:00.000Z');
    expect(closed.to).toBe('2026-06-17T22:00:00.000Z');

    const open = registerSessionOrderLoadBounds({
      openedAt: '2026-06-17T08:00:00.000Z',
      closedAt: '',
      status: 'open',
    });
    expect(open.from).toBe('2026-06-17T08:00:00.000Z');
    expect(open.to).toBeTruthy();
  });
});
