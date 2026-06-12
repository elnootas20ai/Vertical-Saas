/**
 * Clasificación de alertas por plan comercial: Básico · Normal · Pro
 * Una sola fuente de verdad para el catálogo y la UI.
 */

/**
 * Plan Básico — mínimo (casi no se vende).
 * Solo avisos informativos o de muy bajo nivel.
 */
export const BASIC_ALERT_RULE_IDS = new Set([
  'lead_new',
  'sale_cancelled',
  'payment_received',
  'worker_no_clockin',
  'stock_low',
  'low_stock',
  'delivery_no_address',
  'delivery_register_not_opened',
]);

/** Verticales y operaciones especializadas (no delivery puro). */
export const PRO_ALERT_DEPARTMENTS = new Set([
  'limpieza',
  'construccion',
  'verticales',
  'sistema',
]);

/**
 * Plan Pro — el más completo (mayor volumen de alertas).
 * Finanzas avanzadas, fiscal, proveedores, documentación, márgenes, canales y patrones.
 */
export const DELIVERY_PRO_ALERT_RULE_IDS = new Set([
  // Delivery estratégico
  'delivery_low_margin',
  'delivery_channel_silent',
  'delivery_repeat_incident_client',
  'delivery_driver_mismatch',
  'delivery_channel_incident',
  // Finanzas y compras avanzadas
  'negative_cash_flow',
  'low_sales_velocity',
  'low_avg_margin',
  'bank_unreconciled',
  'tax_deadline_overdue',
  'tax_deadline_approaching',
  'invoice_pending_validation',
  'supplier_invoice_duplicate',
  'pending_validation_invoice',
  'duplicate_invoice',
  'invoice_missing_document',
  'overdue_client_invoice',
  'unpaid_client_invoice',
  'client_multiple_pending',
  'overdue_purchase',
  'high_payables',
  'expense_without_document',
  'excess_preparation_cost',
  'supplier_invoice_pending',
  'supplier_invoice_unknown',
  'supplier_invoice_overdue',
  // RRHH y documentación avanzada
  'worker_absent_pattern',
  'worker_overtime',
  'contract_expiring',
  'document_expired',
  'document_expiring',
  'document_expiring_soon',
  'document_missing_required',
  'fleet_itv_expiring',
  'fleet_insurance_expiring',
  'itv_expired',
  'itv_expiring',
  'missing_vehicle_docs',
  'contract_pending_sign',
  'signature_pending',
  'signature_rejected',
  'signature_expiring',
  'ocr_incomplete',
]);

/** Reglas de departamento operaciones que son de verticales concretas → Pro. */
export const PRO_ALERT_RULE_IDS = new Set([
  ...DELIVERY_PRO_ALERT_RULE_IDS,
  'stale_web_order',
  'vehicle_missing_docs',
  'vehicle_missing_price',
  'vehicle_duplicate_plate',
  'vehicle_duplicate_vin',
  'vehicle_stock_aging',
  'parts_low_stock',
  'workshop_ready',
  'workshop_delayed',
  'stale_work_order',
  // Desguace
  'scrapyard_reservation_expired',
  'scrapyard_order_pending_ship',
  'scrapyard_sale_unpaid',
  'scrapyard_sold_not_delivered',
  'scrapyard_worker_no_clockin',
  'scrapyard_worker_overtime',
  'scrapyard_worker_doc_expired',
  'scrapyard_worker_low_perf',
  'scrapyard_task_pending_overdue',
  'scrapyard_task_unassigned',
  'part_missing_price',
  'part_missing_location',
  'part_duplicate_reference',
  'part_missing_photos',
  'dismantling_stalled',
  'acquisition_missing_docs',
  'acquisition_excessive_cost',
  // Carnicería
  'butcher_product_out_of_stock',
  'butcher_stock_critical',
  'butcher_stock_low',
  'butcher_batch_expired',
  'butcher_batch_expiring_soon',
  'butcher_waste_high',
  'butcher_waste_repeated',
  'butcher_waste_expired_product',
  'butcher_register_pending',
  'butcher_scale_disconnected',
  // Compraventa
  'cv_vehicle_missing_docs',
  'cv_reservation_expired',
  'cv_sale_unpaid',
  'cv_vehicle_stagnant',
  'cv_low_avg_margin',
]);

export const ALERT_PLAN_TIER_LABELS = {
  basic: 'Básico',
  normal: 'Normal',
  pro: 'Pro',
};

/**
 * Resuelve el plan mínimo requerido para una regla.
 * - basic: listado explícito
 * - pro: departamento vertical o regla vertical
 * - normal: operación delivery, caja, pedidos e impagos (plan recomendado)
 * - pro: finanzas avanzadas, fiscal, proveedores, documentación, márgenes…
 */
export function resolveAlertPlanTier(ruleId, department) {
  if (BASIC_ALERT_RULE_IDS.has(ruleId)) return 'basic';
  if (PRO_ALERT_DEPARTMENTS.has(department)) return 'pro';
  if (PRO_ALERT_RULE_IDS.has(ruleId)) return 'pro';
  return 'normal';
}

export function isDeliveryVertical(vertical) {
  return !vertical || vertical === 'delivery';
}

/** Siempre tres ramas: Básico · Normal · Pro */
export function getVisiblePlanTiersForVertical() {
  return ['basic', 'normal', 'pro'];
}

export function alertTierDescription(tier, vertical = 'delivery') {
  if (isDeliveryVertical(vertical)) {
    if (tier === 'basic') {
      return 'Plan de entrada con avisos mínimos: leads, ventas canceladas, stock bajo y recordatorios simples.';
    }
    if (tier === 'normal') {
      return 'El plan recomendado: pedidos, cocina, reparto, caja, impagos y operación diaria del restaurante.';
    }
    return 'El más completo: finanzas avanzadas, fiscal, proveedores, documentación, márgenes, canales y control inteligente.';
  }
  if (tier === 'basic') {
    return 'Pedidos, caja, stock crítico, impagos y fichajes. Incluidas desde el plan Básico.';
  }
  if (tier === 'normal') {
    return 'Delivery avanzado, finanzas, RRHH, documentación, compras y catálogo. Plan Normal.';
  }
  return 'Otras verticales del software y alertas de sistema. Plan Pro.';
}
