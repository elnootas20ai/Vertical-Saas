import { describe, expect, it } from 'vitest';
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
} from '../src/app/lib/deliveryCatalogImportLogic.ts';

describe('deliveryCatalogImport', () => {
  it('normalizeImportCategory maps delivery categories and fixes Dato N', () => {
    expect(normalizeImportCategory('bebida')).toBe('Bebidas');
    expect(normalizeImportCategory('Pizzas')).toBe('Pizzas');
    expect(normalizeImportCategory('Dato 14')).toBe('Principales');
  });

  it('readImportLineText prefers linea over marca', () => {
    expect(readImportLineText({ linea: 'modomio', marca: 'Coca-Cola' })).toBe('modomio');
    expect(readImportLineText({ marca: 'Sushi' })).toBe('Sushi');
  });

  it('isCommercialLineBrand ignores supplier-only brands', () => {
    expect(isCommercialLineBrand({ name: 'Coca-Cola' })).toBe(false);
    expect(isCommercialLineBrand({ name: 'modomio', catalogCategories: ['Pizzas'] })).toBe(true);
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

  it('buildValidValuesRows lists each commercial line with its sections', async () => {
    const { buildDeliveryCatalogImportWorkbook } = await import('../src/app/lib/deliveryCatalogExcelTemplate.ts');
    const wb = buildDeliveryCatalogImportWorkbook([
      { _id: 'a', name: 'modomio', active: true, catalogCategories: ['Pizzas'] },
      { _id: 'b', name: 'Burger', active: true, catalogCategories: ['Burgers', 'Complementos'] },
    ]);
    expect(wb.SheetNames).toContain('catalogo');
    expect(wb.SheetNames).toContain('referencia_tpv');
    expect(wb.SheetNames).toContain('valores_validos');
    expect(wb.SheetNames).toContain('instrucciones');
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
    expect(isOfficialCatalogTemplateHeaders(['Nombre', 'SKU', 'Categoría', 'Línea', 'Precio', 'Descripción'])).toBe(true);
    expect(isOfficialCatalogTemplateHeaders(['nombre', 'sku', 'categoria', 'linea', 'precio'])).toBe(false);
  });

  it('autoMapImportFields maps official template headers exactly', async () => {
    const { autoMapImportFields } = await import('../src/app/lib/importHeaderMapping.ts');
    const { DELIVERY_CATALOG_IMPORT_FIELDS, DELIVERY_CATALOG_HEADER_ALIASES } = await import(
      '../src/app/lib/deliveryCatalogExcelTemplate.ts',
    );
    const headers = ['nombre', 'sku', 'categoria', 'linea', 'precio', 'descripcion'];
    const map = autoMapImportFields(DELIVERY_CATALOG_IMPORT_FIELDS, headers, DELIVERY_CATALOG_HEADER_ALIASES);
    expect(map.name).toBe('nombre');
    expect(map.sku).toBe('sku');
    expect(map.category).toBe('categoria');
    expect(map.linea).toBe('linea');
    expect(map.price).toBe('precio');
    expect(map.description).toBe('descripcion');
  });

  it('autoMapImportFields maps accented and English catalog headers', async () => {
    const { autoMapImportFields } = await import('../src/app/lib/importHeaderMapping.ts');
    const { DELIVERY_CATALOG_IMPORT_FIELDS, DELIVERY_CATALOG_HEADER_ALIASES } = await import(
      '../src/app/lib/deliveryCatalogExcelTemplate.ts',
    );
    const headers = ['Nombre', 'SKU', 'Categoría', 'Línea', 'Precio', 'Descripción'];
    const map = autoMapImportFields(DELIVERY_CATALOG_IMPORT_FIELDS, headers, DELIVERY_CATALOG_HEADER_ALIASES);
    expect(map.name).toBe('Nombre');
    expect(map.sku).toBe('SKU');
    expect(map.category).toBe('Categoría');
    expect(map.linea).toBe('Línea');
    expect(map.price).toBe('Precio');
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
    expect(result.issues.some((i) => i.field === 'linea' && i.message.includes('fantasma'))).toBe(true);
    expect(result.issues.some((i) => i.field === 'sku')).toBe(true);
  });
});
