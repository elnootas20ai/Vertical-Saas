import { describe, expect, it } from 'vitest';
import {
  reGrossToBaseTax,
  resolveContractHonorarios,
  reContractSaleRef,
  reContractRentRef,
} from '../src/app/lib/realEstateFinanceAmounts.ts';

describe('realEstateFinanceAmounts', () => {
  it('parte IVA 21% desde bruto', () => {
    const a = reGrossToBaseTax(121);
    expect(a?.amountBase).toBe(100);
    expect(a?.taxRate).toBe(21);
    expect(a?.totalAmount).toBe(121);
  });

  it('honorarios: explícitos o fallback alquiler/venta', () => {
    expect(resolveContractHonorarios({ honorarios: 500, importeMensual: 900 })).toBe(500);
    expect(resolveContractHonorarios({ tipo: 'alquiler', importeMensual: 900 })).toBe(900);
    expect(resolveContractHonorarios({ tipo: 'venta', importeTotal: 12000 })).toBe(12000);
  });

  it('referencias estables', () => {
    expect(reContractSaleRef('abc')).toBe('RE-SALE-abc');
    expect(reContractRentRef('abc', '2026-08')).toBe('RE-RENT-abc-2026-08');
  });
});
