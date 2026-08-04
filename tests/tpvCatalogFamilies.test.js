// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  normalizeSubfamilyCategory,
  resolveTpvFamilyKey,
} from '../src/app/lib/tpvCatalogFamilies';
import { normalizeImportCategory } from '../src/app/lib/deliveryCatalogImportLogic';

describe('tpvCatalogFamilies', () => {
  it('mapea subfamilias de bebida a familia Bebidas', () => {
    expect(resolveTpvFamilyKey('Cervezas')).toBe('bebidas');
    expect(resolveTpvFamilyKey('Refrescos')).toBe('bebidas');
    expect(resolveTpvFamilyKey('Vinos')).toBe('bebidas');
    expect(resolveTpvFamilyKey('Champán')).toBe('bebidas');
    expect(resolveTpvFamilyKey('Whisky')).toBe('bebidas');
    expect(resolveTpvFamilyKey('Tapas')).toBe(null);
  });

  it('preserveSubfamilies no aplasta Cervezas a Bebidas', () => {
    expect(normalizeImportCategory('Cervezas', { preserveSubfamilies: true })).toBe('Cervezas');
    expect(normalizeImportCategory('refresco', { preserveSubfamilies: true })).toBe('Refrescos');
    expect(normalizeSubfamilyCategory('whisky')).toBe('Whisky');
  });
});
