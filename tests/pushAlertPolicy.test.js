import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ALERT_RULE_DEFINITIONS,
  isCierreCajaAlertRule,
  listCierreCajaMobilePushRuleIds,
} from '../services/alertRulesCatalog.js';
import {
  MOBILE_PUSH_RULE_IDS,
  CEO_MOBILE_PUSH_RULE_IDS,
  isMobilePushWhitelisted,
  isCeoUrgentMobilePushRule,
  resolveRuleKey,
} from '../services/pushAlertPolicy.js';

test('whitelist móvil = solo cierre (deducido del catálogo Alertas)', () => {
  assert.ok(ALL_ALERT_RULE_DEFINITIONS.length > 60);
  assert.equal(MOBILE_PUSH_RULE_IDS, CEO_MOBILE_PUSH_RULE_IDS);
  const deduced = new Set(listCierreCajaMobilePushRuleIds());
  assert.deepEqual([...CEO_MOBILE_PUSH_RULE_IDS].sort(), [...deduced].sort());
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.has('ceo_daily_digest'), 'falta resumen cierre');
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.size >= 1);
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.size <= 20, `demasiadas reglas push: ${CEO_MOBILE_PUSH_RULE_IDS.size}`);
});

test('isCierreCajaAlertRule sigue departamento pdvs + categoría caja', () => {
  const byId = Object.fromEntries(ALL_ALERT_RULE_DEFINITIONS.map((r) => [r.id, r]));
  assert.equal(isCierreCajaAlertRule(byId.ceo_daily_digest), true);
  assert.equal(isCierreCajaAlertRule(byId.delivery_cash_discrepancy), true);
  assert.equal(isCierreCajaAlertRule(byId.delivery_cash_pending_close), true);
  assert.equal(isCierreCajaAlertRule(byId.delivery_register_closed_discrepancy), true);
  assert.equal(isCierreCajaAlertRule(byId.delivery_register_not_opened), false);
  assert.equal(isCierreCajaAlertRule(byId.register_high_return), false);
  assert.equal(isCierreCajaAlertRule(byId.delivery_order_cancelled), false);
  assert.equal(isCierreCajaAlertRule(byId.worker_no_clockin), false);
});

test('cada regla whitelist existe en el catálogo', () => {
  const catalogIds = new Set(ALL_ALERT_RULE_DEFINITIONS.map((r) => r.id));
  for (const id of CEO_MOBILE_PUSH_RULE_IDS) {
    assert.ok(catalogIds.has(id), `regla desconocida en whitelist: ${id}`);
  }
});

test('incluye cierre / descuadre caja; no ruido operativo', () => {
  for (const id of [
    'ceo_daily_digest',
    'delivery_cash_discrepancy',
    'delivery_cash_pending_close',
    'delivery_register_closed_discrepancy',
  ]) {
    assert.ok(CEO_MOBILE_PUSH_RULE_IDS.has(id), `falta ${id}`);
  }
  // Cierre OK es in-app en catálogo; el push unificado es ceo_daily_digest.
  assert.equal(
    CEO_MOBILE_PUSH_RULE_IDS.has('delivery_register_closed_ok'),
    false,
    'cierre OK in-app no debe ir solo a push',
  );
  for (const id of [
    'delivery_delayed_order',
    'delivery_order_cancelled',
    'worker_no_clockin',
    'payment_overdue',
    'butcher_stock_critical',
    'document_expired',
    'user_login_new',
  ]) {
    assert.equal(isMobilePushWhitelisted(id, ''), false, `no debería ir al iPhone: ${id}`);
  }
});

test('isCeoUrgentMobilePushRule / isMobilePushWhitelisted', () => {
  assert.equal(isCeoUrgentMobilePushRule('delivery_cash_discrepancy', ''), true);
  assert.equal(isMobilePushWhitelisted('ceo_daily_digest', ''), true);
  assert.equal(isMobilePushWhitelisted('', 'ceo_daily_digest'), true);
  assert.equal(isMobilePushWhitelisted('user_login_new', ''), false);
  assert.equal(resolveRuleKey('', ''), null);
});
