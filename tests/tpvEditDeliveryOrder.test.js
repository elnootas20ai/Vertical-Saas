/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  seedTpvCartFromDeliveryOrder,
  isDeliveryOrderEditableOnTpvBoard,
  diffAddedDeliveryOrderItems,
} from '../src/app/lib/tpvEditDeliveryOrder.ts';

describe('tpvEditDeliveryOrder', () => {
  it('domicilio editable en montaje y reparto', () => {
    expect(isDeliveryOrderEditableOnTpvBoard({ status: 'listo', deliveryType: 'domicilio' })).toBe(true);
    expect(
      isDeliveryOrderEditableOnTpvBoard({
        status: 'listo',
        deliveryType: 'domicilio',
        assemblyCompletedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isDeliveryOrderEditableOnTpvBoard({ status: 'en_reparto', deliveryType: 'domicilio' }),
    ).toBe(true);
  });

  it('recogida local editable en montaje; no en entregado', () => {
    expect(
      isDeliveryOrderEditableOnTpvBoard({ status: 'listo', deliveryType: 'recogida' }),
    ).toBe(true);
    expect(
      isDeliveryOrderEditableOnTpvBoard({ status: 'cocina', deliveryType: 'recogida' }),
    ).toBe(true);
    expect(
      isDeliveryOrderEditableOnTpvBoard({ status: 'entregado', deliveryType: 'recogida' }),
    ).toBe(false);
  });

  it('diffAddedDeliveryOrderItems: nuevas líneas y subidas de cantidad', () => {
    const prev = [
      { id: 'a', name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 },
      { id: 'b', name: 'Cola', quantity: 2, unitPrice: 2, total: 4 },
    ];
    const next = [
      { id: 'a', name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 },
      { id: 'b', name: 'Cola', quantity: 3, unitPrice: 2, total: 6 },
      { id: 'c', name: 'Burger', quantity: 1, unitPrice: 8, total: 8 },
    ];
    const added = diffAddedDeliveryOrderItems(prev, next);
    expect(added).toHaveLength(2);
    expect(added.find((i) => i.id === 'b')).toMatchObject({ quantity: 1, total: 2 });
    expect(added.find((i) => i.id === 'c')).toMatchObject({ name: 'Burger', quantity: 1 });
  });

  it('diffAddedDeliveryOrderItems: quitar no genera adición', () => {
    const prev = [{ id: 'a', name: 'Pizza', quantity: 2, unitPrice: 10, total: 20 }];
    const next = [{ id: 'a', name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 }];
    expect(diffAddedDeliveryOrderItems(prev, next)).toEqual([]);
  });

  it('siembra carrito desde líneas del pedido', () => {
    const order = {
      _id: 'o1',
      status: 'listo',
      deliveryType: 'recogida',
      items: [
        {
          id: 'line-1',
          name: 'Pizza margarita',
          quantity: 2,
          unitPrice: 10,
          total: 20,
          catalogItemId: 'cat-1',
          category: 'pizzas',
          notes: 'sin cebolla',
          extras: ['extra queso'],
        },
      ],
    };
    const catalogById = {
      'cat-1': {
        _id: 'cat-1',
        id: 'cat-1',
        name: 'Pizza margarita',
        unitPrice: 10,
        active: true,
        brandIds: ['b1'],
        category: 'pizzas',
      },
    };
    const cart = seedTpvCartFromDeliveryOrder(order, catalogById, 'u1');
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].catalogItem._id).toBe('cat-1');
  });
});
