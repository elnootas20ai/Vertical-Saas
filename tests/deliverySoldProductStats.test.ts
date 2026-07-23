import { describe, expect, it } from 'vitest';
import {
  brandHeroSoldCountsForDay,
  buildSoldProductDailySeries,
  classifySoldProductFamily,
  resolveActiveSoldFamilies,
  soldProductCountsForDay,
} from '../src/app/lib/deliverySoldProductStats';

describe('classifySoldProductFamily', () => {
  it('detecta pizza, burger, taco, kebab y sushi', () => {
    expect(classifySoldProductFamily('Pizzas', 'Margarita')).toBe('pizza');
    expect(classifySoldProductFamily('Burger', 'Simple')).toBe('burger');
    expect(classifySoldProductFamily('Tacos', 'Pastor')).toBe('taco');
    expect(classifySoldProductFamily('Kebab', 'Mixed')).toBe('kebab');
    expect(classifySoldProductFamily('Sushi', 'California')).toBe('sushi');
    expect(classifySoldProductFamily('Bebidas', 'Coca Cola')).toBe(null);
  });
});

describe('resolveActiveSoldFamilies', () => {
  it('elige familias según marcas de la empresa', () => {
    const fams = resolveActiveSoldFamilies([
      { deliveryLineKind: 'pizza', active: true },
      { deliveryLineKind: 'kebab', active: true },
    ]);
    expect(fams.map((f) => f.id).sort()).toEqual(['kebab', 'pizza']);
  });
});

describe('soldProductCountsForDay / daily series', () => {
  it('suma unidades del día y arma la serie', () => {
    const dayKey = '2026-07-22';
    const orders = [
      {
        _id: '1',
        status: 'entregado',
        deliveredAt: '2026-07-22T12:00:00.000Z',
        items: [
          { name: 'Margarita', category: 'Pizzas', quantity: 2 },
          { name: 'Mixed', category: 'Kebab', quantity: 1 },
        ],
      },
      {
        _id: '2',
        status: 'cancelled',
        deliveredAt: '2026-07-22T13:00:00.000Z',
        items: [{ name: 'Margarita', category: 'Pizzas', quantity: 9 }],
      },
    ];
    const counts = soldProductCountsForDay(orders as any, dayKey);
    expect(counts.pizza).toBe(2);
    expect(counts.kebab).toBe(1);

    const series = buildSoldProductDailySeries(
      orders as any,
      [dayKey],
      resolveActiveSoldFamilies([{ deliveryLineKind: 'pizza' }, { deliveryLineKind: 'kebab' }]),
    );
    expect(series[0].pizza).toBe(2);
    expect(series[0].kebab).toBe(1);
  });
});

describe('brandHeroSoldCountsForDay', () => {
  it('desglosa el ítem importante por marca (pizza / burger)', () => {
    const dayKey = '2026-07-22';
    const brands = [
      { _id: 'b-pizza', name: 'Modomio', deliveryLineKind: 'pizza', active: true },
      { _id: 'b-burger', name: 'BlackBurger', deliveryLineKind: 'burger_fastfood', active: true },
    ];
    const orders = [
      {
        _id: '1',
        status: 'entregado',
        deliveredAt: '2026-07-22T12:00:00.000Z',
        items: [
          { name: 'Margarita', category: 'Pizzas', quantity: 3, brandIds: ['b-pizza'] },
          { name: 'Cheese', category: 'Burgers', quantity: 2, brandIds: ['b-burger'] },
          { name: 'Coca', category: 'Bebidas', quantity: 5, brandIds: ['b-pizza'] },
        ],
      },
    ];
    const rows = brandHeroSoldCountsForDay(orders as any, brands, dayKey);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.brandId === 'b-pizza')).toMatchObject({
      familyLabel: 'Pizzas',
      count: 3,
    });
    expect(rows.find((r) => r.brandId === 'b-burger')).toMatchObject({
      familyLabel: 'Burgers',
      count: 2,
    });
  });
});
