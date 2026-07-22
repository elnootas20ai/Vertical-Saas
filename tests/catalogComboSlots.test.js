import { describe, expect, it } from 'vitest';
import {
  buildComboMenuSections,
  catalogProductsForCategory,
  catalogProductsForComboSection,
  catalogProductsForComboSlot,
  COMBO_MENU_PRESETS,
  comboMenuHasMainFamilyChoice,
  DEFAULT_COMBO_STRUCTURE,
  expectedCountForComboSlot,
  filterComboMenuSectionsForMainFamily,
  groupComboItemsBySlot,
  inferComboMenuPresetId,
  inferComboSlotKind,
  inferMainFamilyFromComboSelections,
  isComboMenuComplete,
  mainFamilyForCatalogCategory,
  normalizeComboItemsForSave,
  pickComboProductInSection,
  resolveComboRefSlotKind,
  structureFromSectionDraft,
  totalUnitsInComboSlot,
  validateComboSectionDraft,
  DEFAULT_COMBO_SECTION_DRAFT,
} from '../src/app/lib/catalogComboSlots.ts';

function item(partial) {
  return {
    _id: partial._id,
    name: partial.name,
    category: partial.category,
    type: 'catalog_item',
    id: partial._id,
    sku: '',
    user_id: 'u1',
    module: 'catalog',
    itemType: 'product',
    vertical: 'delivery',
    description: '',
    unitPrice: 9,
    costPrice: 3,
    taxRate: 10,
    stockQuantity: 0,
    minStock: 0,
    reorderQuantity: 0,
    autoReorder: false,
    unit: 'ud',
    supplierId: '',
    supplierName: '',
    allergens: [],
    image: '',
    images: [],
    active: true,
    webVisible: true,
    available: true,
    notes: '',
    barcode: '',
    brandIds: [],
    articles: [],
    comboItems: [],
    salesChannels: [],
    stockCategory: 'other',
    stockSubcategory: '',
    isStockItem: false,
    customFields: {},
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('catalogComboSlots', () => {
  it('clasifica categorías en huecos del combo', () => {
    expect(inferComboSlotKind('Pizzas')).toBe('main');
    expect(inferComboSlotKind('Burgers')).toBe('main');
    expect(inferComboSlotKind('Hamburguesas')).toBe('main');
    expect(inferComboSlotKind('Bebidas')).toBe('drink');
    expect(inferComboSlotKind('Postres')).toBe('dessert');
    expect(inferComboSlotKind('Complementos')).toBe('side');
  });

  it('pizza con "extra" en el nombre sigue siendo plato principal', () => {
    expect(inferComboSlotKind('Pizzas', 'Pizza Barbacoa extra queso')).toBe('main');
    expect(inferComboSlotKind('Complementos', 'Patatas fritas')).toBe('side');
  });

  it('lista todos los productos del hueco sin límite artificial', () => {
    const catalog = Array.from({ length: 30 }, (_, i) =>
      item({ _id: `p${i}`, name: `Pizza ${i}`, category: 'Pizzas' }),
    );
    expect(catalogProductsForComboSlot('main', catalog)).toHaveLength(30);
  });

  it('agrupa productos del combo por tipo', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'b1', name: 'Coca-Cola', category: 'Bebidas' }),
    ];
    const comboItems = [
      { productId: 'p1', productName: 'Margarita', quantity: 1 },
      { productId: 'b1', productName: 'Coca-Cola', quantity: 1 },
    ];
    const grouped = groupComboItemsBySlot(comboItems, catalog);
    expect(grouped.get('main')).toHaveLength(1);
    expect(grouped.get('drink')).toHaveLength(1);
  });

  it('filtra catálogo por hueco', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'b1', name: 'Agua', category: 'Bebidas' }),
    ];
    const drinks = catalogProductsForComboSlot('drink', catalog);
    expect(drinks.map((d) => d._id)).toEqual(['b1']);
  });

  it('persiste slotKind al guardar', () => {
    const catalog = [item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' })];
    const saved = normalizeComboItemsForSave(
      [{ productId: 'p1', productName: 'Margarita', quantity: 1, slotKind: 'main' }],
      catalog,
    );
    expect(saved[0].slotKind).toBe('main');
    expect(resolveComboRefSlotKind(saved[0], catalog)).toBe('main');
  });

  it('menú estándar es pizza + complemento + bebida', () => {
    expect(DEFAULT_COMBO_STRUCTURE.map((s) => s.slotKind)).toEqual(['main', 'side', 'drink']);
    const err = validateComboSectionDraft({
      ...DEFAULT_COMBO_SECTION_DRAFT,
      side: { enabled: false, count: 1 },
    });
    expect(err).toContain('complemento');
  });

  it('plantillas duo y familiar incluyen complemento', () => {
    const duo = COMBO_MENU_PRESETS.find((p) => p.id === 'duo').structure;
    const familiar = COMBO_MENU_PRESETS.find((p) => p.id === 'familiar').structure;
    expect(duo.some((s) => s.slotKind === 'side')).toBe(true);
    expect(expectedCountForComboSlot('main', duo)).toBe(2);
    expect(expectedCountForComboSlot('side', familiar)).toBe(2);
    expect(inferComboMenuPresetId(duo)).toBe('duo');
    expect(inferComboMenuPresetId(familiar)).toBe('familiar');
    expect(inferComboMenuPresetId(structureFromSectionDraft(DEFAULT_COMBO_SECTION_DRAFT))).toBe('estandar');
  });

  it('cuenta unidades totales en un hueco (cantidad × líneas)', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'Pepperoni', category: 'Pizzas' }),
    ];
    const comboItems = [
      { productId: 'p1', productName: 'Margarita', quantity: 2, slotKind: 'main' },
    ];
    expect(totalUnitsInComboSlot('main', comboItems, catalog)).toBe(2);
    comboItems.push({ productId: 'p2', productName: 'Pepperoni', quantity: 1, slotKind: 'main' });
    expect(totalUnitsInComboSlot('main', comboItems, catalog)).toBe(3);
  });

  it('buildComboMenuSections usa nombres del Excel (Complementos, Bebidas)', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Sides' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('estandar', catalog);
    expect(sections.find((s) => s.catalogCategory === 'Pizzas')?.expectedCount).toBe(1);
    expect(sections.find((s) => s.catalogCategory === 'Complementos')?.slotQuota).toBe(1);
    expect(sections.find((s) => s.catalogCategory === 'Bebidas')?.slotQuota).toBe(1);
    expect(sections.find((s) => s.catalogCategory === 'Sides')).toBeUndefined();
    const sideSection = sections.find((s) => s.catalogCategory === 'Complementos');
    expect(catalogProductsForComboSection(sideSection, catalog).map((p) => p._id)).toEqual(['c1']);
  });

  it('allowlist restringe productos del hueco (p. ej. Deluxe o Monalisa)', async () => {
    const { resolveComboSlotAllowlist } = await import('../src/app/lib/catalogComboSlots.ts');
    const catalog = [
      item({ _id: 'd1', name: 'Patatas Deluxe', category: 'Complementos' }),
      item({ _id: 'm1', name: 'Patatas Monalisa', category: 'Complementos' }),
      item({ _id: 'x1', name: 'Alitas', category: 'Complementos' }),
    ];
    const section = {
      catalogCategory: 'Complementos',
      slotKind: 'side',
      expectedCount: 0,
      required: true,
      slotQuota: 1,
      groupBySlotKind: true,
    };
    const allow = resolveComboSlotAllowlist(
      { comboSlotAllowlists: { side: ['d1', 'm1'] } },
      'side',
    );
    expect(allow).toEqual(['d1', 'm1']);
    expect(
      catalogProductsForComboSection(section, catalog, undefined, { allowlistIds: allow }).map(
        (p) => p._id,
      ),
    ).toEqual(['d1', 'm1']);
  });

  it('buildComboMenuSections sin bebidas en catálogo sigue agrupando por tipo', () => {
    const catalog = [item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' })];
    const sections = buildComboMenuSections('estandar', catalog);
    expect(sections.find((s) => s.slotKind === 'side')?.groupBySlotKind).toBe(true);
    expect(sections.find((s) => s.slotKind === 'drink')?.groupBySlotKind).toBe(true);
  });

  it('Sides se normaliza a Complementos al importar', async () => {
    const { normalizeImportCategory } = await import('../src/app/lib/deliveryCatalogImportLogic.ts');
    expect(normalizeImportCategory('Sides')).toBe('Complementos');
  });

  it('Sides y Entrantes cuentan como complemento', () => {
    expect(inferComboSlotKind('Sides')).toBe('side');
    expect(inferComboSlotKind('Entrantes')).toBe('side');
  });

  it('isComboMenuComplete valida por sección de catálogo', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Sides' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('estandar', catalog);
    const partial = [{ productId: 'p1', productName: 'Margarita', quantity: 1, slotKind: 'main' }];
    expect(isComboMenuComplete(sections, partial, catalog)).toBe(false);
    const full = [
      ...partial,
      { productId: 'c1', productName: 'Patatas', quantity: 1, slotKind: 'side' },
      { productId: 'b1', productName: 'Coca', quantity: 1, slotKind: 'drink' },
    ];
    expect(isComboMenuComplete(sections, full, catalog)).toBe(true);
  });

  it('TPV menú: pizza vs burger y filtro de secciones', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'b1', name: 'Classic', category: 'Burgers' }),
    ];
    const sections = buildComboMenuSections('estandar', catalog);
    expect(comboMenuHasMainFamilyChoice(sections)).toBe(true);
    expect(mainFamilyForCatalogCategory('Pizzas')).toBe('pizza');
    expect(mainFamilyForCatalogCategory('Top Burgers')).toBe('burger');
    expect(mainFamilyForCatalogCategory('Smash Burgers')).toBe('burger');
    const pizzaOnly = filterComboMenuSectionsForMainFamily(sections, 'pizza');
    expect(pizzaOnly.some((s) => s.catalogCategory === 'Pizzas')).toBe(true);
    expect(pizzaOnly.some((s) => s.catalogCategory === 'Burgers')).toBe(false);
    expect(pizzaOnly.some((s) => s.catalogCategory === 'Bebidas')).toBe(true);
    const picks = [{ productId: 'b1', productName: 'Classic', quantity: 1, slotKind: 'main' }];
    expect(inferMainFamilyFromComboSelections(picks, catalog)).toBe('burger');
  });

  it('pizza de especialidad cuenta como plato del menú (1 pizza o premium)', () => {
    expect(inferComboSlotKind('Pizzas Premium')).toBe('main');
    expect(inferComboSlotKind('Especialidad')).toBe('main');
    expect(inferComboSlotKind('Premium')).toBe('main');
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'Trufa', category: 'Pizzas Premium' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('estandar', catalog);
    const pizzaSection = sections.find((s) => s.groupByMainFamily === 'pizza');
    expect(pizzaSection?.catalogCategory).toBe('Pizzas / Especialidad');
    expect(pizzaSection?.expectedCount).toBe(1);
    expect(catalogProductsForComboSection(pizzaSection, catalog).map((p) => p._id).sort()).toEqual([
      'p1',
      'p2',
    ]);
    const withPremium = [
      { productId: 'p2', productName: 'Trufa', quantity: 1, slotKind: 'main' },
      { productId: 'c1', productName: 'Patatas', quantity: 1, slotKind: 'side' },
      { productId: 'b1', productName: 'Coca', quantity: 1, slotKind: 'drink' },
    ];
    expect(isComboMenuComplete(sections, withPremium, catalog)).toBe(true);
  });

  it('Combo Dúo acumula 2 pizzas distintas sin borrar la primera', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'Pepperoni', category: 'Pizzas' }),
      item({ _id: 'p3', name: 'Trufa', category: 'Pizzas Premium' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('duo', catalog);
    const pizzaSection = sections.find((s) => s.groupByMainFamily === 'pizza');
    expect(pizzaSection?.expectedCount).toBe(2);
    expect(catalogProductsForComboSection(pizzaSection, catalog).map((p) => p._id).sort()).toEqual([
      'p1',
      'p2',
      'p3',
    ]);

    const afterFirst = pickComboProductInSection(pizzaSection, catalog[0], [], catalog);
    expect(afterFirst?.map((r) => r.productId)).toEqual(['p1']);
    const afterSecond = pickComboProductInSection(pizzaSection, catalog[1], afterFirst, catalog);
    expect(afterSecond?.map((r) => r.productId).sort()).toEqual(['p1', 'p2']);

    const side = sections.find((s) => s.slotKind === 'side');
    const drink = sections.find((s) => s.slotKind === 'drink');
    const withSide = pickComboProductInSection(side, catalog[3], afterSecond, catalog);
    const complete = pickComboProductInSection(drink, catalog[4], withSide, catalog);
    expect(isComboMenuComplete(sections, complete, catalog)).toBe(true);
  });

  it('Top Burgers y productos con burger en el nombre cuentan como main', () => {
    expect(inferComboSlotKind('Top Burgers')).toBe('main');
    expect(inferComboSlotKind('Principales', 'Smash Burger')).toBe('main');
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 't1', name: 'Double', category: 'Top Burgers' }),
    ];
    const sections = buildComboMenuSections('estandar', catalog);
    expect(sections.some((s) => s.catalogCategory === 'Top Burgers')).toBe(true);
    expect(comboMenuHasMainFamilyChoice(sections)).toBe(true);
  });
});
