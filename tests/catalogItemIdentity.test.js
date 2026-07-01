// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildStableImportCatalogSku,
  catalogImportIdentityKey,
} from '../shared/catalog/catalogItemIdentity.js';

describe('catalogItemIdentity', () => {
  it('genera SKU estable cuando falta en Excel', () => {
    const sku = buildStableImportCatalogSku({
      name: 'Pizza Margarita',
      category: 'Pizzas',
      module: 'catalog',
      business_id: 'biz-a',
    });
    expect(sku).toBe('VT-pizzas-pizza-margarita');
  });

  it('empareja por SKU o nombre+categoría en la misma empresa', () => {
    const a = {
      module: 'catalog',
      business_id: 'biz-a',
      sku: 'PIZ-001',
      name: 'Margarita',
      category: 'Pizzas',
    };
    const b = { ...a, name: 'Otra', sku: 'PIZ-001' };
    const c = { module: 'catalog', business_id: 'biz-a', name: 'Margarita', category: 'Pizzas' };
    expect(catalogImportIdentityKey(a)).toBe(catalogImportIdentityKey(b));
    expect(catalogImportIdentityKey(a)).not.toBe(catalogImportIdentityKey(c));
    expect(catalogImportIdentityKey(a)).toBe(catalogImportIdentityKey({ ...c, sku: 'PIZ-001' }));
  });
});
