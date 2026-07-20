import { describe, expect, it } from 'vitest';

/** Copia de la regla del filtro backend (sin arrancar Couch). */
function orderMatchesBusinessFilter(order, businessFilter) {
  const bid = String(businessFilter || '').replace(/^business:/, '').trim();
  if (!bid) return true;
  const ob = String(order?.business_id || order?.businessId || '').replace(/^business:/, '').trim();
  return ob === bid;
}

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
    const filtered = orders.filter((o) => orderMatchesBusinessFilter(o, modo));
    expect(filtered.map((o) => o._id)).toEqual(['1', '3']);
  });

  it('sin filtro no descarta', () => {
    expect(orderMatchesBusinessFilter({ business_id: bode }, '')).toBe(true);
  });
});
