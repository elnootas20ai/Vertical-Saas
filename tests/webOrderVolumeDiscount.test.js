import { describe, it, expect } from 'vitest';
import { computeVolumeDiscount } from '../shared/volumeDiscount.js';

/**
 * Integration-style tests simulating the end-to-end volume discount flow:
 * config rules + order items → expected discount on the order total.
 */

const CONFIG_RULES = [
  { id: 'vd-1', minQuantity: 5,  maxQuantity: 9,   discountType: 'percentage', discountValue: 5,  label: '5% (5-9 uds.)',  active: true },
  { id: 'vd-2', minQuantity: 10, maxQuantity: 19,  discountType: 'percentage', discountValue: 10, label: '10% (10-19 uds.)', active: true },
  { id: 'vd-3', minQuantity: 20, maxQuantity: null, discountType: 'fixed',      discountValue: 25, label: '25€ dto. (20+ uds.)', active: true },
];

function simulateOrder(items, rules, deliveryFee = 0, promoDiscount = 0) {
  const subtotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const { rule, discountAmount: volumeDiscount } = computeVolumeDiscount(rules, items);

  const totalAmount = Math.max(0, subtotal + deliveryFee - promoDiscount - volumeDiscount);

  return {
    subtotal,
    deliveryFee,
    promoDiscount,
    volumeDiscount,
    volumeDiscountLabel: rule ? rule.label : '',
    totalAmount,
  };
}

describe('Integración: Pedido web con descuento por volumen', () => {
  it('Pedido de 3 artículos: sin descuento por volumen', () => {
    const items = [
      { id: 'a', name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 },
      { id: 'b', name: 'Pasta', quantity: 1, unitPrice: 8,  total: 8 },
      { id: 'c', name: 'Bebida', quantity: 1, unitPrice: 3,  total: 3 },
    ];
    const order = simulateOrder(items, CONFIG_RULES, 3);
    expect(order.volumeDiscount).toBe(0);
    expect(order.volumeDiscountLabel).toBe('');
    expect(order.totalAmount).toBe(24); // 21 + 3 envío
  });

  it('Pedido de 7 artículos: 5% descuento', () => {
    const items = [
      { id: 'a', name: 'Pizza', quantity: 4, unitPrice: 10, total: 40 },
      { id: 'b', name: 'Bebida', quantity: 3, unitPrice: 3,  total: 9 },
    ];
    const order = simulateOrder(items, CONFIG_RULES, 3);
    expect(order.volumeDiscount).toBe(2.45); // 5% de 49
    expect(order.volumeDiscountLabel).toBe('5% (5-9 uds.)');
    expect(order.totalAmount).toBe(49.55); // 49 + 3 - 2.45
  });

  it('Pedido de 15 artículos: 10% descuento', () => {
    const items = [
      { id: 'a', name: 'Pizza', quantity: 10, unitPrice: 10, total: 100 },
      { id: 'b', name: 'Bebida', quantity: 5,  unitPrice: 3,  total: 15 },
    ];
    const order = simulateOrder(items, CONFIG_RULES, 5);
    expect(order.volumeDiscount).toBe(11.5); // 10% de 115
    expect(order.volumeDiscountLabel).toBe('10% (10-19 uds.)');
    expect(order.totalAmount).toBe(108.5); // 115 + 5 - 11.5
  });

  it('Pedido de 25 artículos: 25€ descuento fijo', () => {
    const items = [
      { id: 'a', name: 'Pizza', quantity: 25, unitPrice: 8, total: 200 },
    ];
    const order = simulateOrder(items, CONFIG_RULES, 0);
    expect(order.volumeDiscount).toBe(25);
    expect(order.volumeDiscountLabel).toBe('25€ dto. (20+ uds.)');
    expect(order.totalAmount).toBe(175); // 200 - 25
  });

  it('Descuento por volumen + código promo se combinan', () => {
    const items = [
      { id: 'a', name: 'Pizza', quantity: 6, unitPrice: 10, total: 60 },
    ];
    const order = simulateOrder(items, CONFIG_RULES, 3, 5);
    expect(order.volumeDiscount).toBe(3); // 5% de 60
    expect(order.totalAmount).toBe(55); // 60 + 3 - 5 promo - 3 volumen
  });

  it('Total no puede ser negativo', () => {
    const rules = [
      { id: 'x', minQuantity: 1, maxQuantity: null, discountType: 'fixed', discountValue: 9999, label: 'test', active: true },
    ];
    const items = [
      { id: 'a', name: 'Chicle', quantity: 1, unitPrice: 0.5, total: 0.5 },
    ];
    const order = simulateOrder(items, rules, 0);
    expect(order.totalAmount).toBe(0);
  });

  it('Reglas vacías: sin descuento', () => {
    const items = [
      { id: 'a', name: 'Pizza', quantity: 50, unitPrice: 10, total: 500 },
    ];
    const order = simulateOrder(items, [], 0);
    expect(order.volumeDiscount).toBe(0);
    expect(order.totalAmount).toBe(500);
  });

  it('Todas las reglas inactivas: sin descuento', () => {
    const inactiveRules = CONFIG_RULES.map((r) => ({ ...r, active: false }));
    const items = [
      { id: 'a', name: 'Pizza', quantity: 10, unitPrice: 10, total: 100 },
    ];
    const order = simulateOrder(items, inactiveRules, 0);
    expect(order.volumeDiscount).toBe(0);
    expect(order.totalAmount).toBe(100);
  });
});
