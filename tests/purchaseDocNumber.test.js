import { describe, expect, it } from 'vitest';
import {
  formatPurchaseDocNumber,
  isVertialAutoInvoicePlaceholder,
  nextPurchaseDocNumber,
  parsePurchaseDocSequence,
  resolvePurchaseInvoiceNumber,
} from '../services/purchaseDocNumber.js';

describe('números de factura / albarán de compra', () => {
  it('albarán usa serie A y factura serie F', () => {
    expect(nextPurchaseDocNumber('albaran', [])).toBe('A-0001');
    expect(nextPurchaseDocNumber('factura_proveedor', [])).toBe('F-0001');
    expect(formatPurchaseDocNumber(12, 'A')).toBe('A-0012');
  });

  it('el siguiente albarán ignora facturas F- y códigos viejos de reloj', () => {
    expect(
      nextPurchaseDocNumber('albaran', ['A-0001', 'A-0003', 'F-0009', 'FC-LK3F9A', 'ALB-PC-0001']),
    ).toBe('A-0004');
  });

  it('respeta el número del proveedor', () => {
    expect(
      resolvePurchaseInvoiceNumber(
        { invoiceNumber: '2026/00412', documentKind: 'factura_proveedor' },
        ['F-0001'],
      ),
    ).toBe('2026/00412');
    expect(
      resolvePurchaseInvoiceNumber(
        { invoiceNumber: 'ALB-2026-014', documentKind: 'albaran' },
        ['A-0001'],
      ),
    ).toBe('ALB-2026-014');
  });

  it('si Vertial no tiene número, asigna correlativo', () => {
    expect(
      resolvePurchaseInvoiceNumber({ invoiceNumber: '', documentKind: 'albaran' }, ['A-0002']),
    ).toBe('A-0003');
    expect(isVertialAutoInvoicePlaceholder('FC-M8K2Q1')).toBe(true);
    expect(isVertialAutoInvoicePlaceholder('ALB-PC-0004')).toBe(true);
    expect(parsePurchaseDocSequence('F-0007', 'F')).toBe(7);
  });
});
