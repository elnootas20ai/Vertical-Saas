import assert from 'node:assert/strict';
import {
  mergeSupplierInvoiceOcr,
  ocrHasUsefulLines,
  parseSpanishSupplierInvoiceText,
  reconstructTextFromPdfItems,
} from '../services/supplierInvoicePdfParse.js';

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
Forma de pago: 30 días fecha factura
`;

const parsed = parseSpanishSupplierInvoiceText(sample);
assert.equal(parsed.emitterCIF, 'B12345678');
assert.equal(parsed.documentNumber, 'FAC-2026-0042');
assert.equal(parsed.date, '2026-08-15');
assert.equal(parsed.dueDate, '2026-09-15');
assert.equal(parsed.total, 59.29);
assert.equal(parsed.subtotal, 49);
assert.equal(parsed.bankAccount, 'ES9121000418450200051332');
assert.ok(parsed.paymentTerms);
assert.ok(parsed.confidenceScore >= 70);
assert.equal(parsed.parseMethod, 'pdf_text_rules');
assert.equal(parsed.parseError, false);
assert.ok(parsed.lines.length >= 2, 'debe extraer líneas de artículo');
assert.equal(parsed.lines[0].description.includes('Aceite') || parsed.lines.some((l) => /Aceite/i.test(l.description)), true);
assert.ok(ocrHasUsefulLines(parsed));

// Texto aplastado (como antes hacía pdf.js al juntar todo con espacios)
const flat = parseSpanishSupplierInvoiceText(
  'DISTRIBUCIONES MODORRA S.L. CIF B12345678 Factura Nº FAC-99 Aceite oliva 5L 2 ud 18,50 37,00 Servilletas pack 1 ud 12,00 12,00 Base imponible 49,00 € IVA 21% 10,29 € TOTAL FACTURA 59,29 €',
);
assert.ok(flat.lines.length >= 1, 'líneas desde texto aplastado');
assert.equal(flat.total, 59.29);

// Reconstrucción por coordenadas Y (simula items pdf.js)
const reconstructed = reconstructTextFromPdfItems([
  { str: 'Pizza masa', transform: [1, 0, 0, 1, 20, 700] },
  { str: '2 ud', transform: [1, 0, 0, 1, 200, 700] },
  { str: '10,00', transform: [1, 0, 0, 1, 280, 700] },
  { str: '20,00', transform: [1, 0, 0, 1, 360, 700] },
  { str: 'Base imponible', transform: [1, 0, 0, 1, 20, 650] },
  { str: '20,00', transform: [1, 0, 0, 1, 360, 650] },
  { str: 'TOTAL', transform: [1, 0, 0, 1, 20, 620] },
  { str: '24,20', transform: [1, 0, 0, 1, 360, 620] },
]);
assert.ok(reconstructed.includes('\n'), 'debe crear saltos de línea');
const fromPdfLayout = parseSpanishSupplierInvoiceText(reconstructed);
assert.ok(fromPdfLayout.lines.length >= 1);
assert.ok(/Pizza/i.test(fromPdfLayout.lines[0].description));

const garbage = parseSpanishSupplierInvoiceText('Factura tutra\nTotal 59,29 €');
assert.equal(garbage.documentNumber, null);

const merged = mergeSupplierInvoiceOcr(
  { total: 100, subtotal: 82.64, taxRate: 21, lines: [], parseMethod: 'pdf_text_rules', confidenceScore: 60 },
  {
    total: 99,
    lines: [{ description: 'Tomate', quantity: 2, unitPrice: 5, total: 10 }],
    parseMethod: 'openai_vision',
    confidenceScore: 80,
  },
);
assert.equal(merged.total, 100, 'cabecera local manda en total');
assert.equal(merged.lines.length, 1);
assert.equal(merged.lines[0].description, 'Tomate');
assert.ok(String(merged.parseMethod).includes('merged'));

console.log('ok supplierInvoicePdfParse', {
  total: parsed.total,
  documentNumber: parsed.documentNumber,
  emitterCIF: parsed.emitterCIF,
  confidenceScore: parsed.confidenceScore,
  lines: parsed.lines.length,
  flatLines: flat.lines.length,
  mergedLines: merged.lines.length,
});
