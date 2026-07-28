import { describe, expect, it } from 'vitest';
import {
  buildAccumulatedCajaClosingsAoa,
  sanitizeClosingNotesForExcel,
  selectAggregatorPlatformsForExcel,
} from '../src/app/lib/cajaClosingsExcelExport.ts';

function closedSession(partial = {}) {
  return {
    _id: 'tpvreg-aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'closed',
    pointOfSaleId: 'pdv-a',
    pointOfSaleName: 'Tienda A',
    openedAt: '2026-07-10T10:00:00.000Z',
    closedAt: '2026-07-10T22:00:00.000Z',
    summary: {
      salesByMethod: { efectivo: 50, tarjeta: 20, bizum: 0, online: 0, otro: 0 },
      salesByChannel: {},
      totalSales: 70,
    },
    aggregatorClosingCash: {},
    aggregatorClosingCard: {},
    aggregatorClosingTotals: {},
    productClosingCounts: { pizza: 2, burger: 0, taco: 0 },
    closingNotes: '',
    ...partial,
  };
}

describe('sanitizeClosingNotesForExcel', () => {
  it('quita IDs tpvreg / tpvrge y deja notas humanas', () => {
    expect(sanitizeClosingNotesForExcel('Falta cambio tpvreg-fgds230e47-5689-abcd-1234567890ab')).toBe('Falta cambio');
    expect(sanitizeClosingNotesForExcel('tpvrge.fgds230e47-568')).toBe('');
    expect(sanitizeClosingNotesForExcel('Ok · tpv_session:tpvreg-aaaa-bbbb')).toBe('Ok');
    expect(sanitizeClosingNotesForExcel('Conté dos veces')).toBe('Conté dos veces');
    expect(sanitizeClosingNotesForExcel('')).toBe('');
  });
});

describe('selectAggregatorPlatformsForExcel', () => {
  it('solo incluye plataformas con datos distintos de cero', () => {
    const sessions = [
      closedSession({
        aggregatorClosingCash: { glovo: 30 },
        aggregatorClosingCard: { glovo: 10 },
        aggregatorClosingTotals: { glovo: 40, ubereats: 0, justeat: 0 },
      }),
    ];
    const platforms = selectAggregatorPlatformsForExcel(sessions);
    expect(platforms.map((p) => p.channel)).toEqual(['glovo']);
  });

  it('no incluye nada si todos los integradores van a cero', () => {
    expect(selectAggregatorPlatformsForExcel([closedSession()])).toEqual([]);
  });
});

describe('buildAccumulatedCajaClosingsAoa', () => {
  it('omite columnas de apps a cero y limpia notas', () => {
    const { header, rows, platforms } = buildAccumulatedCajaClosingsAoa([
      closedSession({
        closingNotes: 'Descuadre leve tpvrge.fgds230e47-568',
        aggregatorClosingCash: { justeat: 15 },
        aggregatorClosingTotals: { justeat: 15 },
      }),
    ]);

    expect(platforms.map((p) => p.channel)).toEqual(['justeat']);
    expect(header).toContain('Just Eat efectivo');
    expect(header).not.toContain('Glovo efectivo');
    expect(header).not.toContain('Uber Eats efectivo');
    expect(header[header.length - 1]).toBe('Notas cierre');
    expect(rows[1][rows[1].length - 1]).toBe('Descuadre leve');
  });

  it('sin datos de apps no añade bloque de integradores', () => {
    const { header, platforms } = buildAccumulatedCajaClosingsAoa([closedSession()]);
    expect(platforms).toEqual([]);
    expect(header).not.toContain('Efectivo apps total');
    expect(header).toContain('Notas cierre');
  });
});
