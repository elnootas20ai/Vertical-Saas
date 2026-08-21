/**
 * Catálogo maestro de reglas enchufables para el CEO (notificaciones / alertas).
 * El `id` debe coincidir con ruleId o category que emite cada motor (emitGlobalAlert).
 */

import { resolveAlertPlanTier } from './alertPlanTiers.js';

/** Roles que reciben alertas de gestión (owner siempre incluido en emisor). */
export const MANAGER_RECIPIENT_ROLES = ['Admin', 'Gerente', 'Administrador', 'Encargado'];

function r(id, category, department, label, description, opts = {}) {
  return {
    id,
    category,
    department,
    label,
    description,
    planTier: opts.planTier || resolveAlertPlanTier(id, department),
    enabled: opts.enabled !== false,
    channels: opts.channels || ['inApp'],
    urgency: opts.urgency || 'medium',
    schedule: opts.schedule || 'instant',
    recipientRoles: opts.recipientRoles || [...MANAGER_RECIPIENT_ROLES],
    customRecipients: [],
  };
}

const pushInApp = { channels: ['push', 'inApp'] };
const pushEmail = { channels: ['push', 'email', 'inApp'] };

export const ALERT_RULE_DEPARTMENTS = [
  'delivery',
  'finanzas',
  'rrhh',
  'operaciones',
  'limpieza',
  'construccion',
  'verticales',
  'sistema',
];

export const ALL_ALERT_RULE_DEFINITIONS = [
  // ─── Delivery / caja / operación restaurante ─────────────────────────────
  r('delivery_delayed_order', 'delivery', 'delivery', 'Pedido retrasado (por fase)', 'Pedido que supera el tiempo máximo en su estado actual', { ...pushInApp, urgency: 'high' }),
  r('delivery_order_very_delayed', 'delivery', 'delivery', 'Pedido muy retrasado', 'Pedido activo que supera el tiempo total desde que se creó (por defecto 1 h)', { ...pushEmail, urgency: 'high' }),
  r('delivery_kitchen_saturated', 'delivery', 'delivery', 'Cocina saturada', 'Demasiados pedidos en cocina respecto a la capacidad', { ...pushInApp, urgency: 'high', enabled: false }),
  r('delivery_queue_overflow', 'delivery', 'delivery', 'Cola de cocina desbordada', 'Pedidos en cola y cocina por encima de la capacidad', { ...pushInApp, urgency: 'high', enabled: false }),
  r('delivery_product_out_of_stock', 'delivery', 'delivery', 'Producto agotado en carta', 'Producto activo sin stock disponible', { urgency: 'high' }),
  r('delivery_product_low_stock', 'delivery', 'delivery', 'Stock bajo en producto de carta', 'Producto con stock por debajo del mínimo o alta demanda', { urgency: 'medium' }),
  r('delivery_rider_saturated', 'delivery', 'delivery', 'Reparto saturado', 'Demasiados pedidos por repartidor activo', { ...pushInApp, urgency: 'high', enabled: false }),
  r('delivery_no_active_riders', 'delivery', 'delivery', 'Sin repartidores activos', 'Hay pedidos esperando reparto y ningún rider disponible', { ...pushInApp, urgency: 'high', enabled: false }),
  r('delivery_unassigned_order', 'delivery', 'delivery', 'Pedido sin repartidor', 'Pedido en reparto sin repartidor asignado', { urgency: 'medium' }),
  r('delivery_cash_pending_close', 'delivery', 'pdvs', 'Caja sin cerrar', 'Caja abierta después de la hora límite o demasiadas horas', { ...pushEmail, urgency: 'high' }),
  r('delivery_register_not_opened', 'delivery', 'pdvs', 'Caja sin abrir', 'Terminal activo sin sesión de caja abierta hoy', { ...pushInApp, urgency: 'high' }),
  r('delivery_cash_discrepancy', 'delivery', 'pdvs', 'Descuadre de caja', 'Diferencia al cerrar caja respecto al esperado', { ...pushEmail, urgency: 'critical' }),
  r('delivery_register_closed_ok', 'delivery', 'pdvs', 'Caja cerrada correctamente', 'Alerta positiva: cierre TPV sin descuadre', { channels: ['inApp'], urgency: 'low' }),
  r('delivery_register_closed_discrepancy', 'delivery', 'pdvs', 'Caja cerrada con descuadre', 'Alerta negativa: cierre TPV con diferencia de efectivo', { ...pushEmail, urgency: 'critical' }),
  r('delivery_register_next_day_initial_over', 'delivery', 'pdvs', 'Inicial mañana > contado', 'Al cerrar dejaron más fondo para mañana del efectivo contado: hay que añadir dinero al cajón', { ...pushEmail, urgency: 'high' }),
  r('delivery_channel_silent', 'delivery', 'delivery', 'Canal sin actividad', 'Canal de pedidos (web, app, agregador) sin pedidos en X minutos', { urgency: 'medium' }),
  r('delivery_low_margin', 'delivery', 'delivery', 'Margen bajo en delivery', 'Margen estimado del día por debajo del umbral', { urgency: 'medium' }),
  r('delivery_failed_delivery', 'delivery', 'delivery', 'Entrega fallida', 'Pedido que falló o se canceló tras salir a reparto', { ...pushInApp, urgency: 'high' }),
  r('delivery_unpaid_order', 'delivery', 'delivery', 'Pedido sin cobrar', 'Pedido entregado con pago pendiente demasiado tiempo', { ...pushInApp, urgency: 'high' }),
  r('delivery_repeat_incident_client', 'delivery', 'delivery', 'Cliente reincidente en incidencias', 'Mismo cliente con varias incidencias en el periodo configurado', { enabled: false, urgency: 'low' }),
  r('delivery_driver_mismatch', 'delivery', 'pdvs', 'Descuadre caja repartidor', 'Diferencia al cerrar la caja de un repartidor', { enabled: false, ...pushInApp, urgency: 'high' }),
  r('stale_delivery', 'delivery', 'delivery', 'Pedido delivery estancado (legacy)', 'Obsoleto: usar «Pedido retrasado» (motor delivery por fase)', { enabled: false, ...pushInApp, urgency: 'high' }),
  r('delivery_unattended', 'delivery', 'delivery', 'Pedido nuevo sin atender (legacy)', 'Obsoleto: cubierto por retraso en fase «nuevo»', { enabled: false, urgency: 'high' }),
  r('delivery_unpaid', 'delivery', 'delivery', 'Cobro pendiente (legacy)', 'Obsoleto: usar «Pedido sin cobrar» (motor delivery)', { enabled: false, urgency: 'medium' }),
  r('delivery_no_address', 'delivery', 'delivery', 'Pedido sin dirección', 'Pedido a domicilio sin dirección de entrega', { urgency: 'medium' }),
  r('delivery_channel_incident', 'delivery', 'delivery', 'Canal con incidencias', 'Varias incidencias en un canal de pedidos', { urgency: 'high' }),
  r('register_high_return', 'delivery', 'pdvs', 'Devoluciones elevadas en caja', 'Importe de devoluciones del día por encima del umbral', { ...pushInApp, urgency: 'medium' }),
  r('delivery_order_cancelled', 'delivery', 'delivery', 'Pedido cancelado', 'Un trabajador o el TPV canceló un pedido', { ...pushInApp, urgency: 'high' }),

  // ─── Sala (bar / restaurante) ─────────────────────────────────────────────
  r('sala_long_occupied_table', 'sala', 'restaurant', 'Mesa abierta demasiado tiempo', 'Mesa ocupada sin cobrar más tiempo del límite configurado', { ...pushInApp, urgency: 'medium' }),
  r('sala_served_pending_close', 'sala', 'restaurant', 'Mesa pendiente de cobro', 'Mesa servida o en cobro pendiente demasiado tiempo', { ...pushInApp, urgency: 'medium' }),
  r('sala_slow_kitchen_comanda', 'sala', 'restaurant', 'Comanda lenta en cocina', 'Comanda enviada a cocina que supera el tiempo máximo de preparación', { ...pushInApp, urgency: 'high' }),
  r('sala_incident', 'sala', 'restaurant', 'Incidencia en sala', 'Ítems cancelados u otras incidencias en una mesa', { urgency: 'medium' }),
  r('sala_waitlist_notified', 'sala', 'restaurant', 'Cliente de espera avisado', 'El equipo avisó a un cliente de la lista de espera', { ...pushInApp, urgency: 'low' }),

  // ─── Finanzas / compras / conciliación / OCR ─────────────────────────────
  r('payment_received', 'finanzas', 'finanzas', 'Pago recibido', 'Se registra un cobro o pago', { enabled: false, urgency: 'low' }),
  r('payment_overdue', 'finanzas', 'finanzas', 'Pago vencido', 'Cobro pendiente que supera la fecha de vencimiento', { ...pushEmail, urgency: 'critical' }),
  r('client_payment_overdue', 'finanzas', 'finanzas', 'Impago de cliente', 'Factura de cliente vencida sin cobrar', { ...pushEmail, urgency: 'high' }),
  r('negative_cash_flow', 'finanzas', 'finanzas', 'Flujo de caja negativo', 'Gastos del periodo superan ingresos de forma significativa', { enabled: false, ...pushInApp, urgency: 'high', schedule: 'digest_daily' }),
  r('overdue_client_invoice', 'finanzas', 'finanzas', 'Factura cliente vencida', 'Factura emitida sin cobrar tras el vencimiento', { ...pushEmail, urgency: 'high' }),
  r('unpaid_client_invoice', 'finanzas', 'finanzas', 'Factura cliente sin cobrar', 'Factura con cobro pendiente demasiado tiempo', { urgency: 'medium' }),
  r('client_multiple_pending', 'finanzas', 'finanzas', 'Cliente con varias facturas pendientes', 'Cliente con múltiples facturas sin cobrar', { urgency: 'high' }),
  r('overdue_purchase', 'finanzas', 'finanzas', 'Factura de compra vencida', 'Factura de proveedor vencida sin pagar', { urgency: 'high' }),
  r('high_payables', 'finanzas', 'finanzas', 'Pagos pendientes elevados', 'Importe total de pagables por encima del umbral', { urgency: 'medium' }),
  r('tax_deadline_overdue', 'finanzas', 'finanzas', 'Obligación fiscal vencida', 'Plazo fiscal superado sin presentar', { ...pushEmail, urgency: 'critical' }),
  r('tax_deadline_approaching', 'finanzas', 'finanzas', 'Obligación fiscal próxima', 'Plazo fiscal en los próximos días', { urgency: 'medium', schedule: 'digest_daily' }),
  r('expense_without_document', 'finanzas', 'finanzas', 'Gasto sin documento', 'Gasto registrado sin justificante adjunto', { urgency: 'medium' }),
  r('low_sales_velocity', 'finanzas', 'finanzas', 'Ventas bajas', 'Ventas del periodo por debajo del umbral', { urgency: 'medium', schedule: 'digest_daily' }),
  r('low_avg_margin', 'finanzas', 'finanzas', 'Margen medio bajo', 'Margen medio de operaciones por debajo del objetivo', { urgency: 'medium', schedule: 'digest_daily' }),
  r('excess_preparation_cost', 'finanzas', 'finanzas', 'Coste de preparación elevado', 'Gastos de preparación de vehículo por encima del umbral', { urgency: 'medium' }),
  r('invoice_pending_validation', 'ocr', 'finanzas', 'Factura OCR pendiente de validar', 'Factura escaneada pendiente de revisión manual', { urgency: 'medium', schedule: 'digest_daily' }),
  r('bank_unreconciled', 'conciliacion', 'finanzas', 'Movimientos sin conciliar', 'Movimientos bancarios sin emparejar', { urgency: 'medium', schedule: 'digest_daily' }),
  r('supplier_invoice_pending', 'finanzas', 'finanzas', 'Factura proveedor pendiente', 'Factura de proveedor pendiente de revisión', { urgency: 'medium' }),
  r('supplier_invoice_unknown', 'finanzas', 'finanzas', 'Proveedor desconocido en factura', 'Factura de proveedor no identificado en el sistema', { urgency: 'medium' }),
  r('supplier_invoice_duplicate', 'finanzas', 'finanzas', 'Factura proveedor duplicada', 'Posible factura duplicada de proveedor', { urgency: 'high' }),
  r('supplier_invoice_overdue', 'finanzas', 'finanzas', 'Factura proveedor vencida', 'Factura de proveedor sin pagar tras vencimiento', { urgency: 'high' }),
  r('pending_validation_invoice', 'compras', 'finanzas', 'Compra pendiente de validar', 'Factura de compra pendiente de validación', { urgency: 'medium' }),
  r('duplicate_invoice', 'compras', 'finanzas', 'Factura de compra duplicada', 'Posible duplicado en facturas de compra', { urgency: 'high' }),
  r('invoice_missing_document', 'compras', 'finanzas', 'Factura sin adjunto', 'Factura de compra sin documento asociado', { urgency: 'medium' }),

  // ─── RRHH / equipo ───────────────────────────────────────────────────────
  r('worker_no_clockin', 'equipo', 'rrhh', 'Trabajador no fichó', 'Miembro del equipo sin fichaje en el día', { ...pushInApp, urgency: 'high' }),
  r('worker_late_clockin', 'equipo', 'rrhh', 'Fichaje tardío', 'Entrada después de la hora prevista + tolerancia', { urgency: 'medium' }),
  r('contract_expiring', 'equipo', 'rrhh', 'Contrato próximo a vencer', 'Contrato de trabajador vence en los próximos días', { ...pushEmail, urgency: 'high', schedule: 'digest_daily' }),
  r('worker_overtime', 'equipo', 'rrhh', 'Horas extra', 'Trabajador supera horas extra permitidas', { urgency: 'medium' }),
  r('worker_absent_pattern', 'equipo', 'rrhh', 'Patrón de ausencias', 'Varias ausencias del mismo trabajador', { urgency: 'high' }),

  // ─── Documentación / flota / firmas ──────────────────────────────────────
  r('document_expiring', 'documentos', 'rrhh', 'Documento por vencer', 'Documento próximo a caducar (ITV, seguro, etc.)', { ...pushEmail, urgency: 'high', schedule: 'digest_daily' }),
  r('document_expired', 'documentos', 'rrhh', 'Documento caducado', 'Documento que ya ha vencido', { ...pushEmail, urgency: 'high' }),
  r('document_expiring_soon', 'documentacion', 'rrhh', 'Documento caduca pronto', 'Documento con vencimiento inminente', { ...pushEmail, urgency: 'high' }),
  r('document_missing_required', 'documentacion', 'rrhh', 'Documento obligatorio faltante', 'Falta un documento de sociedad o licencias (Estatutos, CIF, IAE, etc.)', { ...pushInApp, urgency: 'medium' }),
  r('fleet_itv_expiring', 'documentos', 'rrhh', 'ITV próxima a vencer', 'ITV de vehículo de flota próxima a caducar', { ...pushEmail, urgency: 'high', schedule: 'digest_daily' }),
  r('fleet_insurance_expiring', 'documentos', 'rrhh', 'Seguro próximo a vencer', 'Seguro de flota próximo a caducar', { ...pushEmail, urgency: 'high', schedule: 'digest_daily' }),
  r('itv_expired', 'documentacion', 'rrhh', 'ITV caducada', 'ITV de vehículo vencida', { urgency: 'critical' }),
  r('itv_expiring', 'documentacion', 'rrhh', 'ITV por vencer', 'ITV próxima a vencer', { urgency: 'high' }),
  r('missing_vehicle_docs', 'documentacion', 'rrhh', 'Documentos de vehículo faltantes', 'Vehículo sin documentación obligatoria', { urgency: 'high' }),
  r('contract_pending_sign', 'documentacion', 'rrhh', 'Contrato pendiente de firma', 'Contrato enviado sin firmar', { urgency: 'medium' }),
  r('signature_pending', 'documentacion', 'rrhh', 'Firma digital pendiente', 'Solicitud de firma sin completar', { urgency: 'medium' }),
  r('signature_rejected', 'documentacion', 'rrhh', 'Firma rechazada', 'Un firmante ha rechazado el documento', { urgency: 'high' }),
  r('signature_expiring', 'documentacion', 'rrhh', 'Firma a punto de caducar', 'Plazo de firma próximo a vencer', { urgency: 'medium' }),
  r('ocr_incomplete', 'documentacion', 'rrhh', 'OCR con baja confianza', 'Escaneo OCR con datos incompletos o dudosos', { urgency: 'medium' }),

  // ─── Operaciones / stock / taller / CRM / ventas ─────────────────────────
  r('stock_low', 'stock', 'catalogProviders', 'Stock bajo', 'Producto por debajo del stock mínimo', { ...pushInApp, urgency: 'high' }),
  r('out_of_stock', 'stock', 'catalogProviders', 'Sin stock', 'Producto agotado', { ...pushInApp, urgency: 'high' }),
  r('low_stock', 'stock', 'catalogProviders', 'Stock bajo (automático)', 'Alerta automática de stock bajo del motor', { ...pushInApp, urgency: 'high' }),
  r('stock_new_entry', 'stock', 'operaciones', 'Nueva entrada de stock', 'Nueva unidad registrada en inventario', { enabled: false, urgency: 'low' }),
  r('negative_stock', 'stock', 'catalogProviders', 'Stock negativo', 'Producto con stock negativo (error de inventario)', { ...pushInApp, urgency: 'high' }),
  r('stock_inventory_discrepancy', 'stock', 'catalogProviders', 'Diferencia en inventario', 'Producto con diferencia entre stock teórico y contado en revisión', { ...pushInApp, urgency: 'high' }),
  r('stock_count_worker_progress', 'stock', 'catalogProviders', 'Trabajador revisando stock', 'Un trabajador está contando productos en una revisión de inventario', { ...pushInApp, urgency: 'medium' }),
  r('stock_count_completed', 'stock', 'catalogProviders', 'Revisión de stock cerrada', 'Se ha completado una revisión de inventario físico', { ...pushInApp, urgency: 'medium' }),
  r('stock_purchase_list_ready', 'stock', 'catalogProviders', 'Lista de compra tras inventario', 'Productos sugieren pedido tras cerrar una revisión de stock', { ...pushInApp, urgency: 'high' }),
  r('parts_low_stock', 'stock', 'operaciones', 'Recambio con stock bajo', 'Pieza de taller por debajo del mínimo', { urgency: 'high' }),
  r('purchase_order_delayed', 'stock', 'operaciones', 'Pedido de compra retrasado', 'Pedido a proveedor fuera de plazo', { ...pushInApp, urgency: 'high' }),
  r('weekly_purchase_missing', 'stock', 'operaciones', 'Compra semanal pendiente', 'Sin pedido de compra en la semana esperada', { urgency: 'medium' }),
  r('supplier_not_delivering', 'stock', 'operaciones', 'Proveedor sin entregar', 'Proveedor con retraso habitual de entrega', { urgency: 'high' }),
  r('pending_reception', 'stock', 'operaciones', 'Recepción de compra pendiente', 'Mercancía pedida sin recepcionar', { urgency: 'medium' }),
  r('critical_product_not_ordered', 'stock', 'operaciones', 'Producto crítico sin pedir', 'Producto crítico sin pedido de reposición', { urgency: 'high' }),
  r('vehicle_stock_aging', 'stock', 'operaciones', 'Vehículo sin vender', 'Vehículo en stock demasiado tiempo', { urgency: 'medium', schedule: 'digest_daily' }),
  r('sale_completed', 'ventas', 'operaciones', 'Venta completada', 'Operación de venta marcada como completada', { enabled: false, ...pushEmail, urgency: 'medium' }),
  r('sale_cancelled', 'ventas', 'finanzas', 'Venta cancelada', 'Operación de venta cancelada', { ...pushInApp, urgency: 'high' }),
  r('lead_new', 'crm', 'finanzas', 'Nuevo lead', 'Lead recibido desde web, portal o manual', { ...pushInApp, urgency: 'medium' }),
  r('lead_stale', 'crm', 'operaciones', 'Lead sin actividad', 'Lead sin interacción en 48h o más', { urgency: 'medium', schedule: 'digest_daily' }),
  r('appointment_reminder', 'citas', 'operaciones', 'Recordatorio de cita', 'Cita programada próxima', { ...pushEmail, urgency: 'medium' }),
  r('appointment_missed', 'citas', 'operaciones', 'Cita no atendida', 'Cita sin confirmación de asistencia', { ...pushInApp, urgency: 'high' }),
  r('workshop_ready', 'taller', 'operaciones', 'Vehículo listo en taller', 'Orden de trabajo completada', { ...pushEmail, urgency: 'medium' }),
  r('workshop_delayed', 'taller', 'operaciones', 'Reparación retrasada', 'Orden de taller fuera de plazo', { ...pushInApp, urgency: 'high' }),
  r('stale_work_order', 'taller', 'operaciones', 'Orden de taller estancada', 'OT sin avance en demasiado tiempo', { urgency: 'high' }),
  r('stale_web_order', 'verticales', 'operaciones', 'Pedido web sin procesar', 'Pedido web pendiente demasiado tiempo', { urgency: 'high' }),
  r('vehicle_missing_docs', 'vehicle_entry', 'operaciones', 'Vehículo sin documentación', 'Entrada de vehículo con documentos faltantes', { urgency: 'medium' }),
  r('vehicle_missing_price', 'vehicle_entry', 'operaciones', 'Vehículo sin precio', 'Vehículo dado de alta sin precio de venta', { urgency: 'medium' }),
  r('vehicle_duplicate_plate', 'vehicle_entry', 'operaciones', 'Matrícula duplicada', 'Posible vehículo duplicado por matrícula', { urgency: 'high' }),
  r('vehicle_duplicate_vin', 'vehicle_entry', 'operaciones', 'Bastidor duplicado', 'Posible vehículo duplicado por VIN', { urgency: 'high' }),

  // ─── Limpieza ────────────────────────────────────────────────────────────
  r('cleaning_service_uncovered', 'limpieza', 'limpieza', 'Servicio sin cubrir', 'Servicio de limpieza sin trabajador asignado a tiempo', { ...pushInApp, urgency: 'high' }),
  r('cleaning_worker_absent', 'limpieza', 'limpieza', 'Trabajador ausente', 'Trabajador no presente en servicio programado', { urgency: 'high' }),
  r('cleaning_clockin_pending', 'limpieza', 'limpieza', 'Fichaje pendiente en servicio', 'Servicio próximo sin fichaje del trabajador', { urgency: 'medium' }),
  r('cleaning_incident_open', 'limpieza', 'limpieza', 'Incidencia abierta', 'Incidencia de limpieza sin resolver', { urgency: 'medium' }),
  r('cleaning_incident_critical', 'limpieza', 'limpieza', 'Incidencia crítica', 'Incidencia grave en servicio de limpieza', { urgency: 'critical' }),
  r('cleaning_client_unpaid', 'limpieza', 'limpieza', 'Cliente impagado', 'Cliente de limpieza con facturas pendientes', { ...pushInApp, urgency: 'high' }),
  r('cleaning_contract_renewal', 'limpieza', 'limpieza', 'Contrato por renovar', 'Contrato o servicio próximo a vencer', { urgency: 'medium', schedule: 'digest_daily' }),
  r('cleaning_material_critical', 'limpieza', 'limpieza', 'Material crítico', 'Material de limpieza por debajo del mínimo', { urgency: 'high' }),
  r('cleaning_material_depleted', 'limpieza', 'limpieza', 'Material agotado', 'Material de limpieza sin stock', { urgency: 'high' }),
  r('cleaning_route_delayed', 'limpieza', 'limpieza', 'Ruta retrasada', 'Ruta de limpieza fuera de horario previsto', { urgency: 'medium' }),
  r('cleaning_excess_hours', 'limpieza', 'limpieza', 'Horas extra en limpieza', 'Trabajador supera horas diarias o semanales', { urgency: 'high' }),
  r('cleaning_service_overtime', 'limpieza', 'limpieza', 'Servicio prolongado', 'Servicio que excede duración prevista', { urgency: 'medium' }),
  r('cleaning_no_photos', 'limpieza', 'limpieza', 'Servicio sin fotos', 'Servicio completado sin evidencia fotográfica', { enabled: false, urgency: 'low' }),
  r('cleaning_incomplete_checklist', 'limpieza', 'limpieza', 'Checklist incompleto', 'Lista de tareas del servicio sin completar', { enabled: false, urgency: 'medium' }),
  r('cleaning_route', 'limpieza', 'limpieza', 'Alerta de ruta (general)', 'Incidencia o retraso en ruta de limpieza', { urgency: 'medium' }),
  r('cleaning_material', 'limpieza', 'limpieza', 'Material de limpieza', 'Alerta de consumo o stock de material', { urgency: 'medium' }),
  r('cleaning_profitability', 'limpieza', 'limpieza', 'Rentabilidad de servicio', 'Margen o coste del servicio fuera de rango', { urgency: 'medium', schedule: 'digest_daily' }),

  // ─── Construcción ────────────────────────────────────────────────────────
  r('construction_budget_no_response', 'construccion', 'construccion', 'Presupuesto sin respuesta', 'Presupuesto enviado sin respuesta del cliente', { urgency: 'medium' }),
  r('construction_project_no_responsible', 'construccion', 'construccion', 'Obra sin responsable', 'Proyecto sin jefe de obra asignado', { urgency: 'high' }),
  r('construction_project_inactive', 'construccion', 'construccion', 'Obra inactiva', 'Proyecto sin actividad reciente', { urgency: 'medium' }),
  r('construction_worker_no_report', 'construccion', 'construccion', 'Trabajador sin parte', 'Trabajador sin parte de trabajo registrado', { urgency: 'medium' }),
  r('construction_collection_overdue', 'construccion', 'construccion', 'Cobro vencido en obra', 'Certificación o cobro de obra vencido', { ...pushInApp, urgency: 'high' }),
  r('construction_payment_overdue', 'construccion', 'construccion', 'Pago de obra vencido', 'Pago a proveedor o subcontrata vencido', { ...pushInApp, urgency: 'high' }),
  r('construction_payment_unjustified', 'construccion', 'construccion', 'Pago sin justificar', 'Pago de obra sin documentación asociada', { urgency: 'medium' }),
  r('construction_document_pending', 'construccion', 'construccion', 'Documento de obra pendiente', 'Documentación de obra pendiente de subir o validar', { urgency: 'medium' }),
  r('construction_document_expired', 'construccion', 'construccion', 'Documento de obra caducado', 'Licencia o documento de obra vencido', { urgency: 'critical' }),
  r('construction_doc_obligatorio_faltante', 'construccion', 'construccion', 'Documento obligatorio faltante', 'Obra sin documento legal obligatorio', { urgency: 'critical' }),
  r('construction_doc_firma_pendiente', 'construccion', 'construccion', 'Firma pendiente en obra', 'Documento de obra pendiente de firma', { urgency: 'medium' }),
  r('construction_doc_licencia_caducada', 'construccion', 'construccion', 'Licencia de obra caducada', 'Licencia municipal u otro permiso vencido', { urgency: 'critical' }),
  r('construction_doc_duplicado', 'construccion', 'construccion', 'Documento duplicado en obra', 'Posible documento duplicado en expediente', { enabled: false, urgency: 'low' }),
  r('construction_incident_critical', 'construccion', 'construccion', 'Incidencia crítica en obra', 'Incidencia grave en obra', { urgency: 'critical' }),
  r('construction_incident_unreviewed', 'construccion', 'construccion', 'Incidencia sin revisar', 'Incidencia de obra sin revisión del responsable', { urgency: 'high' }),
  r('construction_cost_overrun', 'construccion', 'construccion', 'Sobrecoste en obra', 'Coste real supera presupuesto de forma significativa', { urgency: 'high' }),
  r('construction_cost_warning', 'construccion', 'construccion', 'Aviso de coste en obra', 'Coste de obra acercándose al límite', { urgency: 'medium' }),
  r('construction_project_unclosed', 'construccion', 'construccion', 'Obra sin cerrar', 'Proyecto terminado operativamente pero sin cierre administrativo', { urgency: 'medium' }),
  r('construction_task_overdue', 'construccion', 'construccion', 'Tarea de obra vencida', 'Partida o tarea fuera de plazo', { urgency: 'high' }),
  r('construction_payment_upcoming', 'construccion', 'construccion', 'Pago de obra próximo', 'Vencimiento de pago en los próximos días', { urgency: 'low', schedule: 'digest_daily' }),
  r('budget_no_project', 'construccion', 'construccion', 'Presupuesto sin proyecto', 'Presupuesto sin obra vinculada', { urgency: 'medium' }),
  r('project_no_owner', 'construccion', 'construccion', 'Proyecto sin titular', 'Obra sin cliente o titular asignado', { urgency: 'medium' }),
  r('project_no_start_date', 'construccion', 'construccion', 'Proyecto sin fecha de inicio', 'Obra activa sin fecha de inicio definida', { urgency: 'low' }),

  // ─── Verticales: desguace, carnicería, compraventa ───────────────────────
  r('scrapyard_reservation_expired', 'desguaces', 'verticales', 'Reserva de pieza vencida', 'Reserva de venta en desguace expirada', { urgency: 'high' }),
  r('scrapyard_order_pending_ship', 'desguaces', 'verticales', 'Pedido pendiente de envío', 'Venta lista sin enviar o entregar', { urgency: 'medium' }),
  r('scrapyard_sale_unpaid', 'desguaces', 'verticales', 'Venta desguace sin cobrar', 'Venta realizada con pago pendiente', { ...pushInApp, urgency: 'high' }),
  r('scrapyard_sold_not_delivered', 'desguaces', 'verticales', 'Vendido sin entregar', 'Pieza vendida sin entrega al cliente', { urgency: 'medium' }),
  r('scrapyard_worker_no_clockin', 'desguaces', 'verticales', 'Operario desguace sin fichar', 'Trabajador de desguace sin fichaje', { urgency: 'high' }),
  r('scrapyard_worker_overtime', 'desguaces', 'verticales', 'Horas extra en desguace', 'Operario supera horas permitidas', { urgency: 'medium' }),
  r('scrapyard_worker_doc_expired', 'desguaces', 'verticales', 'Documento operario caducado', 'Documentación de trabajador vencida', { urgency: 'high' }),
  r('scrapyard_worker_low_perf', 'desguaces', 'verticales', 'Bajo rendimiento operario', 'Productividad por debajo del umbral', { urgency: 'medium' }),
  r('scrapyard_task_pending_overdue', 'desguaces', 'verticales', 'Tarea de desguace vencida', 'Tarea operativa fuera de plazo', { urgency: 'high' }),
  r('scrapyard_task_unassigned', 'desguaces', 'verticales', 'Tarea sin asignar', 'Tarea de desguace sin responsable', { urgency: 'medium' }),
  r('part_missing_price', 'desguaces', 'verticales', 'Pieza sin precio', 'Pieza en stock sin precio de venta', { urgency: 'medium' }),
  r('part_missing_location', 'desguaces', 'verticales', 'Pieza sin ubicación', 'Pieza sin ubicación en almacén', { urgency: 'medium' }),
  r('part_duplicate_reference', 'desguaces', 'verticales', 'Referencia duplicada', 'Posible pieza duplicada por referencia', { urgency: 'medium' }),
  r('part_missing_photos', 'desguaces', 'verticales', 'Pieza sin fotos', 'Pieza publicada o en stock sin fotografías', { urgency: 'low' }),
  r('dismantling_stalled', 'desguaces', 'verticales', 'Despiece estancado', 'Vehículo en despiece sin avance', { urgency: 'high' }),
  r('acquisition_missing_docs', 'adquisiciones', 'verticales', 'Adquisición sin documentos', 'Vehículo adquirido sin documentación', { urgency: 'high' }),
  r('acquisition_excessive_cost', 'adquisiciones', 'verticales', 'Coste de adquisición elevado', 'Compra por encima del valor de mercado', { urgency: 'medium' }),
  r('butcher_product_out_of_stock', 'carniceria', 'verticales', 'Producto carnicería agotado', 'Producto sin stock en carnicería', { urgency: 'high' }),
  r('butcher_stock_critical', 'carniceria', 'verticales', 'Stock crítico carnicería', 'Stock por debajo del nivel crítico', { ...pushInApp, urgency: 'critical' }),
  r('butcher_stock_low', 'carniceria', 'verticales', 'Stock bajo carnicería', 'Stock bajo en producto de carnicería', { urgency: 'medium' }),
  r('butcher_batch_expired', 'carniceria', 'verticales', 'Lote caducado', 'Lote de producto caducado', { ...pushInApp, urgency: 'critical' }),
  r('butcher_batch_expiring_soon', 'carniceria', 'verticales', 'Lote próximo a caducar', 'Lote que caduca en breve', { urgency: 'high' }),
  r('butcher_waste_high', 'carniceria', 'verticales', 'Merma elevada', 'Merma del día por encima del umbral', { ...pushInApp, urgency: 'high' }),
  r('butcher_waste_repeated', 'carniceria', 'verticales', 'Merma repetida', 'Misma referencia con merma recurrente', { urgency: 'medium' }),
  r('butcher_waste_expired_product', 'carniceria', 'verticales', 'Producto caducado desechado', 'Desecho por caducidad', { urgency: 'high' }),
  r('butcher_register_pending', 'carniceria', 'verticales', 'Caja carnicería sin cerrar', 'Sesión de caja de carnicería abierta demasiado tiempo', { ...pushInApp, urgency: 'high' }),
  r('butcher_scale_disconnected', 'carniceria', 'verticales', 'Báscula desconectada', 'Báscula sin comunicación con el TPV', { urgency: 'high' }),
  r('butcher_order_overdue_pickup', 'carniceria', 'verticales', 'Pedido sin recoger', 'Encargo listo que no ha sido recogido a tiempo', { urgency: 'medium' }),
  r('butcher_special_not_prepared', 'carniceria', 'verticales', 'Encargo sin preparar', 'Encargo especial pendiente para hoy', { urgency: 'high' }),
  r('butcher_order_late', 'carniceria', 'verticales', 'Pedido atrasado', 'Pedido con fecha de recogida vencida', { urgency: 'high' }),
  r('butcher_reservations_today', 'carniceria', 'verticales', 'Reservas de hoy', 'Resumen de reservas programadas para hoy', { urgency: 'low' }),
  r('cv_vehicle_missing_docs', 'compraventa', 'verticales', 'Vehículo CV sin documentos', 'Vehículo de compraventa con documentación incompleta', { urgency: 'high' }),
  r('cv_reservation_expired', 'compraventa', 'verticales', 'Reserva CV vencida', 'Reserva de vehículo expirada', { urgency: 'medium' }),
  r('cv_sale_unpaid', 'compraventa', 'verticales', 'Venta CV sin cobrar', 'Venta de vehículo con pago pendiente', { ...pushInApp, urgency: 'high' }),
  r('cv_vehicle_stagnant', 'compraventa', 'verticales', 'Vehículo estancado', 'Vehículo en stock demasiado tiempo sin vender', { urgency: 'medium' }),
  r('cv_low_avg_margin', 'compraventa', 'verticales', 'Margen bajo compraventa', 'Margen medio de ventas por debajo del objetivo', { urgency: 'medium' }),

  // ─── Eventos ───────────────────────────────────────────────────────────────
  r('events_quote_accepted', 'eventos', 'verticales', 'Presupuesto aceptado', 'Cliente acepta o se marca el presupuesto como aceptado', { channels: ['inApp', 'push'], urgency: 'low' }),
  r('events_fully_paid', 'eventos', 'verticales', 'Evento cobrado al completo', 'El evento queda sin pendiente de cobro', { channels: ['inApp', 'push'], urgency: 'low' }),
  r('events_cash_pending_close', 'eventos', 'pdvs', 'Caja de evento sin cerrar', 'PDV de evento con caja abierta tras el límite o demasiadas horas', { ...pushEmail, urgency: 'high' }),
  r('events_cash_discrepancy', 'eventos', 'pdvs', 'Descuadre caja evento', 'Diferencia al cerrar caja de un PDV de evento', { ...pushEmail, urgency: 'critical' }),
  r('events_register_closed_ok', 'eventos', 'pdvs', 'Caja evento cerrada OK', 'Cierre TPV de evento sin descuadre', { channels: ['inApp'], urgency: 'low' }),

  // ─── Sistema / seguridad ───────────────────────────────────────────────────
  r('user_login_new', 'seguridad', 'sistema', 'Nuevo inicio de sesión', 'Acceso desde dispositivo o ubicación nueva', { channels: ['email', 'inApp'], urgency: 'high' }),
  r('user_role_changed', 'seguridad', 'sistema', 'Cambio de rol', 'Se modificó el rol o permisos de un usuario', { channels: ['email', 'inApp'], urgency: 'high' }),
  r('system_update', 'sistema', 'sistema', 'Actualización del sistema', 'Nueva versión o mantenimiento programado', { enabled: false, urgency: 'low' }),
];

/**
 * Pack delivery compacto (solo lo cableado y útil):
 * 1 fichaje · 2 docs empresa · 3 caja abrir/cerrar · 4 descuadre · 5 pedido retrasado · 6 sin cobrar/cancelado.
 * Sin producto agotado (aún no conectado de verdad).
 */
export const DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS = [
  'worker_no_clockin',
  'document_missing_required',
  'document_expired',
  'document_expiring_soon',
  'delivery_register_not_opened',
  'delivery_cash_pending_close',
  'delivery_cash_discrepancy',
  'delivery_register_closed_discrepancy',
  'delivery_register_next_day_initial_over',
  'delivery_delayed_order',
  'delivery_order_very_delayed',
  'delivery_unpaid_order',
  'delivery_order_cancelled',
];

/**
 * Modo gerente (Uriel): pocas alertas que importan.
 * Caja + fichaje. Sin stock/CRM/OCR/200 reglas de ruido.
 * Delivery/restaurant añade el pack CEO al aplicar defaults.
 */
export const MANAGER_FOCUS_ENABLED_RULE_IDS = [
  'worker_no_clockin',
  'delivery_register_not_opened',
  'delivery_cash_pending_close',
  'delivery_cash_discrepancy',
  'delivery_register_closed_discrepancy',
  'delivery_register_next_day_initial_over',
  'events_cash_pending_close',
  'events_cash_discrepancy',
];

/** Reglas visibles en ajustes Delivery (mismo pack; el resto se oculta). */
export const DELIVERY_COMPACT_VISIBLE_RULE_IDS = DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS;

export function isDeliveryCompactAlertRuleId(id) {
  return DELIVERY_COMPACT_VISIBLE_RULE_IDS.includes(String(id || ''));
}

/** Duplicados del motor general — desactivados cuando el motor delivery está activo. */
export const DELIVERY_LEGACY_DUPLICATE_RULE_IDS = [
  'stale_delivery',
  'delivery_unpaid',
  'delivery_unattended',
];

export function isDeliveryScopedRuleId(id) {
  const s = String(id || '');
  if (DELIVERY_LEGACY_DUPLICATE_RULE_IDS.includes(s)) return true;
  if (s === 'register_high_return') return true;
  return s.startsWith('delivery_');
}

function defaultEnabledForDeliveryVertical(ruleId) {
  if (DELIVERY_LEGACY_DUPLICATE_RULE_IDS.includes(ruleId)) return false;
  if (DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS.includes(ruleId)) return true;
  return false;
}

/** Reglas nuevas: silencio por defecto. Solo allowlist gerente / pack delivery. */
export function defaultEnabledForNewAlertRule(ruleId, vertical = null) {
  const id = String(ruleId || '');
  if (vertical === 'delivery') {
    return defaultEnabledForDeliveryVertical(id);
  }
  return MANAGER_FOCUS_ENABLED_RULE_IDS.includes(id);
}

/**
 * Fuerza enabled solo en el pack gerente (o pack delivery si vertical delivery).
 * No borra reglas: las apaga para que dejen de emitir.
 */
export function applyManagerFocusRuleDefaults(rules, options = {}) {
  const vertical = options.vertical || null;
  const allow = new Set(
    vertical === 'delivery'
      ? DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS
      : MANAGER_FOCUS_ENABLED_RULE_IDS,
  );
  const list = Array.isArray(rules) ? rules : [];
  return list.map((rule) => ({
    ...rule,
    enabled: allow.has(String(rule?.id || '')),
  }));
}

export function mergeAlertRules(existing, options = {}) {
  const vertical = options.vertical || null;
  const byId = new Map((Array.isArray(existing) ? existing : []).map((rule) => [rule.id, rule]));
  for (const def of ALL_ALERT_RULE_DEFINITIONS) {
    if (!byId.has(def.id)) {
      byId.set(def.id, {
        ...def,
        enabled: defaultEnabledForNewAlertRule(def.id, vertical),
      });
    } else {
      const prev = byId.get(def.id);
      byId.set(def.id, {
        ...def,
        ...prev,
        label: prev.label || def.label,
        description: prev.description || def.description,
        department: prev.department || def.department,
        category: prev.category || def.category,
        planTier: def.planTier,
      });
    }
  }
  return Array.from(byId.values());
}

export function departmentForRule(rule) {
  return rule?.department || 'operaciones';
}
