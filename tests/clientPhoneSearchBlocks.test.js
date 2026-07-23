// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clientSelectionBlocksPhoneSearch } from '../src/app/hooks/useClientPhoneSearch.ts';

describe('clientSelectionBlocksPhoneSearch', () => {
  it('no bloquea sin cliente', () => {
    expect(clientSelectionBlocksPhoneSearch(null)).toBe(false);
    expect(clientSelectionBlocksPhoneSearch(undefined)).toBe(false);
  });

  it('no bloquea walk-in / atención rápida del TPV', () => {
    expect(clientSelectionBlocksPhoneSearch({ id: 'tpv-delivery-quick-attention' })).toBe(false);
    expect(clientSelectionBlocksPhoneSearch({ id: 'tpv-restaurant-walk-in' })).toBe(false);
  });

  it('bloquea clientes reales para no mezclar búsqueda con ficha ya elegida', () => {
    expect(clientSelectionBlocksPhoneSearch({ id: 'client-alfonso-123' })).toBe(true);
  });
});
