import { describe, expect, it } from 'vitest';
import {
  formatPurchaseOrderNumber,
  nextPurchaseOrderNumber,
  parsePurchaseOrderSequence,
} from '../services/purchaseOrderNumber.js';

describe('números de pedido de compra', () => {
  it('formatea correlativo con 4 dígitos', () => {
    expect(formatPurchaseOrderNumber(1)).toBe('PC-0001');
    expect(formatPurchaseOrderNumber(12)).toBe('PC-0012');
  });

  it('el siguiente después de PC-0003 es PC-0004', () => {
    expect(nextPurchaseOrderNumber(['PC-0001', 'PC-0003', 'PO-LK3F9A'])).toBe('PC-0004');
  });

  it('sin pedidos previos empieza en PC-0001', () => {
    expect(nextPurchaseOrderNumber([])).toBe('PC-0001');
  });

  it('ignora el código antiguo PO- de reloj', () => {
    expect(parsePurchaseOrderSequence('PO-M8K2Q1')).toBe(0);
    expect(parsePurchaseOrderSequence('PC-0007')).toBe(7);
  });
});
