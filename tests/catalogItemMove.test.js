import { describe, it, expect } from 'vitest';
import {
  applyCatalogMoveTarget,
  commercialLinesWithoutCatalogItems,
  countCatalogItemsByBrandId,
} from '../src/app/lib/catalogItemMove.ts';

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

describe('commercialLinesWithoutCatalogItems', () => {
  const lines = [
    { _id: 'brand-a', name: 'Modomio', isDefault: false },
    { _id: 'brand-b', name: 'Sushi', isDefault: false },
    { _id: 'brand-c', name: 'Burger', isDefault: false },
    { _id: 'brand-general', name: 'General', isDefault: true },
  ];
  const items = [
    { _id: '1', brandIds: ['brand-a'] },
    { _id: '2', brandIds: ['brand-a'] },
  ];

  it('cuenta productos por línea', () => {
    const counts = countCatalogItemsByBrandId(items);
    expect(counts.get('brand-a')).toBe(2);
    expect(counts.get('brand-b')).toBeUndefined();
  });

  it('devuelve líneas sin productos excepto General', () => {
    const empty = commercialLinesWithoutCatalogItems(lines, items);
    expect(empty.map((b) => b._id).sort()).toEqual(['brand-b', 'brand-c']);
  });
});
