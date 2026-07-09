import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildBrandCategoryMapFromItems,
  commercialLineBrands,
  inferCommercialLineBrandId,
  isCommercialLineBrand,
  mergeBrandCatalogCategories,
  normalizeImportCategory,
  readImportLineText,
  resolveCatalogImportBrandIds,
  resolveCommercialLineIdsFromText,
  formatUnmatchedImportLineRowWarning,
  formatUnmatchedCommercialBrandWarning,
  formatConfiguredCommercialLineNames,
} from '../src/app/lib/deliveryCatalogImportLogic.ts';

describe('deliveryCatalogImport', () => {
  it('normalizeImportCategory maps delivery categories and fixes Dato N', () => {
    expect(normalizeImportCategory('bebida')).toBe('Bebidas');
    expect(normalizeImportCategory('Refrescos')).toBe('Bebidas');
    expect(normalizeImportCategory('Cervezas')).toBe('Bebidas');
    expect(normalizeImportCategory('Pizzas')).toBe('Pizzas');
    expect(normalizeImportCategory('Dato 14')).toBe('Dato 14');
  });

  it('resolveCatalogImportBrandIds clears brand for drink synonyms', () => {
    const brands = [
      { _id: 'b1', name: 'modomio', active: true, catalogCategories: ['Pizzas'], isDefault: false },
    ];
    expect(resolveCatalogImportBrandIds([], 'Refrescos', brands)).toEqual([]);
    expect(resolveCatalogImportBrandIds([], 'Cervezas', brands, 'Mahou 33cl')).toEqual([]);
  });

  it('readImportLineText prefers linea over marca', () => {
    expect(readImportLineText({ linea: 'modomio', marca: 'Coca-Cola' })).toBe('modomio');
    expect(readImportLineText({ marca: 'Sushi' })).toBe('Sushi');
    expect(readImportLineText({ linea: 'Dejar linea vacía' })).toBe('');
    expect(readImportLineText({ linea: '(vacío)' })).toBe('');
  });

  it('isCommercialLineBrand ignores supplier-only brands', () => {
    expect(isCommercialLineBrand({ name: 'Coca-Cola' })).toBe(false);
    expect(isCommercialLineBrand({ name: 'modomio', catalogCategories: ['Pizzas'] })).toBe(true);
  });

  it('asigna Burgers a la línea blackburger por tipo o nombre', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, deliveryLineKind: 'pizza', catalogCategories: ['Pizzas'] },
      { _id: 'bb', name: 'blackburger', active: true, deliveryLineKind: 'burger_fastfood', catalogCategories: ['Burgers'] },
    ];
    expect(inferCommercialLineBrandId('Burgers', brands)).toBe('bb');
    expect(inferCommercialLineBrandId('Pizzas', brands)).toBe('mod');
  });

  it('resolveCatalogImportBrandIds assigns shared categories without line', () => {
    const brands = [
      { _id: 'b1', name: 'modomio', active: true, catalogCategories: ['Pizzas'], isDefault: false },
      { _id: 'b2', name: 'Coca-Cola', active: true },
    ];
    expect(resolveCatalogImportBrandIds([], 'Bebidas', brands)).toEqual([]);
    expect(resolveCatalogImportBrandIds([], 'Pizzas', brands)).toEqual(['b1']);
  });

  it('inferCommercialLineBrandId maps pizza category to pizza line', () => {
    const brands = [
      { _id: 'pizza', name: 'Pizza', active: true, deliveryLineKind: 'pizza', catalogCategories: ['Pizzas'] },
      { _id: 'beb', name: 'Bebidas', active: true, deliveryLineKind: 'drinks_desserts', catalogCategories: ['Bebidas'] },
    ];
    expect(inferCommercialLineBrandId('Pizzas', brands)).toBe('pizza');
    expect(inferCommercialLineBrandId('Bebidas', brands)).toBe('beb');
  });

  it('commercialLineBrands filters supplier brands', () => {
    const brands = [
      { _id: '1', name: 'modomio', active: true, catalogCategories: ['Pizzas'] },
      { _id: '2', name: 'Sprite', active: true },
    ];
    expect(commercialLineBrands(brands)).toHaveLength(1);
    expect(commercialLineBrands(brands)[0].name).toBe('modomio');
  });

  it('mergeBrandCatalogCategories keeps order and dedupes', () => {
    expect(mergeBrandCatalogCategories(['Pizzas', 'Entrantes'], ['Bebidas', 'Pizzas'])).toEqual([
      'Pizzas',
      'Entrantes',
      'Bebidas',
    ]);
  });

  it('resolveCommercialLineIdsFromText matches partial names (Black Burger → blackburger)', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, catalogCategories: ['Pizzas'] },
      { _id: 'bb', name: 'blackburger', active: true, catalogCategories: ['Burgers'] },
    ];
    expect(resolveCommercialLineIdsFromText('Black Burger', brands).brandIds).toEqual(['bb']);
    expect(resolveCommercialLineIdsFromText('modomio', brands).brandIds).toEqual(['mod']);
  });

  it('formatUnmatchedImportLineRowWarning explains unknown line names clearly', () => {
    const brands = [{ _id: 'hp', name: 'holapizza', active: true, catalogCategories: ['Pizzas'] }];
    const msg = formatUnmatchedImportLineRowWarning('burgerrodriguez', brands);
    expect(msg).toContain('burgerrodriguez');
    expect(msg).toContain('holapizza');
    expect(msg).toContain('Ajustes → Marca');
    expect(formatConfiguredCommercialLineNames(brands)).toBe('holapizza');
  });

  it('formatUnmatchedCommercialBrandWarning lists valid configured lines', () => {
    const brands = [{ _id: 'hp', name: 'holapizza', active: true, catalogCategories: ['Pizzas'] }];
    const msg = formatUnmatchedCommercialBrandWarning(['burgerrodriguez', 'otra'], brands);
    expect(msg).toContain('burgerrodriguez');
    expect(msg).toContain('holapizza');
    expect(msg).toContain('no crea líneas nuevas');
  });

  it('la columna linea explícita del Excel gana a la heurística por nombre', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, deliveryLineKind: 'pizza', catalogCategories: ['Pizzas'] },
      { _id: 'bb', name: 'blackburger', active: true, deliveryLineKind: 'burger_fastfood', catalogCategories: ['Burgers'] },
    ];
    // El nombre contiene "burger", pero el Excel dice linea=modomio → modomio.
    expect(
      resolveCatalogImportBrandIds(['mod'], 'Principales', brands, 'Hamburguesa de la casa'),
    ).toEqual(['mod']);
    // El nombre contiene el nombre de otra línea (BlackBurger) → sigue mandando el Excel.
    expect(
      resolveCatalogImportBrandIds(['mod'], 'Principales', brands, 'Avocado BlackBurger'),
    ).toEqual(['mod']);
  });

  it('la columna linea explícita también gana en categorías compartidas', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, deliveryLineKind: 'pizza', catalogCategories: ['Pizzas'] },
    ];
    // Bebidas sin linea → pestaña compartida.
    expect(resolveCatalogImportBrandIds([], 'Bebidas', brands, 'Agua 50cl')).toEqual([]);
    // Bebidas con linea=modomio explícita → se respeta lo que puso el usuario.
    expect(resolveCatalogImportBrandIds(['mod'], 'Bebidas', brands, 'Limoncello')).toEqual(['mod']);
  });

  it('assigns BlackBurger products to blackburger line even when inactive', () => {
    const brands = [
      {
        _id: 'mod',
        name: 'modomio',
        active: true,
        isDefault: true,
        deliveryLineKind: 'prepared_meals',
        catalogCategories: ['Entrantes', 'Principales'],
      },
      {
        _id: 'bb',
        name: 'blackburger',
        active: false,
        deliveryLineKind: 'burger_fastfood',
        catalogCategories: ['Burgers', 'Complementos'],
      },
    ];
    expect(
      resolveCatalogImportBrandIds([], 'Principales', brands, 'Avocado BlackBurger'),
    ).toEqual(['bb']);
    expect(resolveCommercialLineIdsFromText('blackburger', brands).brandIds).toEqual(['bb']);
  });

  it('assigns 100 mixed products to correct TPV organizers', () => {
    const brands = [
      { _id: 'mod', name: 'modomio', active: true, deliveryLineKind: 'pizza', catalogCategories: ['Pizzas', 'Entrantes'] },
      { _id: 'sus', name: 'Sushi', active: true, deliveryLineKind: 'sushi_asian', catalogCategories: ['Rolls', 'Bowls'] },
      { _id: 'bur', name: 'Burger', active: true, deliveryLineKind: 'burger_fastfood', catalogCategories: ['Burgers'] },
      { _id: 'beb', name: 'Bebidas', active: true, deliveryLineKind: 'drinks_desserts', catalogCategories: ['Bebidas'] },
      { _id: 'coke', name: 'Coca-Cola', active: true },
    ];

    const lineCycle = ['modomio', 'modomio', 'Sushi', 'Burger', '', 'modomio'];
    const catCycle = ['Pizzas', 'Entrantes', 'Rolls', 'Burgers', 'Bebidas', 'Complementos'];
    const items = [];

    for (let i = 0; i < 100; i += 1) {
      const entry = {
        name: `Producto ${i + 1}`,
        category: catCycle[i % catCycle.length],
        linea: lineCycle[i % lineCycle.length],
      };
      const category = normalizeImportCategory(entry.category);
      const { brandIds } = resolveCommercialLineIdsFromText(readImportLineText(entry), brands);
      items.push({
        name: entry.name,
        category,
        brandIds: resolveCatalogImportBrandIds(brandIds, category, brands, entry.name),
      });
    }

    expect(items).toHaveLength(100);
    expect(items.every((i) => i.category && !/^dato/i.test(i.category))).toBe(true);

    const withLine = items.filter((i) => i.brandIds.length > 0);
    const shared = items.filter((i) => i.brandIds.length === 0);
    expect(withLine.length).toBeGreaterThan(0);
    expect(shared.length).toBeGreaterThan(0);
    expect(withLine.length + shared.length).toBe(100);

    const map = buildBrandCategoryMapFromItems(items);
    expect(map.get('mod')).toContain('Pizzas');
    expect(map.get('sus')).toContain('Rolls');
    expect(map.get('bur')).toContain('Burgers');

    // Filas Bebidas sin columna linea → sin brandIds (pestaña compartida)
    for (let i = 0; i < 100; i += 1) {
      if (catCycle[i % catCycle.length] !== 'Bebidas') continue;
      if (lineCycle[i % lineCycle.length]) continue;
      expect(items[i].brandIds).toEqual([]);
    }
  });
});

describe('deliveryCatalogExcelTemplate', () => {
  it('organizerBrandsForCatalogTemplate skips default line when named lines exist', async () => {
    const { organizerBrandsForCatalogTemplate } = await import('../src/app/lib/deliveryCatalogImportLogic.ts');
    const brands = [
      { _id: 'def', name: 'modomio', active: true, isDefault: true, catalogCategories: ['Pizzas'] },
      { _id: 'sus', name: 'SushiLine', active: true, catalogCategories: ['Rolls'] },
    ];
    const lines = organizerBrandsForCatalogTemplate(brands);
    expect(lines.map((b) => b.name)).toEqual(['SushiLine']);
  });

  it('buildDeliveryCatalogSampleRows uses brand names and categories', async () => {
    const { buildDeliveryCatalogSampleRows } = await import('../src/app/lib/deliveryCatalogExcelTemplate.ts');
    const rows = buildDeliveryCatalogSampleRows([
      { _id: 'a', name: 'modomio', active: true, catalogCategories: ['Pizzas', 'Entrantes'] },
      { _id: 'b', name: 'SushiLine', active: true, deliveryLineKind: 'sushi_asian' },
    ]);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.some((r) => r[3] === 'modomio' && r[2] === 'Pizzas')).toBe(true);
    expect(rows.some((r) => r[3] === 'SushiLine')).toBe(true);
    expect(rows.some((r) => r[2] === 'Bebidas' && r[3] === '')).toBe(true);
  });

  it('buildDeliveryCatalogImportWorkbook: catalogo vacío + hojas de ayuda', async () => {
    const {
      buildDeliveryCatalogImportWorkbook,
      DELIVERY_CATALOG_TEMPLATE_HEADERS,
      DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS,
    } = await import('../src/app/lib/deliveryCatalogExcelTemplate.ts');
    const wb = buildDeliveryCatalogImportWorkbook([
      { _id: 'a', name: 'modomio', active: true, catalogCategories: ['Pizzas', 'Combos'] },
      { _id: 'b', name: 'blackburger', active: true, catalogCategories: ['Burgers', 'Sides'] },
    ]);
    expect(wb.SheetNames).toEqual(['catalogo', 'referencia_tpv', 'valores_validos', 'instrucciones']);
    const data = XLSX.utils.sheet_to_json(wb.Sheets.catalogo, { header: 1, defval: '' });
    expect(data[0]).toEqual(DELIVERY_CATALOG_TEMPLATE_HEADERS);
    expect(data.length).toBe(1 + DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS);
    expect(data[1].every((cell) => !String(cell || '').trim())).toBe(true);
    expect(data.some((row) => String(row[0] || '').includes('Pizza Margarita'))).toBe(false);
  });

  it('parseCatalogImportStockFields reads stock columns from Excel', async () => {
    const { parseCatalogImportStockFields } = await import('../src/app/lib/deliveryCatalogImportLogic.ts');
    const stock = parseCatalogImportStockFields({
      stock_actual: '80',
      stock_minimo: '15',
      unidad: 'kg',
    });
    expect(stock.stockQuantity).toBe(80);
    expect(stock.minStock).toBe(15);
    expect(stock.unit).toBe('kg');
    expect(stock.isStockItem).toBe(true);
  });

  it('isOfficialCatalogTemplateHeaders detects official column row', async () => {
    const { isOfficialCatalogTemplateHeaders, DELIVERY_CATALOG_TEMPLATE_HEADERS } = await import(
      '../src/app/lib/deliveryCatalogExcelTemplate.ts',
    );
    expect(isOfficialCatalogTemplateHeaders(DELIVERY_CATALOG_TEMPLATE_HEADERS)).toBe(true);
    expect(
      isOfficialCatalogTemplateHeaders(['nombre', 'codigo', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion']),
    ).toBe(true);
    expect(
      isOfficialCatalogTemplateHeaders(['nombre', 'sku', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion']),
    ).toBe(true);
    expect(isOfficialCatalogTemplateHeaders(['Nombre', 'SKU', 'Categoría', 'Línea', 'Precio', 'Descripción'])).toBe(false);
    expect(isOfficialCatalogTemplateHeaders(['nombre', 'sku', 'categoria', 'linea', 'precio'])).toBe(false);
  });

  it('autoMapImportFields maps official template headers exactly', async () => {
    const { autoMapImportFields } = await import('../src/app/lib/importHeaderMapping.ts');
    const { DELIVERY_CATALOG_IMPORT_FIELDS, DELIVERY_CATALOG_HEADER_ALIASES } = await import(
      '../src/app/lib/deliveryCatalogExcelTemplate.ts',
    );
    const headers = ['nombre', 'codigo', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion'];
    const map = autoMapImportFields(DELIVERY_CATALOG_IMPORT_FIELDS, headers, DELIVERY_CATALOG_HEADER_ALIASES);
    expect(map.name).toBe('nombre');
    expect(map.sku).toBe('codigo');
    expect(map.category).toBe('categoria');
    expect(map.linea).toBe('linea');
    expect(map.price).toBe('precio');
    expect(map.ingredients).toBe('ingredientes');
    expect(map.description).toBe('descripcion');
  });

  it('autoMapImportFields sigue aceptando columna sku legacy', async () => {
    const { autoMapImportFields } = await import('../src/app/lib/importHeaderMapping.ts');
    const { DELIVERY_CATALOG_IMPORT_FIELDS, DELIVERY_CATALOG_HEADER_ALIASES } = await import(
      '../src/app/lib/deliveryCatalogExcelTemplate.ts',
    );
    const headers = ['nombre', 'sku', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion'];
    const map = autoMapImportFields(DELIVERY_CATALOG_IMPORT_FIELDS, headers, DELIVERY_CATALOG_HEADER_ALIASES);
    expect(map.sku).toBe('sku');
  });

  it('autoMapImportFields maps accented and English catalog headers', async () => {
    const { autoMapImportFields } = await import('../src/app/lib/importHeaderMapping.ts');
    const { DELIVERY_CATALOG_IMPORT_FIELDS, DELIVERY_CATALOG_HEADER_ALIASES } = await import(
      '../src/app/lib/deliveryCatalogExcelTemplate.ts',
    );
    const headers = ['Nombre', 'SKU', 'Categoría', 'Línea', 'Precio', 'Ingredientes', 'Descripción'];
    const map = autoMapImportFields(DELIVERY_CATALOG_IMPORT_FIELDS, headers, DELIVERY_CATALOG_HEADER_ALIASES);
    expect(map.name).toBe('Nombre');
    expect(map.sku).toBe('SKU');
    expect(map.category).toBe('Categoría');
    expect(map.linea).toBe('Línea');
    expect(map.price).toBe('Precio');
    expect(map.ingredients).toBe('Ingredientes');
    expect(map.description).toBe('Descripción');
  });

  it('validateDeliveryCatalogImportEntries blocks invalid rows', async () => {
    const { validateDeliveryCatalogImportEntries } = await import('../src/app/lib/deliveryCatalogExcelTemplate.ts');
    const brands = [{ _id: 'mod', name: 'modomio', active: true, catalogCategories: ['Pizzas'] }];
    const result = validateDeliveryCatalogImportEntries(
      [
        { name: '', category: 'Pizzas', linea: 'modomio', price: '9' },
        { name: 'Ok', category: 'Dato 4', linea: 'modomio', price: '5' },
        { name: 'Dup', category: 'Pizzas', linea: 'fantasma', price: '8', sku: 'A1' },
        { name: 'Dup2', category: 'Pizzas', linea: 'modomio', price: '8', sku: 'A1' },
      ],
      brands,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === 'nombre')).toBe(true);
    expect(result.issues.some((i) => i.field === 'categoria' && i.message.includes('Dato'))).toBe(true);
    expect(result.issues.some((i) => i.field === 'linea' && i.message.includes('fantasma') && i.severity === 'warning')).toBe(true);
    expect(result.issues.some((i) => i.field === 'linea' && i.message.includes('Ajustes → Marca') && i.severity === 'warning')).toBe(true);
    expect(result.issues.some((i) => i.field === 'codigo')).toBe(true);
  });

  it('partitionDeliveryCatalogImportEntries imports valid rows and skips bad ones', async () => {
    const { partitionDeliveryCatalogImportEntries } = await import('../src/app/lib/deliveryCatalogExcelTemplate.ts');
    const brands = [{ _id: 'mod', name: 'modomio', active: true, catalogCategories: ['Pizzas'] }];
    const { validEntries, issues } = partitionDeliveryCatalogImportEntries(
      [
        { name: 'Coca-Cola', category: 'Refrescos', linea: '', price: '2.50' },
        { name: 'Agua', category: 'Bebidas', linea: '', price: '1.80' },
        { name: 'Sin precio', category: 'Bebidas', linea: '', price: '' },
        { name: 'Pizza', category: 'Pizzas', linea: 'modomio', price: '9.00' },
      ],
      brands,
    );
    expect(validEntries).toHaveLength(3);
    expect(validEntries.map((e) => e.name)).toEqual(['Coca-Cola', 'Agua', 'Pizza']);
    expect(issues.some((i) => i.field === 'precio' && i.severity === 'error')).toBe(true);
  });

  it('collectIngredientEntriesFromCatalogImport groups by commercial line', async () => {
    const { collectIngredientEntriesFromCatalogImport } = await import('../src/app/lib/deliveryCatalogImportLogic.ts');
    const brands = [
      { _id: 'mod', name: 'modomio', catalogCategories: ['Pizzas'], deliveryLineKind: 'pizza' },
      { _id: 'bb', name: 'BlackBurger', catalogCategories: ['Hamburguesas'], deliveryLineKind: 'burger_fastfood' },
    ];
    const entries = collectIngredientEntriesFromCatalogImport(
      [
        {
          brandIds: ['mod'],
          customFields: { ingredients: 'Mozzarella, Tomate' },
        },
        {
          brandIds: ['bb'],
          customFields: { ingredients: 'Carne, Bacon' },
        },
      ],
      brands,
    );
    expect(entries).toHaveLength(4);
    expect(entries.filter((e) => e.brandIds[0] === 'mod').map((e) => e.name)).toEqual(['Mozzarella', 'Tomate']);
    expect(entries.filter((e) => e.brandIds[0] === 'bb').map((e) => e.name)).toEqual(['Carne', 'Bacon']);
    expect(entries.find((e) => e.name === 'Mozzarella')?.productParts).toEqual(['pizzas']);
    expect(entries.find((e) => e.name === 'Carne')?.productParts).toEqual(['hamburguesas']);
  });

  it('applyCatalogImportIngredientEntries adds and promotes as extras de pago', async () => {
    const { applyCatalogImportIngredientEntries } = await import('../src/app/lib/deliveryCatalogImportLogic.ts');
    const existing = [
      {
        id: '1',
        name: 'Tomate',
        role: 'base',
        escandalloOnly: false,
        brandIds: ['mod'],
        productParts: ['pizzas'],
      },
    ];
    const entries = [
      { name: 'Tomate', brandIds: ['mod'], productParts: ['pizzas'] },
      { name: 'Mozzarella', brandIds: ['mod'], productParts: ['pizzas'] },
    ];
    const { merged, added, promoted } = applyCatalogImportIngredientEntries(existing, entries);
    expect(added).toBe(1);
    expect(promoted).toBe(1);
    expect(merged.find((i) => i.name === 'Tomate')?.role).toBe('extra');
    expect(merged.find((i) => i.name === 'Mozzarella')?.role).toBe('extra');
  });

  it('mapImportEntryToCatalogItem creates combo from categoria Combos', async () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const { mapImportEntryToCatalogItem } = await import('../src/app/lib/deliveryCatalogImport.ts');
    const brands = [{ _id: 'mod', name: 'modomio', active: true, catalogCategories: ['Pizzas'] }];
    const result = await mapImportEntryToCatalogItem(
      {
        name: 'Menú Estándar',
        category: 'Combos',
        linea: 'modomio',
        price: '14.90',
      },
      { businessId: 'biz-1', brandCache: brands },
    );
    expect(result?.item.itemType).toBe('combo');
    expect(result?.item.category).toBe('Combos');
    expect(result?.item.customFields?.comboStructureConfirmed).toBe(true);
    expect(Array.isArray(result?.item.customFields?.comboStructure)).toBe(true);
    expect(result?.item.customFields?.comboStructure.length).toBeGreaterThan(0);
  });

  it('mapImportEntryToCatalogItem respects tipo_menu duo', async () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const { mapImportEntryToCatalogItem } = await import('../src/app/lib/deliveryCatalogImport.ts');
    const brands = [{ _id: 'mod', name: 'modomio', active: true, catalogCategories: ['Pizzas'] }];
    const result = await mapImportEntryToCatalogItem(
      {
        name: 'Menú Dúo',
        category: 'Menú',
        linea: 'modomio',
        price: '22.00',
        tipo_menu: 'duo',
      },
      { businessId: 'biz-1', brandCache: brands },
    );
    expect(result?.item.itemType).toBe('combo');
    const main = result?.item.customFields?.comboStructure?.find((s) => s.slotKind === 'main');
    expect(main?.expectedCount).toBe(2);
  });

  it('normalizeImportCategory maps menu aliases to Combos', async () => {
    const { normalizeImportCategory, isImportComboCategory } = await import(
      '../src/app/lib/deliveryCatalogImportLogic.ts',
    );
    expect(normalizeImportCategory('menú')).toBe('Combos');
    expect(isImportComboCategory('Combos')).toBe(true);
  });
});
