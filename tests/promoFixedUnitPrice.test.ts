import { describe, expect, it } from 'vitest';
import {
  computeFixedUnitPriceDiscount,
  getIsoWeekday,
  isPromoWeekdayActive,
  isPromotionActiveNow,
  listAutoFixedUnitPricePromotions,
  matchPromoProduct,
  priceLinesWithFixedUnitPromos,
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
    excludeNameIncludes: ['burger', 'hamburguesa', 'hamburgesa'],
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
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Pizza Bacon' })).toBe(true);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Bacon' })).toBe(true);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Pizza 4 quesos' })).toBe(false);
  });

  it('calzone abierta también matchea si está en nameIncludes', () => {
    const withAbierta: StoredPromotion = {
      ...pizzaPromo,
      productMatch: {
        ...pizzaPromo.productMatch,
        nameIncludes: [...(pizzaPromo.productMatch?.nameIncludes || []), 'calzone abierta'],
      },
    };
    expect(matchPromoProduct(withAbierta.productMatch, { name: 'Calzone Abierta' })).toBe(true);
  });

  it('precio en línea: suma de líneas = total cobrado (sin descuento fantasma)', () => {
    const { priced, discount } = priceLinesWithFixedUnitPromos(
      [
        { name: 'Bacon', unitPrice: 14.5, baseUnitPrice: 14.5, extrasUnitPrice: 0, quantity: 1 },
        { name: 'BBQ', unitPrice: 15.5, quantity: 2 },
      ],
      [pizzaPromo],
      mondayAtNoon(),
    );
    expect(discount).toBeCloseTo(3.5);
    expect(priced[0].unitPrice).toBeCloseTo(11);
    expect(priced[0].total).toBeCloseTo(11);
    expect(priced[1].unitPrice).toBeCloseTo(15.5);
    const sum = priced.reduce((s, l) => s + l.total, 0);
    expect(sum).toBeCloseTo(14.5 + 31 - 3.5);
  });

  it('no aplica a burger de bacon (solo las 5 pizzas)', () => {
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Burger de bacon' })).toBe(false);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Bacon Burger' })).toBe(false);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Top Burger Bacon' })).toBe(false);
    expect(matchPromoProduct(pizzaPromo.productMatch, { name: 'Hamburguesa bacon' })).toBe(false);
  });

  it('discounts unit price down to 11€ on matching lines Mon–Thu', () => {
    const { discount, matchedLineCount, applied } = computeFixedUnitPriceDiscount(
      [
        { name: 'Prosciutto', unitPrice: 13.5, quantity: 2 },
        { name: 'Bacon', unitPrice: 12, quantity: 1 },
        { name: 'Burger de bacon', unitPrice: 14, quantity: 1 },
        { name: 'Coca Cola', unitPrice: 2.5, quantity: 1 },
      ],
      [pizzaPromo],
      mondayAtNoon(),
    );
    // (13.5-11)*2 + (12-11)*1 = 5 + 1 = 6  (burger no cuenta)
    expect(discount).toBeCloseTo(6);
    expect(matchedLineCount).toBe(2);
    expect(applied.map((p) => p.id)).toEqual(['promo-pizzas-11']);
  });

  it('extras encima del fijo (on_top): base 14 + extra 2 → descuenta solo 3€, extras se cobran', () => {
    const { discount } = computeFixedUnitPriceDiscount(
      [{
        name: 'Margarita',
        unitPrice: 16,
        baseUnitPrice: 14,
        extrasUnitPrice: 2,
        quantity: 1,
      }],
      [pizzaPromo],
      mondayAtNoon(),
    );
    // Solo (14-11)=3; el cliente paga 11+2=13
    expect(discount).toBeCloseTo(3);
  });

  it('extras dentro del fijo (include_in_fixed): base 14 + extra 2 → descuenta 5€ a 11€ total', () => {
    const includeExtras: StoredPromotion = {
      ...pizzaPromo,
      extrasMode: 'include_in_fixed',
    };
    const { discount } = computeFixedUnitPriceDiscount(
      [{
        name: 'Margarita',
        unitPrice: 16,
        baseUnitPrice: 14,
        extrasUnitPrice: 2,
        quantity: 1,
      }],
      [includeExtras],
      mondayAtNoon(),
    );
    expect(discount).toBeCloseTo(5);
  });

  it('respeta salesPointIds: solo tiendas listadas', () => {
    const scoped = { ...pizzaPromo, salesPointIds: ['pdv-badalona'] };
    expect(listAutoFixedUnitPricePromotions([scoped], mondayAtNoon(), { salesPointId: 'pdv-tiana' })).toEqual([]);
    expect(
      listAutoFixedUnitPricePromotions([scoped], mondayAtNoon(), { salesPointId: 'pdv-badalona' }).map((p) => p.id),
    ).toEqual(['promo-pizzas-11']);
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
