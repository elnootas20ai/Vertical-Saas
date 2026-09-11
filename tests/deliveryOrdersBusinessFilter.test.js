import { describe, expect, it } from 'vitest';
import { filterDocsForBusiness } from '../shared/scope/opsScope.js';

describe('filterDeliveryOrders — scope por empresa', () => {
  const modo = '33821959-ae50-4e52-bfea-ea2b145faeac';
  const bode = '16487cd6-cccd-42bf-9d96-db415af456ea';

  it('con filtro solo deja pedidos de esa empresa', () => {
    const orders = [
      { _id: '1', business_id: modo },
      { _id: '2', business_id: bode },
      { _id: '3', businessId: modo },
      { _id: '4' },
    ];
    const filtered = filterDocsForBusiness(orders, modo, { multiEmpresa: true });
    expect(filtered.map((o) => o._id)).toEqual(['1', '3']);
  });

  it('sin filtro no descarta', () => {
    const orders = [{ _id: '1', business_id: bode }];
    expect(filterDocsForBusiness(orders, '', { multiEmpresa: true })).toEqual(orders);
  });

  it('legacy sin business_id solo con una empresa', () => {
    const orders = [{ _id: 'legacy' }, { _id: 'ok', business_id: modo }];
    expect(filterDocsForBusiness(orders, modo, { accountBusinessCount: 1 }).map((o) => o._id)).toEqual([
      'legacy',
      'ok',
    ]);
    expect(filterDocsForBusiness(orders, modo, { accountBusinessCount: 2 }).map((o) => o._id)).toEqual(['ok']);
  });
});
