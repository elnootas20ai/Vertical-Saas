import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ALERT_RULE_DEFINITIONS } from '../services/alertRulesCatalog.js';
import {
  MOBILE_PUSH_RULE_IDS,
  CEO_MOBILE_PUSH_RULE_IDS,
  isMobilePushWhitelisted,
  isCeoUrgentMobilePushRule,
  resolveRuleKey,
} from '../services/pushAlertPolicy.js';

test('whitelist móvil CEO es pequeña y centrada en dinero/caja', () => {
  assert.ok(ALL_ALERT_RULE_DEFINITIONS.length > 60);
  assert.equal(MOBILE_PUSH_RULE_IDS, CEO_MOBILE_PUSH_RULE_IDS);
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.size >= 12);
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.size <= 24, `demasiadas reglas push CEO: ${CEO_MOBILE_PUSH_RULE_IDS.size}`);
});

test('cada regla whitelist existe en el catálogo', () => {
  const catalogIds = new Set(ALL_ALERT_RULE_DEFINITIONS.map((r) => r.id));
  for (const id of CEO_MOBILE_PUSH_RULE_IDS) {
    assert.ok(catalogIds.has(id), `regla desconocida en whitelist: ${id}`);
  }
});

test('incluye críticas y caja / impagos clave', () => {
  for (const id of [
    'delivery_cash_discrepancy',
    'delivery_cash_pending_close',
    'payment_overdue',
    'delivery_unpaid_order',
    'client_payment_overdue',
    'delivery_order_cancelled',
  ]) {
    assert.ok(CEO_MOBILE_PUSH_RULE_IDS.has(id), `falta ${id}`);
  }
});

test('no incluye ruido operativo típico (pedidos/retrasos/stock)', () => {
  for (const id of [
    'delivery_delayed_order',
    'delivery_product_low_stock',
    'lead_new',
    'sala_slow_kitchen_comanda',
    'worker_late_clockin',
  ]) {
    assert.equal(isMobilePushWhitelisted(id, ''), false, `no debería ir al iPhone: ${id}`);
  }
});

test('isCeoUrgentMobilePushRule / isMobilePushWhitelisted', () => {
  assert.equal(isCeoUrgentMobilePushRule('delivery_cash_discrepancy', ''), true);
  assert.equal(isMobilePushWhitelisted('', 'payment_overdue'), true);
  assert.equal(isMobilePushWhitelisted('user_login_new', ''), false);
  assert.equal(resolveRuleKey('', ''), null);
});
