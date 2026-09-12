import { describe, expect, it } from 'vitest';
import {
  isWarehouseImportCategory,
  resolveWarehouseImportMeta,
} from '../src/app/lib/deliveryCatalogImportLogic';
import { stockFieldsForOrganizer } from '../src/app/lib/inventoryUtils';

describe('warehouse ingredient routing', () => {
  it('crea nuevas materias bajo Ingredientes', () => {
    expect(stockFieldsForOrganizer('brand-food')).toEqual({
      stockCategory: 'ingredient',
      category: 'Ingredientes',
    });
    expect(resolveWarehouseImportMeta('Ingredientes')).toEqual({
      stockCategory: 'ingredient',
      categoryLabel: 'Ingredientes',
      organizerId: 'total',
    });
  });

  it('sigue reconociendo Cocina legacy, pero la normaliza fuera de Carta', () => {
    expect(isWarehouseImportCategory('Cocina')).toBe(true);
    expect(isWarehouseImportCategory('Cocina · Marca antigua')).toBe(true);
    expect(resolveWarehouseImportMeta('Cocina · Marca antigua')?.categoryLabel).toBe('Ingredientes');
  });
});
