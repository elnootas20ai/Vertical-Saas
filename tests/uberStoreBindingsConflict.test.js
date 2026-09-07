import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  document: null,
  putCalls: 0,
}));

vi.mock('../services/couchdb.js', () => ({
  ensureDatabase: vi.fn(),
  ensureIndex: vi.fn(),
  findDocuments: vi.fn().mockResolvedValue([]),
  getWebDbName: vi.fn(() => 'web'),
  getDocument: vi.fn(async () => structuredClone(state.document)),
  putDocument: vi.fn(async (_req, _db, _id, doc) => {
    state.putCalls += 1;
    if (state.putCalls === 1) {
      state.document = {
        ...state.document,
        _rev: '2-webhook',
        lastWebhookAt: '2026-09-07T15:24:30.000Z',
      };
      throw new Error('Document update conflict.');
    }
    state.document = { ...structuredClone(doc), _rev: '3-saved' };
    return { ok: true, rev: '3-saved' };
  }),
}));

import { saveUberStoreBinding } from '../services/uberStoreBindings.js';

describe('Uber store binding conflict handling', () => {
  beforeEach(() => {
    state.putCalls = 0;
    state.document = {
      _id: 'uber-store-binding:sandbox:c3RvcmUtMQ',
      _rev: '1-initial',
      type: 'uber_store_binding',
      environment: 'sandbox',
      business_id: 'business-1',
      storeId: 'store-1',
      storeName: 'Vertial POS Sandbox',
      active: true,
      primary: true,
      defaultPrepMinutes: 20,
      posIntegrationEnabled: false,
      lastWebhookAt: '',
      createdAt: '2026-09-07T15:00:00.000Z',
    };
  });

  it('retries against the latest revision without erasing concurrent webhook fields', async () => {
    const saved = await saveUberStoreBinding({}, {
      environment: 'sandbox',
      businessId: 'business-1',
      storeId: 'store-1',
      storeName: 'Vertial POS Sandbox',
      active: true,
      primary: true,
      defaultPrepMinutes: 20,
      posIntegrationEnabled: true,
      lastWebhookAt: '',
    });

    expect(state.putCalls).toBe(2);
    expect(saved.posIntegrationEnabled).toBe(true);
    expect(saved.lastWebhookAt).toBe('2026-09-07T15:24:30.000Z');
  });
});
