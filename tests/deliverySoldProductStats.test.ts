import { describe, expect, it } from 'vitest';
import {
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
