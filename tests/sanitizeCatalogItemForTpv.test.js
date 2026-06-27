// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeCatalogItemForTpv } from '../services/couchdb.js';
import { filterCatalogItemsForBusinessScope } from '../src/app/lib/catalogBusinessScope.ts';

describe('sanitizeCatalogItemForTpv', () => {
  it('conserva business_id para filtrar por empresa en cuentas multi-negocio', () => {
    const doc = {
      _id: 'cat-1',
      user_id: 'owner-1',
      name: 'Pizza Margarita',
      category: 'pizzas',
      unitPrice: 9.5,
      business_id: 'biz-a',
      brandIds: [],
      active: true,
      itemType: 'product',
    };
    const sanitized = sanitizeCatalogItemForTpv(doc);
    expect(sanitized.business_id).toBe('biz-a');

    const scoped = filterCatalogItemsForBusinessScope([sanitized], 'biz-a', [], {
      accountBusinessCount: 2,
    });
    expect(scoped).toHaveLength(1);

    const otherBiz = filterCatalogItemsForBusinessScope([sanitized], 'biz-b', [], {
      accountBusinessCount: 2,
    });
    expect(otherBiz).toHaveLength(0);
  });
});
