import { describe, expect, it } from 'vitest';
import { collectInventoryCandidates } from '../src/app/lib/inventorySyncLogic.ts';

describe('collectInventoryCandidates', () => {
  it('merges store ingredients, catalog text and vertial templates', () => {
    const candidates = collectInventoryCandidates(
      [
        { id: 'ing-moz', name: 'Mozzarella', baseCost: 8.5 },
        { id: 'ing-tom', name: 'Tomate triturado', baseCost: 2.1 },
      ],
      [
        {
          name: 'Margarita',
          module: 'catalog',
          itemType: 'product',
          customFields: { ingredients: 'Mozzarella, Tomate triturado, Albahaca' },
        },
        {
          _id: 'cat-coca',
          name: 'Coca-Cola 33cl',
          module: 'catalog',
          itemType: 'product',
          category: 'Bebidas',
          costPrice: 0.65,
        },
      ],
    );

    const names = candidates.map((c) => c.name);
    expect(names).toContain('Mozzarella');
    expect(names).toContain('Albahaca');
    expect(names).toContain('Caja pizza M');
    expect(names).toContain('Bolsa delivery');
    expect(names).toContain('Coca-Cola 33cl');
    const moz = candidates.find((c) => c.name === 'Mozzarella');
    expect(moz?.storeIngredientId).toBe('ing-moz');
  });

  it('can disable templates and resale for isolated ingredient parsing', () => {
    const candidates = collectInventoryCandidates(
      [],
      [
        {
          name: 'Fanta Naranja',
          module: 'catalog',
          itemType: 'product',
          category: 'Bebidas',
          customFields: { ingredients: 'Agua, Azúcar' },
        },
      ],
      { includeVertialTemplates: false, includeCatalogResale: false },
    );
    expect(candidates).toHaveLength(0);
  });

  it('deduplicates by folded name', () => {
    const candidates = collectInventoryCandidates(
      [{ id: 'ing-1', name: 'Bacon' }],
      [
        {
          name: 'BBQ Burger',
          module: 'catalog',
          itemType: 'product',
          customFields: { ingredients: 'bacon, queso cheddar' },
        },
      ],
      { includeVertialTemplates: false, includeCatalogResale: false },
    );
    expect(candidates.some((c) => c.name === 'Bacon')).toBe(true);
    expect(candidates.some((c) => c.name.toLowerCase().includes('queso'))).toBe(true);
  });
});
