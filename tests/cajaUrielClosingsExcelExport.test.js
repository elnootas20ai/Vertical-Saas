import { describe, expect, it } from 'vitest';
import {
  buildUrielCajaComparativaSheetAoa,
  buildUrielCajaMonthSheet,
  buildUrielCajaSheetAoa,
  brandMoneyShares,
  canDownloadUrielCajaExcel,
  sessionToUrielAmounts,
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
});

describe('brandMoneyShares / splitUrielAmountsByBrand', () => {
  it('reparte € por familia; tacos no van con burger', () => {
    expect(brandMoneyShares(7, 2, 1)).toEqual({
      modomio: 0.7,
      blackburger: 0.2,
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
    expect(bb.efectivo).toBe(20);
    expect(modo.totalPizza).toBe(7);
    expect(modo.totalBurger).toBe(0);
    expect(bb.totalBurger).toBe(2);
    expect(bb.totalTaco).toBe(0);
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

  it('AOA plantilla Uriel + COMPARATIVA con todas las hojas', () => {
    const sheet = buildUrielCajaMonthSheet([
      closedSession({
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 100, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 100,
        },
        productClosingCounts: { pizza: 7, burger: 2, taco: 1 },
      }),
    ], { pointOfSaleId: 'pdv-a', yearMonth: '2026-07' });

    expect(URIEL_CAJA_MONEY_HEADERS).toEqual([
      'DIA', 'EFECTIVO', 'VISA', 'B', 'JUST EAT', 'UBER', 'GLOVVO', 'APP', 'TOTAL',
    ]);
    expect(URIEL_MODOMIO_HEADERS).toContain('VISA');
    expect(URIEL_MODOMIO_HEADERS).toContain('GLOVVO');
    expect(URIEL_MODOMIO_HEADERS).not.toContain('TPV');
    expect(URIEL_MODOMIO_HEADERS).not.toContain('X');

    const modo = buildUrielCajaSheetAoa(sheet, 'modomio');
    expect(modo[0][0]).toContain('MODOMIO');
    expect(modo[0][8]).toBe('TOTAL');
    expect(modo[0][9]).toBe(70);
    expect(modo[1][8]).toBe('TOTAL PIZZA');
    expect(modo[1][9]).toBe(7);
    expect(modo[3]).toEqual([...URIEL_MODOMIO_HEADERS]);
    // Día 1 · 70 € pizzas; celdas a 0 en blanco
    expect(modo[4]).toEqual([1, 70, '', '', '', '', '', '', 70, 7]);

    const bb = buildUrielCajaSheetAoa(sheet, 'blackburger');
    expect(bb[0][0]).toContain('BLACK BURGER');
    expect(bb[0][9]).toBe(20);
    expect(bb[1][8]).toBe('TOTAL BURGUER');
    expect(bb[1][9]).toBe(2);
    expect(bb[3]).toEqual([...URIEL_BLACKBURGER_HEADERS]);
    expect(bb[4]).toEqual([1, 20, '', '', '', '', '', '', 20, 2]);

    const tacos = buildUrielCajaSheetAoa(sheet, 'tacos');
    expect(tacos[0][0]).toContain('TACOS');
    expect(tacos[0][9]).toBe(10);
    expect(tacos[1][8]).toBe('TOTAL TACOS');
    expect(tacos[1][9]).toBe(1);

    const comp = buildUrielCajaComparativaSheetAoa(sheet, null);
    expect(comp[0][0]).toContain('COMPARATIVA');
    const headerRow = comp.find((r) => r[0] === 'DIA');
    expect(headerRow).toEqual([
      'DIA',
      'MODOMIO TOTAL',
      'TOTAL PIZZA',
      'BLACK BURGER TOTAL',
      'TOTAL BURGUER',
      'TACOS TOTAL',
      'TOTAL TACOS',
      'TOTAL DÍA',
    ]);
    const day1 = comp.find((r) => r[0] === 1);
    expect(day1).toEqual([1, 70, 7, 20, 2, 10, 1, 100]);
  });
});
