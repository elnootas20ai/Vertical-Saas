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
