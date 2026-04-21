/**
 * OCR Validator — Validación de datos extraídos por OCR.
 * Detecta inconsistencias aritméticas, fechas inválidas, datos faltantes.
 */

import logger from './logger.js';

const VALID_TAX_RATES_ES = [0, 4, 5, 10, 21];
const CIF_REGEX = /^[A-Z]\d{7}[A-Z0-9]$/i;
const NIF_REGEX = /^\d{8}[A-Z]$/i;
const NIE_REGEX = /^[XYZ]\d{7}[A-Z]$/i;

// ─── Critical fields per document type ──────────────────────────────────────

const CRITICAL_FIELDS = {
  factura_proveedor: ['emitter', 'date', 'total', 'documentNumber'],
  factura_cliente: ['emitter', 'date', 'total', 'documentNumber'],
  ticket_gasto: ['emitter', 'date', 'total'],
  recibo: ['emitter', 'date', 'total'],
  albaran: ['emitter', 'date', 'documentNumber'],
  nomina: ['workerName', 'periodStart', 'total'],
  contrato_laboral: ['workerName', 'date'],
  certificado_laboral: ['workerName', 'date'],
  baja_it: ['workerName', 'date'],
  contrato_comercial: ['emitter', 'receiver', 'date'],
  presupuesto: ['emitter', 'date', 'total'],
  documento_cliente: ['date'],
  documento_vertical: ['date'],
  otro: [],
};

export function validateOcrData(ocrData) {
  const warnings = [];
  const errors = [];
  const docType = ocrData?.documentType || 'otro';

  // 1. Check critical fields
  const criticals = CRITICAL_FIELDS[docType] || [];
  for (const field of criticals) {
    if (ocrData[field] == null || ocrData[field] === '') {
      warnings.push({
        code: 'INCOMPLETE_READ',
        field,
        message: `Campo crítico "${field}" no detectado`,
        severity: 'warning',
      });
    }
  }

  // 2. Low confidence
  if (typeof ocrData.confidenceScore === 'number' && ocrData.confidenceScore < 60) {
    warnings.push({
      code: 'LOW_CONFIDENCE',
      field: 'confidenceScore',
      message: `Confianza de lectura baja (${ocrData.confidenceScore}%)`,
      severity: 'warning',
    });
  }

  // 3. Arithmetic validation
  if (ocrData.subtotal != null && ocrData.taxAmount != null && ocrData.total != null) {
    const expected = Number((ocrData.subtotal + ocrData.taxAmount).toFixed(2));
    const actual = Number(Number(ocrData.total).toFixed(2));
    if (Math.abs(expected - actual) > 0.05) {
      warnings.push({
        code: 'ARITHMETIC_MISMATCH',
        field: 'total',
        message: `Subtotal (${ocrData.subtotal}) + IVA (${ocrData.taxAmount}) = ${expected}, pero total es ${actual}`,
        severity: 'warning',
        expected,
        actual,
      });
    }
  }

  if (Array.isArray(ocrData.lines) && ocrData.lines.length > 0 && ocrData.subtotal != null) {
    const linesTotal = Number(ocrData.lines.reduce((s, l) => s + Number(l.total || 0), 0).toFixed(2));
    const subtotal = Number(Number(ocrData.subtotal).toFixed(2));
    if (Math.abs(linesTotal - subtotal) > 0.10) {
      warnings.push({
        code: 'LINES_SUBTOTAL_MISMATCH',
        field: 'lines',
        message: `Suma de líneas (${linesTotal}) no coincide con subtotal (${subtotal})`,
        severity: 'warning',
      });
    }
  }

  // 4. Date validation
  if (ocrData.date) {
    const docDate = new Date(ocrData.date);
    const now = new Date();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    if (Number.isNaN(docDate.getTime())) {
      warnings.push({ code: 'INVALID_DATE', field: 'date', message: `Fecha inválida: "${ocrData.date}"`, severity: 'warning' });
    } else {
      if (docDate > new Date(now.getTime() + 86400000)) {
        errors.push({ code: 'FUTURE_DATE', field: 'date', message: `Fecha futura: ${ocrData.date}`, severity: 'error' });
      }
      if (docDate < tenYearsAgo) {
        warnings.push({ code: 'OLD_DATE', field: 'date', message: `Fecha anterior a 10 años: ${ocrData.date}`, severity: 'warning' });
      }
    }
  }

  if (ocrData.periodStart && ocrData.periodEnd) {
    const ps = new Date(ocrData.periodStart);
    const pe = new Date(ocrData.periodEnd);
    if (!Number.isNaN(ps.getTime()) && !Number.isNaN(pe.getTime()) && pe < ps) {
      warnings.push({ code: 'PERIOD_INVERTED', field: 'periodEnd', message: 'Fin de periodo anterior al inicio', severity: 'warning' });
    }
  }

  // 5. Amount validation
  if (ocrData.total != null) {
    if (Number(ocrData.total) < 0 && docType !== 'otro') {
      warnings.push({ code: 'NEGATIVE_TOTAL', field: 'total', message: `Importe negativo: ${ocrData.total}`, severity: 'warning' });
    }
    if (Number(ocrData.total) === 0 && ['factura_proveedor', 'factura_cliente'].includes(docType)) {
      warnings.push({ code: 'ZERO_TOTAL', field: 'total', message: 'Importe total es 0 para una factura', severity: 'warning' });
    }
  }

  // 6. Tax rate validation
  if (ocrData.taxRate != null && !VALID_TAX_RATES_ES.includes(Number(ocrData.taxRate))) {
    warnings.push({
      code: 'NON_STANDARD_TAX',
      field: 'taxRate',
      message: `IVA no estándar en España: ${ocrData.taxRate}% (esperado: ${VALID_TAX_RATES_ES.join(', ')})`,
      severity: 'info',
    });
  }

  // 7. CIF/NIF format validation
  for (const cifField of ['emitterCIF', 'receiverCIF']) {
    const val = ocrData[cifField];
    if (val && typeof val === 'string' && val.length >= 8) {
      const clean = val.replace(/[\s\-\.]/g, '');
      if (!CIF_REGEX.test(clean) && !NIF_REGEX.test(clean) && !NIE_REGEX.test(clean)) {
        warnings.push({ code: 'INVALID_CIF', field: cifField, message: `Formato CIF/NIF no válido: "${val}"`, severity: 'warning' });
      }
    }
  }

  // 8. Uncategorized
  if (!ocrData.documentType || ocrData.documentType === 'otro') {
    if (typeof ocrData.confidenceScore !== 'number' || ocrData.confidenceScore < 50) {
      warnings.push({ code: 'UNCATEGORIZED', field: 'documentType', message: 'No se pudo determinar el tipo de documento', severity: 'warning' });
    }
  }

  logger.info({ tag: 'OCR-VALIDATE', docType, warningCount: warnings.length, errorCount: errors.length }, 'Validation done');

  return { warnings, errors, isValid: errors.length === 0, hasWarnings: warnings.length > 0 };
}

/**
 * Generate a fingerprint from OCR data to detect duplicates.
 */
export function generateOcrFingerprint(ocrData) {
  const parts = [
    ocrData?.documentType,
    (ocrData?.emitter || '').toLowerCase().trim().substring(0, 30),
    (ocrData?.documentNumber || '').toLowerCase().trim(),
    ocrData?.date,
    ocrData?.total != null ? String(Number(ocrData.total).toFixed(2)) : null,
  ].filter(Boolean);

  if (parts.length < 2) return '';

  const key = parts.join('|');
  return import('node:crypto').then((c) =>
    c.createHash('sha256').update(key).digest('hex').substring(0, 16),
  );
}
