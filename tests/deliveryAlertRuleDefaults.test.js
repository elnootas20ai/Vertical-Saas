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
  assert.equal(byId.worker_no_clockin?.enabled, true);
  assert.equal(byId.document_missing_required?.enabled, true);
  assert.equal(byId.delivery_product_out_of_stock?.enabled, false);
  assert.equal(byId.delivery_register_closed_ok?.enabled, false);
});

test('mergeAlertRules sin vertical: silencio por defecto (modo gerente)', () => {
  const rules = mergeAlertRules([], {});
  const delayed = rules.find((r) => r.id === 'delivery_delayed_order');
  assert.equal(delayed?.enabled, false);
  const cash = rules.find((r) => r.id === 'delivery_cash_discrepancy');
  assert.equal(cash?.enabled, true);
  const stale = rules.find((r) => r.id === 'stale_delivery');
  assert.equal(stale?.enabled, false);
  const stock = rules.find((r) => r.id === 'out_of_stock');
  assert.equal(stock?.enabled, false);
});

test('applyManagerFocusRuleDefaults apaga ruido y deja pack delivery', async () => {
  const { applyManagerFocusRuleDefaults } = await import('../services/alertRulesCatalog.js');
  const noisy = mergeAlertRules([], {});
  // Simula config antigua con casi todo ON
  const allOn = noisy.map((r) => ({ ...r, enabled: true }));
  const focused = applyManagerFocusRuleDefaults(allOn, { vertical: 'delivery' });
  const on = focused.filter((r) => r.enabled).map((r) => r.id).sort();
  assert.deepEqual(on.sort(), [...DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS].sort());
});

test('usesDeliveryAlertMotor detecta vertical delivery', () => {
  assert.equal(usesDeliveryAlertMotor({}, { businessType: 'delivery' }), true);
  assert.equal(usesDeliveryAlertMotor({ alertConfig: { delivery: { enabled: true } } }), true);
  assert.equal(usesDeliveryAlertMotor({ alertConfig: { delivery: { enabled: false } } }), false);
});
