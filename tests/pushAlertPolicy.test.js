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

test('whitelist móvil CEO es pequeña y centrada en dinero/caja/pack gerente', () => {
  assert.ok(ALL_ALERT_RULE_DEFINITIONS.length > 60);
  assert.equal(MOBILE_PUSH_RULE_IDS, CEO_MOBILE_PUSH_RULE_IDS);
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.size >= 12);
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.size <= 40, `demasiadas reglas push CEO: ${CEO_MOBILE_PUSH_RULE_IDS.size}`);
});

test('incluye alertas urgentes carnicería', () => {
  for (const id of [
    'butcher_register_pending',
    'butcher_batch_expired',
    'butcher_stock_critical',
    'butcher_waste_high',
  ]) {
    assert.ok(CEO_MOBILE_PUSH_RULE_IDS.has(id), `falta ${id}`);
  }
});

test('cada regla whitelist existe en el catálogo', () => {
  const catalogIds = new Set(ALL_ALERT_RULE_DEFINITIONS.map((r) => r.id));
  for (const id of CEO_MOBILE_PUSH_RULE_IDS) {
    assert.ok(catalogIds.has(id), `regla desconocida en whitelist: ${id}`);
  }
});

test('incluye críticas y caja / impagos / fichaje clave', () => {
  for (const id of [
    'delivery_cash_discrepancy',
    'delivery_cash_pending_close',
    'delivery_register_closed_ok',
    'delivery_register_closed_discrepancy',
    'delivery_order_very_delayed',
    'payment_overdue',
    'delivery_unpaid_order',
    'client_payment_overdue',
    'delivery_order_cancelled',
    'worker_no_clockin',
  ]) {
    assert.ok(CEO_MOBILE_PUSH_RULE_IDS.has(id), `falta ${id}`);
  }
});

test('no incluye ruido operativo típico (pedidos/retrasos/stock/docs)', () => {
  for (const id of [
    'delivery_delayed_order',
    'delivery_product_low_stock',
    'lead_new',
    'sala_slow_kitchen_comanda',
    'worker_late_clockin',
    'document_expired',
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
