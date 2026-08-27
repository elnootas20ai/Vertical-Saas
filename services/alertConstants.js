/**
 * Alert Constants — Constantes centralizadas del sistema de alertas globales.
 *
 * Importar desde aquí en alertEngine, alertController, alertEmitter, etc.
 * para evitar duplicación y mantener consistencia.
 */

export const ALERT_PRIORITIES = ['high', 'medium', 'low'];

export const ALERT_STATUSES = ['new', 'seen', 'resolved'];

export const ALERT_SOURCES = [
  'finanzas',
  'stock',
  'equipo',
  'documentacion',
  'verticales',
  'delivery',
  'construccion',
  'limpieza',
  'ocr',
  'conciliacion',
  'crm',
  'taller',
  'carniceria',
  'compraventa',
  'adquisiciones',
  'desguaces',
  'sistema',
];

export const SCRAPYARD_ALERTS = {
  PART_MISSING_PRICE: 'part_missing_price',
  PART_MISSING_LOCATION: 'part_missing_location',
  PART_DUPLICATE_REFERENCE: 'part_duplicate_reference',
  PART_MISSING_PHOTOS: 'part_missing_photos',
  DISMANTLING_STALLED: 'dismantling_stalled',
};

export const ALERT_CHANNELS = ['inApp', 'push', 'email', 'sms'];

export const LEVEL_TO_PRIORITY = {
  alert: 'high',
  warning: 'medium',
  info: 'low',
  success: 'low',
};

export const PRIORITY_TO_LEVEL = {
  high: 'alert',
  medium: 'warning',
  low: 'info',
};

export const CATEGORY_TO_SOURCE = {
  out_of_stock: 'stock',
  supplier_price_changed: 'stock',
  low_stock: 'stock',
  stock_inventory_discrepancy: 'stock',
  stock_count_worker_progress: 'stock',
  stock_count_completed: 'stock',
  stock_purchase_list_ready: 'stock',
  parts_low_stock: 'stock',
  overdue_purchase: 'finanzas',
  high_payables: 'finanzas',
  stale_web_order: 'verticales',
  stale_delivery: 'verticales',
  vehicle_stock_aging: 'stock',
  stale_work_order: 'taller',
  low_sales_velocity: 'finanzas',
  payment_received: 'finanzas',
  payment_overdue: 'finanzas',
  negative_cash_flow: 'finanzas',
  recurring_payment_due: 'finanzas',
  client_payment_overdue: 'finanzas',
  invoice_pending_validation: 'ocr',
  ocr_scan_failed: 'ocr',
  bank_unreconciled: 'conciliacion',
  bank_reconciliation_mismatch: 'conciliacion',
  worker_no_clockin: 'equipo',
  worker_late_clockin: 'equipo',
  worker_overtime: 'equipo',
  worker_absent_pattern: 'equipo',
  contract_expiring: 'equipo',
  document_expired: 'documentacion',
  document_expiring_soon: 'documentacion',
  document_missing_required: 'documentacion',
  fleet_itv_expiring: 'documentacion',
  fleet_insurance_expiring: 'documentacion',
  purchase_order_delayed: 'stock',
  purchase_order_partial: 'stock',
  booking_no_show: 'verticales',
  service_overdue: 'verticales',
  capacity_alert: 'verticales',
  recurring_client_inactive: 'crm',
  lead_new: 'crm',
  lead_stale: 'crm',
  sale_completed: 'finanzas',
  sale_cancelled: 'finanzas',
  system_update: 'sistema',
  user_login_new: 'sistema',
  user_role_changed: 'sistema',

  // Scrapyard / Desguace
  scrapyard_pending_deregistration: 'desguaces',
  scrapyard_no_destruction_cert: 'desguaces',
  scrapyard_part_no_price: 'desguaces',
  scrapyard_part_no_location: 'desguaces',
  scrapyard_sale_unpaid: 'desguaces',
  scrapyard_order_pending_ship: 'desguaces',
  scrapyard_stale_stock: 'desguaces',
  scrapyard_vehicle_missing_docs: 'desguaces',
  scrapyard_unjustified_purchase: 'desguaces',
  scrapyard_dismantling_stale: 'desguaces',
  scrapyard_pending_dismantling: 'desguaces',
  scrapyard_low_extraction_rate: 'desguaces',
  scrapyard_low_margin: 'desguaces',
  scrapyard_avg_margin_low: 'desguaces',
  scrapyard_reservation_expired: 'desguaces',
  scrapyard_sold_not_delivered: 'desguaces',
  part_missing_price: 'desguaces',
  part_missing_location: 'desguaces',
  part_duplicate_reference: 'desguaces',
  part_missing_photos: 'desguaces',
  dismantling_stalled: 'desguaces',

  // Scrapyard Workers / Operativa
  scrapyard_worker_no_clockin: 'desguaces',
  scrapyard_worker_overtime: 'desguaces',
  scrapyard_worker_doc_expired: 'desguaces',
  scrapyard_worker_low_perf: 'desguaces',
  scrapyard_task_pending_overdue: 'desguaces',
  scrapyard_task_unassigned: 'desguaces',

  // Acquisitions (desguace)
  acquisition_missing_docs: 'adquisiciones',
  acquisition_excessive_cost: 'adquisiciones',
  acquisition_unclosed: 'adquisiciones',
  acquisition_unjustified_expense: 'adquisiciones',

  // Delivery
  delivery_delayed_order: 'delivery',
  delivery_kitchen_saturated: 'delivery',
  delivery_queue_overflow: 'delivery',
  delivery_product_out_of_stock: 'delivery',
  delivery_product_low_stock: 'delivery',
  delivery_rider_saturated: 'delivery',
  delivery_no_active_riders: 'delivery',
  delivery_unassigned_order: 'delivery',
  delivery_cash_pending_close: 'delivery',
  delivery_register_not_opened: 'delivery',
  delivery_cash_discrepancy: 'delivery',
  delivery_register_closed_ok: 'delivery',
  delivery_register_closed_discrepancy: 'delivery',
  delivery_register_next_day_initial_over: 'delivery',
  delivery_order_very_delayed: 'delivery',
  delivery_channel_silent: 'delivery',
  delivery_low_margin: 'delivery',
  delivery_failed_delivery: 'delivery',
  delivery_unpaid_order: 'delivery',
  delivery_repeat_incident_client: 'delivery',

  // Construcción
  construction_budget_no_response: 'construccion',
  construction_project_no_responsible: 'construccion',
  construction_project_inactive: 'construccion',
  construction_worker_no_report: 'construccion',
  construction_collection_upcoming: 'construccion',
  construction_collection_overdue: 'construccion',
  construction_collection_partial_pending: 'construccion',
  construction_collection_project_finished_open: 'construccion',
  construction_payment_overdue: 'construccion',
  construction_payment_unjustified: 'construccion',
  construction_document_pending: 'construccion',
  construction_document_expired: 'construccion',
  construction_doc_obligatorio_faltante: 'construccion',
  construction_doc_firma_pendiente: 'construccion',
  construction_doc_licencia_caducada: 'construccion',
  construction_doc_duplicado: 'construccion',
  construction_incident_critical: 'construccion',
  construction_incident_unreviewed: 'construccion',
  construction_cost_overrun: 'construccion',
  construction_cost_warning: 'construccion',
  construction_project_unclosed: 'construccion',
  construction_task_overdue: 'construccion',

  // Limpieza
  cleaning_service_uncovered: 'limpieza',
  cleaning_worker_absent: 'limpieza',
  cleaning_clockin_pending: 'limpieza',
  cleaning_incident_open: 'limpieza',
  cleaning_incident_critical: 'limpieza',
  cleaning_client_unpaid: 'limpieza',
  cleaning_contract_renewal: 'limpieza',
  cleaning_material_critical: 'limpieza',
  cleaning_material_depleted: 'limpieza',
  cleaning_route_delayed: 'limpieza',
  cleaning_excess_hours: 'limpieza',
  cleaning_service_overtime: 'limpieza',
  cleaning_no_photos: 'limpieza',
  cleaning_incomplete_checklist: 'limpieza',

  // Carnicería — Merma y pérdidas
  butcher_waste_high: 'carniceria',
  butcher_waste_repeated: 'carniceria',
  butcher_waste_expired_product: 'carniceria',
  butcher_waste_batch_loss: 'carniceria',
  butcher_order_overdue_pickup: 'carniceria',
  butcher_special_not_prepared: 'carniceria',
  butcher_order_late: 'carniceria',
  butcher_reservations_today: 'carniceria',

  // Compraventa
  cv_vehicle_missing_docs: 'compraventa',
  cv_stock_itv_expired: 'compraventa',
  cv_stock_itv_expiring: 'compraventa',
  cv_reservation_no_contract: 'compraventa',
  cv_reservation_expired: 'compraventa',
  cv_sale_unpaid: 'compraventa',
  cv_vehicle_stagnant: 'compraventa',
  cv_expense_no_invoice: 'compraventa',
  cv_price_below_minimum: 'compraventa',
  cv_low_avg_margin: 'compraventa',
  cv_lead_no_followup: 'compraventa',
  cv_pending_delivery: 'compraventa',
};

export function normalizePriority(value) {
  return ALERT_PRIORITIES.includes(value) ? value : 'medium';
}

export function normalizeStatus(value) {
  return ALERT_STATUSES.includes(value) ? value : 'new';
}

export function normalizeSource(value) {
  return ALERT_SOURCES.includes(value) ? value : 'sistema';
}

export function derivePriorityFromLevel(level) {
  return LEVEL_TO_PRIORITY[level] || 'medium';
}

export function deriveSourceFromCategory(category) {
  return CATEGORY_TO_SOURCE[category] || 'sistema';
}
