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
    expect(parseCatalogSupplements(item, undefined, undefined, undefined, master, 0.9, [modomioBrand])).toEqual(
      [],
    );
    const masterMod = [
      { id: '2', name: 'Extra bacon', role: 'extra', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    expect(parseCatalogSupplements(item, undefined, undefined, undefined, masterMod, 0.9, [modomioBrand])).toEqual([
      { id: '2', name: 'Extra bacon', price: 0.9 },
    ]);
  });

  it('TPV solo usa ingredientes del producto, no la lista maestra', () => {
    const master = [
      { id: '1', name: 'Tomate', role: 'base', brandIds: ['mod'], productParts: ['pizzas'] },
      { id: '2', name: 'Cebolla', role: 'base', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    const pizzaWithRecipe = {
      category: 'Pizzas',
      brandIds: ['mod'],
      customFields: { ingredients: 'Mozzarella, Albahaca' },
    };
    const pizzaWithoutRecipe = { category: 'Pizzas', brandIds: ['mod'], customFields: {} };
    expect(parseCatalogIngredients(pizzaWithRecipe, undefined, master, undefined, undefined, undefined, {
      productIngredientsOnly: true,
    })).toEqual(['Mozzarella', 'Albahaca']);
    expect(parseCatalogIngredients(pizzaWithoutRecipe, undefined, master, undefined, undefined, undefined, {
      productIngredientsOnly: true,
    })).toEqual([]);
    expect(parseCatalogIngredients(pizzaWithoutRecipe, undefined, master, undefined, undefined, undefined, {
      productIngredientsOnly: true,
      tpvFallbackWhenEmpty: true,
    })).toEqual(['Tomate', 'Cebolla']);
  });

  it('TPV combina ingredientes de productos del combo si la ficha está vacía', () => {
    const combo = {
      _id: 'combo-1',
      itemType: 'combo',
      category: 'Combos',
      brandIds: ['mod'],
      customFields: {},
      comboItems: [{ productId: 'p1', productName: 'Margarita', quantity: 1 }],
    };
    const catalog = [
      {
        _id: 'p1',
        category: 'Pizzas',
        brandIds: ['mod'],
        customFields: { ingredients: 'Tomate, Mozzarella' },
      },
    ];
    expect(
      parseCatalogIngredients(combo, undefined, undefined, undefined, undefined, undefined, {
        productIngredientsOnly: true,
        tpvFallbackWhenEmpty: true,
        catalogItems: catalog,
      }),
    ).toEqual(['Tomate', 'Mozzarella']);
  });

  it('TPV muestra todos los extras del negocio aunque el producto tenga suplementos propios', () => {
    const master = [
      { id: '2', name: 'Extra queso', role: 'extra', brandIds: ['mod'], productParts: ['pizzas'] },
      { id: '3', name: 'Extra bacon', role: 'extra', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    const pizza = {
      category: 'Pizzas',
      brandIds: ['mod'],
      customFields: { supplements: [{ id: 'x', name: 'Solo producto', price: 2 }] },
    };
    expect(parseCatalogSupplements(pizza, undefined, undefined, undefined, master, 1.5, undefined, {
      storeExtrasOnly: true,
    })).toEqual([
      { id: '2', name: 'Extra queso', price: 1.5 },
      { id: '3', name: 'Extra bacon', price: 1.5 },
    ]);
  });

  it('producto con ingredientes en ficha es configurable aunque no sea pizza/burger', () => {
    const crepe = {
      category: 'Entrantes',
      name: 'Crepe jamón y queso',
      brandIds: ['crep'],
      customFields: { ingredients: 'Jamón, Queso, Mantequilla' },
    };
    expect(isCustomizableCatalogItem(crepe)).toBe(true);
    expect(
      parseCatalogIngredients(crepe, undefined, undefined, undefined, undefined, undefined, {
        productIngredientsOnly: true,
      }),
    ).toEqual(['Jamón', 'Queso', 'Mantequilla']);
  });

  it('usa suplementos por marca si aún no hay extras en la lista maestra', () => {
    const pizza = { category: 'Pizzas', brandIds: ['mod'], customFields: {} };
    const brandSupplements = {
      mod: [{ id: 's1', name: 'Extra aceitunas', price: 1.2 }],
    };
    expect(parseCatalogSupplements(pizza, undefined, brandSupplements)).toEqual([
      { id: 's1', name: 'Extra aceitunas', price: 1.2 },
    ]);
  });

  it('no mezcla extras de pizza y burger entre marcas', () => {
    const master = [
      { id: 'p1', name: 'Extra mozzarella', role: 'extra', brandIds: ['mod'], productParts: ['pizzas'] },
      { id: 'b1', name: 'Extra bacon', role: 'extra', brandIds: ['bb'], productParts: ['hamburguesas'] },
    ];
    const pizza = { category: 'Pizzas', brandIds: ['mod'], customFields: {} };
    const burger = { category: 'Hamburguesas', brandIds: ['bb'], customFields: {} };
    expect(parseCatalogSupplements(pizza, undefined, undefined, undefined, master, 0.9)).toEqual([
      { id: 'p1', name: 'Extra mozzarella', price: 0.9 },
    ]);
    expect(parseCatalogSupplements(burger, undefined, undefined, undefined, master, 0.9)).toEqual([
      { id: 'b1', name: 'Extra bacon', price: 0.9 },
    ]);
  });

  it('explodeStoreIngredientsPerBrand crea una fila por línea comercial', async () => {
    const { explodeStoreIngredientsPerBrand } = await import('../src/app/lib/catalogCustomization.ts');
    const brands = [
      { _id: 'mod', deliveryLineKind: 'pizza', catalogCategories: ['Pizzas'] },
      { _id: 'bb', deliveryLineKind: 'burger_fastfood', catalogCategories: ['Hamburguesas'] },
    ];
    const split = explodeStoreIngredientsPerBrand(
      [
        {
          id: 'ing-1',
          name: 'Tomate',
          role: 'extra',
          brandIds: ['mod', 'bb'],
          productParts: ['pizzas', 'hamburguesas'],
        },
      ],
      brands,
    );
    expect(split).toHaveLength(2);
    expect(split.map((r) => r.brandIds?.[0]).sort()).toEqual(['bb', 'mod']);
    expect(split.find((r) => r.brandIds?.[0] === 'mod')?.productParts).toEqual(['pizzas']);
    expect(split.find((r) => r.brandIds?.[0] === 'bb')?.productParts).toEqual(['hamburguesas']);
  });
});
