import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDeliveryOperational,
  resolveDeliveryAlertConfig,
  DEFAULT_DELIVERY_OPERATIONAL,
} from '../services/deliveryOperationalAlertConfig.js';

test('sanitizeDeliveryOperational aplica defaults y límites', () => {
  const out = sanitizeDeliveryOperational({
    delayThresholds: { kitchen: 999, delivery: 2 },
    kitchenCapacity: 0,
    lowMarginThresholdPercent: 3,
  });
  assert.equal(out.delayThresholds.kitchen, 120);
  assert.equal(out.delayThresholds.delivery, 5);
  assert.equal(out.delayThresholds.orderTotal, 60);
  assert.equal(out.kitchenCapacity, 1);
  assert.equal(out.lowMarginThresholdPercent, 5);
});

test('orderTotal (pedido muy retrasado) acepta 15–240 y default 60', () => {
  assert.equal(DEFAULT_DELIVERY_OPERATIONAL.delayThresholds.orderTotal, 60);
  assert.equal(sanitizeDeliveryOperational({ delayThresholds: { orderTotal: 10 } }).delayThresholds.orderTotal, 15);
  assert.equal(sanitizeDeliveryOperational({ delayThresholds: { orderTotal: 300 } }).delayThresholds.orderTotal, 240);
  assert.equal(sanitizeDeliveryOperational({ delayThresholds: { orderTotal: 90 } }).delayThresholds.orderTotal, 90);
});

test('resolveDeliveryAlertConfig prioriza umbrales CEO sobre cuenta', () => {
  const account = {
    alertConfig: {
      delivery: {
        delayThresholds: { kitchen: 25 },
        kitchenCapacity: 8,
      },
    },
  };
  const businessOp = {
    delivery: sanitizeDeliveryOperational({
      delayThresholds: { kitchen: 35 },
      kitchenCapacity: 12,
    }),
  };
  const cfg = resolveDeliveryAlertConfig(account, businessOp);
  assert.equal(cfg.delayThresholds.kitchen, 35);
  assert.equal(cfg.kitchenCapacity, 12);
  assert.equal(cfg.delayThresholds.pending, DEFAULT_DELIVERY_OPERATIONAL.delayThresholds.pending);
});
