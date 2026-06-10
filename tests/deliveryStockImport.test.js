import { describe, expect, it } from 'vitest';

describe('deliveryStockExcelTemplate', () => {
  it('validates stock rows require identifier and quantity', async () => {
    const { validateDeliveryStockImportEntries } = await import('../src/app/lib/deliveryStockExcelTemplate.ts');
    const bad = validateDeliveryStockImportEntries([
      { sku: '', name: '', cantidad: '10' },
      { sku: 'A1', name: 'Prod', cantidad: '' },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.issues.length).toBeGreaterThanOrEqual(2);

    const ok = validateDeliveryStockImportEntries([
      { sku: 'BEB-001', cantidad: '48' },
      { nombre: 'Agua', cantidad: '12' },
    ]);
    expect(ok.ok).toBe(true);
  });

  it('detects official stock template headers', async () => {
    const { isOfficialStockTemplateHeaders, DELIVERY_STOCK_TEMPLATE_HEADERS } = await import(
      '../src/app/lib/deliveryStockExcelTemplate.ts',
    );
    expect(isOfficialStockTemplateHeaders(DELIVERY_STOCK_TEMPLATE_HEADERS)).toBe(true);
    expect(isOfficialStockTemplateHeaders(['sku', 'nombre', 'cantidad', 'unidad'])).toBe(true);
  });

  it('auto-maps stock template columns', async () => {
    const { autoMapImportFields } = await import('../src/app/lib/importHeaderMapping.ts');
    const { DELIVERY_STOCK_IMPORT_FIELDS, DELIVERY_STOCK_HEADER_ALIASES } = await import(
      '../src/app/lib/deliveryStockExcelTemplate.ts',
    );
    const map = autoMapImportFields(
      DELIVERY_STOCK_IMPORT_FIELDS,
      ['sku', 'nombre', 'cantidad', 'unidad'],
      DELIVERY_STOCK_HEADER_ALIASES,
    );
    expect(map.sku).toBe('sku');
    expect(map.name).toBe('nombre');
    expect(map.quantity).toBe('cantidad');
    expect(map.unit).toBe('unidad');
  });
});
