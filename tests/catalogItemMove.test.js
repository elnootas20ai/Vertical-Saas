import { describe, it, expect } from 'vitest';
import { applyCatalogMoveTarget } from '../src/app/lib/catalogItemMove.ts';

describe('applyCatalogMoveTarget', () => {
  const base = {
    _id: '1',
    category: 'Pizzas',
    brandIds: ['brand-modomio'],
    name: 'Margarita',
  };

  it('cambia categoría y mantiene línea si brandChoice es keep', () => {
    const next = applyCatalogMoveTarget(base, { category: 'Combos', brandChoice: 'keep' });
    expect(next.category).toBe('Combos');
    expect(next.brandIds).toEqual(['brand-modomio']);
  });

  it('asigna nueva línea comercial', () => {
    const next = applyCatalogMoveTarget(base, { category: 'Burgers', brandChoice: 'brand-bb' });
    expect(next.category).toBe('Burgers');
    expect(next.brandIds).toEqual(['brand-bb']);
  });

  it('limpia línea en categorías compartidas', () => {
    const next = applyCatalogMoveTarget(base, { category: 'Bebidas', brandChoice: 'brand-modomio' });
    expect(next.category).toBe('Bebidas');
    expect(next.brandIds).toEqual([]);
  });

  it('permite quitar línea explícitamente', () => {
    const next = applyCatalogMoveTarget(base, { category: 'Pizzas', brandChoice: 'clear' });
    expect(next.brandIds).toEqual([]);
  });
});
