import { describe, expect, it } from 'vitest';
import { groupDeliveryOrdersByClientRows } from '../services/deliveryClientSync.js';

describe('groupDeliveryOrdersByClientRows', () => {
  it('agrupa por clientId y por teléfono huérfano solo para la página', () => {
    const rows = [
      { id: 'c1', phone: '600111222' },
      { id: 'c2', phone: '600333444' },
    ];
    const orders = [
      { _id: 'o1', clientId: 'c1', totalAmount: 10 },
      { _id: 'o2', clientId: 'c2', totalAmount: 20 },
      { _id: 'o3', clientId: 'c999', totalAmount: 99 },
      { _id: 'o4', clientId: '', customerPhone: '600111222', totalAmount: 5 },
      { _id: 'o5', clientId: '', customerPhone: '600000000', totalAmount: 1 },
    ];
    const map = groupDeliveryOrdersByClientRows(orders, rows);
    expect(map.get('c1').map((o) => o._id)).toEqual(['o1', 'o4']);
    expect(map.get('c2').map((o) => o._id)).toEqual(['o2']);
    expect(map.has('c999')).toBe(false);
  });
});
