// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  catalogItemBelongsToBusinessScope,
  filterCatalogItemsForBusinessScope,
} from '../src/app/lib/catalogBusinessScope.ts';

const brandA = { _id: 'brand-a', name: 'Modomio' };
const brandB = { _id: 'brand-b', name: 'Black Burger' };

describe('catalogBusinessScope', () => {
  it('prioriza business_id sobre marcas de otra empresa', () => {
    const item = {
      _id: '1',
      name: 'Pizza',
      business_id: 'biz-a',
      brandIds: ['brand-b'],
    };
    const brandIds = new Set(['brand-a']);
    expect(catalogItemBelongsToBusinessScope(item, 'biz-a', brandIds)).toBe(true);
    expect(catalogItemBelongsToBusinessScope(item, 'biz-b', brandIds)).toBe(false);
  });

  it('filtra por línea comercial de la empresa activa', () => {
    const items = [
      { _id: '1', name: 'Pizza A', brandIds: ['brand-a'] },
      { _id: '2', name: 'Burger B', brandIds: ['brand-b'] },
      { _id: '3', name: 'Bebida', brandIds: [] },
    ];
    const scoped = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 2,
    });
    expect(scoped.map((i) => i._id)).toEqual(['1']);
  });

  it('no mezcla legacy sin business_id entre varias empresas', () => {
    const items = [{ _id: 'beb', name: 'Coca-Cola', brandIds: [] }];
    const multi = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 2,
    });
    expect(multi).toHaveLength(0);

    const single = filterCatalogItemsForBusinessScope(items, 'biz-a', [brandA], {
      accountBusinessCount: 1,
    });
    expect(single).toHaveLength(1);
  });
});
