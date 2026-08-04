/**
 * OCR Classifier — Clasifica documentos escaneados y determina su destino
 * en el sistema (módulo, BD, builder, acción).
 */

import {
  getCatalogDbName,
  getFinanceDbName,
  getInvoicesDbName,
  getDocumentsDbName,
  getOcrLogsDbName,
  getPayrollDbName,
  getConstructionDbName,
  getWorkshopDbName,
} from './couchdb.js';
import logger from './logger.js';

// ─── Routing table ──────────────────────────────────────────────────────────

const ROUTE_TABLE = {
  factura_proveedor: {
    module: 'compras',
    database: () => getCatalogDbName(),
    builder: 'buildPurchaseInvoiceDocument',
    action: 'create_purchase_invoice',
    documentCategory: 'financial',
  },
  factura_cliente: {
    module: 'finanzas',
    database: () => getInvoicesDbName(),
    builder: 'buildInvoiceDocument',
    action: 'create_client_invoice',
    documentCategory: 'financial',
  },
  ticket_gasto: {
    module: 'finanzas',
    database: () => getFinanceDbName(),
    builder: 'buildFinanceDocument',
    action: 'create_expense',
    financeType: 'pago',
    documentCategory: 'user-expenses',
  },
  recibo: {
    module: 'finanzas',
    database: () => getFinanceDbName(),
    builder: 'buildFinanceDocument',
    action: 'create_receipt',
    financeType: 'cobro',
    documentCategory: 'financial',
  },
  albaran: {
    module: 'compras',
    database: () => getCatalogDbName(),
    builder: 'buildPurchaseInvoiceDocument',
    action: 'create_delivery_note',
    documentCategory: 'financial',
  },
  nomina: {
    module: 'nominas',
    database: () => getPayrollDbName(),
    builder: 'createPayrollDocument',
    action: 'create_payroll',
    payrollType: 'nomina',
    documentCategory: 'payroll',
  },
  contrato_laboral: {
    module: 'equipo',
    database: () => getPayrollDbName(),
    builder: 'createPayrollDocument',
    action: 'create_labor_contract',
    payrollType: 'contrato',
    documentCategory: 'contracts',
  },
  certificado_laboral: {
    module: 'equipo',
    database: () => getPayrollDbName(),
    builder: 'createPayrollDocument',
    action: 'create_labor_certificate',
    payrollType: 'certificado',
    documentCategory: 'licenses',
  },
  baja_it: {
    module: 'equipo',
    database: () => getPayrollDbName(),
    builder: 'createPayrollDocument',
    action: 'create_sick_leave',
    payrollType: 'baja',
    documentCategory: 'licenses',
  },
  contrato_comercial: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_commercial_contract',
    documentCategory: 'contracts',
  },
  contrato_alquiler: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_rental_contract',
    documentCategory: 'contracts',
  },
  presupuesto: {
    module: 'finanzas',
    database: () => getInvoicesDbName(),
    builder: 'buildInvoiceDocument',
    action: 'create_quote',
    documentCategory: 'financial',
  },
  documento_cliente: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_client_document',
    documentCategory: 'other',
  },
  documento_vertical: {
    module: 'verticales',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_vertical_document',
    documentCategory: 'other',
  },
  baja_temporal: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_deregistration_temp',
    documentCategory: 'baja-destruccion',
    isScrapyard: true,
  },
  baja_definitiva: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_deregistration_final',
    documentCategory: 'baja-destruccion',
    isScrapyard: true,
  },
  certificado_destruccion: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_destruction_cert',
    documentCategory: 'baja-destruccion',
    isScrapyard: true,
  },
  certificado_descontaminacion: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_decontamination_cert',
    documentCategory: 'medioambiental',
    isScrapyard: true,
  },
  acta_retirada: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_removal_act',
    documentCategory: 'compra-retirada',
    isScrapyard: true,
  },
  albaran_grua: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_tow_note',
    documentCategory: 'compra-retirada',
    isScrapyard: true,
  },
  doc_tasacion: {
    module: 'desguace',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'create_appraisal',
    documentCategory: 'vehiculo',
    isScrapyard: true,
  },
  // ── Compraventa / vehículo ────────────────────────────────────────────────
  permiso_circulacion: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'vehiculo',
  },
  ficha_tecnica: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'vehiculo',
  },
  itv: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'vehiculo',
  },
  contrato_compra: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'contratos',
  },
  contrato_venta: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'contratos',
  },
  factura_compra: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'facturas',
  },
  factura_venta: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'facturas',
  },
  seguro: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'vehiculo',
  },
  reparacion: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'reparacion',
  },
  informe_trafico: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'vehiculo',
  },
  otro: {
    module: 'documentacion',
    database: () => getDocumentsDbName(),
    builder: 'buildDocumentRecord',
    action: 'archive_document',
    documentCategory: 'other',
  },
};

// ─── Vertical detection via keywords ─────────────────────────────────────────

const VERTICAL_KEYWORDS = {
  construccion: {
    keywords: ['certificación', 'medición', 'obra', 'presupuesto obra', 'albañil', 'cimentación', 'hormigón'],
    database: () => getConstructionDbName(),
    module: 'construccion',
  },
  taller: {
    keywords: ['orden de trabajo', 'reparación', 'diagnóstico', 'taller', 'mecánico', 'vehículo'],
    database: () => getWorkshopDbName(),
    module: 'taller',
  },
  inmobiliaria: {
    keywords: ['arrendamiento', 'escritura', 'propiedad', 'alquiler', 'hipoteca', 'inquilino'],
    database: () => getDocumentsDbName(),
    module: 'inmobiliaria',
  },
  abogados: {
    keywords: ['sentencia', 'demanda', 'auto', 'providencia', 'juzgado', 'tribunal', 'letrado'],
    database: () => getDocumentsDbName(),
    module: 'abogados',
  },
  clinica: {
    keywords: ['historia clínica', 'diagnóstico médico', 'tratamiento', 'paciente', 'receta'],
    database: () => getDocumentsDbName(),
    module: 'clinica',
  },
  veterinaria: {
    keywords: ['vacunación', 'desparasitación', 'mascota', 'veterinario'],
    database: () => getDocumentsDbName(),
    module: 'veterinaria',
  },
  desguace: {
    keywords: [
      'baja definitiva', 'baja temporal', 'certificado de destrucción', 'centro autorizado de tratamiento',
      'descontaminación', 'residuos peligrosos', 'chatarra', 'desguace', 'acta de retirada',
      'albarán de grúa', 'vehículo fuera de uso', 'VFU', 'compactación',
    ],
    database: () => getDocumentsDbName(),
    module: 'desguace',
  },
};

function detectVertical(ocrData) {
  const textToSearch = [
    ocrData.documentTypeLabel,
    ocrData.notes,
    ocrData.emitter,
    ...(ocrData.lines || []).map((l) => l.description),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const [key, config] of Object.entries(VERTICAL_KEYWORDS)) {
    for (const kw of config.keywords) {
      const normalizedKw = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (textToSearch.includes(normalizedKw)) {
        return { vertical: key, ...config };
      }
    }
  }
  return null;
}

// ─── Expense category detection ──────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  { keywords: ['combustible', 'gasolinera', 'gasolina', 'diesel', 'carburante', 'repsol', 'cepsa', 'bp'], category: 'Transporte', icon: '⛽', color: '#f59e0b' },
  { keywords: ['restaurante', 'comida', 'cafetería', 'bar', 'menú', 'catering'], category: 'Dietas', icon: '🍽️', color: '#ef4444' },
  { keywords: ['hotel', 'alojamiento', 'hostal', 'pensión', 'booking'], category: 'Viajes', icon: '🏨', color: '#8b5cf6' },
  { keywords: ['material', 'ferretería', 'herramienta', 'suministro'], category: 'Material', icon: '🔧', color: '#6366f1' },
  { keywords: ['teléfono', 'internet', 'móvil', 'fibra', 'vodafone', 'movistar', 'orange'], category: 'Comunicaciones', icon: '📱', color: '#06b6d4' },
  { keywords: ['seguro', 'póliza', 'aseguradora', 'mutua'], category: 'Seguros', icon: '🛡️', color: '#10b981' },
  { keywords: ['alquiler', 'renta', 'arrendamiento', 'local'], category: 'Alquiler', icon: '🏢', color: '#64748b' },
  { keywords: ['luz', 'electricidad', 'agua', 'gas', 'energía', 'endesa', 'iberdrola'], category: 'Suministros', icon: '💡', color: '#eab308' },
  { keywords: ['asesoría', 'gestoría', 'abogado', 'notario', 'consultoría'], category: 'Servicios profesionales', icon: '👔', color: '#0ea5e9' },
  { keywords: ['publicidad', 'marketing', 'google ads', 'meta', 'anuncio'], category: 'Marketing', icon: '📢', color: '#ec4899' },
];

function detectExpenseCategory(ocrData) {
  const textToSearch = [ocrData.emitter, ocrData.notes, ...(ocrData.lines || []).map((l) => l.description)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const cat of EXPENSE_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (textToSearch.includes(kw)) {
        return { category: cat.category, categoryIcon: cat.icon, categoryColor: cat.color };
      }
    }
  }
  return { category: 'General', categoryIcon: '📄', categoryColor: '#94a3b8' };
}

// ─── Main classifier ────────────────────────────────────────────────────────

export function classifyDocument(ocrResult) {
  const docType = ocrResult?.documentType || 'otro';
  let route = ROUTE_TABLE[docType] || ROUTE_TABLE.otro;

  if (docType === 'documento_vertical') {
    const detected = detectVertical(ocrResult);
    if (detected) {
      route = { ...route, database: detected.database, module: detected.module };
    }
  }

  const expenseCategory = ['ticket_gasto', 'recibo'].includes(docType)
    ? detectExpenseCategory(ocrResult)
    : null;

  const destination = {
    module: route.module,
    database: route.database(),
    builder: route.builder,
    action: route.action,
    documentCategory: route.documentCategory,
    financeType: route.financeType || null,
    payrollType: route.payrollType || null,
    expenseCategory,
  };

  logger.info({ tag: 'OCR-CLASSIFY', docType, module: destination.module, action: destination.action }, 'Document classified');

  return destination;
}

/**
 * Determine if proposal should be auto-approved based on confidence thresholds.
 */
export function shouldAutoApprove(ocrResult, entityMatches, validationResult) {
  if (!validationResult.isValid) return false;
  if (validationResult.errors.length > 0) return false;

  const docType = ocrResult?.documentType || '';
  const supplierDocTypes = ['factura_proveedor', 'albaran'];
  if (supplierDocTypes.includes(docType)) {
    const supplierMatch = (entityMatches || []).find((m) => m.matchType === 'supplier');
    if (!supplierMatch?.matchedEntity || supplierMatch.suggestNew) {
      return false;
    }
  }

  const confidence = ocrResult?.confidenceScore || 0;
  if (confidence < 85) return false;

  const criticalWarnings = (validationResult.warnings || []).filter(
    (w) => w.code === 'INCOMPLETE_READ' || w.code === 'UNCATEGORIZED',
  );
  if (criticalWarnings.length > 0) return false;

  const bestEntityMatch = entityMatches?.[0];
  if (bestEntityMatch && bestEntityMatch.confidence < 80) return false;

  return true;
}
