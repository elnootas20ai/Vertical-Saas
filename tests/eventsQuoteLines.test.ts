import { describe, expect, it } from 'vitest';
import {
  buildEventQuoteListRows,
  computeQuoteTotal,
  parseQuoteAmount,
  patchQuoteLine,
  quoteLinesAreEqual,
} from '../src/app/lib/eventsFlow';
import type { EventQuoteRecord, EventRecord, QuoteLine } from '../src/app/lib/eventsTypes';

const line = (partial: Partial<QuoteLine>): QuoteLine => ({
  id: 'l1',
  concepto: 'Carpa',
  cantidad: 1,
  precioUnitario: 950,
  total: 950,
  ...partial,
});

describe('eventsQuoteLines', () => {
  it('recalcula el total al cambiar cantidad o precio', () => {
    expect(patchQuoteLine(line({}), { cantidad: 2 }).total).toBe(1900);
    expect(patchQuoteLine(line({}), { precioUnitario: 800 }).total).toBe(800);
  });

  it('parsea importes en formato ES', () => {
    expect(parseQuoteAmount('1.250,50')).toBe(1250.5);
    expect(parseQuoteAmount('400,00')).toBe(400);
    expect(parseQuoteAmount('50')).toBe(50);
  });

  it('suma el presupuesto con las líneas actuales', () => {
    expect(computeQuoteTotal([
      line({ total: 950 }),
      line({ id: 'l2', total: 400 }),
      line({ id: 'l3', cantidad: 50, precioUnitario: 18, total: 900 }),
    ])).toBe(2250);
  });

  it('detecta si el presupuesto ha cambiado', () => {
    const a = [line({})];
    expect(quoteLinesAreEqual(a, [line({})])).toBe(true);
    expect(quoteLinesAreEqual(a, [line({ precioUnitario: 800, total: 800 })])).toBe(false);
  });
});

describe('buildEventQuoteListRows', () => {
  const event = (partial: Partial<EventRecord> = {}): EventRecord => ({
    _id: 'eve-1',
    type: 'ev_event',
    user_id: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    nombre: 'Boda Ana',
    tipo: 'boda',
    fecha: '2026-09-01',
    lugar: 'Finca',
    cliente: 'Ana',
    invitados: 50,
    presupuesto: 1200,
    estado: 'enviado',
    ...partial,
  });

  const quote = (partial: Partial<EventQuoteRecord> = {}): EventQuoteRecord => ({
    _id: 'evq-1',
    type: 'ev_quote',
    user_id: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    eventId: 'eve-1',
    eventNombre: 'Boda Ana',
    cliente: 'Ana',
    lineas: '[]',
    subtotal: 1200,
    iva: 252,
    total: 1200,
    estado: 'borrador',
    ...partial,
  });

  it('mantiene el borrador aunque el evento ya esté enviado', () => {
    const rows = buildEventQuoteListRows(
      [event()],
      [
        quote({ _id: 'evq-draft', estado: 'borrador' }),
        quote({ _id: 'evq-sent', estado: 'enviado' }),
      ],
    );
    expect(rows.map((r) => r.kind).sort()).toEqual(['borrador', 'enviado']);
    expect(rows.every((r) => r.eventId === 'eve-1')).toBe(true);
  });
});
