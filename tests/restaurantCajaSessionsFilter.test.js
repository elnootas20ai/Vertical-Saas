/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { filterRestaurantRegisterSessions } from '../src/app/lib/restaurantCajaApi.ts';

function session(overrides) {
  return {
    _id: overrides._id || 's1',
    pointOfSaleId: overrides.pointOfSaleId || 'pdv-bode',
    business_id: overrides.business_id,
    businessId: overrides.businessId,
    status: 'closed',
    ...overrides,
  };
}

describe('filterRestaurantRegisterSessions', () => {
  const bode = '16487cd6-cccd-42bf-9d96-db415af456ea';
  const modomio = 'biz-modomio';

  it('quita turnos de otra empresa (delivery) cuando hay businessId', () => {
    const rows = filterRestaurantRegisterSessions(
      [
        session({ _id: 'a', business_id: bode, pointOfSaleId: 'pdv-bode' }),
        session({ _id: 'b', business_id: modomio, pointOfSaleId: 'pdv-mod' }),
      ],
      { businessId: bode, pointOfSaleIds: ['pdv-bode'] },
    );
    expect(rows.map((s) => s._id)).toEqual(['a']);
  });

  it('con PDVs del local solo deja esos turnos (legacy sin business_id)', () => {
    const rows = filterRestaurantRegisterSessions(
      [
        session({ _id: 'a', pointOfSaleId: 'pdv-bode' }),
        session({ _id: 'b', pointOfSaleId: 'pdv-mod' }),
      ],
      { businessId: bode, pointOfSaleIds: ['pdv-bode'] },
    );
    expect(rows.map((s) => s._id)).toEqual(['a']);
  });
});
