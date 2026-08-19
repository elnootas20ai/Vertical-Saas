import { describe, expect, it } from 'vitest';
import {
  normalizeSupplierCode,
  sanitizeSupplierCodeInput,
  slugFromSupplierName,
  suggestNextSupplierCode,
  suggestSupplierCodeFromName,
  supplierCodeAlreadyUsed,
  SUPPLIER_CODE_MAX_LEN,
} from '../src/app/lib/supplierCode';

describe('supplierCode', () => {
  it('normaliza a mayúsculas sin espacios y respeta el tope', () => {
    expect(normalizeSupplierCode(' prov 12 ')).toBe('PROV-12');
    expect(normalizeSupplierCode('makro.01')).toBe('MAKRO.01');
    expect(normalizeSupplierCode('ABCDEFGHIJKLMNOP')).toHaveLength(SUPPLIER_CODE_MAX_LEN);
  });

  it('sanitiza la entrada del input', () => {
    expect(sanitizeSupplierCodeInput('makro!!')).toBe('MAKRO');
    expect(sanitizeSupplierCodeInput('a'.repeat(40))).toHaveLength(SUPPLIER_CODE_MAX_LEN);
  });

  it('slug desde el nombre', () => {
    expect(slugFromSupplierName('Makro')).toBe('MAKRO');
    expect(slugFromSupplierName('Proveedor Café SL')).toBe('PROVEEDORCAF');
    expect(slugFromSupplierName('  ')).toBe('');
  });

  it('sugiere código desde el nombre y evita duplicados', () => {
    expect(suggestSupplierCodeFromName('Makro', [])).toBe('MAKRO');
    expect(suggestSupplierCodeFromName('Makro', [{ code: 'MAKRO' }])).toBe('MAKRO-2');
    expect(suggestSupplierCodeFromName('', [])).toBe('PROV-001');
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
