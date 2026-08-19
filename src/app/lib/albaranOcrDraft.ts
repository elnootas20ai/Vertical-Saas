import type { PurchaseInvoice, PurchaseInvoiceLine } from './deliveryApi';
import type { PurchaseOrder } from './purchaseOrderApi';
import type { OcrResult } from './ocrApi';

function parseOcrDate(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const es = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw);
  if (es) {
    const day = es[1].padStart(2, '0');
    const month = es[2].padStart(2, '0');
    const year = es[3].length === 2 ? `20${es[3]}` : es[3];
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Convierte el OCR del albarán a líneas de compra para comprobar contra el pedido. */
export function purchaseInvoiceFromAlbaranOcr(
  order: Pick<PurchaseOrder, '_id' | 'orderNumber' | 'supplierId' | 'supplierName' | 'taxRate'>,
  ocr: OcrResult,
  extras: { imageBase64?: string } = {},
): PurchaseInvoice {
  const lines: PurchaseInvoiceLine[] = (ocr.lines || []).map((line, idx) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unitPrice) || 0;
    const total = Number(line.total) || quantity * unitPrice;
    return {
      id: `ocr-${idx}`,
      itemName: String(line.description || line.catalogItemName || '').trim() || `Línea ${idx + 1}`,
      quantity,
      unitPrice,
      total: Math.round(total * 100) / 100,
      catalogItemId: String(line.catalogItemId || ''),
      catalogItemName: String(line.catalogItemName || line.description || ''),
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + Number(l.total || 0), 0);
  const taxRate = Number(ocr.taxRate ?? order.taxRate ?? 21) || 21;
  const taxAmount = Number(ocr.taxAmount) || subtotal * (taxRate / 100);

  return {
    _id: '',
    type: 'purchase_invoice',
    id: '',
    invoiceNumber: String(ocr.documentNumber || '').trim(),
    user_id: '',
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    date: parseOcrDate(ocr.date),
    dueDate: '',
    status: 'pending',
    lines,
    subtotal,
    taxRate,
    taxAmount,
    total: Number(ocr.total) || subtotal + taxAmount,
    notes: String(ocr.notes || ''),
    paidAt: '',
    linkedPurchaseOrderId: order._id,
    linkedPurchaseOrderNumber: order.orderNumber || '',
    documentKind: 'albaran',
    entryMethod: 'ocr',
    ocrData: {
      documentType: ocr.documentType || 'albaran',
      documentTypeLabel: ocr.documentTypeLabel,
      emitter: ocr.emitter,
      receiver: ocr.receiver,
      date: ocr.date,
      documentNumber: ocr.documentNumber,
      subtotal: ocr.subtotal,
      taxRate: ocr.taxRate,
      taxAmount: ocr.taxAmount,
      total: ocr.total,
      currency: ocr.currency,
      lines: (ocr.lines || []).map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        total: l.total,
      })),
      notes: ocr.notes,
    },
    ocrImageBase64: extras.imageBase64 || '',
    validationStatus: 'pending_validation',
    createdAt: '',
    updatedAt: '',
  };
}
