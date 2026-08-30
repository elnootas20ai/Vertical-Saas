import { describe, expect, it } from 'vitest';
import {
  explicitMarkedStockItemsForSupplier,
  groupSuggestionsForVertial,
  stockItemsForOrganizer,
  stockItemsForSupplierOrder,
  suggestionOrderQuantity,
  SUGGESTION_NO_SUPPLIER_ID,
} from '../src/app/lib/purchaseSuggestions';
import type { SuggestionItem } from '../src/app/lib/purchaseOrderApi';
import type { CatalogItem, Supplier } from '../src/app/lib/deliveryApi';

const suggestion = (partial: Partial<SuggestionItem> = {}): SuggestionItem => ({
  _id: 'item-1',
  name: 'Mozzarella',
  sku: '',
  category: 'Ingredientes',
  stockQuantity: 1,
  minStock: 5,
  maxStock: 0,
  costPrice: 8,
  supplierId: '',
  supplierName: '',
  consumed30d: 0,
  weeklyAvg: 0,
  weeksOfStock: 999,
  suggestedQty: 0,
  needsReorder: true,
  reorderQuantity: 0,
  autoReorder: false,
  estimatedCost: 0,
  ...partial,
});

const supplier = (partial: Partial<Supplier> = {}): Supplier =>
  ({
    _id: 'sup-1',
    id: 'sup-1',
    type: 'supplier',
    user_id: 'u1',
    name: 'Proveedor Uno',
    cif: '',
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
    category: '',
    organizerIds: [],
    catalogItemIds: [],
    paymentTerms: '',
    notes: '',
    active: true,
    validated: true,
    validatedAt: '',
    validatedBy: '',
    createdAt: '',
    updatedAt: '',
    ...partial,
  }) as Supplier;

const catalogItem = (partial: Partial<CatalogItem> = {}): CatalogItem =>
  ({
    _id: 'item-1',
    name: 'Mozzarella',
    category: 'Ingredientes',
    stockCategory: 'ingredient',
    isStockItem: true,
    customFields: {},
    ...partial,
  }) as CatalogItem;

describe('groupSuggestionsForVertial', () => {
  it('agrupa por supplierId del artículo cuando está enlazado', () => {
    const groups = groupSuggestionsForVertial(
      [suggestion({ supplierId: 'sup-1', estimatedCost: 12 })],
      [catalogItem()],
      [supplier()],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe('sup-1');
    expect(groups[0].matchedBy).toBe('item');
    expect(groups[0].totalCost).toBe(12);
  });

  it('asigna por «Qué suministra» (organizerIds) cuando el artículo no tiene proveedor', () => {
    const groups = groupSuggestionsForVertial(
      [suggestion()],
      [catalogItem({ customFields: { inventoryOrganizerId: 'brand-modomio' } })],
      [supplier({ organizerIds: ['brand-modomio'] })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe('sup-1');
    expect(groups[0].matchedBy).toBe('organizer');
  });

  it('deja en «Sin proveedor asignado» lo que no cruza con nadie', () => {
    const groups = groupSuggestionsForVertial([suggestion()], [catalogItem()], [supplier()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe('');
    expect(groups[0].matchedBy).toBe('none');
    expect(groups[0].supplierName).toBe('Sin proveedor asignado');
  });

  it('deja en «Sin proveedor asignado» si varios proveedores cubren el mismo organizador', () => {
    const groups = groupSuggestionsForVertial(
      [suggestion()],
      [catalogItem({ customFields: { inventoryOrganizerId: 'packaging' } })],
      [
        supplier({ organizerIds: ['packaging'] }),
        supplier({ _id: 'sup-2', id: 'sup-2', name: 'Otro', organizerIds: ['packaging'] }),
      ],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].matchedBy).toBe('none');
  });

  it('mantiene grupos separados aunque el nombre de proveedor se repita', () => {
    const groups = groupSuggestionsForVertial(
      [
        suggestion({ _id: 'a', supplierId: 'sup-1', estimatedCost: 5 }),
        suggestion({ _id: 'b', supplierId: 'sup-2', estimatedCost: 7, name: 'Queso' }),
      ],
      [
        catalogItem({ _id: 'a' }),
        catalogItem({ _id: 'b', supplierId: 'sup-2' }),
      ],
      [
        supplier({ _id: 'sup-1', name: 'Makro' }),
        supplier({ _id: 'sup-2', name: 'Makro' }),
      ],
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.supplierId).sort()).toEqual(['sup-1', 'sup-2']);
  });
});

describe('stockItemsForSupplierOrder', () => {
  it('no mete platos de carta aunque el nombre coincida con un organizador', () => {
    const pizza = catalogItem({
      _id: 'pizza-1',
      name: 'Pizza Margarita',
      module: 'catalog',
      isStockItem: false,
      stockCategory: 'other',
      customFields: {},
    });
    const boxes = catalogItem({
      _id: 'box-1',
      name: 'Cajas pizza',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'packaging',
      customFields: { inventoryOrganizerId: 'packaging' },
    });
    const items = stockItemsForSupplierOrder(
      [pizza, boxes],
      supplier({ organizerIds: ['packaging'] }),
    );
    expect(items.map((i) => i._id)).toEqual(['box-1']);
  });

  it('no mezcla Envases con Bebidas', () => {
    const drink = catalogItem({
      _id: 'drink-1',
      name: 'Coca-Cola',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'beverage',
      customFields: { inventoryOrganizerId: 'beverages' },
    });
    const box = catalogItem({
      _id: 'box-1',
      name: 'Cajas',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'packaging',
      customFields: { inventoryOrganizerId: 'packaging' },
    });
    const items = stockItemsForSupplierOrder(
      [drink, box],
      supplier({ organizerIds: ['packaging'] }),
    );
    expect(items.map((i) => i._id)).toEqual(['box-1']);
  });

  it('si el proveedor tiene productos marcados, solo carga esos', () => {
    const cola = catalogItem({
      _id: 'cola',
      name: 'Cola',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'beverage',
      customFields: { inventoryOrganizerId: 'beverages' },
    });
    const fanta = catalogItem({
      _id: 'fanta',
      name: 'Fanta',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'beverage',
      customFields: { inventoryOrganizerId: 'beverages' },
    });
    const items = stockItemsForSupplierOrder(
      [cola, fanta],
      supplier({ organizerIds: ['beverages'], catalogItemIds: ['cola'] }),
    );
    expect(items.map((i) => i._id)).toEqual(['cola']);
  });

  it('con Bebidas marcadas y Complementos añadido sin marcar, incluye ambas categorías', () => {
    const cola = catalogItem({
      _id: 'cola',
      name: 'Cola',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'beverage',
      category: 'Bebidas',
      customFields: { inventoryOrganizerId: 'beverages' },
    });
    const fanta = catalogItem({
      _id: 'fanta',
      name: 'Fanta',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'beverage',
      category: 'Bebidas',
      customFields: { inventoryOrganizerId: 'beverages' },
    });
    const nuggets = catalogItem({
      _id: 'nuggets',
      name: 'Nuggets',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'consumable',
      category: 'Complementos',
      customFields: { inventoryOrganizerId: 'complements' },
    });
    const items = explicitMarkedStockItemsForSupplier(
      [cola, fanta, nuggets],
      supplier({
        organizerIds: ['beverages', 'complements'],
        catalogItemIds: ['cola'],
      }),
    );
    expect(items.map((i) => i._id).sort()).toEqual(['cola', 'nuggets']);
  });

  it('sin proveedor muestra el almacén completo, no la carta', () => {
    const pizza = catalogItem({
      _id: 'pizza-1',
      name: 'Pizza',
      module: 'catalog',
      isStockItem: false,
      stockCategory: 'other',
    });
    const flour = catalogItem({
      _id: 'flour-1',
      name: 'Harina',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'ingredient',
      customFields: { inventoryOrganizerId: 'brand-modomio' },
    });
    const items = stockItemsForSupplierOrder([pizza, flour], null);
    expect(items.map((i) => i._id)).toEqual(['flour-1']);
  });
});

describe('suggestionOrderQuantity', () => {
  it('usa la cantidad sugerida por consumo si existe', () => {
    expect(suggestionOrderQuantity(suggestion({ suggestedQty: 7 }))).toBe(7);
  });

  it('usa reorderQuantity como segundo criterio', () => {
    expect(suggestionOrderQuantity(suggestion({ reorderQuantity: 10 }))).toBe(10);
  });

  it('repone hasta 1,5× el mínimo si no hay consumo ni reposición', () => {
    // min 5 → objetivo 8, stock 1 → pedir 7
    expect(suggestionOrderQuantity(suggestion({ minStock: 5, stockQuantity: 1 }))).toBe(7);
  });

  it('nunca sugiere menos de 1', () => {
    expect(suggestionOrderQuantity(suggestion({ minStock: 0, stockQuantity: 0 }))).toBe(1);
  });
});

describe('SUGGESTION_NO_SUPPLIER_ID', () => {
  it('coincide con la clave del backend', () => {
    expect(SUGGESTION_NO_SUPPLIER_ID).toBe('__no_supplier__');
  });
});

describe('stockItemsForOrganizer', () => {
  it('solo lista artículos de almacén de ese organizador', () => {
    const drink = catalogItem({
      _id: 'drink-1',
      name: 'Coca-Cola',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'beverage',
      customFields: { inventoryOrganizerId: 'beverages' },
    });
    const box = catalogItem({
      _id: 'box-1',
      name: 'Cajas',
      module: 'stock',
      isStockItem: true,
      stockCategory: 'packaging',
      customFields: { inventoryOrganizerId: 'packaging' },
    });
    const pizza = catalogItem({
      _id: 'pizza-1',
      name: 'Pizza',
      module: 'catalog',
      isStockItem: false,
      stockCategory: 'other',
    });
    const items = stockItemsForOrganizer([drink, box, pizza], 'packaging');
    expect(items.map((i) => i._id)).toEqual(['box-1']);
  });

  it('incluye ingredientes TPV del Excel/manual aunque aún no tengan fila de almacén', () => {
    const brands = [{ _id: 'brand-pizza', name: 'Pizza House', deliveryLineKind: 'pizza' }];
    const stockMozzarella = catalogItem({
      _id: 'stock-moz',
      name: 'Mozzarella',
      module: 'stock',
      category: 'Ingredientes',
      isStockItem: true,
      stockCategory: 'ingredient',
      customFields: { storeIngredientId: 'ing-moz' },
    });
    const storeIngredients = [
      {
        id: 'ing-moz',
        name: 'Mozzarella',
        brandIds: ['brand-pizza'],
        productParts: ['pizzas'],
      },
      {
        id: 'ing-tomate',
        name: 'Tomate',
        brandIds: ['brand-pizza'],
        productParts: ['pizzas'],
      },
    ];
    const byBrand = stockItemsForOrganizer(
      [stockMozzarella],
      'brand-pizza',
      storeIngredients,
      brands,
    );
    expect(byBrand.map((i) => i.name).sort()).toEqual(['Mozzarella', 'Tomate']);

    const byCategory = stockItemsForOrganizer(
      [stockMozzarella],
      'cat:ingredientes',
      storeIngredients,
      brands,
    );
    expect(byCategory.map((i) => i.name).sort()).toEqual(['Mozzarella', 'Tomate']);
  });

  it('categoría de carta lista ingredientes de receta, no el plato; Combos vacío', () => {
    const pan = catalogItem({
      _id: 'stock-pan',
      name: 'pan',
      module: 'stock',
      category: 'Ingredientes',
      isStockItem: true,
      stockCategory: 'ingredient',
      customFields: { storeIngredientId: 'ing-pan' },
    });
    const jamon = catalogItem({
      _id: 'stock-jamon',
      name: 'jamón',
      module: 'stock',
      category: 'Ingredientes',
      isStockItem: true,
      stockCategory: 'ingredient',
      customFields: { storeIngredientId: 'ing-jamon' },
    });
    const bocata = catalogItem({
      _id: 'carta-bocata',
      name: 'Bocadillo queso',
      module: 'catalog',
      category: 'Bocatas',
      isStockItem: false,
      stockCategory: 'finished_product',
      customFields: {
        costingType: 'recipe',
        costingRecipe: [
          { storeIngredientId: 'ing-pan', name: 'pan', quantity: 1, unit: 'ud' },
          { storeIngredientId: 'ing-jamon', name: 'jamón', quantity: 1, unit: 'ud' },
        ],
      },
    });
    const combo = catalogItem({
      _id: 'carta-combo',
      name: 'Combo 1',
      module: 'catalog',
      category: 'Combos',
      isStockItem: false,
      stockCategory: 'finished_product',
      customFields: {
        costingType: 'recipe',
        costingRecipe: [
          { storeIngredientId: 'ing-pan', name: 'pan', quantity: 1, unit: 'ud' },
        ],
      },
    });
    const catalog = [pan, jamon, bocata, combo];
    const bocatas = stockItemsForOrganizer(catalog, 'cat:bocatas');
    expect(bocatas.map((i) => i.name).sort()).toEqual(['jamón', 'pan']);
    expect(bocatas.every((i) => i._id !== 'carta-bocata')).toBe(true);
    expect(stockItemsForOrganizer(catalog, 'cat:combos')).toEqual([]);
  });
});
