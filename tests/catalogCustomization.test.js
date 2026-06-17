import { describe, expect, it } from 'vitest';
import {
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  isCustomizableCatalogItem,
  normalizeTpvDefaultExtraPrice,
  parseCatalogIngredients,
  parseCatalogSupplements,
  resolveTpvCategoryTemplateKey,
} from '../src/app/lib/catalogCustomization.ts';

const modomioBrand = {
  _id: 'mod',
  deliveryLineKind: 'pizza',
  catalogCategories: ['Pizzas', 'Al Dulce'],
};

describe('catalogCustomization TPV', () => {
  it('ingredientes incluidos y extras con precio único', () => {
    const master = [
      { id: '1', name: 'Tomate', role: 'base', brandIds: ['mod'], productParts: ['pizzas'] },
      { id: '2', name: 'Extra queso', role: 'extra', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    const pizza = { category: 'Pizzas', brandIds: ['mod'], customFields: {} };
    expect(parseCatalogIngredients(pizza, undefined, master)).toEqual(['Tomate']);
    expect(parseCatalogSupplements(pizza, undefined, undefined, undefined, master, 1.5)).toEqual([
      { id: '2', name: 'Extra queso', price: 1.5 },
    ]);
    expect(parseCatalogSupplements(pizza, undefined, undefined, undefined, master, 0.9)).toEqual([
      { id: '2', name: 'Extra queso', price: 0.9 },
    ]);
    expect(normalizeTpvDefaultExtraPrice('.90')).toBe(0.9);
    expect(ingredientChargesExtra(master[1])).toBe(true);
    expect(inferTpvDefaultExtraPrice(master, 2)).toBe(2);
  });

  it('detecta pizzas Al Dulce por marca y muestra ingredientes sin coincidencia exacta de marca', () => {
    const master = [
      { id: '1', name: 'Mozzarella', role: 'base', brandIds: ['otra'], productParts: ['pizzas'] },
      { id: '2', name: 'Extra bacon', role: 'extra', brandIds: ['otra'], productParts: ['pizzas'] },
    ];
    const item = { name: 'Al Dulce Roquefort', category: 'Al Dulce', brandIds: ['mod'], customFields: {} };
    expect(resolveTpvCategoryTemplateKey(item, [modomioBrand])).toBe('pizzas');
    expect(isCustomizableCatalogItem(item, [modomioBrand])).toBe(true);
    expect(parseCatalogIngredients(item, undefined, master, undefined, undefined, [modomioBrand])).toEqual([
      'Mozzarella',
    ]);
    expect(parseCatalogSupplements(item, undefined, undefined, undefined, master, 0.9, [modomioBrand])).toEqual([
      { id: '2', name: 'Extra bacon', price: 0.9 },
    ]);
  });
});
