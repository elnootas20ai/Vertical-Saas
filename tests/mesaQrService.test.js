import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tables: [],
  floor: { rooms: [] },
  pdvs: [],
  config: null,
}));

vi.mock('../services/couchdb.js', () => ({
  findDocuments: vi.fn(async (_req, _db, selector) => (
    state.tables.filter((table) => table.qrCode === selector.qrCode)
  )),
  getAllDocuments: vi.fn(async () => state.tables),
  putDocument: vi.fn(async (_req, _db, id, doc) => {
    state.tables = state.tables.map((table) => (table._id === id ? { ...doc, _rev: '2-new' } : table));
    return { rev: '2-new' };
  }),
  bulkPutDocuments: vi.fn(),
  getWebConfigByBusinessId: vi.fn(async () => state.config),
  listScopedPointsOfSaleForBusiness: vi.fn(async () => state.pdvs),
}));

vi.mock('../services/salaService.js', () => ({
  getSalaDbName: () => 'sala-db',
  listDiningTablesByUser: vi.fn(async () => state.tables),
  sanitizeDiningTable: (table) => ({ ...table }),
  buildDiningTableDocument: (_userId, data, existing) => ({ ...existing, ...data }),
  getFloorConfigByUser: vi.fn(async () => state.floor),
}));

import {
  findDiningTableByQrToken,
  resolveMesaQrContext,
  rotateMesaQrToken,
} from '../services/mesaQrService.js';

function baseTable(overrides = {}) {
  return {
    _id: 'table-1',
    type: 'dining_table',
    user_id: 'owner-1',
    businessId: 'business-1',
    roomId: 'room-1',
    zone: 'Salón',
    active: true,
    qrCode: 'mt_original_valid_token',
    ...overrides,
  };
}

beforeEach(() => {
  state.tables = [baseTable()];
  state.floor = { rooms: [{ id: 'room-1', name: 'Salón', pdvId: 'pdv-1' }] };
  state.pdvs = [{ _id: 'pdv-1', active: true }];
  state.config = { slug: 'mi-restaurante', salesPointIds: ['pdv-1'] };
});

describe('seguridad y PDV del QR de mesa', () => {
  it('rechaza token falso, mesa cruzada, negocio cruzado y slug cruzado', async () => {
    await expect(resolveMesaQrContext({}, { token: 'mt_falso' })).rejects.toThrow('QR no válido');
    await expect(resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      tableId: 'otra-mesa',
    })).rejects.toThrow('no corresponde');
    await expect(resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      businessId: 'otro-negocio',
    })).rejects.toThrow('no pertenece');
    await expect(resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      businessId: 'business-1',
      slug: 'otro-slug',
    })).rejects.toThrow('no pertenece');
  });

  it('resuelve el PDV desde la sala y usa fallback solo con un PDV', async () => {
    const mapped = await resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      businessId: 'business-1',
    });
    expect(mapped.salesPointId).toBe('pdv-1');

    state.floor = { rooms: [{ id: 'room-1', name: 'Salón' }] };
    state.config = { slug: 'mi-restaurante', salesPointIds: [] };
    const mono = await resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      businessId: 'business-1',
    });
    expect(mono.salesPointId).toBe('pdv-1');
  });

  it('bloquea un negocio multi-PDV sin asignación de sala', async () => {
    state.floor = { rooms: [{ id: 'room-1', name: 'Salón' }] };
    state.pdvs = [{ _id: 'pdv-1', active: true }, { _id: 'pdv-2', active: true }];
    state.config = { slug: 'mi-restaurante', salesPointIds: ['pdv-1', 'pdv-2'] };
    await expect(resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      businessId: 'business-1',
    })).rejects.toThrow('Configura el punto de venta');
  });

  it('bloquea QR si el negocio todavía no tiene PDV', async () => {
    state.floor = { rooms: [{ id: 'room-1', name: 'Salón' }] };
    state.pdvs = [];
    state.config = { slug: 'mi-restaurante', salesPointIds: [] };
    await expect(resolveMesaQrContext({}, {
      token: 'mt_original_valid_token',
      businessId: 'business-1',
    })).rejects.toThrow('Configura un punto de venta');
  });

  it('al regenerar, el token anterior deja de resolver', async () => {
    const rotated = await rotateMesaQrToken({}, 'owner-1', 'table-1');
    expect(rotated.qrCode).not.toBe('mt_original_valid_token');
    expect(await findDiningTableByQrToken({}, 'mt_original_valid_token')).toBeNull();
    expect((await findDiningTableByQrToken({}, rotated.qrCode))?._id).toBe('table-1');
  });
});
