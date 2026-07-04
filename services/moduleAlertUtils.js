/**
 * Guardas por módulo: no emitir alertas si el apartado no está configurado.
 */

import { canEmitPdvCashAlerts, canEmitDriverCashAlerts } from './pdvAlertUtils.js';
import { hasPartsStockSetup } from './stockAlertUtils.js';

function activeDocs(docs) {
  return (Array.isArray(docs) ? docs : []).filter((d) => d && !d.deletedAt);
}

/** Motor delivery por fases activo (vertical delivery/restaurant o config en cuenta). */
export function usesDeliveryAlertMotor(account, business = null) {
  const bt = String(business?.businessType || '').trim();
  if (bt === 'delivery' || bt === 'restaurant') return true;
  const cfg = account?.alertConfig?.delivery;
  if (cfg && typeof cfg === 'object' && cfg.enabled !== false) return true;
  return false;
}

/** Delivery operativo: pedidos, PDV o config de delivery. */
export function canEmitDeliveryAlerts({ deliveryOrders = [], pointsOfSale = [], deliveryConfig = null } = {}) {
  if (activeDocs(deliveryOrders).length > 0) return true;
  if (canEmitPdvCashAlerts(pointsOfSale)) return true;
  if (deliveryConfig && typeof deliveryConfig === 'object' && Object.keys(deliveryConfig).length > 0) return true;
  return false;
}

/** Reparto: repartidores registrados. */
export function canEmitRiderAlerts({ drivers = [] } = {}) {
  return canEmitDriverCashAlerts(drivers);
}

/** Taller: órdenes de trabajo o piezas con stock configurado. */
export function canEmitWorkshopAlerts({ workOrders = [], parts = [] } = {}) {
  if (activeDocs(workOrders).length > 0) return true;
  return hasPartsStockSetup(parts);
}

/** Vehículos en inventario. */
export function canEmitVehicleAlerts({ vehicles = [] } = {}) {
  return activeDocs(vehicles).filter((v) => v.active !== false).length > 0;
}

/** Finanzas / cobros / pagos. */
export function canEmitFinanceAlerts({ financeDocs = [], purchaseInvoices = [], clientInvoices = [] } = {}) {
  return activeDocs(financeDocs).length > 0
    || activeDocs(purchaseInvoices).length > 0
    || activeDocs(clientInvoices).length > 0;
}

/** Compras / pedidos a proveedor. */
export function canEmitPurchaseAlerts({ purchaseOrders = [], purchaseInvoices = [] } = {}) {
  return activeDocs(purchaseOrders).length > 0 || activeDocs(purchaseInvoices).length > 0;
}

/** Pedidos web. */
export function canEmitWebOrderAlerts({ webOrders = [] } = {}) {
  return activeDocs(webOrders).length > 0;
}

/** RRHH / fichajes: equipo con historial de fichajes o contratos con fecha. */
export function canEmitHrAlerts({ members = [], clockinDocs = [] } = {}) {
  const team = (members || []).filter((m) => m?.user_id && m.status !== 'inactive');
  if (team.length === 0) return false;
  if (activeDocs(clockinDocs).some((d) => d.type === 'clockin')) return true;
  if (team.some((m) => m.contractEndDate)) return true;
  return false;
}

/** Flota interna. */
export function canEmitFleetAlerts({ fleetVehicles = [] } = {}) {
  return activeDocs(fleetVehicles).length > 0;
}

/** Limpieza: servicios, rutas o trabajadores. */
export function canEmitCleaningAlerts({ services = [], routes = [], workers = [] } = {}) {
  return activeDocs(services).length > 0
    || activeDocs(routes).length > 0
    || activeDocs(workers).length > 0;
}

/** Construcción: obras o presupuestos. */
export function canEmitConstructionAlerts({ projects = [], budgets = [] } = {}) {
  return activeDocs(projects).length > 0 || activeDocs(budgets).length > 0;
}

/** Compraventa: vehículos, ventas o leads. */
export function canEmitCompraventaAlerts({ vehicles = [], sales = [], leads = [] } = {}) {
  return activeDocs(vehicles).length > 0
    || activeDocs(sales).length > 0
    || activeDocs(leads).length > 0;
}

/** Desguace: piezas, sesiones, ventas o vehículos de entrada. */
export function canEmitScrapyardAlerts({ parts = [], sessions = [], sales = [], vehicles = [] } = {}) {
  if (activeDocs(parts).length > 0) return true;
  if (activeDocs(sessions).length > 0) return true;
  if (activeDocs(sales).length > 0) return true;
  return activeDocs(vehicles).some((v) => v.procedencia || v.entryDate || v.dismantlingStartedAt);
}

/** Documentación / firmas. */
export function canEmitDocumentsAlerts({ documents = [], signatureRequests = [] } = {}) {
  return activeDocs(documents).length > 0 || activeDocs(signatureRequests).length > 0;
}

/** CRM / leads. */
export function canEmitCrmAlerts({ leads = [] } = {}) {
  return activeDocs(leads).length > 0;
}

/** Sala / comedor. */
export function canEmitSalaAlerts({ salaDocs = [] } = {}) {
  return activeDocs(salaDocs).length > 0;
}
