import { describe, expect, it } from 'vitest';
import {
  buildPurchaseInvoiceDocument,
  buildPurchaseOrderDocument,
  sanitizePurchaseInvoice,
  sanitizePurchaseOrder,
} from '../services/couchdb.js';

describe('purchase document builders', () => {
  it('conserva alcance, aprobación, envío y enlaces del pedido', () => {
    const built = buildPurchaseOrderDocument('user-1', {
      orderNumber: 'PC-0001',
      supplierId: 'sup-1',
      status: 'sent',
      sentAt: '2026-09-11T10:00:00.000Z',
      sentVia: 'email',
      approvedBy: 'manager-1',
      approvedAt: '2026-09-11T09:00:00.000Z',
      salesPointId: 'pdv-1',
      workCenterId: 'wc-1',
      warehouseId: 'wh-1',
      businessId: 'biz-1',
      purchaseInvoiceId: 'pinv-1',
      items: [
        {
          catalogItemId: 'stock-1',
          name: 'Harina',
          quantity: 2,
          unitCost: 10,
          taxRate: 10,
        },
      ],
    });
    const safe = sanitizePurchaseOrder(built);

    expect(safe.sentVia).toBe('email');
    expect(safe.approvedBy).toBe('manager-1');
    expect(safe.salesPointId).toBe('pdv-1');
    expect(safe.workCenterId).toBe('wc-1');
    expect(safe.warehouseId).toBe('wh-1');
    expect(safe.businessId).toBe('biz-1');
    expect(safe.purchaseInvoiceId).toBe('pinv-1');
    expect(safe.taxAmount).toBe(2);
    expect(safe.total).toBe(22);
  });

  it('conserva revisión, validación, PDF y enlaces financieros de factura', () => {
    const built = buildPurchaseInvoiceDocument('user-1', {
      invoiceNumber: 'FAC-9',
      supplierId: 'sup-1',
      supplierName: 'Proveedor',
      supplierCif: 'B12345678',
      status: 'validated',
      paymentStatus: 'unpaid',
      validationStatus: 'validated',
      validatedAt: '2026-09-11T10:00:00.000Z',
      validatedBy: 'manager-1',
      linkedFinanceId: 'finance-1',
      linkedDocumentId: 'doc-1',
      pdfUrl: '/invoice.pdf',
      pdfFilename: 'invoice.pdf',
      reviewNotes: 'Revisada',
      reviewedBy: 'manager-1',
      lines: [{ itemName: 'Harina', quantity: 2, unitPrice: 10, taxRate: 10 }],
      taxAmount: 2,
      total: 22,
    });
    const safe = sanitizePurchaseInvoice(built);

    expect(safe.status).toBe('validated');
    expect(safe.validationStatus).toBe('validated');
    expect(safe.supplierCif).toBe('B12345678');
    expect(safe.linkedFinanceId).toBe('finance-1');
    expect(safe.linkedDocumentId).toBe('doc-1');
    expect(safe.pdfFilename).toBe('invoice.pdf');
    expect(safe.reviewNotes).toBe('Revisada');
    expect(safe.taxAmount).toBe(2);
    expect(safe.total).toBe(22);
  });
});
