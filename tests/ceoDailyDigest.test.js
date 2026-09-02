import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shortStoreLabel,
  formatCeoDailyPushBody,
  formatCeoDailyCampanaBody,
  buildStoreDigestBlock,
  parseDigestTimeToMinutes,
  resolveCeoDailyDigestRecipients,
} from '../services/ceoDailyDigest.js';
import { CEO_MOBILE_PUSH_RULE_IDS } from '../services/pushAlertPolicy.js';
import { ALL_ALERT_RULE_DEFINITIONS } from '../services/alertRulesCatalog.js';

test('ceo_daily_digest está en catálogo y whitelist push CEO', () => {
  assert.ok(ALL_ALERT_RULE_DEFINITIONS.some((r) => r.id === 'ceo_daily_digest'));
  assert.ok(CEO_MOBILE_PUSH_RULE_IDS.has('ceo_daily_digest'));
});

test('shortStoreLabel limpia LOCAL y sufijo terminal', () => {
  assert.equal(shortStoreLabel('LOCAL TIANA · MOD-04'), 'TIANA');
  assert.equal(shortStoreLabel('LOCAL BADALONA · BAD-01'), 'BADALONA');
});

test('destinatarios digest: solo owner + admin (no gerente)', () => {
  const ids = resolveCeoDailyDigestRecipients({
    owner_user_id: 'owner-1',
    members: [
      { user_id: 'admin-1', role: 'Administrador' },
      { user_id: 'ger-1', role: 'Gerente' },
      { user_id: 'enc-1', role: 'Encargado' },
      { user_id: 'trab-1', role: 'Usuario' },
    ],
  });
  assert.deepEqual(ids.sort(), ['admin-1', 'owner-1']);
});

test('parseDigestTimeToMinutes', () => {
  assert.equal(parseDigestTimeToMinutes('23:50'), 23 * 60 + 50);
  assert.equal(parseDigestTimeToMinutes('09:00'), 9 * 60);
});

test('push corto: platos + total + OK/descuadre por tienda', () => {
  const body = formatCeoDailyPushBody([
    { name: 'Tiana', pizza: 48, burger: 6, taco: 9, cobrado: 980.94, difference: 0 },
    { name: 'Badalona', pizza: 16, burger: 2, taco: 1, cobrado: 243.62, difference: 12.5 },
  ]);
  assert.match(body, /Tiana 48 pizzas · 6 burgers · 9 tacos · 980,94 € · OK/);
  assert.match(body, /Badalona 16 pizzas · 2 burgers · 1 taco · 243,62 € · Descuadre \+12,50 €/);
});

test('campana: cierre OK o descuadre en el bloque', () => {
  const ok = formatCeoDailyCampanaBody(
    [{
      name: 'Tiana',
      brands: [],
      pizza: 1,
      burger: 0,
      taco: 0,
      cobrado: 10,
      tarjeta: 10,
      efectivo: 0,
      enLocal: 5,
      cashIn: 0,
      cashOut: 0,
      retirado: 0,
      difference: 0,
    }],
    '2026-09-02',
  );
  assert.match(ok, /Cierre OK · sin descuadre/);

  const bad = formatCeoDailyCampanaBody(
    [{
      name: 'Tiana',
      brands: [],
      pizza: 1,
      burger: 0,
      taco: 0,
      cobrado: 10,
      tarjeta: 10,
      efectivo: 0,
      enLocal: 5,
      cashIn: 0,
      cashOut: 0,
      retirado: 0,
      difference: -3.2,
    }],
    '2026-09-02',
  );
  assert.match(bad, /Descuadre {2}-3,20 €/);
});

test('campana larga: en local por tienda, sin sumar locales', () => {
  const body = formatCeoDailyCampanaBody(
    [
      {
        name: 'Tiana',
        brands: [{ name: 'MODOMIO', euros: 368.92 }],
        pizza: 48,
        burger: 6,
        taco: 9,
        cobrado: 980.94,
        tarjeta: 386.34,
        efectivo: 164.49,
        enLocal: 144.95,
        cashIn: 0,
        cashOut: 160,
        retirado: 0,
        difference: 0.16,
      },
      {
        name: 'Badalona',
        brands: [{ name: 'MODOMIO', euros: 103.56 }],
        pizza: 16,
        burger: 2,
        taco: 1,
        cobrado: 243.62,
        tarjeta: 111.69,
        efectivo: 9.5,
        enLocal: 90.3,
        cashIn: 1,
        cashOut: 5,
        retirado: 0,
        difference: 0,
      },
    ],
    '2026-08-31',
  );
  assert.match(body, /En local · Tiana {2}144,95 €/);
  assert.match(body, /En local · Badalona {2}90,30 €/);
  assert.doesNotMatch(body, /en locales \(acumulado\)/i);
  assert.match(body, /Salidas 160,00 €/);
  assert.doesNotMatch(body, /Entradas 0,00/);
});

test('buildStoreDigestBlock lee cierre', () => {
  const block = buildStoreDigestBlock({
    status: 'closed',
    pointOfSaleName: 'LOCAL TIANA · MOD-04',
    summary: {
      totalSales: 100,
      salesByMethod: { efectivo: 40, tarjeta: 60 },
      totalCashIn: 0,
      totalCashOut: 10,
    },
    aggregatorClosingTotals: { glovo: 50 },
    aggregatorClosingCash: { glovo: 20 },
    aggregatorClosingCard: { glovo: 30 },
    productClosingCounts: { pizza: 5, burger: 2, taco: 0 },
    closingBrandLabels: { 'brand-1': 'Modomio' },
    closingBrandTpvTotals: { 'brand-1': { efectivo: 40, tarjeta: 60 } },
    finalCashAmount: 80,
    nextDayInitialCash: 75,
    difference: 0,
  });
  assert.equal(block.name, 'TIANA');
  assert.equal(block.pizza, 5);
  assert.equal(block.cobrado, 150);
  assert.equal(block.enLocal, 75);
  assert.equal(block.retirado, 5);
  assert.equal(block.brands[0].name, 'Modomio');
});
