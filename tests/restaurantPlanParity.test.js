import { describe, expect, it } from 'vitest';
import { VERTIAL_PLANS } from '../src/app/lib/planCatalog.ts';
import {
  PLAN_ADDON_CATALOG as FRONT_ADDONS,
  getAddonAnnualPriceCents,
} from '../src/app/lib/planAddonCatalog.ts';
import { INCLUDED_COMMERCIAL_BRANDS as FRONT_BRANDS } from '../src/app/lib/tenantEntitlements.ts';
import { PLAN_CATALOG as CHARGE_PLANS } from '../controllers/subscriptionController.js';
import { PLAN_QUOTE_CATALOG } from '../shared/billing/subscriptionQuote.js';
import { PLAN_ADDON_CATALOG as BACK_ADDONS } from '../shared/billing/planAddons.js';
import {
  INCLUDED_BUSINESSES,
  INCLUDED_COMMERCIAL_BRANDS,
  POINT_OF_SALE_LIMITS,
  WORKER_SEAT_LIMITS,
} from '../shared/billing/entitlements.js';
import {
  RESTAURANT_PLAN_FEATURES,
  accountHasRestaurantFeature,
  restaurantFeatureAccessForTier,
} from '../shared/billing/restaurantPlanFeatures.js';

describe('paridad comercial de planes Restaurante', () => {
  it('mantiene UI, cotización y cargo mensual en 49/179/350', () => {
    const expected = { basic: 49, normal: 179, pro: 350 };
    for (const [planId, euros] of Object.entries(expected)) {
      expect(VERTIAL_PLANS.find((plan) => plan.id === planId)?.priceMonthly).toBe(euros);
      expect(PLAN_QUOTE_CATALOG[planId].monthlyEuros).toBe(euros);
      expect(CHARGE_PLANS[planId].monthlyPrice).toBe(euros * 100);
    }
  });

  it('mantiene el PDV extra Pro en 149 €/mes', () => {
    expect(FRONT_ADDONS.extra_pdv.requiresProPlan).toBe(true);
    expect(FRONT_ADDONS.extra_pdv.monthlyPriceEur).toBe(149);
    expect(BACK_ADDONS.extra_pdv.monthlyPrice).toBe(14900);
    expect(getAddonAnnualPriceCents('extra_pdv')).toBe(BACK_ADDONS.extra_pdv.annualPrice);
  });

  it('mantiene cupos frontend/backend', () => {
    expect(POINT_OF_SALE_LIMITS).toEqual({ basic: 1, normal: 1, pro: 1 });
    expect(INCLUDED_BUSINESSES).toEqual({ basic: 1, normal: 1, pro: 2 });
    expect(INCLUDED_COMMERCIAL_BRANDS).toEqual({ basic: 1, normal: 1, pro: 2 });
    expect(FRONT_BRANDS).toEqual(INCLUDED_COMMERCIAL_BRANDS);
    expect(WORKER_SEAT_LIMITS).toEqual({ basic: 2, normal: 4, pro: 12 });
  });

  it('reserva capacidades avanzadas a Pro y deja metadata SVA estable', () => {
    expect(restaurantFeatureAccessForTier('inventory', 'normal')).toBe(true);
    expect(restaurantFeatureAccessForTier('restaurant_ops', 'normal')).toBe(false);
    expect(restaurantFeatureAccessForTier('production_stations', 'pro')).toBe(true);
    expect(RESTAURANT_PLAN_FEATURES.public_web_orders.svaEligible).toBe(true);
    expect(restaurantFeatureAccessForTier('public_web_orders', 'normal', ['web_orders'])).toBe(true);
    expect(accountHasRestaurantFeature({
      subscription: { status: 'cancelled', selectedPlanId: 'pro' },
    }, 'public_web_orders')).toBe(false);
  });
});
