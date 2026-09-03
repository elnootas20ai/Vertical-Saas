import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shortStoreLabel,
  shortBrandLabel,
  formatCeoDailyPushBody,
  formatCeoDailyCampanaBody,
  buildStoreDigestBlock,
  parseDigestTimeToMinutes,
  resolveCeoDailyDigestRecipients,
  brandFoodUnitsLine,
  attachBrandFoodUnits,
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

test('shortBrandLabel iniciales', () => {
  assert.equal(shortBrandLabel('Black Burger'), 'BB');
  assert.equal(shortBrandLabel('Modomio').length, 2);
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

test('brandFoodUnitsLine estilo operativo', () => {
  assert.equal(brandFoodUnitsLine({ name: 'Modomio', pizza: 19, burger: 0, taco: 0 }), 'P 19');
  assert.equal(
    brandFoodUnitsLine({ name: 'Black Burger', pizza: 0, burger: 4, taco: 4 }),
    'BB 4 taco 4',
  );
});

test('attachBrandFoodUnits reparte P/B/T por marca', () => {
  const rows = attachBrandFoodUnits(
    [
      { name: 'Modomio', euros: 600 },
      { name: 'Black Burger', euros: 200 },
    ],
    { pizza: 19, burger: 4, taco: 4 },
  );
  assert.equal(rows[0].pizza, 19);
  assert.equal(rows[0].burger, 0);
  assert.equal(rows[1].burger, 4);
  assert.equal(rows[1].taco, 4);
});

test('push Delivery PRO: marcas, tarjeta/efectivo, salidas, fondo, notas', () => {
  const body = formatCeoDailyPushBody([
    {
      name: 'Tiana',
      dayKey: '2026-09-02',
      pizza: 19,
      burger: 4,
      taco: 4,
      cobrado: 791.23,
      efectivo: 254.45,
      tarjeta: 207.6,
      difference: 0,
      cashOut: 86,
      enLocal: 91.6,
      cashOuts: [
        { name: 'Tejada', amount: 54 },
        { name: 'Jordi', amount: 28 },
        { name: 'Erik', amount: 4 },
      ],
      brands: [
        { name: 'Modomio', euros: 668.28, pizza: 19, burger: 0, taco: 0 },
        { name: 'Black Burger', euros: 122.95, pizza: 0, burger: 4, taco: 4 },
      ],
      notes: 'Subir bdn:\n1 caja mozzarela\n2 lata tomate\nSubir 4 placas de massa.',
    },
  ]);
  assert.match(body, /^TIANA \(02\/09\/26\)/m);
  assert.match(body, /MO 668,28€|MM 668,28€/);
  assert.match(body, /^P 19$/m);
  assert.match(body, /BB 122,95€/);
  assert.match(body, /^BB 4 taco 4$/m);
  assert.match(body, /Tarjeta total 207,60€/);
  assert.match(body, /Efectivo total 254,45€/);
  assert.match(body, /^Tejada 54$/m);
  assert.match(body, /^Jordi 28$/m);
  assert.match(body, /^Erik 4$/m);
  assert.match(body, /Fondo 91,60/);
  assert.match(body, /Subir bdn:/);
  assert.match(body, /mozzarela/);
});

test('push con descuadre lo indica', () => {
  const body = formatCeoDailyPushBody([
    {
      name: 'Badalona',
      dayKey: '2026-09-02',
      pizza: 2,
      burger: 0,
      taco: 0,
      cobrado: 50,
      efectivo: 20,
      tarjeta: 30,
      difference: 12.5,
      cashOut: 0,
      enLocal: 40,
      cashOuts: [],
      brands: [{ name: 'Modomio', euros: 50, pizza: 2, burger: 0, taco: 0 }],
      notes: '',
    },
  ]);
  assert.match(body, /Descuadre \+12,50€/);
});

test('campana usa el mismo parte PRO', () => {
  const body = formatCeoDailyCampanaBody(
    [{
      name: 'Tiana',
      brands: [{ name: 'Modomio', euros: 10, pizza: 1, burger: 0, taco: 0 }],
      pizza: 1,
      burger: 0,
      taco: 0,
      cobrado: 10,
      tarjeta: 10,
      efectivo: 0,
      enLocal: 5,
      cashIn: 0,
      cashOut: 0,
      cashOuts: [],
      retirado: 0,
      difference: 0,
      notes: '',
    }],
    '2026-09-02',
  );
  assert.match(body, /TIANA \(02\/09\/26\)/);
  assert.match(body, /Fondo 5,00/);
});

test('buildStoreDigestBlock lee cierre + salidas por persona', () => {
  const block = buildStoreDigestBlock({
    status: 'closed',
    closedAt: '2026-09-02T22:10:00.000Z',
    pointOfSaleName: 'LOCAL TIANA · MOD-04',
    summary: {
      totalSales: 100,
      salesByMethod: { efectivo: 40, tarjeta: 60 },
      totalCashIn: 0,
      totalCashOut: 54,
    },
    transactions: [
      { type: 'cash_out', amount: 54, workerName: 'Tejada Lopez', description: '' },
    ],
    aggregatorClosingTotals: { glovo: 50 },
    aggregatorClosingCash: { glovo: 20 },
    aggregatorClosingCard: { glovo: 30 },
    productClosingCounts: { pizza: 5, burger: 2, taco: 0 },
    closingBrandLabels: { 'brand-1': 'Modomio', 'brand-2': 'Black Burger' },
    closingBrandTpvTotals: {
      'brand-1': { efectivo: 40, tarjeta: 60 },
      'brand-2': { efectivo: 0, tarjeta: 0 },
    },
    aggregatorClosingBrandTotals: { glovo: { 'brand-2': 50 } },
    finalCashAmount: 80,
    nextDayInitialCash: 75,
    difference: 0,
    closingNotes: 'Subir tomate',
  });
  assert.equal(block.name, 'TIANA');
  assert.equal(block.pizza, 5);
  assert.equal(block.cobrado, 150);
  assert.equal(block.enLocal, 75);
  assert.equal(block.cashOuts[0].name, 'Tejada');
  assert.equal(block.cashOuts[0].amount, 54);
  assert.equal(block.notes, 'Subir tomate');
  const mo = block.brands.find((b) => /modomio/i.test(b.name));
  const bb = block.brands.find((b) => /black/i.test(b.name));
  assert.ok(mo);
  assert.equal(mo.pizza, 5);
  assert.ok(bb);
  assert.equal(bb.burger, 2);
});
