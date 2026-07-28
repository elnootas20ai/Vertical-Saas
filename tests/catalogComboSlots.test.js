import { describe, expect, it } from 'vitest';
import {
  appendComboMainUnit,
  availableComboMainFamilies,
  buildComboMenuSections,
  catalogProductsForCategory,
  catalogProductsForComboSection,
  catalogProductsForComboSlot,
  COMBO_MENU_PRESETS,
  comboMenuHasMainFamilyChoice,
  DEFAULT_COMBO_STRUCTURE,
  ensureComboMainInstanceIds,
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
  resolveTpvComboMenuSections,
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
    expect(inferComboSlotKind('Tapas')).toBe('main');
    expect(inferComboSlotKind('Raciones')).toBe('main');
    expect(inferComboSlotKind('Bocadillos')).toBe('main');
    expect(inferComboSlotKind('Pinchos')).toBe('main');
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

  it('appendComboMainUnit crea unidades separadas con instanceId (Dúo)', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'Pepperoni', category: 'Pizzas' }),
    ];
    const section = {
      slotKind: 'main',
      catalogCategory: 'Pizzas',
      slotQuota: 2,
      expectedCount: 2,
      required: true,
      groupByMainFamily: 'pizza',
    };
    const first = appendComboMainUnit(section, catalog[0], [], catalog);
    expect(first).toHaveLength(1);
    expect(first[0].instanceId).toBeTruthy();
    expect(first[0].quantity).toBe(1);
    const second = appendComboMainUnit(section, catalog[1], first, catalog);
    expect(second).toHaveLength(2);
    expect(second[0].instanceId).not.toBe(second[1].instanceId);
    const expanded = ensureComboMainInstanceIds(
      [{ productId: 'p1', productName: 'Margarita', quantity: 2, slotKind: 'main' }],
      catalog,
    );
    expect(expanded).toHaveLength(2);
    expect(expanded.every((r) => r.quantity === 1 && r.instanceId)).toBe(true);
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

  it('allowlist muestra complemento con isStockItem (no almacén puro)', () => {
    const catalog = [
      item({
        _id: 'm1',
        name: 'Patatas Monalisa',
        category: 'Complementos',
        isStockItem: true,
        stockCategory: 'other',
      }),
      item({
        _id: 's1',
        name: 'Salchipapas Supreme',
        category: 'Complementos',
        isStockItem: true,
      }),
      item({
        _id: 'flour',
        name: 'Harina',
        category: 'Complementos',
        module: 'stock',
        isStockItem: true,
        stockCategory: 'ingredient',
      }),
    ];
    const section = {
      catalogCategory: 'Complementos',
      slotKind: 'side',
      expectedCount: 0,
      required: true,
      slotQuota: 1,
      groupBySlotKind: true,
    };
    expect(
      catalogProductsForComboSection(section, catalog, undefined, {
        allowlistIds: ['m1', 's1', 'flour'],
      }).map((p) => p._id),
    ).toEqual(['m1', 's1']);
  });

  it('comboSlotSurcharges aplica suplemento Tequeños/Salchipapas sin tocar extras de pizza', async () => {
    const { resolveComboSlotSurcharge, applyComboSlotSurcharges } = await import(
      '../src/app/lib/catalogComboSlots.ts'
    );
    const cf = {
      comboSlotSurcharges: {
        side: { teq1: 1.5, sal1: 1 },
      },
    };
    expect(resolveComboSlotSurcharge(cf, 'side', 'teq1')).toBe(1.5);
    expect(resolveComboSlotSurcharge(cf, 'side', 'sal1')).toBe(1);
    expect(resolveComboSlotSurcharge(cf, 'side', 'pat1')).toBe(0);

    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'teq1', name: 'Tequeños', category: 'Complementos' }),
    ];
    const applied = applyComboSlotSurcharges(
      [
        {
          productId: 'p1',
          productName: 'Margarita',
          quantity: 1,
          slotKind: 'main',
          addedSupplements: [{ id: 'extra-queso', name: 'Extra queso', price: 1.2 }],
        },
        { productId: 'teq1', productName: 'Tequeños', quantity: 1, slotKind: 'side' },
      ],
      cf,
      catalog,
    );
    expect(applied[0].addedSupplements).toEqual([
      { id: 'extra-queso', name: 'Extra queso', price: 1.2 },
    ]);
    expect(applied[1].addedSupplements).toEqual([
      { id: 'combo-slot-surcharge:teq1', name: 'Tequeños', price: 1.5 },
    ]);
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
    expect(mainFamilyForCatalogCategory('Tacos')).toBe('taco');
    const pizzaOnly = filterComboMenuSectionsForMainFamily(sections, 'pizza');
    expect(pizzaOnly.some((s) => s.catalogCategory === 'Pizzas')).toBe(true);
    expect(pizzaOnly.some((s) => s.catalogCategory === 'Burgers')).toBe(false);
    expect(pizzaOnly.some((s) => s.catalogCategory === 'Bebidas')).toBe(true);
    const picks = [{ productId: 'b1', productName: 'Classic', quantity: 1, slotKind: 'main' }];
    expect(inferMainFamilyFromComboSelections(picks, catalog)).toBe('burger');
  });

  it('Menú Taco solo ofrece tacos aunque el catálogo tenga pizza/burger', () => {
    const catalog = [
      item({ _id: 't1', name: 'Pastor', category: 'Tacos' }),
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'b1', name: 'Classic', category: 'Burgers' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'd1', name: 'Coca', category: 'Bebidas' }),
    ];
    const combo = item({
      _id: 'menu-taco',
      name: 'Menú Taco',
      itemType: 'combo',
      category: 'Combos',
      customFields: {
        comboStructureConfirmed: true,
        comboStructure: [
          { slotKind: 'main', label: 'Taco', required: true, expectedCount: 1 },
          { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
          { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
        ],
      },
    });
    const sections = resolveTpvComboMenuSections(combo, catalog);
    expect(comboMenuHasMainFamilyChoice(sections)).toBe(false);
    expect(sections.filter((s) => s.slotKind === 'main').map((s) => s.groupByMainFamily)).toEqual([
      'taco',
    ]);
    expect(
      catalogProductsForComboSection(
        sections.find((s) => s.slotKind === 'main'),
        catalog,
      ).map((p) => p._id),
    ).toEqual(['t1']);
  });

  it('Menú Taco ignora etiqueta «Pizza o burger» del hueco', () => {
    const catalog = [
      item({ _id: 't1', name: 'Pastor', category: 'Tacos' }),
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'b1', name: 'Classic', category: 'Burgers' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'd1', name: 'Coca', category: 'Bebidas' }),
    ];
    const combo = item({
      _id: 'menu-taco-2',
      name: 'Menú Taco',
      itemType: 'combo',
      category: 'Combos',
      customFields: {
        comboStructureConfirmed: true,
        comboStructure: [
          { slotKind: 'main', label: 'Pizza o burger', required: true, expectedCount: 1 },
          { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
          { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
        ],
      },
    });
    const sections = resolveTpvComboMenuSections(combo, catalog);
    expect(comboMenuHasMainFamilyChoice(sections)).toBe(false);
    expect(availableComboMainFamilies(sections)).toEqual(['taco']);
    expect(sections.filter((s) => s.slotKind === 'main').map((s) => s.groupByMainFamily)).toEqual([
      'taco',
    ]);
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
      item({ _id: 'p4', name: 'Pallesa', category: 'Especialidad' }),
      item({ _id: 'rec', name: 'Receta Margarita', category: 'Pizzas' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
      item({ _id: 'b2', name: 'Fanta', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('duo', catalog);
    const pizzaSection = sections.find((s) => s.groupByMainFamily === 'pizza');
    expect(pizzaSection?.expectedCount).toBe(2);
    expect(catalogProductsForComboSection(pizzaSection, catalog).map((p) => p._id).sort()).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
    ]);

    const afterFirst = pickComboProductInSection(pizzaSection, catalog[0], [], catalog);
    expect(afterFirst?.map((r) => r.productId)).toEqual(['p1']);
    const afterSecond = pickComboProductInSection(pizzaSection, catalog[1], afterFirst, catalog);
    expect(afterSecond?.map((r) => r.productId).sort()).toEqual(['p1', 'p2']);

    const side = sections.find((s) => s.slotKind === 'side');
    const drink = sections.find((s) => s.slotKind === 'drink');
    expect(drink?.slotQuota).toBe(2);
    const withSide = pickComboProductInSection(side, catalog[5], afterSecond, catalog);
    const withDrink1 = pickComboProductInSection(drink, catalog[6], withSide, catalog);
    const complete = pickComboProductInSection(drink, catalog[7], withDrink1, catalog);
    expect(isComboMenuComplete(sections, complete, catalog)).toBe(true);
  });

  it('Familiar pide 3 pizzas, 2 complementos y 4 bebidas', () => {
    const catalog = [
      item({ _id: 'p1', name: 'A', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'B', category: 'Pizzas' }),
      item({ _id: 'p3', name: 'C', category: 'Premium' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'c2', name: 'Aros', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
      item({ _id: 'b2', name: 'Fanta', category: 'Bebidas' }),
      item({ _id: 'b3', name: 'Agua', category: 'Bebidas' }),
      item({ _id: 'b4', name: 'Cerveza', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('familiar', catalog);
    const pizza = sections.find((s) => s.groupByMainFamily === 'pizza');
    const side = sections.find((s) => s.slotKind === 'side');
    const drink = sections.find((s) => s.slotKind === 'drink');
    expect(pizza?.expectedCount).toBe(3);
    expect(side?.slotQuota).toBe(2);
    expect(drink?.slotQuota).toBe(4);

    let sel = [];
    sel = pickComboProductInSection(pizza, catalog[0], sel, catalog);
    sel = pickComboProductInSection(pizza, catalog[1], sel, catalog);
    sel = pickComboProductInSection(pizza, catalog[2], sel, catalog);
    sel = pickComboProductInSection(side, catalog[3], sel, catalog);
    sel = pickComboProductInSection(side, catalog[4], sel, catalog);
    for (const b of [catalog[5], catalog[6], catalog[7], catalog[8]]) {
      sel = pickComboProductInSection(drink, b, sel, catalog);
    }
    expect(isComboMenuComplete(sections, sel, catalog)).toBe(true);
  });

  it('resolveTpvComboMenuSections respeta expectedCount custom (no cae a 1-1-1)', () => {
    const catalog = [
      item({ _id: 'p1', name: 'A', category: 'Pizzas' }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    const combo = {
      customFields: {
        comboStructureConfirmed: true,
        comboStructure: [
          { slotKind: 'main', label: 'Pizzas', required: true, expectedCount: 3 },
          { slotKind: 'side', label: 'Comp', required: true, expectedCount: 2 },
          { slotKind: 'drink', label: 'Bebidas', required: true, expectedCount: 4 },
        ],
      },
      comboItems: [],
    };
    const sections = resolveTpvComboMenuSections(combo, catalog);
    expect(sections.find((s) => s.groupByMainFamily === 'pizza')?.expectedCount).toBe(3);
    expect(sections.find((s) => s.slotKind === 'side')?.slotQuota).toBe(2);
    expect(sections.find((s) => s.slotKind === 'drink')?.slotQuota).toBe(4);
  });

  it('Individual / estándar / familiar incluyen Premium y Especialidad y excluyen Receta', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'Trufa', category: 'Premium' }),
      item({ _id: 'p3', name: 'Pallesa', category: 'Especialidad' }),
      item({ _id: 'rec', name: 'Receta Margarita', category: 'Pizzas' }),
      item({ _id: 'hh', name: 'Mitad y Mitad', category: 'Premium', customFields: { halfHalf: true } }),
      item({ _id: 'c1', name: 'Patatas', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    for (const preset of ['estandar', 'duo', 'familiar']) {
      const sections = buildComboMenuSections(preset, catalog);
      const pizzaSection = sections.find((s) => s.groupByMainFamily === 'pizza');
      expect(catalogProductsForComboSection(pizzaSection, catalog).map((p) => p._id).sort()).toEqual([
        'p1',
        'p2',
        'p3',
      ]);
    }
  });

  it('Individual (1 pizza + side allowlist + drink) completes and swaps pizza', () => {
    const catalog = [
      item({ _id: 'p1', name: 'Margarita', category: 'Pizzas' }),
      item({ _id: 'p2', name: 'Trufa', category: 'Premium' }),
      item({ _id: 'deluxe', name: 'Patatas Deluxe', category: 'Complementos' }),
      item({ _id: 'mona', name: 'Patatas Monalisa', category: 'Complementos' }),
      item({ _id: 'other', name: 'Patatas Fritas', category: 'Complementos' }),
      item({ _id: 'b1', name: 'Coca', category: 'Bebidas' }),
    ];
    const sections = buildComboMenuSections('estandar', catalog);
    const pizzaSection = sections.find((s) => s.groupByMainFamily === 'pizza');
    const side = sections.find((s) => s.slotKind === 'side');
    const drink = sections.find((s) => s.slotKind === 'drink');
    expect(pizzaSection?.expectedCount).toBe(1);

    const allowSide = catalogProductsForComboSection(side, catalog, undefined, {
      allowlistIds: ['deluxe', 'mona'],
    }).map((p) => p._id);
    expect(allowSide.sort()).toEqual(['deluxe', 'mona']);

    let sel = pickComboProductInSection(pizzaSection, catalog[0], [], catalog);
    sel = pickComboProductInSection(side, catalog[2], sel, catalog);
    sel = pickComboProductInSection(drink, catalog[5], sel, catalog);
    expect(isComboMenuComplete(sections, sel, catalog)).toBe(true);

    const swapped = pickComboProductInSection(pizzaSection, catalog[1], sel, catalog);
    expect(swapped?.filter((r) => resolveComboRefSlotKind(r, catalog) === 'main').map((r) => r.productId)).toEqual([
      'p2',
    ]);
    expect(isComboMenuComplete(sections, swapped, catalog)).toBe(true);
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
