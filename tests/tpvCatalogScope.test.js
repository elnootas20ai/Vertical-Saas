// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  filterTpvCatalogItems,
  resolveTpvCatalogLoadScope,
  tpvCatalogCacheKey,
} from '../src/app/lib/tpvCatalogScope.ts';

describe('tpvCatalogScope', () => {
  const businesses = [
    { business_id: 'clean-1', businessType: 'cleaning' },
    { business_id: 'del-1', businessType: 'delivery' },
  ];

  it('resolveTpvCatalogLoadScope usa la empresa del selector (sin saltar a delivery)', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(scope.catalogBusinessId).toBe('clean-1');
    expect(scope.scopeBusinessId).toBe('clean-1');
    expect(scope.accountBusinessCount).toBe(2);
  });

  it('tpvCatalogCacheKey usa catalogBusinessId del scope activo', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(tpvCatalogCacheKey('user-1', scope)).toBe('user-1:clean-1');
  });

  it('filterTpvCatalogItems respeta scope y no mezcla marcas de otra vertical', () => {
    const rawItems = [
      { _id: 'p1', name: 'Burger', brandIds: ['brand-modomio'], vertical: 'delivery', itemType: 'product', active: true },
    ];
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);

    const items = filterTpvCatalogItems(rawItems, scope, []);
    expect(items).toEqual([]);
  });

  it('filterTpvCatalogItems devuelve vacío si no hay marcas ni coincidencias', () => {
    const rawItems = [{ _id: 'p1', name: 'X', brandIds: ['b1'], itemType: 'product' }];
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(filterTpvCatalogItems(rawItems, scope, [])).toEqual([]);
  });
});
