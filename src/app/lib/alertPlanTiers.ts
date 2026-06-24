import type { AlertRule, AlertRuleDepartment } from './settingsApi';
import { ruleDepartment } from './settingsApi';
import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { PLAN_TIER_LABELS } from './pointOfSaleLimits';

export type AlertPlanTier = 'basic' | 'normal' | 'pro';

export const ALERT_PLAN_TIER_ORDER: AlertPlanTier[] = ['basic', 'normal', 'pro'];

export const ALERT_PLAN_TIER_LABELS: Record<AlertPlanTier, string> = {
  basic: PLAN_TIER_LABELS.basic,
  normal: PLAN_TIER_LABELS.normal,
  pro: PLAN_TIER_LABELS.pro,
};

const TIER_RANK: Record<AlertPlanTier, number> = {
  basic: 0,
  normal: 1,
  pro: 2,
};

/** Plan Básico — mínimo (casi no se vende). */
const BASIC_ALERT_RULE_IDS = new Set([
  'lead_new',
  'sale_cancelled',
  'payment_received',
  'worker_no_clockin',
  'stock_low',
  'low_stock',
  'delivery_no_address',
  'delivery_register_not_opened',
]);

const PRO_ALERT_DEPARTMENTS = new Set<AlertRuleDepartment>([
  'limpieza',
  'construccion',
  'verticales',
  'sistema',
]);

/** Plan Pro — el más completo. */
const DELIVERY_PRO_ALERT_RULE_IDS = new Set([
  'delivery_low_margin',
  'delivery_channel_silent',
  'delivery_repeat_incident_client',
  'delivery_driver_mismatch',
  'delivery_channel_incident',
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

const PRO_ALERT_RULE_IDS = new Set([
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
  'cv_vehicle_missing_docs',
  'cv_reservation_expired',
  'cv_sale_unpaid',
  'cv_vehicle_stagnant',
  'cv_low_avg_margin',
]);

export function isDeliveryVertical(vertical: string | null | undefined): boolean {
  return !vertical || vertical === 'delivery';
}

/** Siempre tres ramas en ajustes: Básico · Normal · Pro */
export function getVisiblePlanTiersForVertical(_vertical?: string | null): AlertPlanTier[] {
  return ALERT_PLAN_TIER_ORDER;
}

/** Siempre desde el catálogo actual — ignora planTier guardado en cuenta (puede estar desactualizado). */
export function inferRulePlanTier(rule: Pick<AlertRule, 'id' | 'department' | 'category'>): AlertPlanTier {
  if (BASIC_ALERT_RULE_IDS.has(rule.id)) return 'basic';
  const dept = ruleDepartment(rule);
  if (PRO_ALERT_DEPARTMENTS.has(dept)) return 'pro';
  if (PRO_ALERT_RULE_IDS.has(rule.id)) return 'pro';
  return 'normal';
}

export function syncRulesPlanTier<T extends Pick<AlertRule, 'id' | 'department' | 'category' | 'planTier'>>(rules: T[]): T[] {
  return rules.map((rule) => ({
    ...rule,
    planTier: inferRulePlanTier(rule),
  }));
}

export function canAccessAlertTier(userTier: SubscriptionPlanTier, ruleTier: AlertPlanTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[ruleTier];
}

export function alertTierDescription(tier: AlertPlanTier, vertical?: string | null): string {
  if (isDeliveryVertical(vertical)) {
    if (tier === 'basic') {
      return 'Plan de entrada con avisos mínimos: leads, ventas canceladas, stock bajo y recordatorios simples.';
    }
    if (tier === 'normal') {
      return 'El plan recomendado para el gerente: caja, incidencias, impagos, fichajes y control del negocio.';
    }
    return 'El más completo: finanzas avanzadas, fiscal, proveedores, documentación, márgenes, canales y control inteligente.';
  }
  if (tier === 'basic') {
    return 'Pedidos, caja, stock crítico, impagos y fichajes. Incluidas desde el plan Básico.';
  }
  if (tier === 'normal') {
    return 'Delivery avanzado, finanzas, RRHH, documentación, compras y catálogo. Plan Normal.';
  }
  return 'Otras verticales del software (limpieza, construcción, desguace, etc.) y alertas de sistema. Plan Pro.';
}

export function alertTierExamples(tier: AlertPlanTier, vertical?: string | null): string {
  if (isDeliveryVertical(vertical)) {
    if (tier === 'basic') {
      return 'Ej.: nuevo lead, venta cancelada, stock bajo, caja sin abrir, trabajador sin fichar.';
    }
    if (tier === 'normal') {
      return 'Ej.: caja sin cerrar, descuadre, pedido cancelado, impago, trabajador sin fichar, producto agotado.';
    }
    return 'Ej.: margen bajo, canal sin pedidos, factura vencida, banco sin conciliar, contrato por firmar.';
  }
  if (tier === 'basic') {
    return 'Ej.: pedido retrasado, cocina llena, caja sin cerrar, sin stock, trabajador sin fichar.';
  }
  if (tier === 'normal') {
    return 'Ej.: margen bajo, canal silencioso, facturas, contratos, compras a proveedor.';
  }
  return 'Ej.: rutas de limpieza, obras, desguace, carnicería, compraventa, accesos al sistema.';
}

/** Título de sección en ajustes (delivery usa nombres más claros). */
export function alertTierSectionTitle(tier: AlertPlanTier, vertical?: string | null): string {
  if (isDeliveryVertical(vertical)) {
    if (tier === 'basic') return 'Esenciales';
    if (tier === 'normal') return 'Gestión';
    return 'Pro';
  }
  return ALERT_PLAN_TIER_LABELS[tier];
}

export function alertTierSubtitle(tier: AlertPlanTier, vertical?: string | null): string {
  if (isDeliveryVertical(vertical)) {
    if (tier === 'basic') return 'Avisos mínimos de entrada';
    if (tier === 'normal') return 'Operación diaria — plan recomendado';
    return 'Control total del negocio';
  }
  if (tier === 'basic') return 'Alertas imprescindibles';
  if (tier === 'normal') return 'Gestión y seguimiento';
  return 'Control avanzado del negocio';
}
