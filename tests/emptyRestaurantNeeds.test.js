import { describe, expect, it } from 'vitest';
import { emptyRestaurantNeeds } from '../src/app/lib/onboardingPlanRecommendation.ts';

describe('emptyRestaurantNeeds', () => {
  it('defaults unificados bar/restaurante (sin subtipo)', () => {
    const needs = emptyRestaurantNeeds();
    expect(needs.tpv).toBe(true);
    expect(needs.deliveryOrders).toBe(true);
    expect(needs.team).toBe(true);
    expect(needs.autoShipping).toBe(false);
  });
});
