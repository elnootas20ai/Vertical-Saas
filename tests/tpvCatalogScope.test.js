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

  it('resolveTpvCatalogLoadScope apunta al delivery si el scope es limpieza', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(scope.catalogBusinessId).toBe('del-1');
    expect(scope.scopeBusinessId).toBe('clean-1');
    expect(scope.accountBusinessCount).toBe(2);
  });

  it('tpvCatalogCacheKey usa catalogBusinessId resuelto', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(tpvCatalogCacheKey('user-1', scope)).toBe('user-1:del-1');
  });

  it('filterTpvCatalogItems cae a brandIds si filtro principal devuelve vacío', () => {
    const rawItems = [
      { _id: 'p1', name: 'Burger', brandIds: ['brand-modomio'], itemType: 'product', active: true },
      { _id: 'p2', name: 'Otro', brandIds: ['brand-otro'], itemType: 'product', active: true },
    ];
    const brands = [{ _id: 'brand-modomio', name: 'Modomio' }];
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);

    const items = filterTpvCatalogItems(rawItems, scope, brands);
    expect(items.map((i) => i._id)).toEqual(['p1']);
  });

  it('filterTpvCatalogItems devuelve vacío si no hay marcas ni coincidencias', () => {
    const rawItems = [{ _id: 'p1', name: 'X', brandIds: ['b1'], itemType: 'product' }];
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(filterTpvCatalogItems(rawItems, scope, [])).toEqual([]);
  });
});
