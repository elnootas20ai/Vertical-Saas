import { describe, expect, it } from 'vitest';
import {
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
});
