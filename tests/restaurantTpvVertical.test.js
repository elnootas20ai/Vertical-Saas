import { describe, expect, it } from 'vitest';
import {
  resolveRestaurantVerticalFromContext,
  isTpvOpsVerticalPending,
} from '../src/app/lib/deliveryOpsTypes.ts';

describe('resolveRestaurantVerticalFromContext', () => {
  const businesses = [
    { business_id: 'biz-delivery', businessType: 'delivery' },
    { business_id: 'biz-restaurant', businessType: 'restaurant' },
  ];

  it('uses scoped business over global selector', () => {
    expect(resolveRestaurantVerticalFromContext({
      currentBusiness: { business_id: 'biz-delivery', businessType: 'delivery' },
      businesses,
      scopeBusinessId: 'biz-restaurant',
    })).toBe(true);
  });

  it('falls back to current business when scope missing', () => {
    expect(resolveRestaurantVerticalFromContext({
      currentBusiness: { business_id: 'biz-restaurant', businessType: 'restaurant' },
      businesses,
      scopeBusinessId: '',
    })).toBe(true);
  });

  it('returns false for pure delivery scope', () => {
    expect(resolveRestaurantVerticalFromContext({
      currentBusiness: { business_id: 'biz-restaurant', businessType: 'restaurant' },
      businesses,
      scopeBusinessId: 'biz-delivery',
    })).toBe(false);
  });
});

describe('isTpvOpsVerticalPending', () => {
  it('waits until businesses list is settled', () => {
    expect(isTpvOpsVerticalPending({
      scopeBusinessId: 'biz-restaurant',
      businessesFetchSettled: false,
    })).toBe(true);
  });

  it('is not pending once scope business type is known', () => {
    expect(isTpvOpsVerticalPending({
      scopeBusinessId: 'biz-restaurant',
      businesses: [{ business_id: 'biz-restaurant', businessType: 'restaurant' }],
      businessesFetchSettled: true,
    })).toBe(false);
  });
});
