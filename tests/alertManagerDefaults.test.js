import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAlertRules } from '../services/alertRulesCatalog.js';
import { resolveAlertPlanTier } from '../services/alertPlanTiers.js';
import { resolvePlanTier } from '../services/subscriptionAddons.js';

test('delivery_order_cancelled es Normal y activa por defecto en delivery', () => {
  assert.equal(resolveAlertPlanTier('delivery_order_cancelled', 'delivery'), 'normal');
  const rules = mergeAlertRules([], { vertical: 'delivery' });
  const rule = rules.find((r) => r.id === 'delivery_order_cancelled');
  assert.equal(rule?.enabled, true);
  assert.ok(rule?.recipientRoles?.includes('Gerente'));
});

test('plan Basic no alcanza reglas Normal del paquete gerente', () => {
  const tier = resolvePlanTier('basic', 'Básico');
  assert.equal(tier, 'basic');
  const ruleTier = resolveAlertPlanTier('delivery_cash_pending_close', 'pdvs');
  assert.equal(ruleTier, 'normal');
});

test('reglas delivery nuevas incluyen destinatarios gerente', () => {
  const rules = mergeAlertRules([], { vertical: 'delivery' });
  const cash = rules.find((r) => r.id === 'delivery_cash_pending_close');
  assert.ok(cash?.recipientRoles?.includes('Admin'));
  assert.ok(cash?.recipientRoles?.includes('Gerente'));
  assert.ok(cash?.channels?.includes('push'));
});
