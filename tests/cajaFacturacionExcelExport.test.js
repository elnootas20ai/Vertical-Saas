import { describe, expect, it } from 'vitest';
import {
  buildCajaClosingsWorkbook,
  buildCajaComparativaYearSheetAoa,
  buildCajaMonthSheet,
  buildCajaSheetAoa,
  brandMoneyShares,
  canDownloadCajaExcel,
  sessionToCajaAmounts,
  splitSessionCajaAmountsByBillingSheet,
  splitCajaAmountsByBrand,
  isTrustworthyClosingBrandTpvForExcel,
  BLACKBURGER_HEADERS,
  CAJA_MONEY_HEADERS,
  MODOMIO_HEADERS,
} from '../src/app/lib/cajaFacturacionExcelExport.ts';
import { resolveClosingBrandTpvForExcelExport, closingBrandTpvTotalsFromBillingRows } from '../src/app/lib/cajaExcelBrandTpvEnrich.ts';

describe('canDownloadCajaExcel', () => {
  it('permite cuenta dueña (no worker) y Admin; bloquea cajero/trabajador', () => {
    expect(canDownloadCajaExcel({ user_id: 'ceo', accountType: 'company' })).toBe(true);
    expect(canDownloadCajaExcel({ user_id: 'a1', accountType: 'user', role: 'Admin' })).toBe(true);
    expect(canDownloadCajaExcel(
      { user_id: 'own', accountType: 'user', invitedBy: 'x' },
      [{ owner_user_id: 'own' }],
    )).toBe(true);
    expect(canDownloadCajaExcel({
      user_id: 'w1',
      accountType: 'user',
      invitedBy: 'ceo',
      role: 'Encargado',
    })).toBe(false);
    expect(canDownloadCajaExcel({
      user_id: 'w2',
      accountType: 'user',
      invitedBy: 'ceo',
      role: 'Gerente',
    })).toBe(false);
    expect(canDownloadCajaExcel(null)).toBe(false);
  });
});

function closedSession(partial) {
  return {
    _id: 's1',
    status: 'closed',
    pointOfSaleId: 'pdv-a',
    pointOfSaleName: 'Tienda A',
    openedAt: '2026-07-10T10:00:00.000Z',
    closedAt: '2026-07-10T22:00:00.000Z',
    summary: {
      salesByMethod: { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
      salesByChannel: {},
      totalSales: 0,
    },
    aggregatorClosingTotals: {},
    productClosingCounts: { pizza: 0, burger: 0, taco: 0 },
    ...partial,
  };
}

describe('sessionToCajaAmounts', () => {
  it('mapea VISA + B(Bizum/otro) + aggregators + Vertial/Flipdish por separado', () => {
    const amounts = sessionToCajaAmounts(closedSession({
      summary: {
        salesByMethod: { efectivo: 100.5, tarjeta: 40, bizum: 12, online: 0, otro: 3 },
        salesByChannel: { app: 10 },
        totalSales: 140.5,
      },
      aggregatorClosingTotals: {
        justeat: 50,
        ubereats: 30,
        glovo: 20,
        flipdish: 15,
      },
      productClosingCounts: { pizza: 7, burger: 2, taco: 1 },
    }));

    expect(amounts.efectivo).toBe(100.5);
    expect(amounts.tpv).toBe(40);
    expect(amounts.visa).toBe(40);
    expect(amounts.x).toBe(15);
    expect(amounts.justEat).toBe(50);
    expect(amounts.uber).toBe(30);
    expect(amounts.glovo).toBe(20);
    expect(amounts.vertial).toBe(10);
    expect(amounts.flipdish).toBe(15);
    expect(amounts.app).toBe(25);
    expect(amounts.total).toBe(280.5);
    expect(amounts.totalPizza).toBe(7);
    expect(amounts.totalBurger).toBe(2);
    expect(amounts.totalTaco).toBe(1);
  });

  it('si el total está en marcas y el canal a 0, las marcas cuentan; el no-pagado no', () => {
    const amounts = sessionToCajaAmounts(closedSession({
      aggregatorClosingTotals: { glovo: 0, flipdish: 0 },
      aggregatorClosingCard: { flipdish: 48.2 },
      aggregatorClosingBrandTotals: {
        glovo: { 'brand-mm': 80, 'brand-bb': 20 },
      },
    }));
    expect(amounts.glovo).toBe(100);
    expect(amounts.app).toBe(0);
  });
});

describe('splitSessionCajaAmountsByBillingSheet', () => {
  const sheets = [
    {
      id: 'modomio',
      label: 'MODOMIO',
      brandIds: ['brand-mm'],
      unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
    },
    {
      id: 'blackburger',
      label: 'BLACK BURGER',
      brandIds: ['brand-bb'],
      unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
    },
  ];

  it('App/Glovo van al total de marca del cierre, no al % de pizzas', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 100,
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 50, tarjeta: 0 },
        'brand-bb': { efectivo: 50, tarjeta: 0 },
      },
      aggregatorClosingTotals: { glovo: 100 },
      aggregatorClosingBrandTotals: {
        glovo: { 'brand-mm': 100 },
      },
      productClosingCounts: { pizza: 5, burger: 5, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.efectivo).toBe(50);
    expect(bb.efectivo).toBe(50);
    expect(mm.glovo).toBe(100);
    expect(bb.glovo).toBe(0);
    expect(mm.total).toBe(150);
    expect(bb.total).toBe(50);
  });

  it('sin Caja 1 por marca: Vertial (ef/tpv) reparte por % uds', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 40, bizum: 10, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 150,
      },
      productClosingCounts: { pizza: 9, burger: 1, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.efectivo).toBe(90);
    expect(mm.tpv).toBe(36);
    expect(mm.x).toBe(9);
    expect(bb.efectivo).toBe(10);
    expect(bb.tpv).toBe(4);
    expect(bb.x).toBe(1);
  });

  it('efectivo/tarjeta usan Caja 1 por marca, no el % de pizzas/burgers', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 200, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 300,
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 90, tarjeta: 150 },
        'brand-bb': { efectivo: 10, tarjeta: 50 },
      },
      productClosingCounts: { pizza: 9, burger: 1, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    // Por unidades sería 90/10; Caja 1 real (dashboard) es 90+150 / 10+50
    expect(mm.efectivo).toBe(90);
    expect(mm.tpv).toBe(150);
    expect(bb.efectivo).toBe(10);
    expect(bb.tpv).toBe(50);
    expect(mm.total + bb.total).toBe(300);
  });

  it('ignora Caja 1 corrupta (uds como €) y reparte ef/tpv por % uds', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 368.28, tarjeta: 50, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 418.28,
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 149, tarjeta: 0 },
        'brand-bb': { efectivo: 0, tarjeta: 1 },
      },
      productClosingCounts: { pizza: 149, burger: 1, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.efectivo).toBeCloseTo(368.28 * (149 / 150), 2);
    expect(mm.tpv).toBeCloseTo(50 * (149 / 150), 2);
    expect(bb.efectivo).toBeCloseTo(368.28 / 150, 2);
    expect(bb.tpv).toBeCloseTo(50 / 150, 2);
    expect(mm.totalPizza).toBe(149);
    expect(bb.totalBurger).toBe(1);
  });

  it('resolveClosingBrandTpvForExcelExport descarta Caja 1 corrupta', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 368.28, tarjeta: 50, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 418.28,
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 149, tarjeta: 0 },
        'brand-bb': { efectivo: 0, tarjeta: 1 },
      },
      productClosingCounts: { pizza: 149, burger: 1, taco: 0 },
    });
    expect(isTrustworthyClosingBrandTpvForExcel(session, sessionToCajaAmounts(session))).toBe(false);
    const fromOrders = {
      'brand-mm': { efectivo: 360, tarjeta: 48 },
      'brand-bb': { efectivo: 8.28, tarjeta: 2 },
    };
    expect(resolveClosingBrandTpvForExcelExport(session, fromOrders)).toEqual(fromOrders);
    expect(resolveClosingBrandTpvForExcelExport(session, null)).toBeUndefined();
  });

  it('closingBrandTpvTotalsFromBillingRows reparte cobro tienda por € marca si falta ef/tj', () => {
    const totals = closingBrandTpvTotalsFromBillingRows(
      [
        { brandId: 'brand-mm', name: 'MM', revenue: 600, revenueEfectivo: 0, revenueTarjeta: 0, ownRevenue: 600, sharedAssigned: 0, orderCount: 10, sharePercent: 90, why: '' },
        { brandId: 'brand-bb', name: 'BB', revenue: 100, revenueEfectivo: 0, revenueTarjeta: 0, ownRevenue: 100, sharedAssigned: 0, orderCount: 2, sharePercent: 10, why: '' },
      ],
      59.75,
      657.84,
    );
    expect(totals['brand-mm'].efectivo).toBeCloseTo(51.21, 2);
    expect(totals['brand-mm'].tarjeta).toBeCloseTo(563.86, 2);
    expect(totals['brand-bb'].efectivo).toBeCloseTo(8.54, 2);
    expect(totals['brand-bb'].tarjeta).toBeCloseTo(93.98, 2);
    expect(totals['brand-mm'].tarjeta + totals['brand-bb'].tarjeta).toBeCloseTo(657.84, 2);
  });

  it('ago-22 prod Tiana: sin Caja 1 guardada reparte tienda por uds (MM)', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 59.75, tarjeta: 657.84, bizum: 0, online: 0, otro: 0 },
        salesByChannel: { glovo: 100, justeat: 114.19, ubereats: 33.89, flipdish: 54.28 },
        totalSales: 1094.43,
      },
      aggregatorClosingTotals: { glovo: 100, justeat: 114.19, ubereats: 33.89, flipdish: 54.28 },
      productClosingCounts: { pizza: 57, burger: 6, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    expect(mm.efectivo).toBeCloseTo(54.06, 2);
    expect(mm.tpv).toBeCloseTo(595.19, 2);
    expect(mm.totalPizza).toBe(57);
  });

  it('enlaza Caja 1 por nombre aunque brandIds de hoja estén vacíos (Modomio Pizza → MODOMIO)', () => {
    const legacy = [
      {
        id: 'modomio',
        label: 'MODOMIO',
        brandIds: [],
        unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
      },
      {
        id: 'blackburger',
        label: 'BLACK BURGER',
        brandIds: [],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
    ];
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 200, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 300,
      },
      closingBrandLabels: {
        'uuid-mm': 'Modomio Pizza',
        'uuid-bb': 'Black Burger Badalona',
      },
      closingBrandTpvTotals: {
        'uuid-mm': { efectivo: 80, tarjeta: 180 },
        'uuid-bb': { efectivo: 20, tarjeta: 20 },
      },
      // Unidades dirían casi todo a Modomio; Caja 1 manda
      productClosingCounts: { pizza: 9, burger: 1, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, legacy[0], legacy);
    const bb = splitSessionCajaAmountsByBillingSheet(session, legacy[1], legacy);
    expect(mm.tpv).toBe(180);
    expect(bb.tpv).toBe(20);
    expect(mm.efectivo).toBe(80);
    expect(bb.efectivo).toBe(20);
    expect(mm.total + bb.total).toBe(300);
  });

  it('Badalona 06 ago: MM Vertial por uds; integradores = Total MM del cierre', () => {
    const session = closedSession({
      _id: 'tpvreg-de2decbb',
      pointOfSaleId: 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6',
      pointOfSaleName: 'BADALONA',
      openedAt: '2026-08-06T10:00:00.000Z',
      closedAt: '2026-08-06T22:00:00.000Z',
      summary: {
        salesByMethod: { efectivo: 18.9, tarjeta: 133.7, bizum: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 152.6,
      },
      aggregatorClosingTotals: { glovo: 159.37, justeat: 74.39, ubereats: 24.89 },
      aggregatorClosingBrandTotals: {
        glovo: { 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec': 159.37 },
        justeat: { 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec': 74.39 },
        ubereats: { 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec': 24.89 },
      },
      productClosingCounts: { pizza: 29, burger: 2, taco: 1 },
    });
    const legacy = [
      {
        id: 'modomio',
        label: 'MODOMIO',
        brandIds: ['brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec'],
        unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
      },
      {
        id: 'blackburger',
        label: 'BLACK BURGER',
        brandIds: [],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
    ];
    const mm = splitSessionCajaAmountsByBillingSheet(session, legacy[0], legacy);
    const bb = splitSessionCajaAmountsByBillingSheet(session, legacy[1], legacy);
    // 29/31 del Vertial tienda (pizza vs burger; taco no en columnas de hoja)
    expect(mm.efectivo).toBe(17.68);
    expect(mm.tpv).toBe(125.07);
    expect(mm.glovo).toBe(159.37);
    expect(mm.justEat).toBe(74.39);
    expect(mm.uber).toBe(24.89);
    expect(mm.totalPizza).toBe(29);
    expect(bb.totalBurger).toBe(2);
    expect(bb.glovo).toBe(0);
  });

  it('Caja 1 por marca: solo lo declarado (sin sumar resto de tienda)', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 110, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 210,
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 90, tarjeta: 90 },
        'brand-bb': { efectivo: 10, tarjeta: 10 },
      },
      productClosingCounts: { pizza: 1, burger: 1, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.tpv).toBe(90);
    expect(bb.tpv).toBe(10);
    expect(mm.efectivo).toBe(90);
    expect(bb.efectivo).toBe(10);
  });

  it('X (Bizum/otro) sigue el reparto de dinero Vertial, no el % de unidades', () => {
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 80, tarjeta: 20, bizum: 50, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 150,
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 80, tarjeta: 20 },
        'brand-bb': { efectivo: 0, tarjeta: 0 },
      },
      // Unidades dirían 50/50; el dinero Vertial es 100% Modomio
      productClosingCounts: { pizza: 1, burger: 1, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.x).toBe(50);
    expect(bb.x).toBe(0);
    expect(mm.total + bb.total).toBe(150);
  });

  it('sin brandIds en hojas, enlaza por nombre del cierre (MODOMIO / BLACKBURGER)', () => {
    const legacy = [
      {
        id: 'modomio',
        label: 'MODOMIO',
        brandIds: [],
        unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
      },
      {
        id: 'blackburger',
        label: 'BLACK BURGER',
        brandIds: [],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
    ];
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 100,
      },
      closingBrandLabels: {
        'brand-mm': 'MODOMIO',
        'brand-bb': 'BLACKBURGER',
      },
      closingBrandTpvTotals: {
        'brand-mm': { efectivo: 100, tarjeta: 0 },
        'brand-bb': { efectivo: 0, tarjeta: 0 },
      },
      aggregatorClosingTotals: { glovo: 100 },
      aggregatorClosingBrandTotals: {
        glovo: { 'brand-mm': 70, 'brand-bb': 30 },
      },
      productClosingCounts: { pizza: 5, burger: 5, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, legacy[0], legacy);
    const bb = splitSessionCajaAmountsByBillingSheet(session, legacy[1], legacy);
    expect(mm.glovo).toBe(70);
    expect(bb.glovo).toBe(30);
    expect(mm.total + bb.total).toBe(200);
  });

  it('Total MM/BB del cierre van a su hoja via closingBrandSheetIds (4 pestanas)', () => {
    const sheets = [
      {
        id: 'sheet-mm',
        label: 'MODOMIO',
        brandIds: [],
        unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
      },
      {
        id: 'sheet-bb',
        label: 'BLACK BURGER',
        brandIds: [],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
    ];
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 0,
      },
      closingBrandLabels: {
        'uuid-mm': 'Modomio Random',
        'uuid-bb': 'Black Random',
      },
      closingBrandSheetIds: {
        'uuid-mm': 'sheet-mm',
        'uuid-bb': 'sheet-bb',
      },
      aggregatorClosingTotals: { glovo: 200, ubereats: 100 },
      aggregatorClosingBrandTotals: {
        glovo: { 'uuid-mm': 150, 'uuid-bb': 50 },
        ubereats: { 'uuid-mm': 40, 'uuid-bb': 60 },
      },
      productClosingCounts: { pizza: 10, burger: 10, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.glovo).toBe(150);
    expect(bb.glovo).toBe(50);
    expect(mm.uber).toBe(40);
    expect(bb.uber).toBe(60);
    expect(mm.total + bb.total).toBe(300);
  });
});

describe('brandMoneyShares / splitCajaAmountsByBrand', () => {
  it('reparte €: pizzas → MODOMIO; burgers+tacos → BLACK BURGER', () => {
    expect(brandMoneyShares(7, 2, 1)).toEqual({
      modomio: 0.7,
      blackburger: 0.3,
    });
    const full = sessionToCajaAmounts(closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 100,
      },
      productClosingCounts: { pizza: 7, burger: 2, taco: 1 },
    }));
    const modo = splitCajaAmountsByBrand(full, 'modomio');
    const bb = splitCajaAmountsByBrand(full, 'blackburger');
    expect(modo.efectivo).toBe(70);
    expect(bb.efectivo).toBe(30);
    expect(modo.totalPizza).toBe(7);
    expect(modo.totalBurger).toBe(0);
    expect(bb.totalBurger).toBe(2);
    expect(bb.totalTaco).toBe(1);
    expect(bb.totalPizza).toBe(0);
  });
});

describe('buildCajaMonthSheet', () => {
  it('suma varios cierres del mismo día en una fila', () => {
    const sessions = [
      closedSession({
        _id: 'a',
        openedAt: '2026-07-05T09:00:00',
        summary: {
          salesByMethod: { efectivo: 10, tarjeta: 5, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 15,
        },
        aggregatorClosingTotals: { justeat: 2 },
        productClosingCounts: { pizza: 3, burger: 1, taco: 0 },
      }),
      closedSession({
        _id: 'b',
        openedAt: '2026-07-05T18:00:00',
        summary: {
          salesByMethod: { efectivo: 20, tarjeta: 1, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 21,
        },
        aggregatorClosingTotals: { glovo: 4, flipdish: 8 },
        productClosingCounts: { pizza: 2, burger: 0, taco: 2 },
      }),
      closedSession({
        _id: 'other-pdv',
        pointOfSaleId: 'pdv-b',
        openedAt: '2026-07-05T12:00:00',
        summary: {
          salesByMethod: { efectivo: 999, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 999,
        },
        productClosingCounts: { pizza: 50, burger: 0, taco: 0 },
      }),
    ];

    const sheet = buildCajaMonthSheet(sessions, {
      pointOfSaleId: 'pdv-a',
      yearMonth: '2026-07',
    });

    expect(sheet).not.toBeNull();
    expect(sheet.monthLabel).toBe('JULIO 2026');
    expect(sheet.daysInMonth).toBe(31);

    const day5 = sheet.rows.find((r) => r.day === 5);
    expect(day5.efectivo).toBe(30);
    expect(day5.tpv).toBe(6);
    expect(day5.justEat).toBe(2);
    expect(day5.glovo).toBe(4);
    expect(day5.flipdish).toBe(8);
    expect(day5.app).toBe(8);
    expect(day5.total).toBe(50);
    expect(day5.totalPizza).toBe(5);
    expect(day5.totalBurger).toBe(1);
    expect(day5.totalTaco).toBe(2);

    expect(sheet.monthTotal).toBe(50);
    expect(sheet.monthTotalPizzas).toBe(5);
  });

  it('sin PDV suma todas las tiendas del mes', () => {
    const sessions = [
      closedSession({
        _id: 'a',
        openedAt: '2026-07-05T09:00:00',
        summary: {
          salesByMethod: { efectivo: 10, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 10,
        },
        productClosingCounts: { pizza: 1, burger: 0, taco: 0 },
      }),
      closedSession({
        _id: 'b',
        pointOfSaleId: 'pdv-b',
        pointOfSaleName: 'Tienda B',
        openedAt: '2026-07-05T12:00:00',
        summary: {
          salesByMethod: { efectivo: 20, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 20,
        },
        productClosingCounts: { pizza: 2, burger: 0, taco: 0 },
      }),
    ];
    const all = buildCajaMonthSheet(sessions, { yearMonth: '2026-07' });
    expect(all.rows.find((r) => r.day === 5).efectivo).toBe(30);
    expect(all.monthTotalPizzas).toBe(3);
  });

  it('AOA plantilla clasica de cierres (foto) + COMPARATIVA por meses', () => {
    const sessions = [
      closedSession({
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 100,
        },
        closingBrandLabels: { 'brand-mm': 'MODOMIO', 'brand-bb': 'BLACK BURGER' },
        closingBrandTpvTotals: {
          'brand-mm': { efectivo: 70, tarjeta: 0 },
          'brand-bb': { efectivo: 30, tarjeta: 0 },
        },
        productClosingCounts: { pizza: 7, burger: 2, taco: 1 },
      }),
      closedSession({
        _id: 's-aug',
        openedAt: '2026-08-10T10:00:00',
        closedAt: '2026-08-10T22:00:00',
        summary: {
          salesByMethod: { efectivo: 50, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 50,
        },
        closingBrandLabels: { 'brand-mm': 'MODOMIO' },
        closingBrandTpvTotals: {
          'brand-mm': { efectivo: 50, tarjeta: 0 },
        },
        productClosingCounts: { pizza: 5, burger: 0, taco: 0 },
      }),
    ];
    const sheet = buildCajaMonthSheet(sessions, { pointOfSaleId: 'pdv-a', yearMonth: '2026-07' });

    expect(CAJA_MONEY_HEADERS).toEqual([
      'DIA', 'EFECTIVO', 'VISA', 'JUST EAT', 'UBER', 'GLOVO', 'FLIPDISH', 'TOTAL',
    ]);
    expect(MODOMIO_HEADERS).toContain('VISA');
    expect(MODOMIO_HEADERS).toContain('FLIPDISH');
    expect(MODOMIO_HEADERS).not.toContain('VERTIAL');
    expect(MODOMIO_HEADERS).toContain('GLOVO');
    expect(MODOMIO_HEADERS).not.toContain('TPV');
    expect(MODOMIO_HEADERS).not.toContain('App');

    const modo = buildCajaSheetAoa(sheet, 'modomio');
    expect(modo[0][0]).toContain('MODOMIO');
    expect(modo[2][1]).toBe('VERTIAL');
    expect(modo[2][3]).toBe('INTEGRADORES');
    expect(modo[2][7]).toBe('TOTAL');
    expect(modo[3]).toEqual([...MODOMIO_HEADERS]);
    // Día 1 · Caja 1 del cierre (70 Modomio / 30 BB)
    expect(modo[4]).toEqual([1, 70, '', '', '', '', '', 70, 7]);
    expect(modo[6]).toEqual(['TOTAL MES', 70, '', '', '', '', '', 70, 7]);

    const bb = buildCajaSheetAoa(sheet, 'blackburger');
    expect(bb[0][0]).toContain('BLACK BURGER');
    expect(bb[3]).toEqual([...BLACKBURGER_HEADERS]);
    expect(bb[4]).toEqual([1, 30, '', '', '', '', '', 30, 2, 1]);
    expect(bb[6]).toEqual(['TOTAL MES', 30, '', '', '', '', '', 30, 2, 1]);

    const comp = buildCajaComparativaYearSheetAoa(sessions, {
      pointOfSaleId: 'pdv-a',
      year: 2026,
      billingSheets: null,
    });
    expect(comp[0][0]).toContain('COMPARATIVA · 2026');
    expect(comp[0][0]).not.toContain('TODAS LAS TIENDAS');
    const headerRow = comp.find((r) => r[0] === 'MES');
    expect(headerRow).toEqual([
      'MES',
      'MODOMIO TOTAL',
      'TOTAL PIZZA',
      'BLACK BURGER TOTAL',
      'TOTAL BURGUER',
      'TOTAL TACOS',
      'TOTAL MES',
    ]);
    const julio = comp.find((r) => r[0] === 'JULIO');
    expect(julio).toEqual(['JULIO', 70, 7, 30, 2, 1, 100]);
    const agosto = comp.find((r) => r[0] === 'AGOSTO');
    expect(agosto).toEqual(['AGOSTO', 50, 5, '', '', '', 50]);
    const yearTotal = comp.find((r) => r[0] === 'TOTAL AÑO');
    expect(yearTotal).toEqual(['TOTAL AÑO', 120, 12, 30, 2, 1, 150]);
  });

  it('libro: MM/BB × tienda (hub EXCEL 1…4) → RESUMEN → COMPARATIVA', () => {
    const sessions = [
      closedSession({
        _id: 'tiana',
        pointOfSaleId: 'pdv-tiana',
        pointOfSaleName: 'Tiana',
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 70, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 70,
        },
        productClosingCounts: { pizza: 7, burger: 0, taco: 0 },
      }),
      closedSession({
        _id: 'badalona',
        pointOfSaleId: 'pdv-bad',
        pointOfSaleName: 'Badalona',
        openedAt: '2026-07-01T11:00:00',
        summary: {
          salesByMethod: { efectivo: 30, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 30,
        },
        productClosingCounts: { pizza: 0, burger: 2, taco: 1 },
      }),
    ];
    const built = buildCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      historyRange: 'all',
      pointsOfSale: [
        { id: 'pdv-tiana', name: 'Tiana' },
        { id: 'pdv-bad', name: 'Badalona' },
      ],
    });
    expect(built.historyRange).toBe('all');
    expect(built.sheetNames.slice(0, 4)).toEqual([
      'MM TIANA',
      'BB TIANA',
      'MM BADALONA',
      'BB BDN',
    ]);
    expect(built.sheetNames).toContain('RESUMEN');
    expect(built.sheetNames[built.sheetNames.length - 1]).toBe('COMPARATIVA');
    expect(built.rows).toBe(1);

    const modoTitle = String(built.workbook.Sheets['MM TIANA']?.A1?.v || '');
    expect(modoTitle).toContain('MM TIANA');
    expect(modoTitle).toContain('HISTORIAL');
    const bbBdnTitle = String(built.workbook.Sheets['BB BDN']?.A1?.v || '');
    expect(bbBdnTitle).toContain('BB BDN');
    const resumenTitle = String(built.workbook.Sheets.RESUMEN?.A1?.v || '');
    expect(resumenTitle).toContain('RESUMEN');
    expect(resumenTitle).toContain('HISTORIAL');
    const compTitle = String(built.workbook.Sheets.COMPARATIVA?.A1?.v || '');
    expect(compTitle).toContain('TODAS LAS TIENDAS');
  });

  it('Excel no incluye tiendas de otra empresa aunque vengan en sessions', () => {
    const sessions = [
      closedSession({
        _id: 'own',
        pointOfSaleId: 'pdv-tiana',
        pointOfSaleName: 'Tiana',
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 70, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 70,
        },
        closingBrandLabels: { 'brand-mm': 'MODOMIO' },
        closingBrandTpvTotals: { 'brand-mm': { efectivo: 70, tarjeta: 0 } },
        productClosingCounts: { pizza: 7, burger: 0, taco: 0 },
      }),
      closedSession({
        _id: 'foreign',
        pointOfSaleId: 'pdv-otra-empresa',
        pointOfSaleName: 'Otra Empresa',
        openedAt: '2026-07-01T11:00:00',
        summary: {
          salesByMethod: { efectivo: 999, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 999,
        },
        productClosingCounts: { pizza: 50, burger: 0, taco: 0 },
      }),
    ];
    const built = buildCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      pointsOfSale: [{ id: 'pdv-tiana', name: 'Tiana' }],
    });
    expect(built.sheetNames).toContain('MM TIANA');
    expect(built.sheetNames).not.toContain('Otra Empresa');
    const modoTitle = String(built.workbook.Sheets['MM TIANA']?.A1?.v || '');
    expect(modoTitle).toContain('MM TIANA');
    // Marca solo suma la tienda de esta empresa (70), no 999
    const totalCell = built.workbook.Sheets['MM TIANA']?.H5?.v;
    expect(Number(totalCell)).toBe(70);
  });

  it('si el mes elegido está vacío, usa el mes con cierres', () => {
    const sessions = [
      closedSession({
        openedAt: '2026-07-15T10:00:00',
        summary: {
          salesByMethod: { efectivo: 40, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 40,
        },
        productClosingCounts: { pizza: 4, burger: 0, taco: 0 },
      }),
    ];
    const built = buildCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-08',
      historyRange: 'all',
      pointsOfSale: [{ id: 'pdv-a', name: 'Tienda A' }],
    });
    expect(built.yearMonth).toBe('2026-07');
    expect(built.historyRange).toBe('all');
    expect(built.rows).toBeGreaterThan(0);
    const firstBrandSheet = built.sheetNames.find((n) => n.startsWith('MM ')) || built.sheetNames[0];
    const title = String(built.workbook.Sheets[firstBrandSheet]?.A1?.v || '');
    expect(title).toContain('HISTORIAL');
  });

  it('alcance mes usa columna DIA (plantilla foto)', () => {
    const sessions = [
      closedSession({
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 40, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 40,
        },
        productClosingCounts: { pizza: 4, burger: 0, taco: 0 },
      }),
    ];
    const built = buildCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      historyRange: 'month',
      pointsOfSale: [{ id: 'pdv-a', name: 'Tienda A' }],
    });
    expect(built.historyRange).toBe('month');
    const headerRow = built.workbook.Sheets['MM TIENDA']?.A4?.v
      || built.workbook.Sheets[built.sheetNames[0]]?.A4?.v;
    expect(headerRow).toBe('DIA');
    const groupRow = built.workbook.Sheets['MM TIENDA']?.B3?.v
      || built.workbook.Sheets[built.sheetNames[0]]?.B3?.v;
    expect(groupRow).toBe('VERTIAL');
  });

  it('nombre de archivo y títulos usan el nombre de la empresa', () => {
    const sessions = [
      closedSession({
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 40, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 40,
        },
        productClosingCounts: { pizza: 4, burger: 0, taco: 0 },
      }),
    ];
    const built = buildCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      historyRange: 'month',
      businessName: 'Royo del Amor',
      pointsOfSale: [{ id: 'pdv-a', name: 'Tiana' }],
    });
    expect(built.baseName).toBe('Royo-del-Amor-facturacion-2026-07');
    expect(built.baseName.toLowerCase()).not.toContain('uriel');
    const modoTitle = String(built.workbook.Sheets['MM TIANA']?.A1?.v || '');
    expect(modoTitle).toContain('Royo del Amor');
    expect(modoTitle).toContain('MM TIANA');
    const resumenTitle = String(built.workbook.Sheets.RESUMEN?.A1?.v || '');
    expect(resumenTitle).toContain('Royo del Amor');
  });

  it('acepta sesión con workCenterId y la agrupa en el PDV', () => {
    const sessions = [
      closedSession({
        pointOfSaleId: 'wc-tiana',
        pointOfSaleName: 'Tiana WC',
        openedAt: '2026-07-02T10:00:00',
        summary: {
          salesByMethod: { efectivo: 25, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 25,
        },
        closingBrandLabels: { 'brand-mm': 'MODOMIO' },
        closingBrandTpvTotals: { 'brand-mm': { efectivo: 25, tarjeta: 0 } },
        productClosingCounts: { pizza: 2, burger: 0, taco: 0 },
      }),
    ];
    const built = buildCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      pointsOfSale: [{ id: 'pdv-tiana', name: 'Tiana', workCenterId: 'wc-tiana' }],
    });
    expect(built.sheetNames).toContain('MM TIANA');
    expect(built.rows).toBe(1);
    expect(Number(built.workbook.Sheets['MM TIANA']?.H5?.v)).toBe(25);
  });
});
