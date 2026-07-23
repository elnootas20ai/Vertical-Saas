import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/couchdb.js', () => ({
  getClientsDbName: () => 'clients',
  getDeliveryDbName: () => 'delivery',
  getDocument: vi.fn(),
  putDocument: vi.fn(),
  buildClientDocument: vi.fn(),
  buildDeliveryOrderDocument: vi.fn((userId, data, existing) => ({
    ...existing,
    ...data,
    _id: existing?._id || 'order-1',
  })),
  listDeliveryOrdersByUser: vi.fn(async () => []),
  listScopedPointsOfSaleForBusiness: vi.fn(async () => []),
  searchClientsByPhone: vi.fn(async () => [{ _id: 'client-real-1', phone: '600000000' }]),
  ensureDatabase: vi.fn(async () => {}),
}));

import { searchClientsByPhone } from '../services/couchdb.js';
import { syncClientAfterDeliveryOrder } from '../services/deliveryClientSync.js';

describe('syncClientAfterDeliveryOrder — atención rápida / walk-in', () => {
  it('no toca CRM si el clientId es sintético tpv-*', async () => {
    const result = await syncClientAfterDeliveryOrder({}, 'user-1', {
      clientId: 'tpv-delivery-quick-attention',
      customerPhone: '+34 0',
    });
    expect(result).toBeNull();
    expect(searchClientsByPhone).not.toHaveBeenCalled();
  });

  it('no busca cliente por teléfono basura (menos de 6 dígitos)', async () => {
    searchClientsByPhone.mockClear();
    const result = await syncClientAfterDeliveryOrder({}, 'user-1', {
      clientId: '',
      customerPhone: '+34 0',
    });
    expect(result).toBeNull();
    expect(searchClientsByPhone).not.toHaveBeenCalled();
  });
});
