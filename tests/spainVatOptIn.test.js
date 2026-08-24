import { describe, expect, it } from 'vitest';
import {
  calcOrderFinanceTaxAmounts,
  calcRefundFinanceTaxAmounts,
  DEFAULT_ES_TAX_POLICY,
  LEGACY_ES_FINANCE_TAX_RATE,
  normalizeEsTaxPolicy,
  saleLineOptsFromTaxPolicy,
} from '../shared/tax/spainVat.js';
import {
  emptyBrandBillingConfig,
  normalizeBrandBillingConfig,
  taxPolicyFromBillingConfig,
} from '../src/app/lib/brandBillingConfig.ts';
import { withOrderLineTaxRate } from '../src/app/lib/spainVat.ts';
import { resolveImportTaxRate } from '../src/app/lib/deliveryCatalogImport.ts';

/** Mismo cálculo que tenía el cliente antes (total / 1.21). */
function legacyFinance(total) {
  const gross = Math.round(Number(total) * 100) / 100;
  const base = Math.round((gross / 1.21) * 100) / 100;
  return {
    amountBase: base,
    taxAmount: Math.round((gross - base) * 100) / 100,
    totalAmount: gross,
    taxRate: 21,
  };
}

const mixedOrder = {
  paidAmount: 25.5,
  totalAmount: 25.5,
  items: [
    { name: 'Pizza', quantity: 2, total: 20, taxRate: 10, category: 'Pizzas' },
    { name: 'Coca', quantity: 2, total: 5.5, taxRate: 21, category: 'Bebidas' },
  ],
};

describe('IVA opt-in: no cambia totales con política apagada', () => {
  it('DEFAULT_ES_TAX_POLICY viene apagada', () => {
    expect(DEFAULT_ES_TAX_POLICY.enabled).toBe(false);
    expect(normalizeEsTaxPolicy(null).enabled).toBe(false);
    expect(normalizeEsTaxPolicy(undefined).enabled).toBe(false);
    expect(normalizeEsTaxPolicy({ enabled: 'yes' }).enabled).toBe(false);
    expect(normalizeEsTaxPolicy({ enabled: true }).enabled).toBe(true);
  });

  it('config de facturación nueva / vacía → IVA apagado', () => {
    expect(emptyBrandBillingConfig('biz1').taxPolicy.enabled).toBe(false);
    expect(normalizeBrandBillingConfig({ businessId: 'biz1' }).taxPolicy.enabled).toBe(false);
    expect(taxPolicyFromBillingConfig(null).enabled).toBe(false);
    expect(taxPolicyFromBillingConfig({ taxPolicy: { enabled: true } }).enabled).toBe(true);
  });

  it('pedido mixto 10%+21%: con apagado = exactamente legacy /1.21', () => {
    const expected = legacyFinance(25.5);
    for (const policy of [undefined, null, normalizeEsTaxPolicy(null), taxPolicyFromBillingConfig(null)]) {
      const tax = calcOrderFinanceTaxAmounts(mixedOrder, policy || undefined);
      expect(tax.totalAmount).toBe(expected.totalAmount);
      expect(tax.taxRate).toBe(LEGACY_ES_FINANCE_TAX_RATE);
      expect(tax.amountBase).toBe(expected.amountBase);
      expect(tax.taxAmount).toBe(expected.taxAmount);
      expect(tax.amountBase + tax.taxAmount).toBeCloseTo(tax.totalAmount, 2);
    }
  });

  it('aunque las líneas digan 10%, apagado ignora y usa total del pedido', () => {
    const order = {
      totalAmount: 100,
      paidAmount: 100,
      items: [{ name: 'Solo comida', total: 100, taxRate: 10 }],
    };
    const tax = calcOrderFinanceTaxAmounts(order);
    const expected = legacyFinance(100);
    expect(tax).toMatchObject(expected);
  });

  it('devolución apagada = legacy /1.21 del importe devuelto', () => {
    const tax = calcRefundFinanceTaxAmounts(mixedOrder, 12.1);
    const expected = legacyFinance(12.1);
    expect(tax).toMatchObject(expected);
  });

  it('TPV no copia taxRate a la línea si la política está apagada', () => {
    const line = {
      id: 'l1',
      name: 'Pizza',
      quantity: 1,
      unitPrice: 11,
      total: 11,
      category: 'Pizzas',
    };
    const catalogItem = { taxRate: 10, category: 'Pizzas' };
    expect(withOrderLineTaxRate(line, catalogItem, null)).toEqual(line);
    expect(withOrderLineTaxRate(line, catalogItem, normalizeEsTaxPolicy({ enabled: false }))).toEqual(line);
    expect(withOrderLineTaxRate(line, catalogItem, undefined)).toEqual(line);
  });

  it('import Excel sin columna iva (delivery) sigue en 21, no 10', () => {
    expect(resolveImportTaxRate({ name: 'Pizza', category: 'Pizzas' }, 'delivery')).toBe(21);
    expect(resolveImportTaxRate({ name: 'Pizza', category: 'Pizzas' }, 'delivery', normalizeEsTaxPolicy(null))).toBe(21);
    expect(resolveImportTaxRate({ name: 'Pizza', iva: '10' }, 'delivery')).toBe(10);
  });

  it('Verifactu: sin política activa no impone defaults de facturación', () => {
    expect(saleLineOptsFromTaxPolicy(null)).toBeNull();
    expect(saleLineOptsFromTaxPolicy(normalizeEsTaxPolicy({ enabled: false }))).toBeNull();
  });
});

describe('IVA opt-in: solo cambia el desglose si enabled=true', () => {
  const policyOn = normalizeEsTaxPolicy({
    enabled: true,
    defaultFoodTaxRate: 10,
    defaultStandardTaxRate: 21,
    pricesIncludeTax: true,
  });

  it('activado: el bruto sigue siendo la suma de líneas (no inventa cobro)', () => {
    const tax = calcOrderFinanceTaxAmounts(mixedOrder, policyOn);
    expect(tax.totalAmount).toBe(25.5);
    expect(tax.amountBase + tax.taxAmount).toBeCloseTo(25.5, 2);
    // Con 10%+21% el tipo efectivo ya no es 21 plano
    expect(tax.taxRate).not.toBe(21);
    expect(tax.amountBase).not.toBe(legacyFinance(25.5).amountBase);
  });

  it('activado: TPV sí puede copiar taxRate del catálogo', () => {
    const line = {
      id: 'l1',
      name: 'Pizza',
      quantity: 1,
      unitPrice: 11,
      total: 11,
      category: 'Pizzas',
    };
    const next = withOrderLineTaxRate(line, { taxRate: 10, category: 'Pizzas' }, policyOn);
    expect(next.taxRate).toBe(10);
    expect(next.total).toBe(11);
  });

  it('activado: Verifactu recibe defaults de la política', () => {
    expect(saleLineOptsFromTaxPolicy(policyOn)).toEqual({
      pricesIncludeTax: true,
      defaultTaxRate: 10,
    });
  });

  it('activado vía import taxPolicy: categoría Bebidas → 21', () => {
    expect(
      resolveImportTaxRate({ name: 'Cola', category: 'Bebidas' }, 'delivery', policyOn),
    ).toBe(21);
    expect(
      resolveImportTaxRate({ name: 'Pizza', category: 'Pizzas' }, 'delivery', policyOn),
    ).toBe(10);
  });
});
