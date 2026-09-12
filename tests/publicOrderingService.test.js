import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  putDocument: vi.fn(),
  listCatalogItemsByUser: vi.fn(),
  findBusinessById: vi.fn(),
  resolveMesaQrContext: vi.fn(),
  acceptRestaurant: vi.fn(),
  acceptRestaurantTakeaway: vi.fn(),
  acceptDelivery: vi.fn(),
  acceptButcher: vi.fn(),
  acceptRetail: vi.fn(),
  broadcastToBusiness: vi.fn(),
  broadcastToUser: vi.fn(),
}));

vi.mock('../services/couchdb.js', () => ({
  buildWebOrderDocument: (businessId, data, existing = null) => ({
    ...(existing || {}),
    ...data,
    _id: existing?._id || 'webord-1',
    _rev: existing?._rev,
    type: 'web_order',
    business_id: businessId,
  }),
  ensureDatabase: vi.fn(),
  findBusinessById: mocks.findBusinessById,
  filterCatalogDocsByBusinessScope: (docs) => docs,
  getDocument: mocks.getDocument,
  getWebDbName: () => 'web-db',
  listCatalogItemsByUser: mocks.listCatalogItemsByUser,
  listBusinessesByUser: vi.fn(async () => [{ business_id: 'business-1' }]),
  listScopedPointsOfSaleForBusiness: vi.fn(async () => [{
    _id: 'pdv-1',
    name: 'Tienda 1',
    active: true,
    publicOrderingConfig: {
      pickupEnabled: true,
      deliveryEnabled: true,
      minimumOrder: 0,
      deliveryFee: 0,
    },
  }]),
  putDocument: mocks.putDocument,
  sanitizePointOfSalePublicOrderingConfig: (value = {}) => ({
    pickupEnabled: value.pickupEnabled !== false,
    deliveryEnabled: Boolean(value.deliveryEnabled),
    minimumOrder: Number(value.minimumOrder || 0),
    deliveryFee: Number(value.deliveryFee || 0),
  }),
  sanitizeWebOrder: (doc) => ({ ...doc }),
}));
vi.mock('../services/mesaQrService.js', () => ({
  resolveMesaQrContext: mocks.resolveMesaQrContext,
}));
vi.mock('../services/customerKioskService.js', () => ({
  resolveCustomerKioskContext: vi.fn(),
}));
vi.mock('../services/sseService.js', () => ({
  broadcastToBusiness: mocks.broadcastToBusiness,
  broadcastToUser: mocks.broadcastToUser,
}));
vi.mock('../services/adapters/restaurantPublicOrderAdapter.js', () => ({
  acceptRestaurantPublicOrder: mocks.acceptRestaurant,
  acceptRestaurantTakeawayPublicOrder: mocks.acceptRestaurantTakeaway,
}));
vi.mock('../services/adapters/deliveryPublicOrderAdapter.js', () => ({
  acceptDeliveryPublicOrder: mocks.acceptDelivery,
}));
vi.mock('../services/adapters/butcherPublicOrderAdapter.js', () => ({
  acceptButcherPublicOrder: mocks.acceptButcher,
}));
vi.mock('../services/adapters/retailPublicOrderAdapter.js', () => ({
  acceptRetailPublicOrder: mocks.acceptRetail,
}));

import {
  preparePublicOrderRequest,
  reviewPublicOrderRequest,
} from '../services/publicOrderingService.js';

const config = {
  business_id: 'business-1',
  deliveryEnabled: true,
  pickupEnabled: true,
  salesPointIds: ['pdv-1'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBusinessById.mockResolvedValue({
    businessType: 'delivery',
    owner_user_id: 'owner-1',
  });
  mocks.listCatalogItemsByUser.mockResolvedValue([
    {
      _id: 'product-1',
      name: 'Producto real',
      category: 'Carta',
      unitPrice: 12.5,
      active: true,
      available: true,
      webVisible: true,
      module: 'catalog',
    },
  ]);
  mocks.putDocument.mockResolvedValue({ rev: '2-test' });
});

describe('servicio común de solicitudes públicas', () => {
  it('recalcula nombre, precio y total desde catálogo aunque el navegador los manipule', async () => {
    const result = await preparePublicOrderRequest({}, {
      config,
      slug: 'tienda',
      order: {
        customerName: 'Ana',
        customerPhone: '600000000',
        customerAddress: 'Calle Uno, 1',
        orderType: 'delivery',
        salesPointId: 'pdv-1',
        items: [{ id: 'product-1', name: 'Hack', quantity: 2, unitPrice: 0.01, total: 0.02 }],
      },
    });
    expect(result.order.items[0]).toMatchObject({
      name: 'Producto real',
      quantity: 2,
      unitPrice: 12.5,
      total: 25,
    });
  });

  it('rechaza productos inexistentes y PDV ajenos', async () => {
    await expect(preparePublicOrderRequest({}, {
      config,
      slug: 'tienda',
      order: {
        customerName: 'Ana',
        customerPhone: '600000000',
        customerAddress: 'Calle Uno, 1',
        orderType: 'delivery',
        salesPointId: 'pdv-ajeno',
        items: [{ id: 'product-1', quantity: 1 }],
      },
    })).rejects.toThrow('tienda seleccionada');

    await expect(preparePublicOrderRequest({}, {
      config,
      slug: 'tienda',
      order: {
        customerName: 'Ana',
        customerPhone: '600000000',
        orderType: 'delivery',
        items: [{ id: 'inexistente', quantity: 1 }],
      },
    })).rejects.toThrow('ya no está disponible');
  });

  it('aplica el pedido mínimo configurado en el PDV, no el importe del cliente', async () => {
    const couch = await import('../services/couchdb.js');
    couch.listScopedPointsOfSaleForBusiness.mockResolvedValueOnce([{
      _id: 'pdv-1',
      name: 'Tienda 1',
      active: true,
      publicOrderingConfig: {
        pickupEnabled: true,
        deliveryEnabled: true,
        minimumOrder: 20,
      },
    }]);
    await expect(preparePublicOrderRequest({}, {
      config,
      slug: 'tienda',
      order: {
        customerName: 'Ana',
        customerPhone: '600000000',
        orderType: 'pickup',
        salesPointId: 'pdv-1',
        items: [{ id: 'product-1', quantity: 1, total: 999 }],
      },
    })).rejects.toThrow('pedido mínimo');
  });

  it('separa el pedido web del QR y usa mesa/PDV resueltos por servidor', async () => {
    mocks.findBusinessById.mockResolvedValue({
      businessType: 'restaurant',
      owner_user_id: 'owner-1',
    });
    const webResult = await preparePublicOrderRequest({}, {
      config,
      slug: 'restaurante',
      order: {
        customerName: 'Ana',
        customerPhone: '600000000',
        orderType: 'pickup',
        salesPointId: 'pdv-1',
        items: [{ id: 'product-1', quantity: 1 }],
      },
    });
    expect(webResult.order.targetKind).toBe('restaurant_takeaway');

    mocks.resolveMesaQrContext.mockResolvedValue({
      table: { _id: 'table-1', number: 7, name: 'Mesa 7', qrCode: 'mt_secure' },
      salesPointId: 'pdv-room',
    });
    const result = await preparePublicOrderRequest({}, {
      config,
      slug: 'restaurante',
      order: { mesaToken: 'mt_secure', tableId: 'fake-client-id', items: [{ id: 'product-1', quantity: 1 }] },
    });
    expect(mocks.resolveMesaQrContext).toHaveBeenCalledWith({}, expect.objectContaining({
      token: 'mt_secure',
      tableId: 'fake-client-id',
      businessId: 'business-1',
    }));
    expect(result.order).toMatchObject({
      tableId: 'table-1',
      salesPointId: 'pdv-room',
      targetKind: 'restaurant_table',
      orderType: 'sala',
    });
  });

  it('aceptar dos veces no vuelve a ejecutar el adaptador', async () => {
    mocks.getDocument.mockResolvedValue({
      _id: 'webord-1',
      type: 'web_order',
      business_id: 'business-1',
      targetKind: 'delivery_ops',
      reviewStatus: 'accepted',
    });
    const result = await reviewPublicOrderRequest({}, {
      businessId: 'business-1',
      orderId: 'webord-1',
      action: 'accept',
      reviewerId: 'worker-1',
    });
    expect(result.reviewStatus).toBe('accepted');
    expect(mocks.acceptDelivery).not.toHaveBeenCalled();
    expect(mocks.putDocument).not.toHaveBeenCalled();
  });

  it('despacha cada destino únicamente a su adaptador', async () => {
    mocks.getDocument.mockResolvedValue({
      _id: 'webord-1',
      type: 'web_order',
      business_id: 'business-1',
      targetKind: 'restaurant_table',
      reviewStatus: 'pending',
      statusHistory: [],
    });
    mocks.acceptRestaurant.mockResolvedValue({
      linkedDiningOrderId: 'dining-1',
      linkedComandaId: 'comanda-1',
    });
    await reviewPublicOrderRequest({}, {
      businessId: 'business-1',
      orderId: 'webord-1',
      action: 'accept',
      reviewerId: 'worker-1',
    });
    expect(mocks.acceptRestaurant).toHaveBeenCalledOnce();
    expect(mocks.acceptDelivery).not.toHaveBeenCalled();
    expect(mocks.putDocument).toHaveBeenCalledOnce();
  });

  it('resuelve una aceptación concurrente sin duplicar el resultado', async () => {
    mocks.getDocument
      .mockResolvedValueOnce({
        _id: 'webord-1',
        type: 'web_order',
        business_id: 'business-1',
        targetKind: 'delivery_ops',
        reviewStatus: 'pending',
        statusHistory: [],
      })
      .mockResolvedValueOnce({
        _id: 'webord-1',
        type: 'web_order',
        business_id: 'business-1',
        reviewStatus: 'accepted',
      });
    mocks.acceptDelivery.mockResolvedValue({ linkedDeliveryOrderId: 'delivery-1' });
    mocks.putDocument.mockRejectedValueOnce(Object.assign(new Error('conflict'), { statusCode: 409 }));
    const result = await reviewPublicOrderRequest({}, {
      businessId: 'business-1',
      orderId: 'webord-1',
      action: 'accept',
      reviewerId: 'worker-1',
    });
    expect(result.reviewStatus).toBe('accepted');
    expect(mocks.acceptDelivery).toHaveBeenCalledOnce();
  });
});
