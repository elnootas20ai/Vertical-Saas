import { describe, expect, it } from 'vitest';
import { filterSalaTablesByBusinessScope } from '../src/app/lib/salaBusinessScope.ts';

describe('salaBusinessScope', () => {
  it('filtra mesas por empresa y excluye otras', () => {
    const tables = [
      { _id: '1', businessId: 'biz-a', number: 1 },
      { _id: '2', businessId: 'biz-b', number: 2 },
    ];
    expect(filterSalaTablesByBusinessScope(tables, 'biz-a', 2).map((t) => t._id)).toEqual(['1']);
  });

  it('legacy sin businessId solo visible con una empresa', () => {
    const tables = [{ _id: '1' }, { _id: '2', businessId: 'biz-b' }];
    expect(filterSalaTablesByBusinessScope(tables, 'biz-a', 1).map((t) => t._id)).toEqual(['1']);
    expect(filterSalaTablesByBusinessScope(tables, 'biz-a', 2).map((t) => t._id)).toEqual([]);
  });
});
