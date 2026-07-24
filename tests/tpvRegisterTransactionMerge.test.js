import { describe, expect, it } from 'vitest';
import { mergeTpvRegisterTransactions } from '../services/tpvRegisterTransactionMerge.js';

describe('mergeTpvRegisterTransactions', () => {
  it('une por id sin perder existentes', () => {
    const merged = mergeTpvRegisterTransactions(
      [{ id: 'a', type: 'sale', amount: 10, date: '2026-01-01T10:00:00.000Z' }],
      [{ id: 'b', type: 'cash_in', amount: 5, date: '2026-01-01T11:00:00.000Z' }],
    );
    expect(merged.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('elimina cash_in/cash_out/return con removedIds y recalcula unión', () => {
    const merged = mergeTpvRegisterTransactions(
      [
        { id: 'sale-1', type: 'sale', amount: 20, date: '2026-01-01T10:00:00.000Z' },
        { id: 'in-1', type: 'cash_in', amount: 50, date: '2026-01-01T11:00:00.000Z' },
        { id: 'out-1', type: 'cash_out', amount: 10, date: '2026-01-01T12:00:00.000Z' },
      ],
      [
        { id: 'sale-1', type: 'sale', amount: 20, date: '2026-01-01T10:00:00.000Z' },
        { id: 'out-1', type: 'cash_out', amount: 10, date: '2026-01-01T12:00:00.000Z' },
      ],
      ['in-1'],
    );
    expect(merged.map((t) => t.id)).toEqual(['sale-1', 'out-1']);
  });

  it('no permite borrar ventas aunque vengan en removedIds', () => {
    const merged = mergeTpvRegisterTransactions(
      [{ id: 'sale-1', type: 'sale', amount: 20, date: '2026-01-01T10:00:00.000Z' }],
      [{ id: 'sale-1', type: 'sale', amount: 20, date: '2026-01-01T10:00:00.000Z' }],
      ['sale-1'],
    );
    expect(merged.map((t) => t.id)).toEqual(['sale-1']);
  });
});
