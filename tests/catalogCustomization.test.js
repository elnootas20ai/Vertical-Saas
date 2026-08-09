import { describe, expect, it } from 'vitest';
import {
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  isCustomizableCatalogItem,
  normalizeTpvDefaultExtraPrice,
  parseCatalogIngredients,
  parseCatalogSupplements,
  isCatalogIngredientPlaceholder,
  parseIngredientsBulkText,
  normalizeCatalogIngredientsForSave,
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
    expect(normalizeTpvDefaultExtraPrice('0,90')).toBe(0.9);
    expect(normalizeTpvDefaultExtraPrice('1,5')).toBe(1.5);
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

  it('extras TPV: parte «queso y tomate», lista completa de marca y flags chargeExtra', () => {
    const master = [
      {
        id: 'e1',
        name: 'Queso y tomate',
        role: 'extra',
        brandIds: ['mod'],
        productParts: ['hamburguesas'],
      },
      {
        id: 'e2',
        name: 'Bacon',
        role: 'base',
        tpvChargeExtra: true,
        tpvAllowRemove: true,
        brandIds: ['mod'],
        productParts: ['pizzas'],
      },
      {
        id: 'e3',
        name: 'Cebolla',
        role: 'extra',
        brandIds: ['otra'],
        productParts: ['pizzas'],
      },
    ];
    const pizza = { category: 'Pizzas', brandIds: ['mod'], customFields: {}, name: 'Margarita' };
    const extras = parseCatalogSupplements(pizza, undefined, undefined, undefined, master, 0.9, [modomioBrand]);
    expect(extras.map((e) => e.name).sort((a, b) => a.localeCompare(b, 'es'))).toEqual([
      'Bacon',
      'Queso',
      'tomate',
    ]);
    expect(extras.every((e) => e.price === 0.9)).toBe(true);
    expect(extras.some((e) => e.name === 'Cebolla')).toBe(false);
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
    })).toEqual([]);
  });

  it('ignora placeholder «Ver carta» en ingredientes de ficha', () => {
    expect(isCatalogIngredientPlaceholder('Ver carta')).toBe(true);
    expect(parseIngredientsBulkText('Ver carta')).toEqual([]);
    expect(normalizeCatalogIngredientsForSave('Ver carta')).toBe('');
    expect(normalizeCatalogIngredientsForSave('Beyond, Queso vegano')).toBe('Beyond, Queso vegano');
    const burger = {
      category: 'Burgers',
      brandIds: ['mod'],
      customFields: { ingredients: 'Ver carta' },
    };
    expect(
      parseCatalogIngredients(burger, undefined, undefined, undefined, undefined, undefined, {
        productIngredientsOnly: true,
        tpvFallbackWhenEmpty: true,
      }),
    ).toEqual([]);
  });

  it('parte «A y B» en dos ingredientes y conserva compuestos reales', () => {
    expect(
      parseIngredientsBulkText(
        'Tomate, mozzarella, rúcula, tomate deshidratado, jamón ibérico y queso fresco',
      ),
    ).toEqual([
      'Tomate',
      'mozzarella',
      'rúcula',
      'tomate deshidratado',
      'jamón ibérico',
      'queso fresco',
    ]);
    expect(parseIngredientsBulkText('Mozzarella, champiñones, salsa de trufa y parmesano')).toEqual([
      'Mozzarella',
      'champiñones',
      'salsa de trufa',
      'parmesano',
    ]);
    expect(parseIngredientsBulkText('pepinillos y salsa miel y mostaza')).toEqual([
      'pepinillos',
      'salsa miel y mostaza',
    ]);
    expect(parseIngredientsBulkText('queso di mare')).toEqual(['queso di mare']);
    expect(
      parseIngredientsBulkText('cebolla y un toque de salsa The Black BBQ'),
    ).toEqual(['cebolla']);
    expect(parseIngredientsBulkText('150g. de ternera, cebolla caramelizada y queso de cabra')).toEqual([
      'cebolla caramelizada',
      'queso de cabra',
    ]);
    expect(parseIngredientsBulkText('2 pizzas + 1 complemento + 2 refrescos')).toEqual([]);
    expect(parseIngredientsBulkText('5 ingredientes')).toEqual([]);
    expect(parseIngredientsBulkText('Helado de 125 ml')).toEqual([]);
    expect(parseIngredientsBulkText('Dos sabores')).toEqual([]);
  });

  it('TPV no usa la lista maestra global cuando la ficha del producto está vacía', () => {
    const master = [
      { id: '1', name: 'Tomate', role: 'base', brandIds: ['mod'], productParts: ['pizzas'] },
      { id: '2', name: 'Cebolla', role: 'base', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    const margarita = { category: 'Pizzas', brandIds: ['mod'], customFields: { ingredients: 'Tomate, Mozzarella' } };
    const carbonara = { category: 'Pizzas', brandIds: ['mod'], customFields: {} };
    const opts = {
      productIngredientsOnly: true,
      tpvFallbackWhenEmpty: true,
    };
    expect(parseCatalogIngredients(margarita, undefined, master, undefined, undefined, undefined, opts)).toEqual([
      'Tomate',
      'Mozzarella',
    ]);
    expect(parseCatalogIngredients(carbonara, undefined, master, undefined, undefined, undefined, opts)).toEqual([]);
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

  it('TPV menú usa comboSelections del pedido para ingredientes y extras de pago', () => {
    const combo = {
      _id: 'combo-1',
      itemType: 'combo',
      category: 'Combos',
      brandIds: ['mod'],
      customFields: {},
      comboItems: [],
    };
    const catalog = [
      {
        _id: 'p1',
        category: 'Pizzas',
        brandIds: ['mod'],
        customFields: { ingredients: 'Tomate, Mozzarella' },
      },
    ];
    const comboSelections = [{ productId: 'p1', productName: 'Margarita', quantity: 1 }];
    const master = [
      { id: 'e1', name: 'Extra bacon', role: 'extra', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    expect(
      parseCatalogIngredients(combo, undefined, master, undefined, undefined, [modomioBrand], {
        productIngredientsOnly: true,
        tpvFallbackWhenEmpty: true,
        catalogItems: catalog,
        comboSelections,
      }),
    ).toEqual(['Tomate', 'Mozzarella']);
    expect(
      parseCatalogSupplements(combo, undefined, undefined, undefined, master, 0.9, [modomioBrand], {
        storeExtrasOnly: true,
        catalogItems: catalog,
        comboSelections,
      }),
    ).toEqual([{ id: 'e1', name: 'Extra bacon', price: 0.9 }]);
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

  it('mergeDuplicateStoreIngredients fusiona mismo nombre y marcas', async () => {
    const { mergeDuplicateStoreIngredients } = await import('../src/app/lib/catalogCustomization.ts');
    const list = [
      { id: 'a', name: 'Mozzarella', role: 'base', brandIds: ['b1'], productParts: ['pizzas'] },
      { id: 'b', name: 'mozzarella', role: 'extra', brandIds: ['b1'], productParts: ['pizzas'] },
    ];
    const { items, mergedCount } = mergeDuplicateStoreIngredients(list);
    expect(items).toHaveLength(1);
    expect(mergedCount).toBe(1);
    expect(items[0].role).toBe('extra');
    expect(items[0].name).toBe('Mozzarella');
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

  it('1 quitado = 1 extra gratis (créditos en orden de añadido)', async () => {
    const {
      applyFreeSwapCreditsToSupplements,
      cartLineExtrasUnitPrice,
      catalogItemAllowsFreeSwapOnRemove,
      withFreeSwapApplied,
    } = await import('../src/app/lib/catalogCustomization.ts');

    expect(catalogItemAllowsFreeSwapOnRemove({ customFields: { tpvFreeSwapOnRemove: true } })).toBe(true);
    expect(catalogItemAllowsFreeSwapOnRemove({ customFields: {} })).toBe(false);
    expect(
      catalogItemAllowsFreeSwapOnRemove({ customFields: {} }, { storeFreeSwapOnRemove: true }),
    ).toBe(true);

    const priced = applyFreeSwapCreditsToSupplements(
      [
        { id: 'a', name: 'Bacon', price: 1.5 },
        { id: 'b', name: 'Piña', price: 1.5 },
      ],
      1,
    );
    expect(priced[0].price).toBe(0);
    expect(priced[1].price).toBe(1.5);

    const custom = {
      removedIngredients: ['Tomate'],
      addedSupplements: [
        { id: 'a', name: 'Bacon', price: 1.5 },
        { id: 'b', name: 'Piña', price: 1.5 },
      ],
      notes: '',
    };
    expect(cartLineExtrasUnitPrice(custom, { freeSwapOnRemove: true })).toBe(1.5);
    expect(withFreeSwapApplied(custom, true).addedSupplements.map((s) => s.price)).toEqual([0, 1.5]);
  });
});
