import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterActiveDeliveryOrders,
  getOrderPhase,
  isActiveDeliveryOrder,
  isDeliveredStatus,
  normalizeDeliveryOrderStatus,
  orderHasDeliveryPhase,
} from '../services/deliveryAlertStatusUtils.js';

describe('deliveryAlertStatusUtils', () => {
  it('normaliza estados legacy en inglés', () => {
    assert.equal(normalizeDeliveryOrderStatus('kitchen'), 'cocina');
    assert.equal(normalizeDeliveryOrderStatus('delivered'), 'entregado');
    assert.equal(normalizeDeliveryOrderStatus('delivery'), 'en_reparto');
  });

  it('excluye pedidos entregados o cancelados del conjunto activo', () => {
    const orders = [
      { _id: '1', status: 'cocina' },
      { _id: '2', status: 'entregado' },
      { _id: '3', status: 'delivered' },
      { _id: '4', status: 'cancelled' },
    ];
    const active = filterActiveDeliveryOrders(orders);
    assert.equal(active.length, 1);
    assert.equal(active[0]._id, '1');
  });

  it('mapea fases operativas para umbrales', () => {
    assert.equal(getOrderPhase({ status: 'cocina' }), 'kitchen');
    assert.equal(getOrderPhase({ status: 'en_reparto' }), 'delivery');
    assert.equal(getOrderPhase({ status: 'entregado' }), null);
  });

  it('detecta historial de reparto en español', () => {
    assert.equal(orderHasDeliveryPhase({ stageHistory: [{ status: 'en_reparto' }] }), true);
    assert.equal(orderHasDeliveryPhase({ stageHistory: [{ status: 'delivery' }] }), true);
    assert.equal(orderHasDeliveryPhase({ stageHistory: [{ status: 'cocina' }] }), false);
  });

  it('reconoce pedido entregado', () => {
    assert.equal(isDeliveredStatus('entregado'), true);
    assert.equal(isDeliveredStatus('delivered'), true);
    assert.equal(isActiveDeliveryOrder({ status: 'entregado' }), false);
  });
});
