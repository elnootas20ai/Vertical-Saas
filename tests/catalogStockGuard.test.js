import { describe, expect, it } from 'vitest';
import {
  applyCatalogImportCartaStockGuard,
  mergeCatalogCustomFields,
  resolveCatalogItemIsStockItem,
} from '../shared/catalog/catalogStockGuard.js';

describe('resolveCatalogItemIsStockItem', () => {
  it('carta: no hereda sticky true si el update omite isStockItem', () => {
    expect(
      resolveCatalogItemIsStockItem({
        module: 'catalog',
        data: { name: 'Tequeños' },
        existing: { isStockItem: true, module: 'catalog' },
      }),
    ).toBe(false);
  });

  it('carta: respeta isStockItem false explícito', () => {
    expect(
      resolveCatalogItemIsStockItem({
        module: 'catalog',
        data: { isStockItem: false },
        existing: { isStockItem: true },
      }),
    ).toBe(false);
  });

  it('carta: permite isStockItem true explícito (control stock vendible)', () => {
    expect(
      resolveCatalogItemIsStockItem({
        module: 'catalog',
        data: { isStockItem: true, stockCategory: 'finished_product' },
        existing: null,
      }),
    ).toBe(true);
  });

  it('módulo stock: mantiene sticky si no viene el campo', () => {
    expect(
      resolveCatalogItemIsStockItem({
        module: 'stock',
        data: {},
        existing: { isStockItem: true, module: 'stock' },
      }),
    ).toBe(true);
  });
});

describe('mergeCatalogCustomFields', () => {
  it('no borra comboSlotAllowlists ni surcharges si el update no los manda', () => {
    const merged = mergeCatalogCustomFields(
      {
        ingredients: 'viejo',
        comboSlotAllowlists: { side: ['a', 'b'] },
        comboSlotSurcharges: { side: { a: 1.5 } },
      },
      { ingredients: 'nuevo' },
    );
    expect(merged.ingredients).toBe('nuevo');
    expect(merged.comboSlotAllowlists).toEqual({ side: ['a', 'b'] });
    expect(merged.comboSlotSurcharges).toEqual({ side: { a: 1.5 } });
  });

  it('sí actualiza allowlists si vienen en el payload', () => {
    const merged = mergeCatalogCustomFields(
      { comboSlotAllowlists: { side: ['a'] } },
      { comboSlotAllowlists: { side: ['x'] } },
    );
    expect(merged.comboSlotAllowlists).toEqual({ side: ['x'] });
  });

  it('no borra halfHalf si el update no lo manda', () => {
    const merged = mergeCatalogCustomFields(
      { halfHalf: true, halfHalfAllowedProductIds: ['p1', 'p2'], ingredients: 'viejo' },
      { ingredients: 'nuevo' },
    );
    expect(merged.halfHalf).toBe(true);
    expect(merged.halfHalfAllowedProductIds).toEqual(['p1', 'p2']);
    expect(merged.ingredients).toBe('nuevo');
  });
});

describe('applyCatalogImportCartaStockGuard', () => {
  it('fuerza carta vendible y reactiva soft-delete', () => {
    const guarded = applyCatalogImportCartaStockGuard(
      { name: 'Carbonara', module: 'catalog', isStockItem: true },
      { isStockItem: true, deletedAt: '2026-01-01', active: false },
    );
    expect(guarded.isStockItem).toBe(false);
    expect(guarded.stockCategory).toBe('finished_product');
    expect(guarded.active).toBe(true);
    expect(guarded.deletedAt).toBe(null);
    expect(guarded.module).toBe('catalog');
  });

  it('no toca módulo stock', () => {
    const guarded = applyCatalogImportCartaStockGuard(
      { name: 'Harina', module: 'stock', isStockItem: true },
      null,
    );
    expect(guarded.module).toBe('stock');
    expect(guarded.isStockItem).toBe(true);
  });
});
