import { describe, expect, it } from 'vitest';
import {
  buildUrielCajaClosingsWorkbook,
  buildUrielCajaComparativaYearSheetAoa,
  buildUrielCajaMonthSheet,
  buildUrielCajaSheetAoa,
  brandMoneyShares,
  canDownloadUrielCajaExcel,
  sessionToUrielAmounts,
  splitSessionUrielAmountsByBillingSheet,
  splitUrielAmountsByBrand,
  URIEL_BLACKBURGER_HEADERS,
  URIEL_CAJA_MONEY_HEADERS,
  URIEL_MODOMIO_HEADERS,
} from '../src/app/lib/cajaUrielClosingsExcelExport.ts';

describe('canDownloadUrielCajaExcel', () => {
  it('permite cuenta dueña (no worker) y Admin; bloquea cajero/trabajador', () => {
    expect(canDownloadUrielCajaExcel({ user_id: 'ceo', accountType: 'company' })).toBe(true);
    expect(canDownloadUrielCajaExcel({ user_id: 'a1', accountType: 'user', role: 'Admin' })).toBe(true);
    expect(canDownloadUrielCajaExcel(
      { user_id: 'own', accountType: 'user', invitedBy: 'x' },
      [{ owner_user_id: 'own' }],
    )).toBe(true);
    expect(canDownloadUrielCajaExcel({
      user_id: 'w1',
      accountType: 'user',
      invitedBy: 'ceo',
      role: 'Encargado',
    })).toBe(false);
    expect(canDownloadUrielCajaExcel({
      user_id: 'w2',
      accountType: 'user',
      invitedBy: 'ceo',
      role: 'Gerente',
    })).toBe(false);
    expect(canDownloadUrielCajaExcel(null)).toBe(false);
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

describe('sessionToUrielAmounts', () => {
  it('mapea VISA + B(Bizum/otro) + aggregators + Flipdish→App', () => {
    const amounts = sessionToUrielAmounts(closedSession({
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
    expect(amounts.app).toBe(25);
    expect(amounts.vertial).toBe(25);
    expect(amounts.total).toBe(280.5);
    expect(amounts.totalPizza).toBe(7);
    expect(amounts.totalBurger).toBe(2);
    expect(amounts.totalTaco).toBe(1);
  });

  it('si el total está en marcas y el canal a 0, las marcas cuentan; el no-pagado no', () => {
    const amounts = sessionToUrielAmounts(closedSession({
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

describe('splitSessionUrielAmountsByBillingSheet', () => {
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
      aggregatorClosingTotals: { glovo: 100 },
      aggregatorClosingBrandTotals: {
        glovo: { 'brand-mm': 100 },
      },
      productClosingCounts: { pizza: 5, burger: 5, taco: 0 },
    });
    const mm = splitSessionUrielAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionUrielAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.efectivo).toBe(50);
    expect(bb.efectivo).toBe(50);
    expect(mm.glovo).toBe(100);
    expect(bb.glovo).toBe(0);
    expect(mm.total).toBe(150);
    expect(bb.total).toBe(50);
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
      aggregatorClosingTotals: { glovo: 100 },
      aggregatorClosingBrandTotals: {
        glovo: { 'brand-mm': 70, 'brand-bb': 30 },
      },
      productClosingCounts: { pizza: 5, burger: 5, taco: 0 },
    });
    const mm = splitSessionUrielAmountsByBillingSheet(session, legacy[0], legacy);
    const bb = splitSessionUrielAmountsByBillingSheet(session, legacy[1], legacy);
    expect(mm.glovo).toBe(70);
    expect(bb.glovo).toBe(30);
    expect(mm.total + bb.total).toBe(200);
  });
});

describe('brandMoneyShares / splitUrielAmountsByBrand', () => {
  it('reparte €: pizzas → MODOMIO; burgers+tacos → BLACK BURGER', () => {
    expect(brandMoneyShares(7, 2, 1)).toEqual({
      modomio: 0.7,
      blackburger: 0.3,
    });
    const full = sessionToUrielAmounts(closedSession({
      summary: {
        salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 100,
      },
      productClosingCounts: { pizza: 7, burger: 2, taco: 1 },
    }));
    const modo = splitUrielAmountsByBrand(full, 'modomio');
    const bb = splitUrielAmountsByBrand(full, 'blackburger');
    expect(modo.efectivo).toBe(70);
    expect(bb.efectivo).toBe(30);
    expect(modo.totalPizza).toBe(7);
    expect(modo.totalBurger).toBe(0);
    expect(bb.totalBurger).toBe(2);
    expect(bb.totalTaco).toBe(1);
    expect(bb.totalPizza).toBe(0);
  });
});

describe('buildUrielCajaMonthSheet', () => {
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

    const sheet = buildUrielCajaMonthSheet(sessions, {
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
    const all = buildUrielCajaMonthSheet(sessions, { yearMonth: '2026-07' });
    expect(all.rows.find((r) => r.day === 5).efectivo).toBe(30);
    expect(all.monthTotalPizzas).toBe(3);
  });

  it('AOA plantilla Uriel (foto) + COMPARATIVA por meses', () => {
    const sessions = [
      closedSession({
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 100,
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
        productClosingCounts: { pizza: 5, burger: 0, taco: 0 },
      }),
    ];
    const sheet = buildUrielCajaMonthSheet(sessions, { pointOfSaleId: 'pdv-a', yearMonth: '2026-07' });

    expect(URIEL_CAJA_MONEY_HEADERS).toEqual([
      'DIA', 'EFECTIVO', 'TPV', 'X', 'App', 'UBER', 'JUST EAT', 'GLOVO', 'TOTAL',
    ]);
    expect(URIEL_MODOMIO_HEADERS).toContain('TPV');
    expect(URIEL_MODOMIO_HEADERS).toContain('X');
    expect(URIEL_MODOMIO_HEADERS).toContain('GLOVO');
    expect(URIEL_MODOMIO_HEADERS).not.toContain('VISA');
    expect(URIEL_MODOMIO_HEADERS).not.toContain('GLOVVO');

    const modo = buildUrielCajaSheetAoa(sheet, 'modomio');
    expect(modo[0][0]).toContain('MODOMIO');
    expect(modo[2]).toEqual([...URIEL_MODOMIO_HEADERS]);
    // Día 1 · 70 € pizzas; celdas a 0 en blanco
    expect(modo[3]).toEqual([1, 70, '', '', '', '', '', '', 70, 7]);
    expect(modo[5]).toEqual(['TOTAL MES', 70, '', '', '', '', '', '', 70, 7]);

    const bb = buildUrielCajaSheetAoa(sheet, 'blackburger');
    expect(bb[0][0]).toContain('BLACK BURGER');
    expect(bb[2]).toEqual([...URIEL_BLACKBURGER_HEADERS]);
    expect(bb[3]).toEqual([1, 30, '', '', '', '', '', '', 30, 2, 1]);
    expect(bb[5]).toEqual(['TOTAL MES', 30, '', '', '', '', '', '', 30, 2, 1]);

    const comp = buildUrielCajaComparativaYearSheetAoa(sessions, {
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
    const built = buildUrielCajaClosingsWorkbook(sessions, {
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
    const built = buildUrielCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      pointsOfSale: [{ id: 'pdv-tiana', name: 'Tiana' }],
    });
    expect(built.sheetNames).toContain('MM TIANA');
    expect(built.sheetNames).not.toContain('Otra Empresa');
    const modoTitle = String(built.workbook.Sheets['MM TIANA']?.A1?.v || '');
    expect(modoTitle).toContain('MM TIANA');
    // Marca solo suma la tienda de esta empresa (70), no 999
    const totalCell = built.workbook.Sheets['MM TIANA']?.I4?.v;
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
    const built = buildUrielCajaClosingsWorkbook(sessions, {
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
    const built = buildUrielCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      historyRange: 'month',
      pointsOfSale: [{ id: 'pdv-a', name: 'Tienda A' }],
    });
    expect(built.historyRange).toBe('month');
    const headerRow = built.workbook.Sheets['MM TIENDA']?.A3?.v
      || built.workbook.Sheets[built.sheetNames[0]]?.A3?.v;
    expect(headerRow).toBe('DIA');
  });

  it('nombre de archivo y títulos usan la empresa (no Uriel)', () => {
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
    const built = buildUrielCajaClosingsWorkbook(sessions, {
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
        productClosingCounts: { pizza: 2, burger: 0, taco: 0 },
      }),
    ];
    const built = buildUrielCajaClosingsWorkbook(sessions, {
      yearMonth: '2026-07',
      pointsOfSale: [{ id: 'pdv-tiana', name: 'Tiana', workCenterId: 'wc-tiana' }],
    });
    expect(built.sheetNames).toContain('MM TIANA');
    expect(built.rows).toBe(1);
    expect(Number(built.workbook.Sheets['MM TIANA']?.I4?.v)).toBe(25);
  });
});
