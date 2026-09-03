import { describe, it, expect } from 'vitest';
import {
  eventsPdvLoadAllowlist,
  eventsPdvLoadPriceMap,
  normalizeEventsPdvLoad,
} from '../src/app/lib/eventsPdvLoad.ts';

describe('eventsPdvLoad', () => {
  it('normalizes lines and dedupes', () => {
    const load = normalizeEventsPdvLoad([
      { catalogItemId: 'a', name: 'Pizza', qty: 10.7, unitPrice: 8.5 },
      { catalogItemId: 'a', name: 'dup', qty: 1, unitPrice: 1 },
      { id: 'b', concepto: 'Bebida', quantity: 20, price: 2 },
    ]);
    expect(load).toHaveLength(2);
    expect(load.find((l) => l.catalogItemId === 'a')?.qty).toBe(10);
    expect(load.find((l) => l.catalogItemId === 'b')?.unitPrice).toBe(2);
  });

  it('allowlist and price map', () => {
    const load = normalizeEventsPdvLoad([
      { catalogItemId: 'x', name: 'X', qty: 1, unitPrice: 3 },
    ]);
    expect(eventsPdvLoadAllowlist(load)).toEqual(['x']);
    expect(eventsPdvLoadPriceMap(load)).toEqual({ x: 3 });
    expect(eventsPdvLoadAllowlist(null)).toBeNull();
  });
});
