import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ALERT_RULE_DEFINITIONS } from '../services/alertRulesCatalog.js';
import { resolveAlertPlanTier } from '../services/alertPlanTiers.js';
import {
  MOBILE_PUSH_RULE_IDS,
  isMobilePushWhitelisted,
  resolveRuleKey,
} from '../services/pushAlertPolicy.js';

test('whitelist móvil es pequeña frente al catálogo completo', () => {
  assert.ok(ALL_ALERT_RULE_DEFINITIONS.length > 60);
  assert.ok(MOBILE_PUSH_RULE_IDS.size >= 20);
  assert.ok(MOBILE_PUSH_RULE_IDS.size <= 40, `demasiadas reglas push: ${MOBILE_PUSH_RULE_IDS.size}`);
});

test('cada regla whitelist existe en el catálogo', () => {
  const catalogIds = new Set(ALL_ALERT_RULE_DEFINITIONS.map((r) => r.id));
  for (const id of MOBILE_PUSH_RULE_IDS) {
    assert.ok(catalogIds.has(id), `regla desconocida en whitelist: ${id}`);
  }
});

test('básico, normal y pro tienen push móvil representativo', () => {
  const byTier = { basic: 0, normal: 0, pro: 0 };
  for (const id of MOBILE_PUSH_RULE_IDS) {
    const def = ALL_ALERT_RULE_DEFINITIONS.find((r) => r.id === id);
    const tier = resolveAlertPlanTier(id, def?.department || 'operaciones');
    byTier[tier] += 1;
  }
  assert.ok(byTier.basic >= 4, `basic: ${byTier.basic}`);
  assert.ok(byTier.normal >= 8, `normal: ${byTier.normal}`);
  assert.ok(byTier.pro >= 4, `pro: ${byTier.pro}`);
});

test('isMobilePushWhitelisted respeta ruleId y category', () => {
  assert.equal(isMobilePushWhitelisted('lead_new', ''), true);
  assert.equal(isMobilePushWhitelisted('', 'delivery_delayed_order'), true);
  assert.equal(isMobilePushWhitelisted('user_login_new', ''), false);
  assert.equal(resolveRuleKey('', ''), null);
});
