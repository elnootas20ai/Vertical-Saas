import { describe, expect, it } from 'vitest';
import {
  buildDeliveryOrderDocument,
  buildWebOrderDocument,
  sanitizeDeliveryOrder,
  sanitizeWebOrder,
} from '../services/couchdb.js';
import { publicOrderPolicyForBusiness } from '../services/publicOrderingService.js';

describe('núcleo de pedidos públicos por vertical', () => {
  it('separa en restaurante la web de fuera y el QR de mesa sin usar delivery', () => {
    expect(publicOrderPolicyForBusiness({ businessType: 'restaurant' })).toMatchObject({
      vertical: 'restaurant',
      mode: 'restaurant_hybrid',
      sourceChannel: 'public_web',
      targetKind: 'restaurant_takeaway',
      supportsTableQr: true,
    });
    expect(publicOrderPolicyForBusiness(
      { businessType: 'restaurant' },
      { mesaToken: 'mt_secure' },
    )).toMatchObject({
      sourceChannel: 'restaurant_qr',
      targetKind: 'restaurant_table',
    });
  });

  it('dirige delivery a su bandeja operativa', () => {
    expect(publicOrderPolicyForBusiness({ businessType: 'delivery' })).toMatchObject({
      sourceChannel: 'public_web',
      targetKind: 'delivery_ops',
      requiresMesaQr: false,
    });
  });

  it.each([
    ['iceCreamShop', 'delivery_ops'],
    ['butcherShop', 'butcher_ops'],
    ['retail', 'retail_ops'],
  ])('dirige %s a su adaptador explícito', (businessType, targetKind) => {
    expect(publicOrderPolicyForBusiness({ businessType })).toMatchObject({
      supported: true,
      targetKind,
    });
  });

  it('no manda verticales no vendibles silenciosamente a Delivery', () => {
    expect(publicOrderPolicyForBusiness({ businessType: 'cleaning' })).toMatchObject({
      supported: false,
      targetKind: '',
    });
  });

  it('mantiene compatibilidad con web_order y guarda sus enlaces operativos', () => {
    const doc = buildWebOrderDocument('business-1', {
      items: [{ id: 'p1', name: 'Tapa', quantity: 2, unitPrice: 4, total: 8 }],
      sourceChannel: 'restaurant_qr',
      targetKind: 'restaurant_table',
      reviewStatus: 'accepted',
      linkedDiningOrderId: 'dining-1',
      linkedComandaId: 'comanda-1',
      tableId: 'table-1',
      mesaToken: 'mt_valid_token',
    });
    expect(sanitizeWebOrder(doc)).toMatchObject({
      type: 'web_order',
      sourceChannel: 'restaurant_qr',
      targetKind: 'restaurant_table',
      reviewStatus: 'accepted',
      linkedDiningOrderId: 'dining-1',
      linkedComandaId: 'comanda-1',
      totalAmount: 8,
    });
  });

  it('conserva el vínculo idempotente al convertir en delivery_order', () => {
    const doc = buildDeliveryOrderDocument('owner-1', {
      business_id: 'business-1',
      sourcePublicOrderId: 'webord-1',
      status: 'nuevo',
      channel: 'web',
      items: [{ id: 'p1', name: 'Burger', quantity: 1, unitPrice: 10, total: 10 }],
    });
    expect(sanitizeDeliveryOrder(doc)).toMatchObject({
      type: 'delivery_order',
      sourcePublicOrderId: 'webord-1',
      channel: 'web',
      status: 'nuevo',
      totalAmount: 10,
    });
  });

  it('infere el destino de pedidos históricos sin los nuevos campos', () => {
    const legacyQr = sanitizeWebOrder({
      type: 'web_order',
      _id: 'legacy-1',
      business_id: 'business-1',
      tableId: 'table-1',
      status: 'pending',
      items: [],
    });
    expect(legacyQr.targetKind).toBe('restaurant_table');
    expect(legacyQr.reviewStatus).toBe('pending');
  });
});
