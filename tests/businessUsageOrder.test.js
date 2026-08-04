import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBusinessUsage,
  recordBusinessOpen,
  sortByBusinessUsage,
} from '../src/app/lib/businessUsageOrder.ts';

function mockLocalStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  });
}

describe('businessUsageOrder', () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it('ordena por más abierta y etiqueta count', () => {
    recordBusinessOpen('u1', 'a');
    recordBusinessOpen('u1', 'b');
    recordBusinessOpen('u1', 'b');
    recordBusinessOpen('u1', 'c');

    expect(getBusinessUsage('u1', 'b').count).toBe(2);
    const sorted = sortByBusinessUsage(
      [
        { business_id: 'a', name: 'Alpha' },
        { business_id: 'b', name: 'Beta' },
        { business_id: 'c', name: 'Charlie' },
      ],
      'u1',
    );
    expect(sorted.map((x) => x.business_id)).toEqual(['b', 'c', 'a']);
  });
});
