import { describe, expect, it } from 'vitest';
import {
  filterPurchaseDocsByBusinessScope,
  purchaseListQuery,
} from '../src/app/lib/purchaseBusinessScope.ts';

describe('purchaseBusinessScope', () => {
  it('filtra por businessId y excluye otras empresas', () => {
    const docs = [
      { _id: '1', businessId: 'biz-a' },
      { _id: '2', businessId: 'biz-b' },
      { _id: '3' },
    ];
    const scoped = filterPurchaseDocsByBusinessScope(docs, 'biz-a', 2);
    expect(scoped.map((d) => d._id)).toEqual(['1']);
  });

  it('legacy sin businessId solo visible con una empresa', () => {
    const docs = [{ _id: '1' }, { _id: '2', businessId: 'biz-b' }];
    expect(filterPurchaseDocsByBusinessScope(docs, 'biz-a', 1).map((d) => d._id)).toEqual(['1']);
    expect(filterPurchaseDocsByBusinessScope(docs, 'biz-a', 2).map((d) => d._id)).toEqual([]);
  });

  it('purchaseListQuery incluye businessId y límite', () => {
    expect(purchaseListQuery('business:abc', 3)).toBe(
      '?businessId=abc&accountBusinessCount=3&limit=400',
    );
    expect(purchaseListQuery(null, 1, 100)).toBe('?limit=100');
  });
});
