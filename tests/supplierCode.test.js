import { describe, expect, it } from 'vitest';
import {
  normalizeSupplierCode,
  suggestNextSupplierCode,
  supplierCodeAlreadyUsed,
} from '../src/app/lib/supplierCode';

describe('supplierCode', () => {
  it('normaliza a mayúsculas sin espacios', () => {
    expect(normalizeSupplierCode(' prov 12 ')).toBe('PROV-12');
    expect(normalizeSupplierCode('makro.01')).toBe('MAKRO.01');
  });

  it('sugiere PROV-001 y sigue la secuencia', () => {
    expect(suggestNextSupplierCode([])).toBe('PROV-001');
    expect(suggestNextSupplierCode([{ code: 'PROV-001' }, { code: 'PROV-003' }])).toBe('PROV-004');
    expect(suggestNextSupplierCode([{ code: 'PROV7' }])).toBe('PROV-008');
  });

  it('detecta códigos duplicados', () => {
    const list = [{ _id: 'a', code: 'PROV-001' }, { _id: 'b', code: 'MAKRO' }];
    expect(supplierCodeAlreadyUsed('prov-001', list)).toBe(true);
    expect(supplierCodeAlreadyUsed('prov-001', list, 'a')).toBe(false);
    expect(supplierCodeAlreadyUsed('nuevo', list)).toBe(false);
  });
});
