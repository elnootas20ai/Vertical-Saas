/**
 * Motor Verifactu — Fase 1 (core fiscal).
 * Genera registros inmutables, cadena de huellas y URL QR AEAT.
 * El envío SOAP a Hacienda queda para Fase 2.
 *
 * Referencia QR (Orden HAC/1177/2024 / docs AEAT):
 * https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?...
 */

import crypto from 'node:crypto';

export const VERIFACTU_QR_PROD =
  'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR';
export const VERIFACTU_QR_SANDBOX =
  'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

export function normalizeNif(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

export function formatDateEs(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function formatImporteQr(total) {
  const n = Number(total);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function calcLineTotals(lines = []) {
  let base = 0;
  let tax = 0;
  const normalized = [];
  for (const raw of lines) {
    const description = String(raw?.description || '').trim();
    const quantity = Number(raw?.quantity) || 0;
    const unitPrice = Number(raw?.unitPrice) || 0;
    const discountPercent = Number(raw?.discountPercent) || 0;
    const taxRate = Number(raw?.taxRate);
    const rate = Number.isFinite(taxRate) ? taxRate : 21;
    const gross = quantity * unitPrice;
    const net = Number((gross * (1 - discountPercent / 100)).toFixed(2));
    const lineTax = Number((net * (rate / 100)).toFixed(2));
    base += net;
    tax += lineTax;
    normalized.push({
      description,
      quantity,
      unitPrice,
      discountPercent,
      taxRate: rate,
      lineBase: net,
      lineTax,
      lineTotal: Number((net + lineTax).toFixed(2)),
    });
  }
  base = Number(base.toFixed(2));
  tax = Number(tax.toFixed(2));
  return {
    lines: normalized,
    base,
    tax,
    total: Number((base + tax).toFixed(2)),
  };
}

/**
 * Cadena canónica interna (Fase 1).
 * En Fase 2 se alineará al algoritmo exacto de huella AEAT del XSD.
 */
export function buildHuellaPayload({
  issuerNif,
  series,
  number,
  issueDate,
  total,
  huellaAnterior,
}) {
  return [
    normalizeNif(issuerNif),
    `${String(series || '').trim()}${String(number || '').trim()}`,
    String(issueDate || '').slice(0, 10),
    formatImporteQr(total),
    String(huellaAnterior || ''),
  ].join('|');
}

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function computeHuella(input) {
  return sha256Hex(buildHuellaPayload(input));
}

export function buildQrUrl({
  issuerNif,
  series,
  number,
  issueDate,
  total,
  environment = 'sandbox',
}) {
  const base = environment === 'production' ? VERIFACTU_QR_PROD : VERIFACTU_QR_SANDBOX;
  const params = new URLSearchParams({
    nif: normalizeNif(issuerNif),
    numserie: `${String(series || '').trim()}${String(number || '').trim()}`,
    fecha: formatDateEs(issueDate),
    importe: formatImporteQr(total),
  });
  return `${base}?${params.toString()}`;
}

export function formatInvoiceNumber(series, sequenceNumber) {
  const seq = Math.max(1, Number(sequenceNumber) || 1);
  return String(seq).padStart(4, '0');
}

export function buildFullNumber(series, number) {
  return `${String(series || '').trim()}${String(number || '').trim()}`;
}

export function defaultVerifactuSettings(businessId, business = {}) {
  const now = new Date().toISOString();
  return {
    _id: `verifactu-settings:${businessId}`,
    type: 'verifactu_settings',
    business_id: businessId,
    enabled: false,
    mode: 'verifactu',
    environment: 'sandbox',
    series: 'A',
    nextNumber: 1,
    /** Al cobrar en TPV/sala se emite registro automático (si enabled). */
    autoIssueOnSale: true,
    /** Precios de carta/ticket incluyen IVA. */
    pricesIncludeTax: true,
    /** IVA por defecto si el artículo no trae tipo (hostelería suele 10). */
    defaultTaxRate: 10,
    issuerNif: normalizeNif(business.taxId || ''),
    issuerName: String(business.name || '').trim(),
    issuerAddress: String(business.address || '').trim(),
    issuerCity: String(business.city || '').trim(),
    issuerPostalCode: String(business.postalCode || '').trim(),
    lastHuella: null,
    lastRecordId: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeVerifactuSettings(doc) {
  if (!doc || doc.type !== 'verifactu_settings') return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    type: doc.type,
    business_id: doc.business_id,
    enabled: Boolean(doc.enabled),
    mode: doc.mode === 'no_verifactu' ? 'no_verifactu' : 'verifactu',
    environment: doc.environment === 'production' ? 'production' : 'sandbox',
    series: String(doc.series || 'A'),
    nextNumber: Number(doc.nextNumber) || 1,
    autoIssueOnSale: doc.autoIssueOnSale !== false,
    pricesIncludeTax: doc.pricesIncludeTax !== false,
    defaultTaxRate: Number.isFinite(Number(doc.defaultTaxRate)) ? Number(doc.defaultTaxRate) : 10,
    issuerNif: normalizeNif(doc.issuerNif),
    issuerName: String(doc.issuerName || ''),
    issuerAddress: String(doc.issuerAddress || ''),
    issuerCity: String(doc.issuerCity || ''),
    issuerPostalCode: String(doc.issuerPostalCode || ''),
    lastHuella: doc.lastHuella || null,
    lastRecordId: doc.lastRecordId || null,
    notes: String(doc.notes || ''),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function sanitizeVerifactuRecord(doc) {
  if (!doc || doc.type !== 'verifactu_record') return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    type: doc.type,
    business_id: doc.business_id,
    mode: doc.mode || 'verifactu',
    status: doc.status || 'issued',
    aeatStatus: doc.aeatStatus || 'pending_local',
    series: doc.series,
    number: doc.number,
    fullNumber: doc.fullNumber,
    issueDate: doc.issueDate,
    issuer: doc.issuer,
    recipient: doc.recipient,
    lines: Array.isArray(doc.lines) ? doc.lines : [],
    base: Number(doc.base) || 0,
    tax: Number(doc.tax) || 0,
    total: Number(doc.total) || 0,
    huella: doc.huella,
    huellaAnterior: doc.huellaAnterior || null,
    qrUrl: doc.qrUrl,
    rectifiesId: doc.rectifiesId || null,
    source: doc.source || null,
    notes: String(doc.notes || ''),
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
  };
}
