// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildStableImportCatalogSku,
  buildCatalogImportIndexes,
  catalogImportIdentityKey,
  catalogLooseIdentityKey,
  findCatalogItemByDuplicateName,
  resolveExistingCatalogItemForImport,
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

  it('catalogLooseIdentityKey colapsa legacy sin empresa y reimport con SKU VT', () => {
    const legacy = {
      module: 'catalog',
      name: 'Margarita',
      category: 'Pizzas',
      sku: '',
    };
    const imported = {
      module: 'catalog',
      business_id: 'biz-a',
      name: 'Margarita',
      category: 'Pizzas',
      sku: 'VT-pizzas-margarita',
    };
    expect(catalogLooseIdentityKey(legacy)).toBe(catalogLooseIdentityKey(imported));
    expect(catalogImportIdentityKey(legacy)).not.toBe(catalogImportIdentityKey(imported));
  });

  it('findCatalogItemByDuplicateName ignora mayúsculas y acentos', () => {
    const items = [{ _id: '1', module: 'catalog', name: 'Piña Colada' }];
    expect(
      findCatalogItemByDuplicateName(items, 'pina colada')?._id,
    ).toBe('1');
  });

  it('resolveExistingCatalogItemForImport encuentra legacy por nombre+categoría', () => {
    const legacy = {
      _id: 'old',
      module: 'catalog',
      name: 'Margarita',
      category: 'Pizzas',
      sku: '',
    };
    const imported = {
      module: 'catalog',
      business_id: 'biz-a',
      name: 'Margarita',
      category: 'Pizzas',
      sku: 'VT-pizzas-margarita',
    };
    const indexes = buildCatalogImportIndexes([legacy]);
    expect(resolveExistingCatalogItemForImport(imported, indexes)?._id).toBe('old');
  });
});
