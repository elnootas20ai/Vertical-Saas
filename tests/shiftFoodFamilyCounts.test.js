import { describe, expect, it } from 'vitest';
import {
  buildShiftFoodFamilyReport,
  classifyFoodFamily,
  pizzaUnitsFromProductLabel,
  tpvOnlyFoodFromReport,
  mergeTpvAndAppsFoodCounts,
} from '../src/app/lib/shiftFoodFamilyCounts.ts';

describe('classifyFoodFamily', () => {
  it('detecta pizza, burger y taco por categoría o nombre', () => {
    expect(classifyFoodFamily('Pizzas', 'Margarita')).toBe('pizza');
    expect(classifyFoodFamily('Burger', 'Simple')).toBe('burger');
    expect(classifyFoodFamily('Top Burger', 'Doble')).toBe('burger');
    expect(classifyFoodFamily('Tacos', 'Pastor')).toBe('taco');
    expect(classifyFoodFamily('Extras', 'Coca Cola')).toBe(null);
  });

  it('Premium, Especialidad y Mitad y mitad cuentan como pizza', () => {
    expect(classifyFoodFamily('Premium', 'Trufada')).toBe('pizza');
    expect(classifyFoodFamily('Especialidad', 'Sanginaccio')).toBe('pizza');
    expect(classifyFoodFamily('Calzone', 'Calzone jamón')).toBe('pizza');
    expect(classifyFoodFamily('Pizzas', 'Mitad y mitad')).toBe('pizza');
    expect(classifyFoodFamily('Premium', 'Premium mitad y mitad')).toBe('pizza');
  });
});

describe('pizzaUnitsFromProductLabel', () => {
  it('Individual=1, Dúo=2, Familiar=3', () => {
    expect(pizzaUnitsFromProductLabel('Combos', 'Menú Individual')).toBe(1);
    expect(pizzaUnitsFromProductLabel('Menús', 'Combo Dúo')).toBe(2);
    expect(pizzaUnitsFromProductLabel('Combos', 'Familiar')).toBe(3);
    expect(pizzaUnitsFromProductLabel('Pizzas', 'Margarita')).toBe(null);
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

  it('cuenta pizzas de menú Individual / Dúo / Familiar (1 / 2 / 3)', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: 'c1',
        channel: 'tpv',
        status: 'entregado',
        items: [
          { name: 'Menú Individual', category: 'Combos', quantity: 1 },
          { name: 'Combo Dúo', category: 'Menús', quantity: 1 },
          { name: 'Familiar', category: 'Combos', quantity: 1 },
          { name: 'Combo Familiar', category: 'Menús', quantity: 2 },
        ],
      },
    ]);
    // 1 + 2 + 3 + (2×3) = 12 pizzas
    expect(report.total).toEqual({ pizza: 12, burger: 0, taco: 0 });
    expect(report.byChannel.tpv.pizza).toBe(12);
  });

  it('cuenta pizzas reales desde extras ▸ del combo (aunque el nombre no diga Individual)', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: 'e1',
        channel: 'tpv',
        status: 'entregado',
        items: [
          {
            name: 'Menú',
            category: 'Combos',
            quantity: 1,
            extras: ['▸ Margarita', '▸ Patatas', '▸ Coca Cola'],
          },
          {
            name: 'Menú Duo',
            category: 'Menús',
            quantity: 1,
            extras: ['▸ Pepperoni', '▸ Cuatro quesos', '▸ Agua', '▸ Fanta'],
          },
          {
            name: 'Combo',
            category: 'Combos',
            quantity: 1,
            extras: ['▸ Barbacoa ×3', '▸ Nuggets', '▸ Agua ×4'],
          },
        ],
      },
    ]);
    // Individual-like 1 + Duo 2 + Familiar-like 3 = 6
    expect(report.total.pizza).toBe(6);
  });

  it('no convierte burgers con “Familiar” en pizzas', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: 'b1',
        channel: 'tpv',
        status: 'entregado',
        items: [{ name: 'Burger Familiar', category: 'Burger', quantity: 1 }],
      },
    ]);
    expect(report.total).toEqual({ pizza: 0, burger: 1, taco: 0 });
  });

  it('Mitad y mitad = 1 pizza (no 2 por los sabores ½)', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: 'hh1',
        channel: 'tpv',
        status: 'entregado',
        items: [
          {
            name: 'Mitad y mitad',
            category: 'Pizzas',
            quantity: 1,
            extras: ['½ Margarita', '½ Pepperoni'],
          },
          {
            name: 'Premium mitad y mitad',
            category: 'Premium',
            quantity: 2,
            extras: ['½ Trufada', '½ Carbonara'],
          },
        ],
      },
    ]);
    // 1 + 2×1 = 3 (cada mitad-y-mitad es una pizza)
    expect(report.total).toEqual({ pizza: 3, burger: 0, taco: 0 });
  });

  it('Premium y Especialidad sueltas suman como pizza', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: 'p1',
        channel: 'tpv',
        status: 'entregado',
        items: [
          { name: 'Trufada', category: 'Premium', quantity: 1 },
          { name: 'Sanginaccio', category: 'Especialidad', quantity: 2 },
          { name: 'Margarita', category: 'Pizzas', quantity: 1 },
        ],
      },
    ]);
    expect(report.total).toEqual({ pizza: 4, burger: 0, taco: 0 });
  });
});

describe('tpvOnly + merge cierre', () => {
  it('separa TPV de apps y suma lo declarado por integración', () => {
    const report = buildShiftFoodFamilyReport([
      {
        _id: '1',
        channel: 'glovo',
        status: 'entregado',
        items: [{ name: 'Margarita', category: 'Pizzas', quantity: 2 }],
      },
      {
        _id: '2',
        channel: 'direct',
        status: 'entregado',
        items: [{ name: 'Simple', category: 'Burger', quantity: 1 }],
      },
    ]);
    expect(tpvOnlyFoodFromReport(report)).toEqual({ pizza: 0, burger: 1, taco: 0 });
    expect(
      mergeTpvAndAppsFoodCounts(
        { pizza: 0, burger: 1, taco: 0 },
        { glovo: { pizza: 5, burger: 0, taco: 0 }, ubereats: { pizza: 1, burger: 2, taco: 0 } },
      ),
    ).toEqual({ pizza: 6, burger: 3, taco: 0 });
  });
});
