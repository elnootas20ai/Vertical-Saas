import assert from 'node:assert/strict';
import { parseSpanishSupplierInvoiceText } from '../services/supplierInvoicePdfParse.js';

const sample = `
DISTRIBUCIONES MODORRA S.L.
CIF B12345678
Factura Nº FAC-2026-0042
Fecha: 15/08/2026
Vencimiento: 15/09/2026

Concepto                  Cant   Precio    Total
Aceite oliva 5L           2 ud   18,50     37,00
Servilletas pack          1 ud   12,00     12,00

Base imponible                       49,00 €
IVA 21%                              10,29 €
TOTAL FACTURA                        59,29 €
IBAN ES9121000418450200051332
`;

const parsed = parseSpanishSupplierInvoiceText(sample);
assert.equal(parsed.emitterCIF, 'B12345678');
assert.equal(parsed.documentNumber, 'FAC-2026-0042');
assert.equal(parsed.date, '2026-08-15');
assert.equal(parsed.dueDate, '2026-09-15');
assert.equal(parsed.total, 59.29);
assert.equal(parsed.subtotal, 49);
assert.ok(parsed.confidenceScore >= 70);
assert.equal(parsed.parseMethod, 'pdf_text_rules');
assert.equal(parsed.parseError, false);
console.log('ok supplierInvoicePdfParse', {
  total: parsed.total,
  documentNumber: parsed.documentNumber,
  emitterCIF: parsed.emitterCIF,
  confidenceScore: parsed.confidenceScore,
  lines: parsed.lines.length,
});
