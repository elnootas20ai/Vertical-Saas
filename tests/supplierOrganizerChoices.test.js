import { describe, expect, it } from 'vitest';
import { buildSupplierOrganizerChoices } from '../src/app/components/saas/SupplierOrganizersField.tsx';

describe('buildSupplierOrganizerChoices', () => {
  it('no lista secciones de carta vacías; sí presets de almacén', () => {
    const brands = [
      {
        _id: 'b1',
        name: 'Marca',
        catalogCategories: ['Desayunos', 'Burgers', 'Pizzas', 'Calzone'],
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

    expect(labels).not.toContain('Desayunos');
    expect(labels).not.toContain('Burgers');
    expect(labels).not.toContain('Pizzas');
    expect(labels).not.toContain('Calzone');
    expect(labels).toContain('Envases');
    expect(labels).toContain('Limpieza');
  });

  it('sí lista categoría de carta si hay ingredientes de almacén enlazados', () => {
    const brands = [
      {
        _id: 'b1',
        name: 'Marca',
        catalogCategories: ['Burgers', 'Pizzas'],
        deliveryLineKind: 'mixed_restaurant',
      },
    ];
    const catalogItems = [
      {
        _id: 'burger1',
        name: 'Burger clásica',
        module: 'catalog',
        category: 'Burgers',
        active: true,
        customFields: {
          costingRecipe: [{ catalogItemId: 'carne', name: 'Carne', quantity: 1, unit: 'kg' }],
        },
      },
      {
        _id: 'carne',
        name: 'Carne',
        module: 'stock',
        isStockItem: true,
        stockCategory: 'ingredient',
        active: true,
      },
    ];

    const choices = buildSupplierOrganizerChoices(brands, catalogItems, {
      businessType: 'restaurant',
      storeIngredients: [],
    });
    const labels = choices.map((c) => c.label);

    expect(labels).toContain('Burgers');
    expect(labels).not.toContain('Pizzas');
    expect(labels).toContain('Envases');
    expect(choices.find((c) => c.label === 'Burgers')?.kind).toBe('ingredients');
    expect(choices.find((c) => c.label === 'Envases')?.kind).toBe('warehouse');
    const warehouseIdx = choices.findIndex((c) => c.kind === 'warehouse');
    const ingredientsIdx = choices.findIndex((c) => c.kind === 'ingredients');
    expect(warehouseIdx).toBeGreaterThanOrEqual(0);
    expect(ingredientsIdx).toBeGreaterThan(warehouseIdx);
  });

  it('mantiene categoría de carta ya seleccionada aunque esté vacía', () => {
    const brands = [
      {
        _id: 'b1',
        name: 'Marca',
        catalogCategories: ['Calzone'],
        deliveryLineKind: 'mixed_restaurant',
      },
    ];
    const choices = buildSupplierOrganizerChoices(brands, [], {
      businessType: 'restaurant',
      selectedOrganizerIds: ['cat:calzone'],
    });
    expect(choices.some((c) => c.id === 'cat:calzone')).toBe(true);
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
