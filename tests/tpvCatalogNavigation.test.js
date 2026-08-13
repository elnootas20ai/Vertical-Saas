// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildTpvCatalogSections,
  categoriesForTpvScope,
  defaultTpvSectionId,
  searchTpvProducts,
  buildTpvProductSearchIndex,
  filterTpvCatalogProducts,
  foldTpvSearchText,
  tpvSectionProductCount,
} from '../src/app/lib/tpvCatalogNavigation';

describe('categoriesForTpvScope', () => {
  it('incluye categorías de items aunque no estén en catalogCategories de la marca', () => {
    const brands = [
      {
        _id: 'brand-modomio',
        catalogCategories: ['Pizzas', 'Bebidas'],
      },
    ];
    const catalog = [
      {
        _id: 'combo-1',
        itemType: 'combo',
        category: 'Combos',
        active: true,
        brandIds: ['brand-modomio'],
        unitPrice: 12,
      },
      {
        _id: 'pizza-1',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['brand-modomio'],
        unitPrice: 10,
      },
    ];

    const cats = categoriesForTpvScope(
      { kind: 'brand', brandId: 'brand-modomio' },
      brands,
      catalog,
    );

    expect(cats).toEqual(['Pizzas', 'Combos']);
  });

  it('pestaña Todos incluye productos huérfanos de marca inactiva', () => {
    const brands = [{ _id: 'brand-active', active: true, name: 'Activa', catalogCategories: ['Pizzas'] }];
    const catalog = [
      {
        _id: 'orphan-1',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['brand-deleted'],
        unitPrice: 9,
      },
    ];
    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections.some((s) => s.label === 'Todos')).toBe(true);
    expect(defaultTpvSectionId(sections)).toBe('brand:brand-active');
    expect(defaultTpvSectionId(sections, catalog)).toBe('all');
    const index = buildTpvProductSearchIndex(catalog);
    const visible = searchTpvProducts(index, catalog, '', { kind: 'all' }, null, {});
    expect(visible.map((i) => i._id)).toEqual(['orphan-1']);
  });

  it('modomio y blackburger aparecen en la barra superior junto a Todos', () => {
    const brands = [
      {
        _id: 'mod',
        name: 'modomio',
        active: true,
        isDefault: true,
        catalogCategories: ['Pizzas', 'Entrantes'],
      },
      {
        _id: 'bb',
        name: 'blackburger',
        active: true,
        catalogCategories: ['Burgers', 'Complementos'],
      },
    ];
    const catalog = [
      { _id: 'p1', itemType: 'product', category: 'Pizzas', active: true, brandIds: ['mod'], unitPrice: 10 },
      { _id: 'b1', itemType: 'product', category: 'Burgers', active: true, brandIds: ['bb'], unitPrice: 12 },
      { _id: 'd1', itemType: 'product', category: 'Bebidas', active: true, brandIds: [], unitPrice: 2 },
    ];
    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections.map((s) => s.label)).toEqual(['Todos', 'Bebidas', 'modomio', 'blackburger']);
    expect(defaultTpvSectionId(sections)).toBe('brand:mod');
    expect(defaultTpvSectionId(sections, catalog)).toBe('all');
    const modCats = categoriesForTpvScope({ kind: 'brand', brandId: 'mod' }, brands, catalog);
    expect(modCats).toEqual(['Pizzas']);
    const bbCats = categoriesForTpvScope({ kind: 'brand', brandId: 'bb' }, brands, catalog);
    expect(bbCats).toEqual(['Burgers']);
  });

  it('combos y tacos se quedan en cada marca; no pestaña General', () => {
    const brands = [
      {
        _id: 'mod',
        name: 'Modomio',
        active: true,
        catalogCategories: ['Pizzas', 'Combos'],
      },
      {
        _id: 'bb',
        name: 'blackburger',
        active: true,
        catalogCategories: ['Burgers', 'Combos', 'Tacos'],
      },
      {
        _id: 'tacos',
        name: 'Tacos',
        active: false,
        catalogCategories: ['Tacos'],
      },
    ];
    const catalog = [
      {
        _id: 'combo-mod',
        itemType: 'combo',
        name: 'Individual',
        category: 'Combos',
        active: true,
        brandIds: ['mod'],
        unitPrice: 12,
      },
      {
        _id: 'combo-bb',
        itemType: 'combo',
        name: 'Combo Blackburger',
        category: 'Combos',
        active: true,
        brandIds: ['bb'],
        unitPrice: 14,
      },
      {
        _id: 'taco-1',
        itemType: 'product',
        name: 'Steak Taco',
        category: 'Tacos',
        active: true,
        brandIds: ['bb'],
        unitPrice: 5,
      },
      {
        _id: 'reventa-1',
        itemType: 'product',
        name: 'Helado Reventa',
        category: 'Reventa',
        active: true,
        brandIds: [],
        unitPrice: 3,
      },
    ];
    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections.map((s) => s.label)).not.toContain('General');
    expect(sections.some((s) => s.label === 'Tacos' && s.scope?.kind === 'brand')).toBe(false);
    const modCats = categoriesForTpvScope({ kind: 'brand', brandId: 'mod' }, brands, catalog);
    const bbCats = categoriesForTpvScope({ kind: 'brand', brandId: 'bb' }, brands, catalog);
    expect(modCats).toContain('Combos');
    expect(bbCats).toEqual(expect.arrayContaining(['Combos', 'Tacos']));
    const modCombos = filterTpvCatalogProducts(
      catalog,
      { kind: 'brand', brandId: 'mod' },
      null,
      '',
      {},
      brands,
    );
    const bbItems = filterTpvCatalogProducts(
      catalog,
      { kind: 'brand', brandId: 'bb' },
      null,
      '',
      {},
      brands,
    );
    expect(modCombos.map((i) => i._id)).toEqual(['combo-mod']);
    expect(bbItems.map((i) => i._id).sort()).toEqual(['combo-bb', 'taco-1']);
  });

  it('no muestra ingredientes de inventario (module stock) en el TPV', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, catalogCategories: ['Pizzas'] },
    ];
    const catalog = [
      {
        _id: 'pizza-1',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['mod'],
        module: 'catalog',
        unitPrice: 10,
      },
      {
        _id: 'tomate',
        itemType: 'product',
        category: 'Ingredientes',
        active: true,
        brandIds: [],
        module: 'stock',
        stockCategory: 'ingredient',
        isStockItem: true,
        unitPrice: 0,
      },
      {
        _id: 'bebida-1',
        itemType: 'product',
        category: 'Bebidas',
        active: true,
        brandIds: [],
        module: 'catalog',
        unitPrice: 2,
      },
    ];
    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections.map((s) => s.label)).toEqual(['Todos', 'Bebidas', 'modomio']);
    const index = buildTpvProductSearchIndex(catalog);
    const visible = searchTpvProducts(index, catalog, '', { kind: 'all' }, null, {});
    expect(visible.map((i) => i._id).sort()).toEqual(['bebida-1', 'pizza-1']);
    expect(visible.some((i) => i._id === 'tomate')).toBe(false);
  });

  it('muestra carta con isStockItem=true (Crispy / Premium con control de stock)', () => {
    const brands = [
      { _id: 'bb', name: 'blackburger', active: true, catalogCategories: ['Burgers'] },
    ];
    const catalog = [
      {
        _id: 'crispy',
        name: 'Crispy Chicken',
        itemType: 'product',
        category: 'Burger',
        active: true,
        brandIds: ['bb'],
        module: 'catalog',
        isStockItem: true,
        stockCategory: 'finished_product',
        unitPrice: 11,
      },
      {
        _id: 'flour',
        name: 'Harina',
        itemType: 'product',
        category: 'Ingredientes',
        active: true,
        brandIds: [],
        module: 'catalog',
        isStockItem: true,
        stockCategory: 'ingredient',
        unitPrice: 0,
      },
    ];
    const index = buildTpvProductSearchIndex(catalog);
    const visible = searchTpvProducts(index, catalog, '', { kind: 'all' }, null, {});
    expect(visible.map((i) => i._id)).toEqual(['crispy']);
  });

  it('muestra modomio y blackburger aunque aún no tengan productos asignados', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, isDefault: true, catalogCategories: ['Pizzas'] },
      { _id: 'bb', name: 'blackburger', active: true, catalogCategories: ['Burgers'] },
    ];
    const catalog = [
      { _id: 'd1', itemType: 'product', category: 'Bebidas', active: true, brandIds: [], unitPrice: 2 },
    ];
    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections.filter((s) => s.scope.kind === 'brand').map((s) => s.label)).toEqual([
      'modomio',
      'blackburger',
    ]);
  });

  it('bar/restaurante: sin pestaña Todos', () => {
    const brands = [
      {
        _id: 'bode',
        name: 'Bodegeta',
        active: true,
        catalogCategories: ['Tapas', 'Bebidas'],
      },
    ];
    const catalog = [
      {
        _id: 'tapa-1',
        itemType: 'product',
        category: 'Tapas',
        active: true,
        brandIds: ['bode'],
        unitPrice: 5,
      },
    ];
    const sections = buildTpvCatalogSections(brands, catalog, { includeAllTab: false });
    expect(sections.some((s) => s.scope.kind === 'all')).toBe(false);
    expect(sections.map((s) => s.label)).toContain('Bodegeta');
  });

  it('bar: marca primero, luego Bebidas/Cafés/Postres; subfamilias abajo', () => {
    const brands = [
      { _id: 'bode', name: 'Bodegeta', active: true, catalogCategories: ['Tapas', 'Raciones'] },
    ];
    const catalog = [
      { _id: 't1', itemType: 'product', category: 'Tapas', active: true, brandIds: ['bode'], unitPrice: 4 },
      { _id: 'c1', itemType: 'product', category: 'Cervezas', active: true, brandIds: ['bode'], unitPrice: 2 },
      { _id: 'r1', itemType: 'product', category: 'Refrescos', active: true, brandIds: ['bode'], unitPrice: 2 },
      { _id: 'v1', itemType: 'product', category: 'Vinos', active: true, brandIds: ['bode'], unitPrice: 3 },
      { _id: 'f1', itemType: 'product', category: 'Café', active: true, brandIds: ['bode'], unitPrice: 1.5 },
      { _id: 'p1', itemType: 'product', category: 'Postres', active: true, brandIds: ['bode'], unitPrice: 4 },
    ];
    const sections = buildTpvCatalogSections(brands, catalog, {
      includeAllTab: false,
      layout: 'brand_families',
    });
    expect(sections.map((s) => s.label)).toEqual(['Bodegeta', 'Bebidas', 'Cafés', 'Postres']);

    const drinkCats = categoriesForTpvScope(
      { kind: 'shared', groupKey: 'bebidas' },
      brands,
      catalog,
      'brand_families',
    );
    expect(drinkCats.sort()).toEqual(['Cervezas', 'Refrescos', 'Vinos']);

    const brandCats = categoriesForTpvScope(
      { kind: 'brand', brandId: 'bode' },
      brands,
      catalog,
      'brand_families',
    );
    expect(brandCats).toEqual(['Tapas']);
  });

  it('bar: con una sola marca, platos sin brandIds salen en la pestaña de marca', () => {
    const brands = [
      { _id: 'bode', name: 'bodegeta', active: true, catalogCategories: ['Platos', 'Tapas'] },
    ];
    const catalog = [
      { _id: 'plato-1', itemType: 'product', category: 'Platos', active: true, brandIds: [], unitPrice: 12 },
      { _id: 'tapa-1', itemType: 'product', category: 'Tapas', active: true, unitPrice: 6 },
      { _id: 'cerveza-1', itemType: 'product', category: 'Cervezas', active: true, unitPrice: 3 },
    ];
    const brandCats = categoriesForTpvScope(
      { kind: 'brand', brandId: 'bode' },
      brands,
      catalog,
      'brand_families',
    );
    expect(brandCats.sort()).toEqual(['Platos', 'Tapas']);
    expect(
      tpvSectionProductCount(catalog, { kind: 'brand', brandId: 'bode' }, brands, 'brand_families'),
    ).toBe(2);
  });

  it('bar: brand: alias y brandIds huérfanos van a la única marca', () => {
    const brands = [
      {
        _id: 'brand:abc-bode',
        name: 'bodegeta',
        active: true,
        catalogCategories: ['Raciones', 'Tapas'],
      },
    ];
    const catalog = [
      {
        _id: 'r1',
        itemType: 'product',
        category: 'Raciones',
        active: true,
        brandIds: ['abc-bode'],
        unitPrice: 9,
      },
      {
        _id: 't1',
        itemType: 'product',
        category: 'Tapas',
        active: true,
        brandIds: ['brand-viejo-raro'],
        unitPrice: 5,
      },
    ];
    expect(
      tpvSectionProductCount(
        catalog,
        { kind: 'brand', brandId: 'brand:abc-bode' },
        brands,
        'brand_families',
      ),
    ).toBe(2);
    expect(
      categoriesForTpvScope(
        { kind: 'brand', brandId: 'abc-bode' },
        brands,
        catalog,
        'brand_families',
      ).sort(),
    ).toEqual(['Raciones', 'Tapas']);
  });

  it('si varias marcas usan el mismo organizador, sale de cada marca y va a pestaña compartida', () => {
    const brands = [
      {
        _id: 'mod',
        name: 'modomio',
        active: true,
        catalogCategories: ['Pizzas', 'Cervezas', 'Vinos'],
      },
      {
        _id: 'bb',
        name: 'blackburger',
        active: true,
        catalogCategories: ['Burgers', 'Cervezas', 'Vinos'],
      },
    ];
    const catalog = [
      {
        _id: 'pizza-1',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['mod'],
        unitPrice: 10,
      },
      {
        _id: 'burger-1',
        itemType: 'product',
        category: 'Burgers',
        active: true,
        brandIds: ['bb'],
        unitPrice: 12,
      },
      {
        _id: 'beer-1',
        itemType: 'product',
        category: 'Cervezas',
        active: true,
        brandIds: ['bb'],
        unitPrice: 3,
      },
      {
        _id: 'wine-1',
        itemType: 'product',
        category: 'Vinos',
        active: true,
        brandIds: ['mod'],
        unitPrice: 8,
      },
    ];

    const sections = buildTpvCatalogSections(brands, catalog);
    expect(sections.map((s) => s.label)).toEqual([
      'Todos',
      'Cervezas',
      'Vinos',
      'blackburger',
      'modomio',
    ]);

    const modCats = categoriesForTpvScope({ kind: 'brand', brandId: 'mod' }, brands, catalog);
    expect(modCats).toEqual(['Pizzas']);

    const bbCats = categoriesForTpvScope({ kind: 'brand', brandId: 'bb' }, brands, catalog);
    expect(bbCats).toEqual(['Burgers']);

    const index = buildTpvProductSearchIndex(catalog);
    const modProducts = searchTpvProducts(
      index,
      catalog,
      '',
      { kind: 'brand', brandId: 'mod' },
      null,
      {},
      brands,
    );
    expect(modProducts.map((i) => i._id)).toEqual(['pizza-1']);

    const cervezas = searchTpvProducts(
      index,
      catalog,
      '',
      { kind: 'shared', groupKey: 'cervezas' },
      null,
      {},
      brands,
    );
    expect(cervezas.map((i) => i._id)).toEqual(['beer-1']);

    const vinos = searchTpvProducts(
      index,
      catalog,
      '',
      { kind: 'shared', groupKey: 'vinos' },
      null,
      {},
      brands,
    );
    expect(vinos.map((i) => i._id)).toEqual(['wine-1']);
  });
});

describe('búsqueda TPV sin acentos', () => {
  it('foldTpvSearchText quita diacríticos', () => {
    expect(foldTpvSearchText('Diávola')).toBe('diavola');
    expect(foldTpvSearchText('Jamón')).toBe('jamon');
    expect(foldTpvSearchText('  Café  ')).toBe('cafe');
  });

  it('searchTpvProducts encuentra «Diávola» con «dia»', () => {
    const catalog = [
      {
        _id: 'diavola',
        name: 'Diávola',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['mod'],
        unitPrice: 12,
      },
      {
        _id: 'margarita',
        name: 'Margarita',
        itemType: 'product',
        category: 'Pizzas',
        active: true,
        brandIds: ['mod'],
        unitPrice: 10,
      },
    ];
    const index = buildTpvProductSearchIndex(catalog);
    const hits = searchTpvProducts(index, catalog, 'dia', { kind: 'all' }, null, {});
    expect(hits.map((i) => i._id)).toEqual(['diavola']);
  });

  it('filterTpvCatalogProducts también ignora acentos', () => {
    const catalog = [
      {
        _id: 'jamon',
        name: 'Jamón ibérico',
        itemType: 'product',
        category: 'Entrantes',
        active: true,
        brandIds: [],
        unitPrice: 8,
      },
    ];
    const hits = filterTpvCatalogProducts(catalog, { kind: 'all' }, null, 'jamon', {});
    expect(hits.map((i) => i._id)).toEqual(['jamon']);
  });
});
