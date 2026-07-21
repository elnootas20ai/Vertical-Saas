import { describe, expect, it } from 'vitest';
import {
  computeFixedUnitPriceDiscount,
  getIsoWeekday,
  isPromoWeekdayActive,
  isPromotionActiveNow,
  matchPromoProduct,
  type StoredPromotion,
} from '../src/app/lib/promoCodes';

function mondayAtNoon(): Date {
  // 2026-07-20 was a Monday
  return new Date('2026-07-20T12:00:00');
}

function fridayAtNoon(): Date {
  return new Date('2026-07-24T12:00:00');
}

const pizzaPromo: StoredPromotion = {
  id: 'promo-pizzas-11',
  name: 'Pizzas básicas 11€ L-J',
  type: 'fixed_unit_price',
  status: 'active',
  discountValue: 11,
  fixedUnitPrice: 11,
  applyMode: 'auto',
  weekdays: [1, 2, 3, 4],
  productMatch: {
    nameIncludes: ['prosciutto', 'bacon', 'calzone apertas', 'margarita', 'roquefort'],
  },
  startDate: '2026-01-01',
  endDate: '2027-12-31T23:59:59',
};

describe('promo fixed_unit_price', () => {
  it('ISO weekday: Monday=1 Thursday=4 Friday=5', () => {
    expect(getIsoWeekday(mondayAtNoon())).toBe(1);
    expect(getIsoWeekday(new Date('2026-07-23T12:00:00'))).toBe(4);
    expect(getIsoWeekday(fridayAtNoon())).toBe(5);
  });

  it('weekdays Lun–Jue active only Mon–Thu', () => {
    expect(isPromoWeekdayActive(pizzaPromo, mondayAtNoon())).toBe(true);
    expect(isPromoWeekdayActive(pizzaPromo, fridayAtNoon())).toBe(false);
    expect(isPromotionActiveNow(pizzaPromo, mondayAtNoon())).toBe(true);
    expect(isPromotionActiveNow(pizzaPromo, fridayAtNoon())).toBe(false);
  });

  it('matches pizza names case/accent insensitive', () => {
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Pizza Margarita' })).toBe(true);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'PROSCIUTTO' })).toBe(true);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Calzone Apertas' })).toBe(true);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Pizza 4 quesos' })).toBe(false);
  });

  it('discounts unit price down to 11€ on matching lines Mon–Thu', () => {
    const { discount, matchedLineCount, applied } = computeFixedUnitPriceDiscount(
      [
        { name: 'Prosciutto', unitPrice: 13.5, quantity: 2 },
        { name: 'Bacon', unitPrice: 12, quantity: 1 },
        { name: 'Coca Cola', unitPrice: 2.5, quantity: 1 },
      ],
      [pizzaPromo],
      mondayAtNoon(),
    );
    // (13.5-11)*2 + (12-11)*1 = 5 + 1 = 6
    expect(discount).toBeCloseTo(6);
    expect(matchedLineCount).toBe(2);
    expect(applied.map((p) => p.id)).toEqual(['promo-pizzas-11']);
  });

  it('no discount on Friday', () => {
    const { discount } = computeFixedUnitPriceDiscount(
      [{ name: 'Margarita', unitPrice: 12, quantity: 1 }],
      [pizzaPromo],
      fridayAtNoon(),
    );
    expect(discount).toBe(0);
  });

  it('no discount if catalog price already <= 11', () => {
    const { discount } = computeFixedUnitPriceDiscount(
      [{ name: 'Margarita', unitPrice: 10, quantity: 1 }],
      [pizzaPromo],
      mondayAtNoon(),
    );
    expect(discount).toBe(0);
  });
});
