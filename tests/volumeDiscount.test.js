import { describe, it, expect } from 'vitest';
import {
  findApplicableRule,
  calculateDiscountAmount,
  computeVolumeDiscount,
} from '../shared/volumeDiscount.js';

const RULES = [
  { id: 'r1', minQuantity: 5,  maxQuantity: 9,    discountType: 'percentage', discountValue: 5,  label: '5% por 5-9 uds.',  active: true },
  { id: 'r2', minQuantity: 10, maxQuantity: 19,   discountType: 'percentage', discountValue: 10, label: '10% por 10-19 uds.', active: true },
  { id: 'r3', minQuantity: 20, maxQuantity: null,  discountType: 'percentage', discountValue: 15, label: '15% por 20+ uds.',  active: true },
  { id: 'r4', minQuantity: 3,  maxQuantity: 4,    discountType: 'fixed',      discountValue: 2,  label: '2€ dto. fijo',      active: false },
];

describe('findApplicableRule', () => {
  it('devuelve null si no hay reglas', () => {
    expect(findApplicableRule([], 10)).toBeNull();
    expect(findApplicableRule(null, 10)).toBeNull();
  });

  it('devuelve null si la cantidad es 0 o negativa', () => {
    expect(findApplicableRule(RULES, 0)).toBeNull();
    expect(findApplicableRule(RULES, -1)).toBeNull();
  });

  it('devuelve null si la cantidad no alcanza ningún mínimo', () => {
    expect(findApplicableRule(RULES, 2)).toBeNull();
  });

  it('devuelve la regla correcta para el rango 5-9', () => {
    const rule = findApplicableRule(RULES, 5);
    expect(rule).not.toBeNull();
    expect(rule.id).toBe('r1');
    expect(findApplicableRule(RULES, 9).id).toBe('r1');
  });

  it('devuelve la regla correcta para el rango 10-19', () => {
    expect(findApplicableRule(RULES, 10).id).toBe('r2');
    expect(findApplicableRule(RULES, 15).id).toBe('r2');
    expect(findApplicableRule(RULES, 19).id).toBe('r2');
  });

  it('devuelve la regla correcta para 20+ (sin máximo)', () => {
    expect(findApplicableRule(RULES, 20).id).toBe('r3');
    expect(findApplicableRule(RULES, 100).id).toBe('r3');
  });

  it('ignora reglas inactivas', () => {
    expect(findApplicableRule(RULES, 3)).toBeNull();
    expect(findApplicableRule(RULES, 4)).toBeNull();
  });

  it('funciona con una sola regla sin máximo', () => {
    const single = [{ id: 's1', minQuantity: 1, maxQuantity: null, discountType: 'percentage', discountValue: 10, label: '', active: true }];
    expect(findApplicableRule(single, 1).id).toBe('s1');
    expect(findApplicableRule(single, 999).id).toBe('s1');
  });
});

describe('calculateDiscountAmount', () => {
  it('devuelve 0 si no hay regla', () => {
    expect(calculateDiscountAmount(null, 100)).toBe(0);
  });

  it('devuelve 0 si el subtotal es 0', () => {
    expect(calculateDiscountAmount(RULES[0], 0)).toBe(0);
  });

  it('calcula porcentaje correctamente', () => {
    expect(calculateDiscountAmount(RULES[0], 100)).toBe(5);
    expect(calculateDiscountAmount(RULES[1], 100)).toBe(10);
    expect(calculateDiscountAmount(RULES[2], 200)).toBe(30);
  });

  it('redondea a 2 decimales', () => {
    expect(calculateDiscountAmount(RULES[0], 33.33)).toBe(1.67);
  });

  it('calcula descuento fijo correctamente', () => {
    const fixedRule = { ...RULES[3], active: true };
    expect(calculateDiscountAmount(fixedRule, 100)).toBe(2);
  });

  it('descuento fijo no excede el subtotal', () => {
    const fixedRule = { ...RULES[3], active: true, discountValue: 500 };
    expect(calculateDiscountAmount(fixedRule, 100)).toBe(100);
  });

  it('porcentaje se limita al 100%', () => {
    const rule = { id: 'x', minQuantity: 1, maxQuantity: null, discountType: 'percentage', discountValue: 150, label: '', active: true };
    expect(calculateDiscountAmount(rule, 100)).toBe(100);
  });
});

describe('computeVolumeDiscount', () => {
  const items3 = [
    { quantity: 1, total: 10 },
    { quantity: 1, total: 15 },
    { quantity: 1, total: 20 },
  ];
  const items7 = [
    { quantity: 3, total: 30 },
    { quantity: 4, total: 40 },
  ];
  const items12 = [
    { quantity: 6, total: 60 },
    { quantity: 6, total: 60 },
  ];
  const items25 = [
    { quantity: 25, total: 250 },
  ];

  it('no aplica descuento si no hay reglas', () => {
    const result = computeVolumeDiscount([], items7);
    expect(result.rule).toBeNull();
    expect(result.discountAmount).toBe(0);
    expect(result.totalQuantity).toBe(7);
  });

  it('no aplica descuento si la cantidad es insuficiente', () => {
    const result = computeVolumeDiscount(RULES, items3);
    expect(result.rule).toBeNull();
    expect(result.discountAmount).toBe(0);
    expect(result.totalQuantity).toBe(3);
  });

  it('aplica el tier correcto para 7 uds.', () => {
    const result = computeVolumeDiscount(RULES, items7);
    expect(result.rule.id).toBe('r1');
    expect(result.discountAmount).toBe(3.5); // 5% de 70
    expect(result.totalQuantity).toBe(7);
  });

  it('aplica el tier correcto para 12 uds.', () => {
    const result = computeVolumeDiscount(RULES, items12);
    expect(result.rule.id).toBe('r2');
    expect(result.discountAmount).toBe(12); // 10% de 120
    expect(result.totalQuantity).toBe(12);
  });

  it('aplica el tier correcto para 25 uds.', () => {
    const result = computeVolumeDiscount(RULES, items25);
    expect(result.rule.id).toBe('r3');
    expect(result.discountAmount).toBe(37.5); // 15% de 250
    expect(result.totalQuantity).toBe(25);
  });

  it('devuelve 0 con items vacíos', () => {
    const result = computeVolumeDiscount(RULES, []);
    expect(result.discountAmount).toBe(0);
    expect(result.totalQuantity).toBe(0);
  });

  it('devuelve 0 con items null', () => {
    const result = computeVolumeDiscount(RULES, null);
    expect(result.discountAmount).toBe(0);
    expect(result.totalQuantity).toBe(0);
  });
});
