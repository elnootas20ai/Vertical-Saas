import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ sessions: [] }));

vi.mock('../services/couchdb.js', () => ({
  getDeliveryDbName: () => 'test-delivery',
  putDocument: vi.fn(),
  findAccountByUserId: vi.fn(),
  listTpvRegisterSessionsByUser: vi.fn(async () => state.sessions),
  findOpenTpvRegisterSessionForPointOfSale: (sessions, pdvId) =>
    sessions.find((session) => session.pointOfSaleId === pdvId && session.status === 'open') || null,
  buildTpvRegisterSessionDocument: vi.fn(),
  sanitizeTpvRegisterSession: (session) => session,
  normalizeTpvPaymentMethod: (method) => method,
}));

vi.mock('../services/sseService.js', () => ({
  broadcastToUser: vi.fn(),
  broadcastToBusiness: vi.fn(),
}));

vi.mock('../services/logger.js', () => ({
  default: { error: vi.fn() },
}));

import { validateDiningCajaTarget } from '../services/diningCajaService.js';

describe('validateDiningCajaTarget', () => {
  beforeEach(() => {
    state.sessions = [];
  });

  it('acepta únicamente caja abierta de la misma empresa', async () => {
    state.sessions = [{
      _id: 'session-1',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      businessId: 'biz-1',
    }];

    const result = await validateDiningCajaTarget({}, 'owner-1', {
      pdvId: 'pdv-1',
      diningOrder: { _id: 'order-1', businessId: 'biz-1' },
    });

    expect(result.status).toBe('ready');
  });

  it('rechaza cruce de empresa entre cuenta y caja', async () => {
    state.sessions = [{
      _id: 'session-1',
      status: 'open',
      pointOfSaleId: 'pdv-1',
      businessId: 'biz-2',
    }];

    const result = await validateDiningCajaTarget({}, 'owner-1', {
      pdvId: 'pdv-1',
      diningOrder: { _id: 'order-1', businessId: 'biz-1' },
    });

    expect(result.status).toBe('business_mismatch');
  });

  it('rechaza el cobro si no hay caja abierta', async () => {
    const result = await validateDiningCajaTarget({}, 'owner-1', {
      pdvId: 'pdv-1',
      diningOrder: { _id: 'order-1', businessId: 'biz-1' },
    });

    expect(result.status).toBe('no_open_session');
  });
});
