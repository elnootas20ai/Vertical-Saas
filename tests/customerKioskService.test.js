import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  docs: new Map(),
  pdvs: [{
    _id: 'pdv-1',
    name: 'Tienda Centro',
    active: true,
    publicOrderingConfig: {
      pickupEnabled: true,
      deliveryEnabled: false,
      customerKioskEnabled: true,
    },
  }],
}));

vi.mock('../services/couchdb.js', () => ({
  ensureDatabase: vi.fn(),
  ensureIndex: vi.fn(async () => ({})),
  findDocuments: vi.fn(async (_req, _db, selector) => (
    [...state.docs.values()].filter((doc) => (
      Object.entries(selector).every(([key, value]) => doc[key] === value)
    ))
  )),
  getDocument: vi.fn(async (_req, _db, id) => state.docs.get(id) || null),
  getWebConfigByBusinessId: vi.fn(async () => ({
    enabled: true,
    slug: 'tienda',
    storeName: 'Mi tienda',
  })),
  getWebDbName: () => 'web-db',
  listScopedPointsOfSaleForBusiness: vi.fn(async () => state.pdvs),
  putDocument: vi.fn(async (_req, _db, id, doc) => {
    state.docs.set(id, { ...doc, _rev: '1-test' });
    return { rev: '1-test' };
  }),
  sanitizePointOfSalePublicOrderingConfig: (value = {}) => ({
    pickupEnabled: value.pickupEnabled !== false,
    deliveryEnabled: Boolean(value.deliveryEnabled),
    minimumOrder: Number(value.minimumOrder || 0),
    customerKioskEnabled: Boolean(value.customerKioskEnabled),
  }),
}));

import {
  issueCustomerKioskToken,
  resolveCustomerKioskContext,
  revokeCustomerKiosk,
} from '../services/customerKioskService.js';

beforeEach(() => {
  state.docs.clear();
  state.pdvs = [{
    _id: 'pdv-1',
    name: 'Tienda Centro',
    active: true,
    publicOrderingConfig: {
      pickupEnabled: true,
      deliveryEnabled: false,
      customerKioskEnabled: true,
    },
  }];
});

describe('tablet de autoservicio por PDV', () => {
  it('emite un token opaco fijado a la tienda y lo resuelve como recogida', async () => {
    const issued = await issueCustomerKioskToken({}, {
      ownerUserId: 'owner-1',
      businessId: 'business-1',
      salesPointId: 'pdv-1',
      name: 'Tablet entrada',
    });
    expect(issued.token).toMatch(/^kt_/);
    const context = await resolveCustomerKioskContext({}, {
      token: issued.token,
      businessId: 'business-1',
      slug: 'tienda',
    });
    expect(context).toMatchObject({
      salesPointId: 'pdv-1',
      salesPointName: 'Tienda Centro',
      webSlug: 'tienda',
    });
  });

  it('rechaza un PDV ajeno y un token revocado', async () => {
    await expect(issueCustomerKioskToken({}, {
      ownerUserId: 'owner-1',
      businessId: 'business-1',
      salesPointId: 'pdv-ajeno',
      name: 'Tablet',
    })).rejects.toThrow('no pertenece');

    const issued = await issueCustomerKioskToken({}, {
      ownerUserId: 'owner-1',
      businessId: 'business-1',
      salesPointId: 'pdv-1',
      name: 'Tablet',
    });
    await revokeCustomerKiosk({}, {
      businessId: 'business-1',
      kioskId: issued.kiosk.id,
    });
    await expect(resolveCustomerKioskContext({}, {
      token: issued.token,
      businessId: 'business-1',
    })).rejects.toThrow('revocada');
  });
});
