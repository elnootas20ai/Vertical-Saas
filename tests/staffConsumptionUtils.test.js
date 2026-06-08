import { describe, expect, it } from 'vitest';
import {
  isCatalogItemEligibleForStaffConsumption,
  resolveStaffUnitPrice,
  staffPriceFromDiscount,
} from '../src/app/lib/staffConsumptionUtils.ts';

describe('resolveStaffUnitPrice', () => {
  const item = { unitPrice: 10, staffPrice: 6 };

  it('uses staffPrice when pricing mode is staff_price_field', () => {
    expect(resolveStaffUnitPrice(item, { pricingMode: 'staff_price_field' })).toBe(6);
  });

  it('falls back to public price when staffPrice is missing', () => {
    expect(resolveStaffUnitPrice({ unitPrice: 10 }, { pricingMode: 'staff_price_field' })).toBe(10);
  });

  it('applies percent discount', () => {
    expect(resolveStaffUnitPrice(item, { pricingMode: 'percent_discount', defaultDiscountPercent: 20 })).toBe(8);
  });

  it('uses public price in same_as_public mode', () => {
    expect(resolveStaffUnitPrice(item, { pricingMode: 'same_as_public' })).toBe(10);
  });
});

describe('staffPriceFromDiscount', () => {
  it('computes discounted price', () => {
    expect(staffPriceFromDiscount(10, 20)).toBe(8);
    expect(staffPriceFromDiscount(5, 50)).toBe(2.5);
  });
});

describe('isCatalogItemEligibleForStaffConsumption', () => {
  it('rejects inactive items', () => {
    expect(
      isCatalogItemEligibleForStaffConsumption(
        { category: 'Bebidas', active: false, available: true },
        { enabled: true, eligibleCategories: [] },
      ),
    ).toBe(false);
  });

  it('filters by eligible categories when configured', () => {
    const cfg = { enabled: true, eligibleCategories: ['Bebidas'] };
    expect(isCatalogItemEligibleForStaffConsumption({ category: 'Bebidas', active: true, available: true }, cfg)).toBe(true);
    expect(isCatalogItemEligibleForStaffConsumption({ category: 'Comida', active: true, available: true }, cfg)).toBe(false);
  });
});
