import { describe, expect, it } from 'vitest';
import {
  catalogBuildYourOwnIngredientCandidates,
  catalogPizzasForHalfHalf,
  catalogPizzaCandidatesForHalfHalf,
  customizationSignature,
  isTpvBuildYourOwnCatalogItem,
  isTpvHalfHalfCatalogItem,
  isHalfHalfFlavorSelectionInvalid,
  mergeHalfHalfProductIngredients,
  normalizeHalfHalfAllowedProductIds,
  resolveBuildYourOwnMaxIngredients,
  tpvBuildYourOwnIngredientPool,
} from '../src/app/lib/catalogCustomization.js';

describe('isTpvHalfHalfCatalogItem', () => {
  it('detects flag in customFields', () => {
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'product',
        name: 'Especial',
        category: 'Pizzas',
        customFields: { halfHalf: true },
      }),
    ).toBe(true);
  });

  it('detects by name', () => {
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'product',
        name: 'Pizza Mitad y mitad',
        category: 'Pizzas',
        customFields: {},
      }),
    ).toBe(true);
  });

  it('ignores combos', () => {
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'combo',
        name: 'Mitad y mitad',
        category: 'Combos',
        customFields: {},
      }),
    ).toBe(false);
  });
});

describe('isTpvBuildYourOwnCatalogItem', () => {
  it('detects flag in customFields', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Especial',
        category: 'Pizzas',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(true);
  });

  it('detects by name', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Pizza al gusto',
        category: 'Pizzas',
        customFields: {},
      }),
    ).toBe(true);
  });

  it('detects 3 / 5 ingredientes modes by name', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: '3 Ingredientes',
        category: 'Pizzas',
        customFields: {},
      }),
    ).toBe(true);
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: '5 Ingredientes a elegir',
        category: 'Premium',
        customFields: {},
      }),
    ).toBe(true);
  });

  it('does not overlap with half-half', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Pizzas',
        customFields: { halfHalf: true },
      }),
    ).toBe(false);
  });
});

describe('catalogPizzasForHalfHalf', () => {
  const catalog = [
    { _id: 'hh', name: 'Mitad y mitad', category: 'Pizzas', itemType: 'product', active: true, customFields: { halfHalf: true } },
    { _id: 'p1', name: 'Margarita', category: 'Pizzas', itemType: 'product', active: true, customFields: {} },
    { _id: 'p2', name: 'Barbacoa', category: 'Pizzas', itemType: 'product', active: true, customFields: {} },
    { _id: 'c1', name: 'Menú 1', category: 'Combos', itemType: 'combo', active: true, customFields: {} },
    { _id: 'b1', name: 'Coca-Cola', category: 'Bebidas', itemType: 'product', active: true, customFields: {} },
  ];

  it('lists pizzas excluding half-half product and combos', () => {
    const list = catalogPizzasForHalfHalf(catalog, 'hh');
    expect(list.map((p) => p._id)).toEqual(['p2', 'p1']);
  });

  it('filters by allowed product ids when configured', () => {
    const list = catalogPizzasForHalfHalf(catalog, 'hh', {
      allowedProductIds: ['p1'],
    });
    expect(list.map((p) => p._id)).toEqual(['p1']);
  });

  it('returns empty when allowed ids do not match any pizza', () => {
    const list = catalogPizzasForHalfHalf(catalog, 'hh', {
      allowedProductIds: ['missing'],
    });
    expect(list).toEqual([]);
  });

  it('excludes pizza al gusto from half-half flavor list', () => {
    const withByo = [
      ...catalog,
      {
        _id: 'byo',
        name: 'Pizza al gusto',
        category: 'Pizzas',
        itemType: 'product',
        active: true,
        customFields: { buildYourOwn: true },
      },
    ];
    const list = catalogPizzasForHalfHalf(withByo, 'hh');
    expect(list.map((p) => p._id)).toEqual(['p2', 'p1']);
  });

  it('shows only configured flavors when half-half whitelist has two pizzas', () => {
    const list = catalogPizzasForHalfHalf(catalog, 'hh', {
      allowedProductIds: ['p1', 'p2'],
    });
    expect(list.map((p) => p._id)).toEqual(['p2', 'p1']);
  });
});

describe('normalizeHalfHalfAllowedProductIds', () => {
  it('dedupes and trims ids', () => {
    expect(normalizeHalfHalfAllowedProductIds([' p1 ', 'p1', '', 'p2'])).toEqual(['p1', 'p2']);
  });

  it('returns empty for invalid input', () => {
    expect(normalizeHalfHalfAllowedProductIds(null)).toEqual([]);
  });
});

describe('catalogPizzaCandidatesForHalfHalf', () => {
  it('filters candidates by brand when brandIds provided', () => {
    const catalog = [
      { _id: 'hh', name: 'Mitad y mitad', category: 'Pizzas', itemType: 'product', active: true, brandIds: ['b1'], customFields: { halfHalf: true } },
      { _id: 'p1', name: 'Margarita', category: 'Pizzas', itemType: 'product', active: true, brandIds: ['b1'], customFields: {} },
      { _id: 'p2', name: 'Barbacoa', category: 'Pizzas', itemType: 'product', active: true, brandIds: ['b2'], customFields: {} },
    ];
    const list = catalogPizzaCandidatesForHalfHalf(catalog, 'hh', ['b1']);
    expect(list.map((p) => p._id)).toEqual(['p1']);
  });

  it('includes products from pizza line brand even without pizza in category name', () => {
    const catalog = [
      { _id: 'hh', name: 'Mitad y mitad', category: 'Pizzas', itemType: 'product', active: true, brandIds: ['b1'], customFields: { halfHalf: true } },
      { _id: 'p1', name: 'Margarita', category: 'Carta', itemType: 'product', active: true, brandIds: ['b1'], customFields: {} },
    ];
    const list = catalogPizzaCandidatesForHalfHalf(catalog, 'hh', ['b1'], [
      { _id: 'b1', deliveryLineKind: 'pizza' },
    ]);
    expect(list.map((p) => p._id)).toEqual(['p1']);
  });
});

describe('isHalfHalfFlavorSelectionInvalid', () => {
  it('allows empty (todas) and two or more', () => {
    expect(isHalfHalfFlavorSelectionInvalid([])).toBe(false);
    expect(isHalfHalfFlavorSelectionInvalid(['a', 'b'])).toBe(false);
  });

  it('rejects exactly one selected pizza', () => {
    expect(isHalfHalfFlavorSelectionInvalid(['a'])).toBe(true);
  });
});

describe('isTpvComboCatalogItem half-half', () => {
  it('does not treat half-half product as combo', async () => {
    const { isTpvComboCatalogItem } = await import('../src/app/lib/catalogComboSlots.js');
    expect(
      isTpvComboCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Pizzas',
        comboItems: [],
        customFields: { halfHalf: true },
      }),
    ).toBe(false);
  });
});

describe('resolveBuildYourOwnMaxIngredients', () => {
  it('lee tope 3 / 5 del nombre o customFields', () => {
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: '3 Ingredientes',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(3);
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: 'Pizza al gusto',
        customFields: { buildYourOwn: true, buildYourOwnMaxIngredients: 5 },
      }),
    ).toBe(5);
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: 'Pizza al gusto',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(null);
  });

  it('infiere 3 / 5 desde Modommio (carta) y Premium Modommio', () => {
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: 'Mitad y mitad',
        customFields: { halfHalf: true },
      }),
    ).toBe(null);
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: 'Modommio',
        category: 'Pizzas',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(3);
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: 'Modommio',
        category: 'Premium',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(5);
    expect(
      resolveBuildYourOwnMaxIngredients({
        name: 'Premium Modommio',
        category: 'Premium',
        customFields: { buildYourOwn: true },
      }),
    ).toBe(5);
  });
});

describe('isTpvBuildYourOwnCatalogItem modommio', () => {
  it('detecta Modommio por nombre (producto, no combo)', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Modommio',
        category: 'Premium',
        customFields: {},
      }),
    ).toBe(true);
  });

  it('no trata Combo Modommio como BYO', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'combo',
        name: 'Combo Modommio',
        category: 'Combos',
        customFields: {},
      }),
    ).toBe(false);
  });

  it('sigue detectando Modomio legacy', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Modomio',
        category: 'Premium',
        customFields: {},
      }),
    ).toBe(true);
  });
});

describe('isTpvBuildYourOwnCatalogItem mitad', () => {
  it('Mitad y mitad es siempre half-half (2 pizzas), nunca BYO', () => {
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Premium',
        customFields: {},
      }),
    ).toBe(false);
    expect(
      isTpvBuildYourOwnCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Premium',
        customFields: { buildYourOwn: true, buildYourOwnMaxIngredients: 3 },
      }),
    ).toBe(false);
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'product',
        name: 'Mitad y mitad',
        category: 'Premium',
        customFields: { buildYourOwn: true, buildYourOwnMaxIngredients: 3 },
      }),
    ).toBe(true);
    expect(
      isTpvHalfHalfCatalogItem({
        itemType: 'product',
        name: 'Premium mitad y mitad (al gusto)',
        category: 'Premium',
        customFields: {},
      }),
    ).toBe(true);
  });
});

describe('catalogPizzasForHalfHalf premium', () => {
  it('incluye Premium / Especialidad como sabores', () => {
    const catalog = [
      { _id: 'hh', name: 'Mitad y mitad', category: 'Pizzas', itemType: 'product', active: true, customFields: { halfHalf: true } },
      { _id: 'p1', name: 'Margarita', category: 'Pizzas', itemType: 'product', active: true, customFields: {} },
      { _id: 'p2', name: 'Pallesa', category: 'Premium', itemType: 'product', active: true, customFields: {} },
      { _id: 'p3', name: 'Mortadella', category: 'Especialidad', itemType: 'product', active: true, customFields: {} },
    ];
    expect(catalogPizzasForHalfHalf(catalog, 'hh').map((p) => p._id).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('tpvBuildYourOwnIngredientPool', () => {
  const storeIngredients = [
    { id: 'ing-1', name: 'Mozzarella', role: 'base', productParts: ['pizzas'] },
    { id: 'ing-2', name: 'Tomate', role: 'base', productParts: ['pizzas'] },
    { id: 'ing-3', name: 'Bacon', role: 'extra', productParts: ['pizzas'] },
  ];

  it('lists base pizza ingredients for al gusto', () => {
    const names = tpvBuildYourOwnIngredientPool(
      {
        name: 'Pizza al gusto',
        category: 'Pizzas',
        brandIds: [],
        customFields: { buildYourOwn: true },
      },
      storeIngredients,
    );
    expect(names).toEqual(['Bacon', 'Mozzarella', 'Tomate']);
  });

  it('relaxes brand filter when product brand does not match ingredient brand', () => {
    const perBrand = [
      { id: 'ing-a', name: 'Mozzarella', role: 'base', brandIds: ['brand-modomio'], productParts: ['pizzas'] },
      { id: 'ing-b', name: 'Tomate', role: 'base', brandIds: ['brand-modomio'], productParts: ['pizzas'] },
    ];
    const names = tpvBuildYourOwnIngredientPool(
      {
        name: 'Pizza al gusto',
        category: 'Pizzas',
        brandIds: ['brand-other'],
        customFields: { buildYourOwn: true },
      },
      perBrand,
    );
    expect(names).toEqual(['Mozzarella', 'Tomate']);
  });

  it('lists TPV extras when no base ingredients exist (import Excel)', () => {
    const extrasOnly = [
      { id: 'ing-1', name: 'Mozzarella', role: 'extra', productParts: ['pizzas'], extraPrices: { '': 1 } },
      { id: 'ing-2', name: 'Tomate', role: 'extra', productParts: ['pizzas'], extraPrices: { '': 1 } },
    ];
    const names = tpvBuildYourOwnIngredientPool(
      {
        name: 'Pizza al gusto',
        category: 'Pizzas',
        brandIds: [],
        customFields: { buildYourOwn: true },
      },
      extrasOnly,
    );
    expect(names).toEqual(['Mozzarella', 'Tomate']);
  });

  it('ignores Excel menu tier labels and beverages in build-your-own pool', () => {
    const mixed = [
      { id: 'm0', name: '0', role: 'extra', productParts: ['pizzas'] },
      { id: 'm3', name: '3 Ingredientes a elegir', role: 'extra', productParts: ['pizzas'] },
      { id: 'm5', name: '+ 5 Ingredientes a elegir', role: 'extra', productParts: ['pizzas'] },
      { id: 'bev', name: 'Agua', role: 'extra', productParts: ['pizzas'] },
      { id: 'ing-1', name: 'Mozzarella', role: 'extra', productParts: ['pizzas'] },
      { id: 'ing-2', name: 'Tomate', role: 'base', productParts: ['pizzas'] },
    ];
    const names = tpvBuildYourOwnIngredientPool(
      {
        name: 'Pizza al gusto',
        category: 'Pizzas',
        brandIds: [],
        customFields: { buildYourOwn: true },
      },
      mixed,
    );
    expect(names).toEqual(['Mozzarella', 'Tomate']);
  });
});

describe('mergeHalfHalfProductIngredients', () => {
  it('merges ingredient lists from both pizza fichas', () => {
    const catalog = [
      {
        _id: 'p1',
        name: 'Margarita',
        category: 'Pizzas',
        customFields: { ingredients: 'Tomate, Mozzarella' },
      },
      {
        _id: 'p2',
        name: 'Barbacoa',
        category: 'Pizzas',
        customFields: { ingredients: 'Salsa BBQ, Mozzarella, Bacon' },
      },
    ];
    const merged = mergeHalfHalfProductIngredients(
      {
        firstProductId: 'p1',
        firstProductName: 'Margarita',
        secondProductId: 'p2',
        secondProductName: 'Barbacoa',
      },
      catalog,
    );
    expect(merged).toEqual(['Tomate', 'Mozzarella', 'Salsa BBQ', 'Bacon']);
  });

  it('falls back to store ingredients when pizza ficha has no ingredientes', () => {
    const catalog = [
      { _id: 'p1', name: 'Margarita', category: 'Pizzas', brandIds: ['b1'], customFields: {} },
      { _id: 'p2', name: 'Barbacoa', category: 'Pizzas', brandIds: ['b1'], customFields: {} },
    ];
    const storeIngredients = [
      { id: 'i1', name: 'Tomate', brandIds: ['b1'], role: 'base' },
      { id: 'i2', name: 'Mozzarella', brandIds: ['b1'], role: 'base' },
    ];
    const merged = mergeHalfHalfProductIngredients(
      {
        firstProductId: 'p1',
        firstProductName: 'Margarita',
        secondProductId: 'p2',
        secondProductName: 'Barbacoa',
      },
      catalog,
      {
        storeIngredients,
        brands: [{ _id: 'b1', deliveryLineKind: 'pizza', catalogCategories: ['Pizzas'] }],
      },
    );
    expect(merged).toEqual(['Tomate', 'Mozzarella']);
  });
});

describe('customizationSignature half-half', () => {
  it('includes both pizza ids', () => {
    const a = customizationSignature({
      removedIngredients: [],
      addedSupplements: [],
      notes: '',
      halfHalfPizza: {
        firstProductId: 'p1',
        firstProductName: 'A',
        secondProductId: 'p2',
        secondProductName: 'B',
      },
    });
    const b = customizationSignature({
      removedIngredients: [],
      addedSupplements: [],
      notes: '',
      halfHalfPizza: {
        firstProductId: 'p1',
        firstProductName: 'A',
        secondProductId: 'p2',
        secondProductName: 'B',
      },
    });
    expect(a).toBe(b);
    expect(a).toContain('p1|p2');
  });
});
