import { describe, expect, it } from 'vitest';
import {
  purchaseInvoiceFromAlbaranOcr,
  purchaseInvoiceFromStandaloneAlbaranOcr,
} from '../src/app/lib/albaranOcrDraft.ts';
import type { OcrResult } from '../src/app/lib/ocrApi.ts';

const sampleOcr = {
  documentType: 'albaran',
  documentTypeLabel: 'Albarán',
  emitter: 'Proveedor Demo',
  emitterCIF: 'B12345678',
  documentNumber: 'ALB-9',
  date: '2026-09-01',
  taxRate: 21,
  taxAmount: 2.1,
  total: 12.1,
  subtotal: 10,
  lines: [
    { description: 'Harina', quantity: 5, unitPrice: 2, total: 10, catalogItemId: 'c1' },
  ],
  notes: null,
  currency: 'EUR',
  receiver: null,
  confidenceScore: 90,
  parseError: false,
} as OcrResult;

describe('albaranOcrDraft', () => {
  it('purchaseInvoiceFromAlbaranOcr enlaza pedido', () => {
    const draft = purchaseInvoiceFromAlbaranOcr(
      { _id: 'po1', orderNumber: 'PC-1', supplierId: 's1', supplierName: 'Makro', taxRate: 21 },
      sampleOcr,
    );
    expect(draft.documentKind).toBe('albaran');
    expect(draft.linkedPurchaseOrderId).toBe('po1');
    expect(draft.supplierId).toBe('s1');
    expect(draft.ocrData?.emitterCIF).toBe('B12345678');
    expect(draft.ocrStockReceivedAt || '').toBe('');
  });

  it('purchaseInvoiceFromStandaloneAlbaranOcr no fuerza pedido', () => {
    const draft = purchaseInvoiceFromStandaloneAlbaranOcr(sampleOcr);
    expect(draft.documentKind).toBe('albaran');
    expect(draft.linkedPurchaseOrderId || '').toBe('');
    expect(draft.supplierName).toBe('Proveedor Demo');
    expect(draft.supplierCif).toBe('B12345678');
    expect(draft.lines).toHaveLength(1);
    expect(draft.ocrStockReceivedAt || '').toBe('');
  });
});
