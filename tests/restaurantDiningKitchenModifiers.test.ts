import { describe, expect, it } from 'vitest';
import { cartLinesToDiningItems } from '../src/app/lib/restaurantDiningTpv';
import { buildKitchenTickets } from '../src/app/verticals/restaurant/restaurantKitchen';
import type { CatalogItem } from '../src/app/lib/deliveryApi';
import type { DiningOrder } from '../src/app/lib/salaApi';
import { EMPTY_CART_CUSTOMIZATION } from '../src/app/lib/catalogCustomization';

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    _id: 'p1',
    name: 'Burger casa',
    unitPrice: 12,
    category: 'burgers',
    customFields: { ingredients: 'Pan, Carne, Lechuga, Tomate, Cebolla' },
    ...overrides,
  } as CatalogItem;
}

describe('comandas cocina: extras / SIN', () => {
  it('guarda + extras y SIN al pasar del carrito a la comanda', () => {
    const items = cartLinesToDiningItems([
      {
        lineId: 'l1',
        catalogItem: catalogItem(),
        quantity: 1,
        customization: {
          ...EMPTY_CART_CUSTOMIZATION,
          removedIngredients: ['Cebolla'],
          addedSupplements: [{ id: 'x1', name: 'Bacon', price: 1.5 }],
          notes: 'Poco hecha',
        },
      },
    ]);

    expect(items[0].modifiers).toEqual(expect.arrayContaining(['+ Bacon', 'SIN Cebolla']));
    expect(items[0].extras).toEqual(items[0].modifiers);
    expect(items[0].ingredients?.some((i) => i.name === 'Cebolla' && i.quantity === 'sin')).toBe(true);
    expect(items[0].notes).toBe('Poco hecha');
  });

  it('el ticket de cocina arrastra extras e ingredientes', () => {
    const order = {
      _id: 'o1',
      status: 'open',
      businessId: 'biz',
      tableNumber: 3,
      tableName: 'Mesa 3',
      zone: '',
      comandas: [
        {
          id: 'c1',
          orderNumber: 2,
          status: 'sent_to_kitchen',
          sentToKitchenAt: '2026-08-19T10:00:00.000Z',
          readyAt: '',
          servedAt: '',
          createdBy: 'u',
          createdByName: 'Ana',
          createdAt: '2026-08-19T10:00:00.000Z',
          notes: '',
          items: [
            {
              id: 'i1',
              productId: 'p1',
              name: 'Burger casa',
              price: 12,
              quantity: 1,
              category: '',
              notes: '',
              modifiers: ['+ Bacon', 'SIN Cebolla'],
              extras: ['+ Bacon', 'SIN Cebolla'],
              ingredients: [
                { name: 'Pan', quantity: 'normal' },
                { name: 'Cebolla', quantity: 'sin' },
              ],
              status: 'pending',
              cancelledReason: '',
              cancelledBy: '',
            },
          ],
        },
      ],
    } as DiningOrder;

    const [ticket] = buildKitchenTickets([order]);
    expect(ticket.items[0].extras).toEqual(['+ Bacon', 'SIN Cebolla']);
    expect(ticket.items[0].ingredients.some((i) => i.quantity === 'sin')).toBe(true);
  });
});
