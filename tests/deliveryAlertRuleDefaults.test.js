import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAlertRules,
  DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS,
  DELIVERY_LEGACY_DUPLICATE_RULE_IDS,
} from '../services/alertRulesCatalog.js';
import { usesDeliveryAlertMotor } from '../services/moduleAlertUtils.js';

test('mergeAlertRules delivery: paquete CEO activo y legacy desactivado', () => {
  const rules = mergeAlertRules([], { vertical: 'delivery' });
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));

  for (const id of DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS) {
    assert.equal(byId[id]?.enabled, true, `CEO rule ${id} should be enabled`);
  }
  for (const id of DELIVERY_LEGACY_DUPLICATE_RULE_IDS) {
    assert.equal(byId[id]?.enabled, false, `legacy ${id} should be disabled`);
  }
  assert.equal(byId.delivery_channel_silent?.enabled, false);
  assert.equal(byId.delivery_low_margin?.enabled, false);
  assert.equal(byId.delivery_kitchen_saturated?.enabled, false);
  assert.equal(byId.delivery_queue_overflow?.enabled, false);
  assert.equal(byId.delivery_order_cancelled?.enabled, true);
});

test('mergeAlertRules sin vertical: no fuerza paquete CEO', () => {
  const rules = mergeAlertRules([], {});
  const delayed = rules.find((r) => r.id === 'delivery_delayed_order');
  assert.equal(delayed?.enabled, true);
  const stale = rules.find((r) => r.id === 'stale_delivery');
  assert.equal(stale?.enabled, false);
});

test('usesDeliveryAlertMotor detecta vertical delivery', () => {
  assert.equal(usesDeliveryAlertMotor({}, { businessType: 'delivery' }), true);
  assert.equal(usesDeliveryAlertMotor({ alertConfig: { delivery: { enabled: true } } }), true);
  assert.equal(usesDeliveryAlertMotor({ alertConfig: { delivery: { enabled: false } } }), false);
});
