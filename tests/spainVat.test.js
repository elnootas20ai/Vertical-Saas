import { describe, expect, it } from 'vitest';
import {
  calcLinesTaxBreakdown,
  calcOrderFinanceTaxAmounts,
  inferTaxRateFromCategory,
  normalizeEsTaxPolicy,
  resolveCatalogItemTaxRate,
} from '../shared/tax/spainVat.js';

describe('spainVat', () => {
  const policyOff = normalizeEsTaxPolicy({
    enabled: false,
    defaultFoodTaxRate: 10,
    defaultStandardTaxRate: 21,
    pricesIncludeTax: true,
  });

  const policyOn = normalizeEsTaxPolicy({
    enabled: true,
    defaultFoodTaxRate: 10,
    defaultStandardTaxRate: 21,
    pricesIncludeTax: true,
  });

  it('política apagada por defecto', () => {
    expect(normalizeEsTaxPolicy(null).enabled).toBe(false);
    expect(normalizeEsTaxPolicy({}).enabled).toBe(false);
  });

  it('infiere bebidas al tipo estándar solo con política activa', () => {
    expect(inferTaxRateFromCategory('Bebidas', policyOn)).toBe(21);
    expect(inferTaxRateFromCategory('Pizzas', policyOn)).toBe(10);
  });

  it('usa taxRate del catálogo si existe', () => {
    expect(resolveCatalogItemTaxRate({ taxRate: 21, category: 'Pizzas' }, policyOff)).toBe(21);
    expect(resolveCatalogItemTaxRate({ category: 'Pizzas' }, policyOff)).toBe(21);
    expect(resolveCatalogItemTaxRate({ category: 'Pizzas' }, policyOn)).toBe(10);
  });

  it('finanzas con política apagada = legacy 21%', () => {
    const amounts = calcOrderFinanceTaxAmounts(
      {
        totalAmount: 12.1,
        items: [
          { name: 'Pizza', quantity: 1, total: 11, taxRate: 10 },
          { name: 'Coca', quantity: 1, total: 1.1, taxRate: 21 },
        ],
      },
      policyOff,
    );
    expect(amounts.taxRate).toBe(21);
    expect(amounts.totalAmount).toBe(12.1);
    expect(amounts.amountBase).toBe(10);
    expect(amounts.taxAmount).toBe(2.1);
  });

  it('calcula base y cuota por líneas mixtas solo si enabled', () => {
    const breakdown = calcLinesTaxBreakdown(
      [
        { name: 'Pizza', quantity: 1, unitPrice: 11, total: 11, taxRate: 10 },
        { name: 'Coca', quantity: 1, unitPrice: 2.42, total: 2.42, taxRate: 21 },
      ],
      policyOn,
    );
    expect(breakdown.gross).toBe(13.42);
    expect(breakdown.base).toBeGreaterThan(10);
    expect(breakdown.tax).toBeGreaterThan(0);
    expect(breakdown.byRate[10]).toBeTruthy();
    expect(breakdown.byRate[21]).toBeTruthy();
  });

  it('finanzas con política activa usan líneas', () => {
    const amounts = calcOrderFinanceTaxAmounts(
      {
        totalAmount: 13.42,
        items: [
          { name: 'Pizza', quantity: 1, total: 11, taxRate: 10 },
          { name: 'Coca', quantity: 1, total: 2.42, taxRate: 21 },
        ],
      },
      policyOn,
    );
    expect(amounts.totalAmount).toBe(13.42);
    expect(amounts.taxAmount).toBeGreaterThan(0);
    expect(amounts.amountBase + amounts.taxAmount).toBeCloseTo(13.42, 2);
  });
});
