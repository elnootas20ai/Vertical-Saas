/**
 * Números Vertial de factura / albarán de compra.
 * Albarán: A-0001  ·  Factura: F-0001
 */

export function purchaseDocSeriesLetter(documentKind?: string | null): 'A' | 'F' {
  const kind = String(documentKind || '').toLowerCase();
  if (kind.includes('albaran')) return 'A';
  return 'F';
}

export function parsePurchaseDocSequence(
  docNumber: string | undefined | null,
  seriesLetter: string,
): number {
  const letter = String(seriesLetter || '').trim().toUpperCase();
  if (!letter) return 0;
  const m = new RegExp(`^${letter}-(\\d+)$`, 'i').exec(String(docNumber || '').trim());
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatPurchaseDocNumber(sequence: number, seriesLetter: string): string {
  const letter = String(seriesLetter || 'F').trim().toUpperCase() || 'F';
  const seq = Math.max(1, Math.floor(Number(sequence) || 1));
  return `${letter}-${String(seq).padStart(4, '0')}`;
}

export function nextPurchaseDocNumber(
  documentKind: string | undefined | null,
  existingNumbers: Array<string | undefined | null> = [],
): string {
  const letter = purchaseDocSeriesLetter(documentKind);
  let max = 0;
  for (const raw of existingNumbers) {
    const seq = parsePurchaseDocSequence(raw, letter);
    if (seq > max) max = seq;
  }
  return formatPurchaseDocNumber(max + 1, letter);
}

export function isVertialAutoInvoicePlaceholder(value: string | undefined | null): boolean {
  const n = String(value || '').trim();
  if (!n) return true;
  if (/^FC-[0-9A-Z]{5,10}$/i.test(n)) return true;
  if (/^ALB-PC-/i.test(n)) return true;
  if (/^ALB-\d{1,3}$/i.test(n)) return true;
  if (/^ALB-[0-9A-Z]{6,12}$/i.test(n)) return true;
  return false;
}

export function resolvePurchaseInvoiceNumber(
  input: { invoiceNumber?: string | null; documentKind?: string | null } = {},
  existingNumbers: Array<string | undefined | null> = [],
): string {
  const given = String(input.invoiceNumber || '').trim();
  if (given && !isVertialAutoInvoicePlaceholder(given)) return given;
  return nextPurchaseDocNumber(input.documentKind, existingNumbers);
}
