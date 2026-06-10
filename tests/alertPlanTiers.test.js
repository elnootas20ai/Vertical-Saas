import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ALERT_RULE_DEFINITIONS } from '../services/alertRulesCatalog.js';
import {
  resolveAlertPlanTier,
  isDeliveryVertical,
  BASIC_ALERT_RULE_IDS,
} from '../services/alertPlanTiers.js';

test('cada regla del catálogo tiene plan basic, normal o pro', () => {
  const counts = { basic: 0, normal: 0, pro: 0 };
  for (const rule of ALL_ALERT_RULE_DEFINITIONS) {
    const tier = resolveAlertPlanTier(rule.id, rule.department);
    assert.ok(['basic', 'normal', 'pro'].includes(tier), `${rule.id} → ${tier}`);
    assert.equal(rule.planTier, tier, `planTier en catálogo debe coincidir para ${rule.id}`);
    counts[tier]++;
  }
  assert.ok(counts.basic >= 8, `basic: ${counts.basic}`);
  assert.ok(counts.normal >= 25, `normal: ${counts.normal}`);
  assert.ok(counts.pro >= 50, `pro: ${counts.pro}`);
});

test('reglas básicas delivery son mínimas', () => {
  for (const id of ['lead_new', 'sale_cancelled', 'worker_no_clockin', 'stock_low']) {
    assert.ok(BASIC_ALERT_RULE_IDS.has(id));
    assert.equal(resolveAlertPlanTier(id, 'delivery'), 'basic');
  }
  assert.equal(resolveAlertPlanTier('delivery_delayed_order', 'delivery'), 'normal');
  assert.equal(resolveAlertPlanTier('delivery_cash_pending_close', 'pdvs'), 'normal');
});

test('limpieza y verticales son Pro', () => {
  assert.equal(resolveAlertPlanTier('cleaning_route_delayed', 'limpieza'), 'pro');
  assert.equal(resolveAlertPlanTier('butcher_waste_high', 'verticales'), 'pro');
  assert.equal(resolveAlertPlanTier('user_login_new', 'sistema'), 'pro');
});

test('delivery operativo diario es Normal (plan recomendado)', () => {
  assert.equal(resolveAlertPlanTier('delivery_delayed_order', 'delivery'), 'normal');
  assert.equal(resolveAlertPlanTier('delivery_unassigned_order', 'delivery'), 'normal');
  assert.equal(resolveAlertPlanTier('register_high_return', 'pdvs'), 'normal');
  assert.equal(resolveAlertPlanTier('payment_overdue', 'finanzas'), 'normal');
});

test('delivery control avanzado es Pro', () => {
  assert.equal(resolveAlertPlanTier('delivery_low_margin', 'delivery'), 'pro');
  assert.equal(resolveAlertPlanTier('delivery_channel_silent', 'delivery'), 'pro');
  assert.equal(resolveAlertPlanTier('bank_unreconciled', 'finanzas'), 'pro');
  assert.equal(resolveAlertPlanTier('worker_absent_pattern', 'rrhh'), 'pro');
});

test('delivery: básico mínimo, normal recomendado, pro el más grande', () => {
  const DELIVERY_DEPTS = new Set(['pdvs', 'delivery', 'rrhh', 'catalogProviders', 'finanzas', 'documentacion']);
  const counts = { basic: 0, normal: 0, pro: 0 };
  for (const rule of ALL_ALERT_RULE_DEFINITIONS) {
    if (!DELIVERY_DEPTS.has(rule.department)) continue;
    counts[resolveAlertPlanTier(rule.id, rule.department)]++;
  }
  assert.ok(counts.basic <= 10, `basic=${counts.basic}`);
  assert.ok(counts.normal > counts.basic, `normal=${counts.normal}`);
  assert.ok(counts.pro > counts.normal, `pro=${counts.pro}`);
});

test('limpieza y construcción siguen siendo Pro (otras verticales)', () => {
  assert.ok(isDeliveryVertical('delivery'));
  assert.equal(resolveAlertPlanTier('cleaning_route_delayed', 'limpieza'), 'pro');
  assert.equal(resolveAlertPlanTier('construction_cost_overrun', 'construccion'), 'pro');
});
