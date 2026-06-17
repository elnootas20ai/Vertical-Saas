import { describe, expect, it } from 'vitest';
import { shouldSkipEmptyStoreApply } from '../src/app/lib/retailScopeApply.ts';

describe('retailScopeCache — regresión sidebar PDV', () => {
  it('shouldSkipEmptyStoreApply conserva tiendas visibles ante fetch vacío', () => {
    expect(
      shouldSkipEmptyStoreApply({
        hasDisplayedStores: true,
        incomingRetailCount: 0,
        incomingPdvCount: 0,
        force: false,
      }),
    ).toBe(true);
  });

  it('shouldSkipEmptyStoreApply aplica vacío cuando force=true (alta/baja real)', () => {
    expect(
      shouldSkipEmptyStoreApply({
        hasDisplayedStores: true,
        incomingRetailCount: 0,
        incomingPdvCount: 0,
        force: true,
      }),
    ).toBe(false);
  });

  it('shouldSkipEmptyStoreApply aplica datos nuevos aunque ya hubiera tiendas', () => {
    expect(
      shouldSkipEmptyStoreApply({
        hasDisplayedStores: true,
        incomingRetailCount: 2,
        incomingPdvCount: 1,
        force: false,
      }),
    ).toBe(false);
  });
});
