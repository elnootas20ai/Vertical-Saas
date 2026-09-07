import { describe, expect, it } from 'vitest';
import {
  findSupplierFromOcrEmitter,
  normalizeSupplierCif,
  rematchAlbaranLinesToCatalog,
} from '../src/app/lib/albaranSupplierEnsure.ts';
import type { CatalogItem, Supplier } from '../src/app/lib/deliveryApi.ts';

describe('albaranSupplierEnsure', () => {
  it('normaliza CIF', () => {
    expect(normalizeSupplierCif('B-12345678')).toBe('B12345678');
    expect(normalizeSupplierCif(' b 12 ')).toBe('B12');
  });

  it('encuentra proveedor por CIF o nombre', () => {
    const suppliers = [
      { _id: 's1', name: 'Makro Cash', cif: 'B-11111111' },
      { _id: 's2', name: 'Distribuciones Norte', cif: 'A22222222' },
    ] as Supplier[];
    expect(findSupplierFromOcrEmitter(suppliers, 'Otro', 'B11111111')?._id).toBe('s1');
    expect(findSupplierFromOcrEmitter(suppliers, 'Distribuciones Norte SA', '')?._id).toBe('s2');
    expect(findSupplierFromOcrEmitter(suppliers, 'Desconocido SL', 'Z999')).toBeNull();
  });

  it('rematchAlbaranLinesToCatalog enlaza por nombre', () => {
    const catalog = [
      {
        _id: 'c1',
        name: 'Tomate triturado',
        module: 'stock',
        stockCategory: 'ingredient',
        supplierId: 's1',
      },
      {
        _id: 'c2',
        name: 'Aceite oliva',
        module: 'stock',
        stockCategory: 'ingredient',
        supplierId: '',
      },
    ] as CatalogItem[];
    const lines = rematchAlbaranLinesToCatalog(
      [
        { id: '1', itemName: 'Tomate triturado 5kg', quantity: 2, unitPrice: 1, total: 2 },
        { id: '2', itemName: 'Cosa rara XYZ', quantity: 1, unitPrice: 1, total: 1 },
      ],
      catalog,
      's1',
    );
    expect(lines[0].catalogItemId).toBe('c1');
    expect(lines[1].catalogItemId || '').toBe('');
  });
});
