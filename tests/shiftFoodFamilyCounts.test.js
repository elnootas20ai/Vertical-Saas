import { describe, expect, it } from 'vitest';
import {
  buildShiftFoodFamilyReport,
  classifyFoodFamily,
} from '../src/app/lib/shiftFoodFamilyCounts.ts';

describe('classifyFoodFamily', () => {
  it('detecta pizza, burger y taco por categoría o nombre', () => {
    expect(classifyFoodFamily('Pizzas', 'Margarita')).toBe('pizza');
    expect(classifyFoodFamily('Burger', 'Simple')).toBe('burger');
    expect(classifyFoodFamily('Top Burger', 'Doble')).toBe('burger');
    expect(classifyFoodFamily('Tacos', 'Pastor')).toBe('taco');
    expect(classifyFoodFamily('Extras', 'Coca Cola')).toBe(null);
  });
});

describe('buildShiftFoodFamilyReport', () => {
  it('suma totales y por integrador', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: '1',
        channel: 'glovo',
        status: 'entregado',
        items: [
          { name: 'Margarita', category: 'Pizzas', quantity: 2 },
          { name: 'Simple', category: 'Burger', quantity: 1 },
        ],
      },
      {
        _id: '2',
        channel: 'tpv',
        status: 'entregado',
        items: [{ name: 'Pastor', category: 'Tacos', quantity: 3 }],
      },
      {
        _id: '3',
        channel: 'ubereats',
        status: 'entregado',
        items: [{ name: 'Cheese', category: 'Burger', quantity: 2 }],
      },
    ]);

    expect(report.total).toEqual({ pizza: 2, burger: 3, taco: 3 });
    expect(report.byAggregator.glovo).toEqual({ pizza: 2, burger: 1, taco: 0 });
    expect(report.byAggregator.ubereats).toEqual({ pizza: 0, burger: 2, taco: 0 });
    expect(report.byChannel.tpv).toEqual({ pizza: 0, burger: 0, taco: 3 });
  });
});
