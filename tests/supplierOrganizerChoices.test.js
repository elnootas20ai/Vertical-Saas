import { describe, expect, it } from 'vitest';
import { buildSupplierOrganizerChoices } from '../src/app/components/saas/SupplierOrganizersField.tsx';

describe('buildSupplierOrganizerChoices', () => {
  it('muestra categorías de carta aunque no haya escandallo ni almacén', () => {
    const brands = [
      {
        _id: 'b1',
        name: 'Marca',
        catalogCategories: ['Desayunos', 'Burgers'],
        deliveryLineKind: 'mixed_restaurant',
      },
    ];
    const catalogItems = [
      {
        _id: 'p1',
        name: 'Tosta test',
        module: 'catalog',
        category: 'Desayunos',
        active: true,
        customFields: { ingredients: 'fruta, café' },
      },
    ];

    const choices = buildSupplierOrganizerChoices(brands, catalogItems, {
      businessType: 'restaurant',
      storeIngredients: [],
    });
    const labels = choices.map((c) => c.label);

    expect(labels).toContain('Desayunos');
    expect(labels).toContain('Burgers');
    expect(labels).toContain('Envases');
    expect(labels).toContain('Limpieza');
  });

  it('no mete categorías solo-almacén (module stock) como carta', () => {
    const catalogItems = [
      {
        _id: 's1',
        name: 'Bolsa',
        module: 'stock',
        category: 'Frío almacén',
        isStockItem: true,
        active: true,
        customFields: { inventoryOrganizerId: 'invcat:frio almacen' },
      },
    ];
    const choices = buildSupplierOrganizerChoices([], catalogItems, {
      businessType: 'restaurant',
    });
    const cartaOnly = choices.filter((c) => String(c.id).startsWith('cat:'));
    expect(cartaOnly.some((c) => /fr[ií]o/i.test(c.label))).toBe(false);
  });
});
