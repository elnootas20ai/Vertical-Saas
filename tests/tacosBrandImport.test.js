import { describe, expect, it } from 'vitest';
import {
  inferCommercialLineBrandId,
  inferCommercialLineBrandIdFromProductName,
  normalizeImportCategory,
} from '../src/app/lib/deliveryCatalogImportLogic.ts';
import { inferImportCostingLineKind } from '../src/app/lib/catalogImportCosting.ts';

describe('tacos brand import', () => {
  const brands = [
    { _id: 'mod', name: 'modomio', deliveryLineKind: 'pizza', active: true },
    { _id: 'bb', name: 'BlackBurger', deliveryLineKind: 'burger_fastfood', active: true },
    { _id: 'tac', name: 'Tacos', deliveryLineKind: 'tacos_mexican', active: true },
  ];

  it('categoría Tacos asigna línea Tacos, no BlackBurger', () => {
    const id = inferCommercialLineBrandId('Tacos', brands, 'Al Pastor');
    expect(id).toBe('tac');
  });

  it('nombre con taco infiere línea Tacos', () => {
    const id = inferCommercialLineBrandIdFromProductName('Taco de carnitas', brands);
    expect(id).toBe('tac');
  });

  it('normaliza categoría taco', () => {
    expect(normalizeImportCategory('taco')).toBe('Tacos');
  });

  it('escandallo usa line kind tacos_mexican', () => {
    const kind = inferImportCostingLineKind(
      { name: 'Taco pastor', category: 'Tacos', brandIds: ['tac'] },
      brands,
    );
    expect(kind).toBe('tacos_mexican');
  });
});
