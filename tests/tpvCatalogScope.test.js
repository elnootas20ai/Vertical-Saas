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

  it('resolveTpvCatalogLoadScope usa la empresa delivery si el selector apunta a otra vertical', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(scope.catalogBusinessId).toBe('del-1');
    expect(scope.scopeBusinessId).toBe('clean-1');
    expect(scope.activeBusinessType).toBe('delivery');
    expect(scope.accountBusinessCount).toBe(2);
  });

  it('tpvCatalogCacheKey usa catalogBusinessId resuelto (delivery)', () => {
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);
    expect(tpvCatalogCacheKey('user-1', scope)).toBe('user-1:del-1');
  });

  it('filterTpvCatalogItems incluye legacy sin business_id por linea comercial', () => {
    const rawItems = [
      { _id: 'p1', name: 'Burger', brandIds: ['brand-modomio'], itemType: 'product', active: true },
    ];
    const scope = resolveTpvCatalogLoadScope('del-1', businesses, 2);
    const brands = [{ _id: 'brand-modomio', name: 'Modomio' }];

    const items = filterTpvCatalogItems(rawItems, scope, brands);
    expect(items).toHaveLength(1);
  });

  it('filterTpvCatalogItems oculta productos de otra vertical aunque compartan cuenta', () => {
    const rawItems = [
      { _id: 'p1', name: 'Menú eventos', brandIds: [], vertical: 'events', itemType: 'product', active: true },
    ];
    const scope = resolveTpvCatalogLoadScope('clean-1', businesses, 2);

    const items = filterTpvCatalogItems(rawItems, scope, []);
    expect(items).toEqual([]);
  });
});
