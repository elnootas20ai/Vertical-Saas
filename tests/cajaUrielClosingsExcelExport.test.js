import { describe, expect, it } from 'vitest';
import {
  buildUrielCajaMonthSheet,
  buildUrielCajaSheetAoa,
  sessionToUrielAmounts,
  URIEL_CAJA_HEADERS,
} from '../src/app/lib/cajaUrielClosingsExcelExport.ts';

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
  it('mapea TPV local + aggregators + Flipdish→VERTIAL (sin Bizum)', () => {
    const amounts = sessionToUrielAmounts(closedSession({
      summary: {
        salesByMethod: { efectivo: 100.5, tarjeta: 40, bizum: 99, online: 0, otro: 0 },
        salesByChannel: { app: 10 },
        totalSales: 140.5,
      },
      aggregatorClosingTotals: {
        justeat: 50,
        ubereats: 30,
        glovo: 20,
        flipdish: 15,
      },
      productClosingCounts: { pizza: 7, burger: 1, taco: 0 },
    }));

    expect(amounts.efectivo).toBe(100.5);
    expect(amounts.visa).toBe(40);
    expect(amounts.justEat).toBe(50);
    expect(amounts.uber).toBe(30);
    expect(amounts.glovo).toBe(20);
    // flipdish 15 + app 10
    expect(amounts.vertial).toBe(25);
    expect(amounts.total).toBe(265.5);
    expect(amounts.totalPizzas).toBe(7);
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
        productClosingCounts: { pizza: 3, burger: 0, taco: 0 },
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
        productClosingCounts: { pizza: 2, burger: 0, taco: 0 },
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
    expect(day5.visa).toBe(6);
    expect(day5.justEat).toBe(2);
    expect(day5.glovo).toBe(4);
    expect(day5.vertial).toBe(8);
    expect(day5.total).toBe(50);
    expect(day5.totalPizzas).toBe(5);

    expect(sheet.monthTotal).toBe(50);
    expect(sheet.monthTotalPizzas).toBe(5);

    const day1 = sheet.rows.find((r) => r.day === 1);
    expect(day1.total).toBe(0);
    expect(day1.totalPizzas).toBe(0);
  });

  it('cabecera AOA incluye TOTAL y TOTAL PIZZAS del mes', () => {
    const sheet = buildUrielCajaMonthSheet([
      closedSession({
        openedAt: '2026-07-01T10:00:00',
        summary: {
          salesByMethod: { efectivo: 10, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
          salesByChannel: {},
          totalSales: 10,
        },
        productClosingCounts: { pizza: 4, burger: 0, taco: 0 },
      }),
    ], { pointOfSaleId: 'pdv-a', yearMonth: '2026-07' });

    const aoa = buildUrielCajaSheetAoa(sheet);
    expect(aoa[0][0]).toBe('JULIO 2026');
    expect(aoa[0][7]).toBe('TOTAL');
    expect(aoa[0][8]).toBe(10);
    expect(aoa[1][7]).toBe('TOTAL PIZZAS');
    expect(aoa[1][8]).toBe(4);
    expect(aoa[3]).toEqual([...URIEL_CAJA_HEADERS]);
    expect(URIEL_CAJA_HEADERS).not.toContain('B');
    expect(URIEL_CAJA_HEADERS).not.toContain('Bizum');
  });
});
