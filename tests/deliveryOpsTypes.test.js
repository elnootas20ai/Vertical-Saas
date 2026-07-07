import { describe, expect, it } from 'vitest';
import {
  isTpvOpsVerticalPending,
  resolveRestaurantVerticalFromContext,
} from '../src/app/lib/deliveryOpsTypes.ts';

describe('deliveryOpsTypes — TPV tablet', () => {
  it('isTpvOpsVerticalPending: tablet no espera lista de empresas', () => {
    expect(
      isTpvOpsVerticalPending({
        businessesFetchSettled: false,
        businesses: [],
        scopeBusinessId: 'biz-tablet',
        isTabletSession: true,
        tabletVertical: 'delivery',
      }),
    ).toBe(false);
  });

  it('isTpvOpsVerticalPending: gerente espera businessesFetchSettled', () => {
    expect(
      isTpvOpsVerticalPending({
        businessesFetchSettled: false,
        businesses: [{ business_id: 'biz-1', businessType: 'delivery' }],
        scopeBusinessId: 'biz-1',
        isTabletSession: false,
      }),
    ).toBe(true);
  });

  it('isTpvOpsVerticalPending: gerente con lista vacía sigue pendiente', () => {
    expect(
      isTpvOpsVerticalPending({
        businessesFetchSettled: true,
        businesses: [],
        scopeBusinessId: 'biz-1',
        isTabletSession: false,
      }),
    ).toBe(true);
  });

  it('resolveRestaurantVerticalFromContext: tablet restaurante sin lista global', () => {
    expect(
      resolveRestaurantVerticalFromContext({
        businesses: [],
        scopeBusinessId: 'biz-tablet',
        isTabletSession: true,
        tabletVertical: 'restaurant',
      }),
    ).toBe(true);
  });

  it('resolveRestaurantVerticalFromContext: tablet delivery sin lista global', () => {
    expect(
      resolveRestaurantVerticalFromContext({
        businesses: [],
        scopeBusinessId: 'biz-tablet',
        isTabletSession: true,
        tabletVertical: 'delivery',
      }),
    ).toBe(false);
  });
});
