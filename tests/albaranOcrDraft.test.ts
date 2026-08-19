import { describe, expect, it } from 'vitest';
import { purchaseInvoiceFromAlbaranOcr } from '../src/app/lib/albaranOcrDraft.ts';

describe('purchaseInvoiceFromAlbaranOcr', () => {
  it('monta un albarán enlazado al pedido con las líneas del OCR', () => {
    const inv = purchaseInvoiceFromAlbaranOcr(
      {
        _id: 'po-1',
        orderNumber: 'PC-0001',
        supplierId: 'sup-1',
        supplierName: 'Bebidas SA',
        taxRate: 21,
      },
      {
        documentType: 'albaran',
        documentTypeLabel: 'Albarán',
        documentNumber: 'AB-88',
        date: '19/08/2026',
        emitter: 'Bebidas SA',
        emitterCIF: null,
        receiver: null,
        receiverCIF: null,
        subtotal: 10,
        taxRate: 21,
        taxAmount: 2.1,
        total: 12.1,
        currency: 'EUR',
        confidenceScore: 90,
        lines: [
          { description: 'Cola 1L', quantity: 12, unitPrice: 0.8, total: 9.6 },
        ],
        workerName: null,
        workerDNI: null,
        periodStart: null,
        periodEnd: null,
        contractDuration: null,
        notes: null,
      },
    );
    expect(inv._id).toBe('');
    expect(inv.documentKind).toBe('albaran');
    expect(inv.entryMethod).toBe('ocr');
    expect(inv.invoiceNumber).toBe('AB-88');
    expect(inv.date).toBe('2026-08-19');
    expect(inv.linkedPurchaseOrderId).toBe('po-1');
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].itemName).toBe('Cola 1L');
    expect(inv.lines[0].quantity).toBe(12);
  });
});
