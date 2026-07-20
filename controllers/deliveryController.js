import {
  getDeliveryDbName,
  getCatalogDbName,
  buildDeliveryOrderDocument,
  sanitizeDeliveryOrder,
  listDeliveryOrdersByUser,
  buildCatalogItemDocument,
  sanitizeCatalogItem,
  sanitizeCatalogItemForTpv,
  listCatalogItemsByUser,
  resolveStaffUnitPrice,
  buildSupplierDocument,
  sanitizeSupplier,
  listSuppliersByUser,
  buildPurchaseInvoiceDocument,
  sanitizePurchaseInvoice,
  listPurchaseInvoicesByUser,
  generateExpenseFromInvoice,
  generateInputTaxFromInvoice,
  createDocumentFromInvoice,
  buildDriverCashSessionDocument,
  sanitizeDriverCashSession,
  listDriverCashSessionsByUser,
  buildTpvRegisterSessionDocument,
  sanitizeTpvRegisterSession,
  listTpvRegisterSessionsByUser,
  listCajaDataByUser,
  findOpenTpvRegisterSessionForPointOfSale,
  sumTpvRegisterSaleAmountForOrder,
  sumTpvRegisterReturnAmountForOrder,
  shouldRegisterTpvSaleOnTpvOrderCreate,
  normalizeTpvPaymentMethod,
  getNextDeliveryTicketNumber,
  autoCloseTpvRegisterSessionDocument,
  buildPointOfSaleDocument,
  sanitizePointOfSale,
  listPointsOfSaleByUser,
  listScopedPointsOfSaleForUser,
  listScopedPointsOfSaleForBusiness,
  dedupeActivePointsOfSale,
  dedupeLinkedPointsOfSale,
  listActiveWorkCenterIds,
  filterPointsOfSaleLinkedToWorkCenters,
  findActivePointOfSaleForWorkCenter,
  findOrphanPointOfSaleByName,
  filterTpvRegisterSessionsForBusiness,
  tpvRegisterSessionBelongsToBusiness,
  generateTerminalCode,
  findPointOfSaleByTerminalCode,
  findWorkCenterById,
  pdvDocMatchesUser,
  resolveBusinessIdForPointOfSale,
  resolveBusinessDocumentForPointOfSale,
  repairWorkCenterBusinessScopeForPdv,
  acceptPointOfSaleInBusinessScope,
  listOwnerBusinessesForUser,
  buildScaleDeviceDocument,
  sanitizeScaleDevice,
  listScaleDevicesByUser,
  buildDeliveryConfigDocument,
  sanitizeDeliveryConfig,
  sanitizeStaffConsumptionConfig,
  buildStaffConsumptionDocument,
  sanitizeStaffConsumption,
  listStaffConsumptionsByUser,
  buildDriverDocument,
  sanitizeDriver,
  listDriversByUser,
  buildRepartoConfigDocument,
  sanitizeRepartoConfig,
  ensureDatabase,
  getDocument,
  getClientsDbName,
  putDocument,
  getAllDocuments,
  bulkPutDocuments,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getFinanceDbName,
  buildFinanceDocument,
  listBrandsByBusiness,
} from '../services/couchdb.js';
import { randomUUID } from 'node:crypto';
import {
  isPdvCodeAlreadyUsed,
  PDV_RETAIL_LIMITS,
  sanitizePdvCodeInput,
  sanitizeStoreDisplayName,
  suggestNextPdvCode,
  suggestNextPdvDisplayName,
  validatePdvCodeInput,
  validateStoreDisplayName,
} from '../shared/naming/deliveryPointOfSaleCode.js';
import {
  accumulateDeliveredOrderLines,
  roundRevenueMap,
} from '../shared/delivery/orderLineRevenueSplit.js';
import {
  buildStableImportCatalogSku,
  buildCatalogImportIndexes,
  catalogImportIdentityKey,
  catalogLooseIdentityKey,
  isSameLooseCatalogProduct,
  resolveExistingCatalogItemForImport,
} from '../shared/catalog/catalogItemIdentity.js';
import { broadcastToBusiness, broadcastToUser } from '../services/sseService.js';
import { assertCanCreatePointOfSale } from '../services/entitlementEnforcement.js';
import { recordMovement } from '../services/stockMovementService.js';
import { deductOrderByRecipe, restoreDeliveryOrderStockFromMovements, deductStaffConsumptionStock } from '../services/recipeStockService.js';
import { deductOrderChannelPackaging } from '../services/orderChannelStockService.js';
import {
  ensureDeliveryOrderIncomeServer,
  ensureDeliveryOrderRefundServer,
} from '../services/deliveryOrderFinanceService.js';
import { triggerReactiveAlert } from '../services/deliveryAlertEngine.js';
import {
  canEmitCatalogStockAlerts,
  filterStockTrackedCatalogItems,
} from '../services/stockAlertUtils.js';
import { canEmitPdvCashAlerts } from '../services/pdvAlertUtils.js';
import { canEmitDeliveryAlerts } from '../services/moduleAlertUtils.js';
import {
  getBusinessAlertsOperational,
  resolveCashRegisterAlertConfig,
} from '../services/cashRegisterAlertConfig.js';
import { resolveDeliveryAlertConfig } from '../services/deliveryOperationalAlertConfig.js';
import {
  getOrderPhase,
  getPhaseStartTime,
  normalizeDeliveryOrderStatus,
} from '../services/deliveryAlertStatusUtils.js';
import { notifyManagersOrderCancelled } from '../services/deliveryOrderNotifications.js';
import { getApprovedVacationBlockingWork } from '../services/vacationClockinGate.js';
import logger from '../services/logger.js';
import {
  deliveryOrderMatchesClient,
  isCancelledDeliveryOrder,
} from '../shared/clients/deliveryClientMatch.js';
import { syncClientAfterDeliveryOrder } from '../services/deliveryClientSync.js';
import { recordDiningTableTicketStat } from '../services/salaService.js';

/** Reglas mínimas para operar TPV / delivery con un PDV identificable. */
function validatePointOfSaleTerminals(terminals) {
  const list = Array.isArray(terminals) ? terminals : [];
  if (list.length < 1) return 'Debe existir al menos un terminal TPV';
  const primary = list.find((t) => t && t.active !== false) || list[0];
  if (!primary) return 'Debe existir al menos un terminal TPV activo';
  if (!String(primary.code || '').trim()) return 'El terminal principal necesita un código (ej. TPV-01)';
  if (!String(primary.name || '').trim()) return 'El terminal principal necesita un nombre (ej. Caja principal)';
  return null;
}

function validatePointOfSaleCreateBody(body) {
  const nameErr = validateStoreDisplayName(body.name);
  if (nameErr) return nameErr;
  const codeErr = validatePdvCodeInput(body.code);
  if (codeErr) return codeErr;
  const addr = String(body.address || '').trim();
  if (addr.length < 5) return 'La dirección del local es obligatoria (calle y referencia, mínimo 5 caracteres)';
  if (addr.length > PDV_RETAIL_LIMITS.addressMax) {
    return `La dirección no puede superar ${PDV_RETAIL_LIMITS.addressMax} caracteres`;
  }
  return validatePointOfSaleTerminals(body.terminals);
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

/** PDV principal (más antiguo activo): pedidos legacy sin salesPointId solo cuentan aquí. */
export function pickPrimaryPdvId(pdvs) {
  const active = (pdvs || []).filter((p) => p && p.active !== false);
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => {
    const ta = String(a.createdAt || '');
    const tb = String(b.createdAt || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a._id || '').localeCompare(String(b._id || ''));
  });
  return sorted[0]._id || null;
}

export function orderMatchesPdvScope(order, pdvId, primaryPdvId, pdvName, pdvWorkCenterId) {
  const filterId = String(pdvId || '').trim();
  if (!filterId) return true;
  const oid = String(order.salesPointId || '').trim();
  if (!oid) {
    const primary = String(primaryPdvId || '').trim();
    if (primary && filterId === primary) return true;
    const orderStore = String(order.salesPointName || '').trim().toLowerCase();
    const pdvLabel = String(pdvName || '').trim().toLowerCase();
    if (orderStore && pdvLabel && orderStore === pdvLabel) return true;
    return false;
  }
  if (oid === filterId) return true;
  const wcId = String(pdvWorkCenterId || '').trim();
  if (wcId && oid === wcId) return true;
  return false;
}

/** Resuelve referencia de tienda (PDV `_id` o centro de trabajo) al `_id` del PDV. */
function resolvePdvIdFromRef(pdvs, ref) {
  const r = String(ref || '').trim();
  if (!r) return null;
  const byId = (pdvs || []).find((p) => p && p._id === r);
  if (byId) return byId._id;
  const byWc = (pdvs || []).find((p) => String(p?.workCenterId || '').trim() === r);
  return byWc?._id || null;
}

/** Empresa real del PDV: prioriza la tienda/centro sobre un business_id del cliente (evita limpieza→delivery). */
async function resolveBusinessIdForOrderPdv(req, pdv, orderBusinessId = '') {
  const fromPdv = String(pdv?.businessId || pdv?.business_id || '').trim();
  if (fromPdv) return fromPdv;
  if (pdv?.workCenterId) {
    try {
      const wc = await findWorkCenterById(req, pdv.workCenterId);
      const fromWc = String(wc?.business_id || wc?.businessId || '').trim();
      if (fromWc) return fromWc;
    } catch {
      /* ignore */
    }
  }
  return String(orderBusinessId || '').trim();
}

async function resolveOrderSalesPoint(req, userId, order, callerAccount) {
  const pdvs = await listScopedPointsOfSaleForUser(req, userId);
  let salesPointId = String(order?.salesPointId || '').trim();
  const orderBusinessId = String(order?.business_id || order?.businessId || '').trim();
  if (salesPointId) {
    const resolved = resolvePdvIdFromRef(pdvs, salesPointId);
    if (resolved) salesPointId = resolved;
    const pdv = pdvs.find((p) => p._id === salesPointId);
    const business_id = await resolveBusinessIdForOrderPdv(req, pdv, orderBusinessId);
    return {
      salesPointId,
      salesPointName: String(order?.salesPointName || pdv?.name || '').trim(),
      ...(business_id ? { business_id } : {}),
    };
  }
  const workerRef = String(callerAccount?.employment?.salesPointId || '').trim();
  if (workerRef) {
    const workerPdv = resolvePdvIdFromRef(pdvs, workerRef);
    if (workerPdv) {
      const pdv = pdvs.find((p) => p._id === workerPdv);
      const business_id = await resolveBusinessIdForOrderPdv(req, pdv, orderBusinessId);
      return {
        salesPointId: workerPdv,
        salesPointName: String(order?.salesPointName || pdv?.name || '').trim(),
        ...(business_id ? { business_id } : {}),
      };
    }
  }
  const active = (pdvs || []).filter((p) => p && p.active !== false);
  if (active.length === 1) {
    const business_id = await resolveBusinessIdForOrderPdv(req, active[0], orderBusinessId);
    return {
      salesPointId: active[0]._id,
      salesPointName: String(order?.salesPointName || active[0].name || '').trim(),
      ...(business_id ? { business_id } : {}),
    };
  }
  return {
    salesPointId: '',
    salesPointName: String(order?.salesPointName || '').trim(),
    ...(orderBusinessId ? { business_id: orderBusinessId } : {}),
  };
}

function assertUserScope(req, res, userId) {
  const authId = String(req.authUser?.user_id || req.authUser?.id || '').trim();
  const paramId = String(userId || '').trim();
  if (!authId || !paramId) return true;
  // Allow exact match or "account:" prefix variants
  const norm = (v) => (v.startsWith('account:') ? v.slice('account:'.length) : v);
  const authNormalized = norm(authId);
  const paramNormalized = norm(paramId);
  if (authNormalized === paramNormalized) return true;
  // El middleware multi-tenant del router puede haber reescrito :userId al
  // owner del negocio. En ese caso `req.callerUserId` conserva el userId del
  // JWT (el del team member que está autenticado): aceptamos esa coincidencia.
  const callerId = String(req.callerUserId || '').trim();
  if (callerId && authNormalized === norm(callerId)) return true;
  res.status(403).json({ ok: false, error: 'Acceso denegado' });
  return false;
}

function normalizeDuplicateValue(value) {
  return String(value || '').trim().toLowerCase();
}

function catalogItemDedupeRank(item, businessId = '') {
  const bid = String(businessId || '').trim();
  let score = 0;
  const itemBiz = String(item?.business_id || '').trim();
  if (bid && itemBiz === bid) score += 1_000_000;

  const cf = item?.customFields || {};
  const recipe = cf.costingRecipe;
  if (cf.costingType === 'recipe' && Array.isArray(recipe) && recipe.length > 0) score += 100_000;
  else if (cf.costingType === 'fixed') score += 10_000;
  else if (Number(item?.costPrice) > 0) score += 1_000;

  if (String(item?.sku || '').trim()) score += 100;
  if (String(cf.ingredients || '').trim()) score += 10;

  const updated = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
  return score + (Number.isFinite(updated) ? updated / 1000 : 0);
}

async function purgeLooseDuplicateCatalogItems(req, userId, options = {}) {
  const moduleFilter = String(options.module || 'catalog');
  const scopeBusinessId = String(options.businessId || '').trim();
  const items = await listCatalogItemsByUser(req, userId, { module: moduleFilter });
  const active = items.filter((item) => item && !item.deletedAt);
  const byLoose = new Map();

  for (const item of active) {
    const key = catalogLooseIdentityKey(item);
    if (!byLoose.has(key)) byLoose.set(key, []);
    byLoose.get(key).push(item);
  }

  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const now = new Date().toISOString();
  const deleteDocs = [];
  let purged = 0;

  for (const group of byLoose.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort(
      (a, b) => catalogItemDedupeRank(b, scopeBusinessId) - catalogItemDedupeRank(a, scopeBusinessId),
    );
    const keep = sorted[0];
    for (const dup of sorted.slice(1)) {
      deleteDocs.push({
        ...dup,
        deletedAt: now,
        updatedAt: now,
      });
      purged += 1;
    }
    if (scopeBusinessId && keep && !String(keep.business_id || '').trim()) {
      try {
        const upgraded = buildCatalogItemDocument(
          userId,
          { business_id: scopeBusinessId, vertical: keep.vertical || 'delivery' },
          keep,
        );
        await putDocument(req, db, upgraded._id, upgraded);
      } catch {
        /* best-effort */
      }
    }
  }

  if (deleteDocs.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < deleteDocs.length; i += chunkSize) {
      await bulkPutDocuments(req, db, deleteDocs.slice(i, i + chunkSize));
    }
  }

  return purged;
}

function isSameCatalogScope(base, candidate) {
  if ((base.module || 'catalog') !== (candidate.module || 'catalog')) return false;
  const baseBusinessId = String(base.business_id || '').trim();
  const candidateBusinessId = String(candidate.business_id || '').trim();
  if (baseBusinessId && candidateBusinessId) return baseBusinessId === candidateBusinessId;
  return true;
}

async function findCatalogDuplicate(req, userId, itemCandidate, excludeId = '') {
  const items = await listCatalogItemsByUser(req, userId, { module: itemCandidate.module || 'catalog' });
  const candidateSku = normalizeDuplicateValue(itemCandidate.sku);
  const excluded = String(excludeId || '').trim();

  if (!String(itemCandidate.name || '').trim() && !candidateSku) return null;

  for (const item of items) {
    if (!item || String(item._id || '') === excluded) continue;
    if (!isSameCatalogScope(itemCandidate, item)) continue;
    if (excluded) {
      const sameSku = !!candidateSku && normalizeDuplicateValue(item.sku) === candidateSku;
      if (sameSku) {
        return { item, duplicatedField: 'sku' };
      }
      continue;
    }
    if (isSameLooseCatalogProduct(itemCandidate, item)) {
      return { item, duplicatedField: 'name' };
    }
    const sameSku = !!candidateSku && normalizeDuplicateValue(item.sku) === candidateSku;
    if (sameSku) {
      return { item, duplicatedField: 'sku' };
    }
  }

  return null;
}

async function ensureDeliveryOrderOwner(req, userId, orderId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, orderId);
  if (!doc || doc.type !== 'delivery_order' || doc.user_id !== userId) return null;
  return doc;
}

async function ensureCatalogItemOwner(req, userId, itemId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, itemId);
  if (!doc || doc.type !== 'catalog_item' || doc.user_id !== userId) return null;
  return doc;
}

async function ensureSupplierOwner(req, userId, supplierId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, supplierId);
  if (!doc || doc.type !== 'supplier' || doc.user_id !== userId) return null;
  return doc;
}

async function ensurePurchaseInvoiceOwner(req, userId, invoiceId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, invoiceId);
  if (!doc || doc.type !== 'purchase_invoice' || doc.user_id !== userId) return null;
  return doc;
}

const DELIVERED_ORDER_STATUS = 'entregado';

/** Estados destino que implican devolución / anulación de entrega (reponen stock). */
function shouldReverseStockForDeliveryStatus(newStatus) {
  const s = String(newStatus || '').toLowerCase();
  if (s === DELIVERED_ORDER_STATUS) return false;
  return new Set([
    'cancelled',
    'cancelado',
    'devuelto',
    'returned',
    'reembolsado',
    'refunded',
    'nuevo',
    'incident',
    'listo',
  ]).has(s);
}

/**
 * Revierte descuentos de receta/venta cuando el pedido deja de estar entregado hacia un estado de devolución o reapertura.
 */
async function maybeRestoreRecipeStockAfterLeavingDelivered(req, userId, doc, previousStatus) {
  const prev = String(previousStatus || '').toLowerCase();
  if (prev !== DELIVERED_ORDER_STATUS) return;
  if (!doc || String(doc.status || '').toLowerCase() === DELIVERED_ORDER_STATUS) return;
  if (!shouldReverseStockForDeliveryStatus(doc.status)) return;
  try {
    const result = await restoreDeliveryOrderStockFromMovements(req, userId, {
      orderId: doc._id,
      orderType: 'delivery_order',
      performedBy: 'system',
    });
    if (result.warnings?.length > 0) {
      logger.warn({ tag: 'DELIVERY_STOCK', orderId: doc._id, warnings: result.warnings }, 'Advertencias al revertir stock delivery');
    }
  } catch (err) {
    logger.warn({ tag: 'DELIVERY_STOCK', err: err?.message, orderId: doc._id }, 'Error revirtiendo stock delivery');
  }
}

/**
 * Descuenta stock (receta + packaging) cuando el pedido está cobrado o entregado.
 * Idempotente vía movimientos de referencia del pedido.
 */
function orderIsPaidForStock(doc) {
  if (!doc) return false;
  if (String(doc.status || '') === 'cancelled' || String(doc.status || '') === 'devuelto') return false;
  if (String(doc.paymentStatus || '') === 'refunded') return false;
  return doc.paymentStatus === 'paid' || doc.paymentCollected === true;
}

async function maybeDeductRecipeStockForDeliveredOrder(req, userId, doc, previousStatus) {
  if (!doc) return;
  const shouldDeduct = doc.status === 'entregado' || orderIsPaidForStock(doc);
  if (!shouldDeduct) return;
  // Si solo estaba entregado antes y sigue entregado sin cambio de pago, ya se descontó
  const prev = String(previousStatus || '').toLowerCase();
  if (prev === 'entregado' && doc.status === 'entregado' && !orderIsPaidForStock(doc)) return;
  try {
    const orderItems = (doc.items || [])
      .filter((item) => (item.catalogItemId || item.productId) && item.quantity)
      .map((item) => ({
        catalogItemId: item.catalogItemId || item.productId || '',
        quantity: Number(item.quantity || 0),
      }));
    if (orderItems.length === 0) return;
    const result = await deductOrderByRecipe(req, userId, {
      orderId: doc._id,
      orderType: 'delivery_order',
      items: orderItems,
      performedBy: 'system',
      deliveryType: doc.deliveryType || 'domicilio',
    });
    const channelResult = await deductOrderChannelPackaging(req, userId, {
      orderId: doc._id,
      orderType: 'delivery_order',
      deliveryType: doc.deliveryType || 'domicilio',
      performedBy: 'system',
    });
    if (channelResult.warnings.length > 0) {
      logger.warn({ tag: 'DELIVERY_STOCK', orderId: doc._id, warnings: channelResult.warnings }, 'Advertencias packaging canal');
    }
    if (result.warnings.length > 0) {
      logger.warn({ tag: 'DELIVERY_STOCK', orderId: doc._id, warnings: result.warnings }, 'Advertencias al descontar stock por receta delivery');
    }
  } catch (err) {
    logger.warn({ tag: 'DELIVERY_STOCK', err: err?.message, orderId: doc._id }, 'Error descontando stock por receta delivery');
  }
}

async function maybeSyncDeliveryOrderFinance(req, userId, doc) {
  if (!doc) return;
  try {
    if (String(doc.status || '') === 'devuelto' || String(doc.paymentStatus || '') === 'refunded') {
      await ensureDeliveryOrderRefundServer(req, userId, doc);
      return;
    }
    await ensureDeliveryOrderIncomeServer(req, userId, doc);
  } catch (err) {
    logger.warn({ tag: 'DELIVERY_FINANCE', err: err?.message, orderId: doc?._id }, 'Sync finance pedido falló');
  }
}

// ─── DELIVERY ORDERS ─────────────────────────────────────────────────────────

export async function listDeliveryOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!assertUserScope(req, res, userId)) return;
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    let orders = await listDeliveryOrdersByUser(req, userId);
    // Defensa en profundidad para workers: solo su PDV y solo el día de hoy.
    // Las vistas operativas (cocina/montaje/reparto) trabajan con eso.
    if (req.callerIsWorker) {
      const pdvs = await listScopedPointsOfSaleForUser(req, userId);
      const workerRef = String(req.callerAccount?.employment?.salesPointId || '').trim();
      const workerPdv = resolvePdvIdFromRef(pdvs, workerRef);
      const today = new Date().toISOString().slice(0, 10);
      const primaryPdvId = pickPrimaryPdvId(pdvs);
      orders = orders.filter((o) => {
        if (workerPdv) {
          if (!orderMatchesPdvScope(o, workerPdv, primaryPdvId)) return false;
        } else if (workerRef && o.salesPointId && o.salesPointId !== workerRef) {
          return false;
        }
        if (o.createdAt && o.createdAt.slice(0, 10) < today) return false;
        return true;
      });
    }
    return res.json({ ok: true, orders: orders.map(sanitizeDeliveryOrder) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar pedidos delivery' });
  }
}

export async function createDeliveryOrder(req, res) {
  try {
    const { userId } = req.params;
    const { order } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!assertUserScope(req, res, userId)) return;
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const scoped = await resolveOrderSalesPoint(req, userId, order, req.callerAccount || account);
    if (!scoped.salesPointId) {
      const pdvs = await listScopedPointsOfSaleForUser(req, userId);
      const active = (pdvs || []).filter((p) => p && p.active !== false);
      if (active.length > 1) {
        return badRequest(res, 'Indica la tienda (salesPointId) del pedido');
      }
    }
    const doc = buildDeliveryOrderDocument(userId, { ...order, ...scoped });
    const channel = String(doc.channel || '').toLowerCase();
    if (channel === 'tpv') {
      const orderPdvId = await resolveOrderPdvIdForCaja(req, userId, doc, req.callerAccount || account);
      if (!orderPdvId) {
        return badRequest(res, 'No se pudo identificar la tienda del pedido. Abre la caja en el TPV.');
      }
      const allSessions = await listTpvRegisterSessionsByUser(req, userId);
      const openSession = findOpenTpvRegisterSessionForPointOfSale(allSessions, orderPdvId);
      if (!openSession) {
        return res.status(409).json({
          ok: false,
          error: 'No hay caja abierta en esta tienda. Abre la caja antes de cobrar.',
        });
      }
    }
    const ticketNumber = await maybeAssignDeliveryTicketNumber(req, userId, doc, null);
    const docWithTicket = ticketNumber
      ? buildDeliveryOrderDocument(userId, { ...doc, ticketNumber }, doc)
      : doc;
    const saved = await putDocument(req, db, docWithTicket._id, docWithTicket);
    const savedDoc = { ...docWithTicket, _rev: saved.rev };
    await maybeDeductRecipeStockForDeliveredOrder(req, userId, savedDoc, null);
    await maybeSyncDeliveryOrderFinance(req, userId, savedDoc);
    let cajaRegistration = await maybeRegisterTpvSaleOnTpvChannelOrderCreate(
      req, userId, savedDoc, account,
    );
    if (cajaRegistration.status === 'nothing_to_register' && savedDoc.status === DELIVERED_ORDER_STATUS) {
      cajaRegistration = await maybeRegisterDeliveryPaymentInTpvSession(
        req, userId, savedDoc, {}, account.fullName, req.callerAccount || account,
      );
    }
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'delivery_order',
      action: `Creó pedido ${doc.orderNumber} — ${doc.customerName}`,
      entityId: doc._id,
      entityLabel: `${doc.orderNumber} ${doc.customerName}`.trim(),
      metadata: { status: doc.status, channel: doc.channel },
    });
    const sanitized = sanitizeDeliveryOrder(savedDoc);
    let tableTicketStat = null;
    if (channel === 'tpv' && (savedDoc.tableId || savedDoc.tableNumber)) {
      try {
        tableTicketStat = await recordDiningTableTicketStat(req, userId, savedDoc);
      } catch (statErr) {
        logger.warn({ err: statErr, orderId: savedDoc._id }, 'No se pudo registrar estadística de mesa');
      }
    }
    broadcastDeliveryOrderSse(account, userId, 'created', savedDoc);
    syncClientAfterDeliveryOrder(req, userId, savedDoc).catch(() => null);
    triggerReactiveAlert(userId, 'order_created', { orderId: doc._id, newStatus: doc.status }).catch(() => null);
    return res.status(201).json({ ok: true, order: sanitized, cajaRegistration, tableTicketStat });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear pedido delivery' });
  }
}

export async function updateDeliveryOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { order } = req.body || {};
    if (!assertUserScope(req, res, userId)) return;
    if (!order || typeof order !== 'object') return badRequest(res, 'Faltan datos del pedido');
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    const merged = { ...existing, ...order };
    const ticketNumber = await maybeAssignDeliveryTicketNumber(req, userId, merged, existing);
    const doc = buildDeliveryOrderDocument(userId, {
      ...merged,
      ...(ticketNumber ? { ticketNumber } : {}),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'delivery_order',
      action: `Actualizó pedido ${doc.orderNumber} → ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.orderNumber} ${doc.customerName}`.trim(),
      metadata: { status: doc.status },
    });

    await maybeRestoreRecipeStockAfterLeavingDelivered(req, userId, doc, existing.status);
    await maybeDeductRecipeStockForDeliveredOrder(req, userId, doc, existing.status);
    await maybeSyncDeliveryOrderFinance(req, userId, { ...doc, _rev: saved.rev });
    const cajaRegistration = await maybeRegisterDeliveryPaymentInTpvSession(
      req, userId, doc, existing, account.fullName, req.callerAccount || account,
    );

    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
    broadcastDeliveryOrderSse(account, userId, 'updated', { ...doc, _rev: saved.rev }, {
      oldStatus: existing.status,
      updatedBy: account.fullName || userId,
    });
    syncClientAfterDeliveryOrder(req, userId, { ...doc, _rev: saved.rev }).catch(() => null);
    if (doc.status !== existing.status) {
      triggerReactiveAlert(userId, 'order_status_changed', { orderId: doc._id, newStatus: doc.status, previousStatus: existing.status }).catch(() => null);
    }
    return res.json({ ok: true, order: sanitized, cajaRegistration });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar pedido delivery' });
  }
}

export async function removeDeliveryOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    if (!assertUserScope(req, res, userId)) return;
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (String(existing.status || '').toLowerCase() === DELIVERED_ORDER_STATUS) {
      await maybeRestoreRecipeStockAfterLeavingDelivered(req, userId, {
        ...existing,
        status: 'cancelled',
      }, existing.status);
    }
    const db = getDeliveryDbName();
    await softDeleteDocument(req, db, orderId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'delivery_order',
      action: `Eliminó pedido ${existing.orderNumber}`,
      entityId: existing._id,
      entityLabel: existing.orderNumber,
      metadata: {},
    });
    return res.json({ ok: true, id: orderId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar pedido delivery' });
  }
}

// ─── CANCEL ORDER ────────────────────────────────────────────────────────────

export async function cancelDeliveryOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { cancelReason } = req.body || {};
    if (!assertUserScope(req, res, userId)) return;
    if (!cancelReason || String(cancelReason).trim().length < 10) {
      return badRequest(res, 'El motivo de cancelación es obligatorio (mínimo 10 caracteres)');
    }
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (existing.status === 'entregado') {
      return badRequest(res, 'No se puede cancelar un pedido ya entregado');
    }
    if (existing.status === 'cancelled') {
      return badRequest(res, 'El pedido ya está cancelado');
    }
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const actorUserId = String(req.callerUserId || userId).trim();
    const actorAccount = req.callerAccount || account;
    const actorName = String(actorAccount?.fullName || account.fullName || 'Sistema').trim();
    const now = new Date().toISOString();
    const trimmedReason = String(cancelReason).trim();
    const db = getDeliveryDbName();
    const doc = buildDeliveryOrderDocument(userId, {
      ...existing,
      status: 'cancelled',
      cancelReason: trimmedReason,
      cancelledAt: now,
      cancelledBy: actorName,
      stageHistory: [
        ...(existing.stageHistory || []),
        { status: 'cancelled', date: now, user: actorName, notes: trimmedReason },
      ],
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: actorUserId, actorName, targetUserId: userId,
      type: 'delivery_order', action: `Eliminó pedido ${doc.orderNumber}: ${trimmedReason}`,
      entityId: doc._id, entityLabel: doc.orderNumber, metadata: { cancelReason: trimmedReason, cancelledBy: actorName },
    });
    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
    broadcastDeliveryOrderSse(account, userId, 'cancelled', { ...doc, _rev: saved.rev }, {
      oldStatus: existing.status,
      reason: trimmedReason,
    });
    triggerReactiveAlert(userId, 'order_status_changed', { orderId: doc._id, newStatus: 'cancelled', previousStatus: existing.status }).catch(() => null);
    notifyManagersOrderCancelled(req, {
      order: sanitized,
      cancelReason: trimmedReason,
      actorUserId,
      actorName,
      businessUserId: userId,
    }).catch((err) => {
      logger.warn({ tag: 'DELIVERY_ORDER_NOTIFY', orderId: doc._id, err: err?.message }, 'Error notificando gerentes por cancelación');
    });
    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar pedido' });
  }
}

// ─── REOPEN ORDER ────────────────────────────────────────────────────────────

export async function reopenDeliveryOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { notes } = req.body || {};
    if (!assertUserScope(req, res, userId)) return;
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (existing.status !== 'cancelled' && existing.status !== 'entregado') {
      return badRequest(res, 'Solo se pueden reabrir pedidos cancelados o entregados');
    }
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const now = new Date().toISOString();
    const db = getDeliveryDbName();
    const doc = buildDeliveryOrderDocument(userId, {
      ...existing,
      status: 'nuevo',
      reopenedAt: now,
      reopenedBy: account.fullName || userId,
      stageHistory: [
        ...(existing.stageHistory || []),
        { status: 'nuevo', date: now, user: account.fullName || 'Sistema', notes: `Pedido reabierto${notes ? `: ${notes}` : ''}` },
      ],
    }, existing);
    await maybeRestoreRecipeStockAfterLeavingDelivered(req, userId, doc, existing.status);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'delivery_order', action: `Reabrió pedido ${doc.orderNumber}`,
      entityId: doc._id, entityLabel: doc.orderNumber, metadata: {},
    });
    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
    broadcastDeliveryOrderSse(account, userId, 'reopened', { ...doc, _rev: saved.rev }, {
      oldStatus: existing.status,
    });
    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reabrir pedido' });
  }
}

// ─── REFUND ORDER (devolución post-entrega) ─────────────────────────────────

export async function refundDeliveryOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { refundReason, refundAmount: rawRefundAmount } = req.body || {};
    if (!assertUserScope(req, res, userId)) return;
    if (!refundReason || String(refundReason).trim().length < 10) {
      return badRequest(res, 'El motivo de devolución es obligatorio (mínimo 10 caracteres)');
    }
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (String(existing.status || '').toLowerCase() !== DELIVERED_ORDER_STATUS) {
      return badRequest(res, 'Solo se pueden devolver pedidos ya entregados');
    }
    if (String(existing.paymentStatus || '') === 'refunded' || String(existing.status || '').toLowerCase() === 'devuelto') {
      return badRequest(res, 'Este pedido ya fue devuelto');
    }
    const paidAmount = Number(existing.paidAmount || 0);
    if (paidAmount <= 0 && String(existing.paymentStatus || '') !== 'paid') {
      return badRequest(res, 'El pedido no tiene cobro registrado para devolver');
    }
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const actorUserId = String(req.callerUserId || userId).trim();
    const actorAccount = req.callerAccount || account;
    const actorName = String(actorAccount?.fullName || account.fullName || 'Sistema').trim();
    const now = new Date().toISOString();
    const trimmedReason = String(refundReason).trim();
    const maxRefundable = paidAmount > 0 ? paidAmount : Number(existing.totalAmount || 0);
    const refundAmount = rawRefundAmount != null && rawRefundAmount !== ''
      ? Math.min(Number(rawRefundAmount), maxRefundable)
      : maxRefundable;
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return badRequest(res, 'El importe a devolver debe ser mayor que 0');
    }

    const db = getDeliveryDbName();
    const doc = buildDeliveryOrderDocument(userId, {
      ...existing,
      status: 'devuelto',
      paymentStatus: 'refunded',
      paymentCollected: false,
      refundReason: trimmedReason,
      refundedAt: now,
      refundedBy: actorName,
      refundAmount,
      stageHistory: [
        ...(existing.stageHistory || []),
        {
          status: 'devuelto',
          date: now,
          user: actorName,
          notes: `Devolución: ${trimmedReason} · ${refundAmount.toFixed(2)}€`,
        },
      ],
    }, existing);

    await maybeRestoreRecipeStockAfterLeavingDelivered(req, userId, doc, existing.status);
    const saved = await putDocument(req, db, doc._id, doc);

    const cajaRegistration = await autoRegisterTpvReturnForOrder(req, userId, { ...doc, _rev: saved.rev }, {
      amount: refundAmount,
      paymentMethod: existing.paymentMethod || 'efectivo',
      registeredBy: actorName,
      description: `Devolución pedido ${doc.orderNumber || ''} — ${doc.customerName || ''}`.trim(),
      callerAccount: actorAccount,
    });

    await logAccountActivity(req, {
      actorUserId,
      actorName,
      targetUserId: userId,
      type: 'delivery_order',
      action: `Devolvió pedido ${doc.orderNumber}: ${refundAmount.toFixed(2)}€`,
      entityId: doc._id,
      entityLabel: doc.orderNumber,
      metadata: { refundReason: trimmedReason, refundAmount },
    });

    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
    broadcastDeliveryOrderSse(account, userId, 'refunded', { ...doc, _rev: saved.rev }, {
      oldStatus: existing.status,
      reason: trimmedReason,
      refundAmount,
    });
    triggerReactiveAlert(userId, 'order_status_changed', {
      orderId: doc._id,
      newStatus: 'devuelto',
      previousStatus: existing.status,
    }).catch(() => null);

    await maybeSyncDeliveryOrderFinance(req, userId, { ...doc, _rev: saved.rev });

    return res.json({ ok: true, order: sanitized, cajaRegistration });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al devolver pedido' });
  }
}

// ─── REGISTER PAYMENT ────────────────────────────────────────────────────────

async function resolveOrderPdvIdForCaja(req, userId, orderDoc, callerAccount) {
  const pdvs = await listScopedPointsOfSaleForUser(req, userId);
  let pdvId = String(orderDoc.salesPointId || '').trim();
  if (pdvId) {
    return resolvePdvIdFromRef(pdvs, pdvId) || pdvId;
  }

  const scoped = await resolveOrderSalesPoint(req, userId, orderDoc, callerAccount);
  if (scoped.salesPointId) return scoped.salesPointId;

  const orderStore = String(orderDoc.salesPointName || '').trim().toLowerCase();
  if (orderStore) {
    const byName = (pdvs || []).find((p) => String(p?.name || '').trim().toLowerCase() === orderStore);
    if (byName?._id) return byName._id;
  }

  const allSessions = await listTpvRegisterSessionsByUser(req, userId);
  const openSessions = (allSessions || []).filter((s) => s && s.status === 'open' && !s.deletedAt);
  if (openSessions.length === 1) {
    const fromSession = String(openSessions[0].pointOfSaleId || '').trim();
    if (fromSession) return fromSession;
  }

  return pickPrimaryPdvId(pdvs);
}

/**
 * Registra venta/devolución en la sesión TPV abierta del PDV del pedido.
 * Reintenta en conflictos CouchDB (409) y devuelve estado explícito para el cliente.
 * @param {'increment'|'targetTotal'} mode - increment: suma amount tal cual; targetTotal: hasta amount menos lo ya registrado.
 */
async function appendTpvSessionTransaction(req, userId, orderDoc, registerTx, {
  mode = 'increment',
  targetAmount,
  callerAccount,
} = {}) {
  const orderPdvId = await resolveOrderPdvIdForCaja(req, userId, orderDoc, callerAccount);
  if (!orderPdvId) {
    return { status: 'no_pdv', message: 'No se pudo identificar el punto de venta del pedido para registrar en caja.' };
  }

  const db = getDeliveryDbName();
  const maxAttempts = 5;
  let lastOpenSession = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const allSessions = await listTpvRegisterSessionsByUser(req, userId);
    const openSession = findOpenTpvRegisterSessionForPointOfSale(allSessions, orderPdvId);
    if (!openSession) {
      return {
        status: 'no_open_session',
        message: 'No hay caja abierta en esta tienda. Abre la caja para que el cobro quede registrado.',
      };
    }
    lastOpenSession = openSession;

    let toRegister = Number(registerTx.amount || 0);
    if (registerTx.type === 'sale' && mode === 'targetTotal') {
      const target = Number(targetAmount ?? registerTx.amount ?? 0);
      const alreadyRegistered = sumTpvRegisterSaleAmountForOrder(openSession.transactions, orderDoc._id);
      toRegister = target - alreadyRegistered;
    }
    if (registerTx.type === 'return') {
      const refundTarget = Number(targetAmount ?? registerTx.amount ?? 0);
      const alreadyReturned = sumTpvRegisterReturnAmountForOrder(openSession.transactions, orderDoc._id);
      toRegister = refundTarget - alreadyReturned;
    }
    if (!Number.isFinite(toRegister) || toRegister <= 0.001) {
      return { status: 'already_registered', message: 'El importe ya estaba registrado en caja.' };
    }

    const now = new Date().toISOString();
    const txId = registerTx.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const finalTx = {
      ...registerTx,
      id: txId,
      amount: Math.round(toRegister * 100) / 100,
      paymentMethod: normalizeTpvPaymentMethod(registerTx.paymentMethod || 'efectivo'),
      orderId: orderDoc._id,
      orderNumber: orderDoc.orderNumber || '',
      linkedDeliveryOrderId: orderDoc._id,
      channel: orderDoc.channel || registerTx.channel || '',
      date: registerTx.date || now,
    };

    const updatedTxs = [...(openSession.transactions || []), finalTx];
    const salesByChannel = {};
    for (const t of updatedTxs) {
      if (t.type === 'sale' && t.channel) salesByChannel[t.channel] = (salesByChannel[t.channel] || 0) + t.amount;
    }
    const linkedOrderIds = [...(openSession.linkedOrderIds || [])];
    if (!linkedOrderIds.includes(orderDoc._id)) linkedOrderIds.push(orderDoc._id);
    const sessionDoc = buildTpvRegisterSessionDocument(userId, {
      ...openSession,
      transactions: updatedTxs,
      salesByChannel,
      linkedOrderIds,
    }, openSession);

    try {
      const saved = await putDocument(req, db, sessionDoc._id, sessionDoc);
      const account = callerAccount || await findAccountByUserId(req, userId);
      const sanitized = sanitizeTpvRegisterSession({ ...sessionDoc, _rev: saved.rev });
      broadcastTpvSessionLive(account, userId, sanitized);
      return { status: 'registered', session: sanitized };
    } catch (err) {
      const isConflict = /conflict|409/i.test(String(err?.message || ''));
      if (!isConflict || attempt === maxAttempts - 1) {
        logger.error({ tag: 'CAJA', orderId: orderDoc._id, err: err?.message, attempt }, 'Error registrando transacción en caja TPV');
        return {
          status: 'error',
          message: err?.message || 'No se pudo registrar el movimiento en caja. Revisa la sesión de caja.',
        };
      }
    }
  }

  return {
    status: 'error',
    message: lastOpenSession
      ? 'No se pudo registrar en caja tras varios intentos. Vuelve a intentarlo.'
      : 'No hay caja abierta en esta tienda.',
  };
}

async function autoRegisterTpvSaleForOrder(req, userId, orderDoc, {
  amount,
  paymentMethod,
  registeredBy,
  description,
  mode = 'increment',
  callerAccount,
}) {
  return appendTpvSessionTransaction(req, userId, orderDoc, {
    type: 'sale',
    paymentMethod: paymentMethod || 'efectivo',
    description: description || `Pedido ${orderDoc.orderNumber || ''} — ${orderDoc.customerName || ''}`.trim(),
    registeredBy: registeredBy || 'Sistema',
    amount: Number(amount || 0),
  }, {
    mode,
    targetAmount: Number(amount || 0),
    callerAccount,
  });
}

async function autoRegisterTpvReturnForOrder(req, userId, orderDoc, {
  amount,
  paymentMethod,
  registeredBy,
  description,
  callerAccount,
}) {
  return appendTpvSessionTransaction(req, userId, orderDoc, {
    type: 'return',
    paymentMethod: paymentMethod || 'efectivo',
    description: description || `Devolución ${orderDoc.orderNumber || ''} — ${orderDoc.customerName || ''}`.trim(),
    registeredBy: registeredBy || 'Sistema',
    amount: Number(amount || 0),
  }, {
    mode: 'increment',
    targetAmount: Number(amount || 0),
    callerAccount,
  });
}

async function maybeRegisterTpvSaleOnTpvChannelOrderCreate(req, userId, doc, account) {
  if (!shouldRegisterTpvSaleOnTpvOrderCreate(doc)) return { status: 'nothing_to_register' };
  const paidAmount = Number(doc.paidAmount || 0);
  const amount = paidAmount > 0 ? paidAmount : Number(doc.totalAmount || 0);
  return autoRegisterTpvSaleForOrder(req, userId, doc, {
    amount,
    paymentMethod: doc.paymentMethod || 'efectivo',
    registeredBy: account?.fullName || doc.takenByName || 'TPV',
    description: `TPV rápido · ${doc.customerName || ''}`.trim(),
    mode: 'increment',
    callerAccount: req.callerAccount || account,
  });
}

async function maybeRegisterDeliveryPaymentInTpvSession(req, userId, doc, existing, registeredBy, callerAccount) {
  const isDelivered = String(doc.status || '').toLowerCase() === DELIVERED_ORDER_STATUS;
  if (!isDelivered) return { status: 'nothing_to_register' };

  const targetPaid = Number(doc.paidAmount || 0);
  const hasPayment = Boolean(doc.paymentMethod || doc.paymentCollected || targetPaid > 0);
  if (!hasPayment) return { status: 'nothing_to_register' };

  const becameDelivered = String(existing.status || '').toLowerCase() !== DELIVERED_ORDER_STATUS;
  const paidIncreased = targetPaid > Number(existing.paidAmount || 0);
  const collectedNow = Boolean(doc.paymentCollected && !existing.paymentCollected);
  if (!becameDelivered && !paidIncreased && !collectedNow) return { status: 'nothing_to_register' };

  const amount = targetPaid > 0 ? targetPaid : Number(doc.totalAmount || 0);
  if (amount <= 0) return { status: 'nothing_to_register' };

  return autoRegisterTpvSaleForOrder(req, userId, doc, {
    amount,
    paymentMethod: doc.paymentMethod || 'efectivo',
    registeredBy: registeredBy || doc.paymentCollectedBy || 'Sistema',
    description: `Pedido ${doc.orderNumber || ''} — ${doc.customerName || ''}`.trim(),
    mode: 'targetTotal',
    callerAccount,
  });
}

async function maybeAssignDeliveryTicketNumber(req, userId, doc, existing) {
  if (String(existing?.ticketNumber || doc.ticketNumber || '').trim()) return doc.ticketNumber || existing?.ticketNumber || '';
  const isPaid = String(doc.paymentStatus || '') === 'paid' && Number(doc.paidAmount || 0) > 0;
  if (!isPaid) return '';
  return getNextDeliveryTicketNumber(req, userId);
}

export async function registerPayment(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { paymentMethod, paidAmount } = req.body || {};
    if (!assertUserScope(req, res, userId)) return;
    if (!paymentMethod) return badRequest(res, 'Falta el método de pago');
    if (!paidAmount || Number(paidAmount) <= 0) return badRequest(res, 'El importe debe ser mayor que 0');
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const now = new Date().toISOString();
    const newPaid = Number(existing.paidAmount || 0) + Number(paidAmount);
    const total = Number(existing.totalAmount || 0);
    const paymentStatus = newPaid >= total ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
    const db = getDeliveryDbName();
    const mergedForTicket = {
      ...existing,
      paymentMethod,
      paidAmount: newPaid,
      paidAt: now,
      paymentStatus,
    };
    const ticketNumber = await maybeAssignDeliveryTicketNumber(req, userId, mergedForTicket, existing);
    const doc = buildDeliveryOrderDocument(userId, {
      ...mergedForTicket,
      ...(ticketNumber ? { ticketNumber } : {}),
      stageHistory: [
        ...(existing.stageHistory || []),
        { status: existing.status, date: now, user: account.fullName || 'Sistema', notes: `Cobro registrado: ${paymentMethod} — ${Number(paidAmount).toFixed(2)}€` },
      ],
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'delivery_order', action: `Cobro ${Number(paidAmount).toFixed(2)}€ en ${doc.orderNumber}`,
      entityId: doc._id, entityLabel: doc.orderNumber,
      metadata: { paymentMethod, paidAmount: newPaid, paymentStatus },
    });

    // CAJA-03/10: auto-register transaction on open TPV register session (misma tienda)
    const cajaRegistration = await autoRegisterTpvSaleForOrder(req, userId, doc, {
      amount: Number(paidAmount),
      paymentMethod: paymentMethod || 'efectivo',
      registeredBy: account.fullName || 'Sistema',
      mode: 'increment',
      callerAccount: req.callerAccount || account,
    });

    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
    broadcastDeliveryPaymentLive(account, userId, { ...doc, _rev: saved.rev });
    await maybeDeductRecipeStockForDeliveredOrder(req, userId, { ...doc, _rev: saved.rev }, existing.status);
    await maybeSyncDeliveryOrderFinance(req, userId, { ...doc, _rev: saved.rev });
    return res.json({ ok: true, order: sanitized, cajaRegistration });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar cobro' });
  }
}

const ALLOWED_PAYMENT_METHODS = new Set(['efectivo', 'tarjeta', 'bizum', 'otro', 'otros', 'online']);

function orderIsPaidForCorrection(order) {
  const total = Number(order?.totalAmount || 0);
  const paid = Number(order?.paidAmount || 0);
  if (order?.paymentStatus === 'paid' || order?.paymentCollected) return true;
  return paid > 0 && total > 0 && paid >= total;
}

/** Corrige método de pago en pedido ya cobrado (p. ej. tarjeta → efectivo) y sincroniza caja TPV. */
export async function correctDeliveryOrderPayment(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { paymentMethod } = req.body || {};
    if (!assertUserScope(req, res, userId)) return;
    const rawPm = String(paymentMethod || '').trim().toLowerCase();
    if (!rawPm || !ALLOWED_PAYMENT_METHODS.has(rawPm)) {
      return badRequest(res, 'Método de pago no válido');
    }
    const pm = normalizeTpvPaymentMethod(rawPm);
    const existing = await ensureDeliveryOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (!orderIsPaidForCorrection(existing)) {
      return badRequest(res, 'Solo se puede corregir el pago en pedidos ya cobrados');
    }
    const prev = normalizeTpvPaymentMethod(existing.paymentMethod);
    if (prev === pm) {
      return res.json({ ok: true, order: sanitizeDeliveryOrder(existing), unchanged: true });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    const now = new Date().toISOString();
    const actor = account.fullName || 'Sistema';
    const doc = buildDeliveryOrderDocument(userId, {
      ...existing,
      paymentMethod: pm,
      stageHistory: [
        ...(existing.stageHistory || []),
        {
          status: existing.status,
          date: now,
          user: actor,
          notes: `Método de pago corregido: ${prev || '—'} → ${pm}`,
        },
      ],
    }, existing);

    let sessionsUpdated = 0;
    const allSessions = await listTpvRegisterSessionsByUser(req, userId);
    for (const sess of allSessions) {
      let changed = false;
      const txs = (sess.transactions || []).map((t) => {
        const linkedId = String(t?.linkedDeliveryOrderId || t?.orderId || '').trim();
        if (linkedId !== orderId || t?.type !== 'sale') return t;
        if (String(t.paymentMethod || '').toLowerCase() === pm) return t;
        changed = true;
        return {
          ...t,
          paymentMethod: pm,
          editedAt: now,
          editedBy: actor,
          originalPaymentMethod: t.originalPaymentMethod || t.paymentMethod,
        };
      });
      if (!changed) continue;
      const sessionDoc = buildTpvRegisterSessionDocument(userId, { ...sess, transactions: txs }, sess);
      const savedSess = await putDocument(req, db, sessionDoc._id, sessionDoc);
      broadcastTpvSessionLive(account, userId, { ...sessionDoc, _rev: savedSess.rev });
      sessionsUpdated += 1;
    }

    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: actor,
      targetUserId: userId,
      type: 'delivery_order',
      action: `Corrigió pago ${doc.orderNumber}: ${prev || '—'} → ${pm}`,
      entityId: doc._id,
      entityLabel: doc.orderNumber,
      metadata: { paymentMethod: pm, previousPaymentMethod: prev, sessionsUpdated },
    });

    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
    broadcastDeliveryOrderSse(account, userId, 'updated', { ...doc, _rev: saved.rev });
    return res.json({ ok: true, order: sanitized, sessionsUpdated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al corregir método de pago' });
  }
}

// ─── FILTER ORDERS ───────────────────────────────────────────────────────────

export async function filterDeliveryOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!assertUserScope(req, res, userId)) return;
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    let orders = await listDeliveryOrdersByUser(req, userId);
    orders = orders.map(sanitizeDeliveryOrder).filter(Boolean);

    let { channel, salesPointId, status, dateFrom, dateTo, clientId, deliveryType, search, businessId, business_id } = req.query;
    const businessFilter = String(businessId || business_id || '').replace(/^business:/, '').trim();
    // Si el caller es un worker invitado: limitamos lo que ve.
    // - Si tiene PDV asignado en `employment.salesPointId`, forzamos ese PDV
    //   aunque el query haya pedido otro (no debe poder espiar otras tiendas).
    // - Ocultamos pedidos finalizados con histórico antiguo (no mostramos
    //   historial completo): limitamos a la jornada actual salvo que el caller
    //   sea operativo de cocina/reparto (que necesita ver pedidos del día).
    if (req.callerIsWorker) {
      const workerSalesPoint = String(req.callerAccount?.employment?.salesPointId || '').trim();
      if (workerSalesPoint) salesPointId = workerSalesPoint;
      if (!dateFrom) dateFrom = new Date().toISOString().slice(0, 10);
    }
    if (businessFilter) {
      orders = orders.filter((o) => {
        const ob = String(o.business_id || o.businessId || '').replace(/^business:/, '').trim();
        return ob === businessFilter;
      });
    }
    if (channel) orders = orders.filter((o) => o.channel === channel);
    if (salesPointId) {
      const pdvs = await listScopedPointsOfSaleForUser(req, userId);
      const primaryPdvId = pickPrimaryPdvId(pdvs);
      const pdv = String(salesPointId).trim();
      const pdvDoc = (pdvs || []).find((p) => p && p._id === pdv);
      const pdvName = String(pdvDoc?.name || '').trim();
      const pdvWorkCenterId = String(pdvDoc?.workCenterId || '').trim();
      orders = orders.filter((o) =>
        orderMatchesPdvScope(o, pdv, primaryPdvId, pdvName, pdvWorkCenterId),
      );
    }
    if (status) orders = orders.filter((o) => o.status === status);
    if (deliveryType) orders = orders.filter((o) => o.deliveryType === deliveryType);
    if (clientId) orders = orders.filter((o) => o.clientId === clientId);
    if (dateFrom) orders = orders.filter((o) => o.createdAt >= dateFrom);
    if (dateTo) orders = orders.filter((o) => o.createdAt <= dateTo);
    if (search) {
      const q = String(search).toLowerCase();
      orders = orders.filter((o) =>
        (o.orderNumber || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        (o.customerAddress || '').toLowerCase().includes(q)
      );
    }

    orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const total = orders.length;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    orders = orders.slice(offset, offset + limit);
    return res.json({ ok: true, orders, total });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al filtrar pedidos' });
  }
}

// ─── CLIENT ORDER HISTORY ────────────────────────────────────────────────────

export async function clientOrderHistory(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');
    if (!assertUserScope(req, res, userId)) return;
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const clientsDb = getClientsDbName();
    await ensureDatabase(req, clientsDb);
    let client = null;
    try {
      client = await getDocument(req, clientsDb, clientId);
    } catch {
      client = null;
    }
    if (!client || client.type !== 'client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    let orders = await listDeliveryOrdersByUser(req, userId);
    orders = orders
      .filter((o) => deliveryOrderMatchesClient(o, clientId, client.phone) && !isCancelledDeliveryOrder(o))
      .map(sanitizeDeliveryOrder)
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ ok: true, orders, total: orders.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener historial de cliente' });
  }
}

// ─── CATALOG ITEMS ───────────────────────────────────────────────────────────

export async function listCatalogItems(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!assertUserScope(req, res, userId)) return;
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const filterModule = req.query.module || undefined;
    const view = String(req.query.view || '').trim().toLowerCase();
    let items = await listCatalogItemsByUser(req, userId, { module: filterModule });
    // TPV: nunca devolver inventario/ingredientes como vendibles.
    if (view === 'tpv') {
      items = items.filter((doc) => {
        if ((doc.module || 'catalog') !== 'catalog') return false;
        if (doc.isStockItem === true) return false;
        const sc = String(doc.stockCategory || '');
        if (sc && sc !== 'finished_product' && ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable'].includes(sc)) {
          return false;
        }
        return doc.itemType === 'product' || doc.itemType === 'combo';
      });
    }
    const sanitizer = view === 'tpv' ? sanitizeCatalogItemForTpv : sanitizeCatalogItem;
    return res.json({ ok: true, items: items.map(sanitizer).filter(Boolean) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar artículos' });
  }
}

export async function createCatalogItem(req, res) {
  try {
    const { userId } = req.params;
    const { item } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!item || typeof item !== 'object') return badRequest(res, 'Falta el objeto item en el body');
    if (!item.name) return badRequest(res, 'Falta el nombre del artículo');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const doc = buildCatalogItemDocument(userId, item);
    const duplicate = await findCatalogDuplicate(req, userId, doc);
    if (duplicate) {
      return res.status(409).json({
        ok: false,
        error: `Ya existe un artículo con ese ${duplicate.duplicatedField === 'sku' ? 'código' : 'nombre'}`,
      });
    }
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'catalog_item',
      action: `Añadió artículo ${doc.sku} — ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { category: doc.category },
    });
    return res.status(201).json({ ok: true, item: sanitizeCatalogItem({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear artículo' });
  }
}

export async function bulkCreateCatalogItems(req, res) {
  try {
    const { userId } = req.params;
    const { items } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(items) || items.length === 0) return badRequest(res, 'Falta el array items en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const rawItems = items.filter(item => item && typeof item === 'object' && item.name);
    const docs = rawItems.map(item => {
      const prepared = { ...item };
      if (!String(prepared.sku || '').trim()) {
        const stableSku = buildStableImportCatalogSku(prepared);
        if (stableSku) prepared.sku = stableSku;
      }
      return buildCatalogItemDocument(userId, prepared);
    });

    if (docs.length === 0) return badRequest(res, 'Ningún item válido para importar');

    const existingItems = await listCatalogItemsByUser(req, userId);
    const importIndexes = buildCatalogImportIndexes(existingItems);

    const batchIdentityKeys = new Set();
    const batchLooseKeys = new Set();
    const dedupedDocs = [];
    const docsToUpdate = [];
    const duplicateErrors = [];

    docs.forEach((doc, idx) => {
      const identityKey = catalogImportIdentityKey(doc);
      const looseKey = catalogLooseIdentityKey(doc);
      const repeatedInBatch =
        batchIdentityKeys.has(identityKey) || batchLooseKeys.has(looseKey);
      const existing = resolveExistingCatalogItemForImport(doc, importIndexes);

      if (repeatedInBatch && !existing) {
        duplicateErrors.push({
          index: idx,
          name: doc?.name,
          error: 'Producto duplicado en el mismo archivo',
        });
        return;
      }

      if (existing) {
        docsToUpdate.push({ existing, doc, index: idx });
        batchIdentityKeys.add(identityKey);
        batchLooseKeys.add(looseKey);
        return;
      }

      batchIdentityKeys.add(identityKey);
      batchLooseKeys.add(looseKey);
      dedupedDocs.push(doc);
    });

    if (dedupedDocs.length === 0 && docsToUpdate.length === 0) {
      return res.status(409).json({
        ok: false,
        error: 'No se pudo importar: todos los artículos están duplicados por código',
        created: 0,
        errors: duplicateErrors.length,
        items: [],
        errorDetails: duplicateErrors,
      });
    }

    const results = dedupedDocs.length > 0 ? await bulkPutDocuments(req, db, dedupedDocs) : [];

    const created = [];
    const updated = [];
    const errors = [];
    results.forEach((result, idx) => {
      if (result.ok) {
        created.push(sanitizeCatalogItem({ ...dedupedDocs[idx], _rev: result.rev }));
      } else {
        errors.push({ index: idx, name: dedupedDocs[idx]?.name, error: result.error || result.reason });
      }
    });

    const updateDocs = [];
    for (const { existing, doc, index } of docsToUpdate) {
      try {
        // Si el import envía brandIds (aunque sea []), manda el Excel: corrige la
        // línea/organizador TPV en re-imports. Si no viene el campo, se conserva.
        const incomingBrandIds = rawItems[index]?.brandIds;
        const mergedDoc = buildCatalogItemDocument(
          userId,
          {
            name: doc.name || existing.name,
            category: doc.category || existing.category,
            unitPrice: doc.unitPrice ?? existing.unitPrice,
            costPrice: doc.costPrice ?? existing.costPrice,
            brandIds: Array.isArray(incomingBrandIds) ? doc.brandIds : existing.brandIds,
            description: doc.description || existing.description,
            business_id:
              String(doc.business_id || doc.businessId || '').trim() ||
              String(existing.business_id || existing.businessId || '').trim(),
            vertical:
              String(doc.vertical || '').trim() ||
              String(existing.vertical || '').trim() ||
              (String(doc.business_id || doc.businessId || existing.business_id || '').trim()
                ? 'delivery'
                : ''),
            itemType: doc.itemType || existing.itemType,
            customFields: {
              ...(existing.customFields && typeof existing.customFields === 'object' ? existing.customFields : {}),
              ...(doc.customFields && typeof doc.customFields === 'object' ? doc.customFields : {}),
            },
          },
          existing,
        );
        updateDocs.push({ mergedDoc, index, doc });
      } catch (error) {
        errors.push({
          index,
          name: doc?.name,
          error: error.message || 'Error al preparar artículo importado',
        });
      }
    }

    const updateChunkSize = 100;
    for (let i = 0; i < updateDocs.length; i += updateChunkSize) {
      const chunk = updateDocs.slice(i, i + updateChunkSize);
      const bulkResults = await bulkPutDocuments(
        req,
        db,
        chunk.map(({ mergedDoc }) => mergedDoc),
      );
      bulkResults.forEach((result, chunkIdx) => {
        const { mergedDoc, index, doc } = chunk[chunkIdx];
        if (result.ok) {
          updated.push(sanitizeCatalogItem({ ...mergedDoc, _rev: result.rev }));
        } else {
          errors.push({
            index,
            name: doc?.name,
            error: result.error || result.reason || 'Error al actualizar artículo importado',
          });
        }
      });
    }

    if (duplicateErrors.length > 0) errors.push(...duplicateErrors);

    const scopeBusinessId = String(
      docs.find((doc) => String(doc?.business_id || '').trim())?.business_id || '',
    ).trim();
    let purged = 0;
    if (created.length > 0 || updated.length > 0) {
      try {
        purged = await purgeLooseDuplicateCatalogItems(req, userId, {
          module: dedupedDocs[0]?.module || docsToUpdate[0]?.doc?.module || 'catalog',
          businessId: scopeBusinessId,
        });
      } catch {
        /* best-effort */
      }
    }

    if (created.length > 0) {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName,
        targetUserId: userId,
        type: 'catalog_item',
        action: `Importación masiva: ${created.length} artículo(s) creado(s)`,
        entityId: created[0]._id,
        entityLabel: `Importación de ${created.length} artículos`,
        metadata: { count: created.length, module: dedupedDocs[0]?.module },
      });
    }

    return res.status(201).json({
      ok: true,
      created: created.length,
      updated: updated.length,
      purged,
      errors: errors.length,
      items: [...created, ...updated],
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en importación masiva' });
  }
}

/** Actualiza muchos artículos en una sola pasada (escandallo / costes tras import). */
export async function bulkPatchCatalogItems(req, res) {
  try {
    const { userId } = req.params;
    const { items } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(items) || items.length === 0) {
      return badRequest(res, 'Falta el array items en el body');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const existingItems = await listCatalogItemsByUser(req, userId);
    const byId = new Map(existingItems.map((item) => [item._id, item]));

    const docs = [];
    const errors = [];
    items.forEach((patch, index) => {
      if (!patch || typeof patch !== 'object') return;
      const id = String(patch._id || '').trim();
      if (!id) {
        errors.push({ index, error: 'Falta _id del artículo' });
        return;
      }
      const existing = byId.get(id);
      if (!existing || existing.deletedAt) {
        errors.push({ index, name: patch?.name, error: 'Artículo no encontrado' });
        return;
      }
      docs.push(buildCatalogItemDocument(userId, { ...existing, ...patch }, existing));
    });

    if (docs.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Ningún artículo válido para actualizar',
        updated: 0,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
      });
    }

    const updated = [];
    const chunkSize = 100;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const results = await bulkPutDocuments(req, db, chunk);
      results.forEach((result, idx) => {
        if (result.ok) {
          updated.push(sanitizeCatalogItem({ ...chunk[idx], _rev: result.rev }));
        } else {
          errors.push({
            index: i + idx,
            name: chunk[idx]?.name,
            error: result.error || result.reason || 'Error al guardar',
          });
        }
      });
    }

    return res.json({
      ok: errors.length === 0,
      updated: updated.length,
      errors: errors.length,
      items: updated,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en actualización masiva' });
  }
}

export async function bulkApplyStaffPrices(req, res) {
  try {
    const { userId } = req.params;
    const { discountPercent, categories, enabled } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const pct = Math.max(0, Math.min(100, Number(discountPercent)));
    if (!Number.isFinite(pct)) return badRequest(res, 'discountPercent inválido');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const staffCfg = { pricingMode: 'percent_discount', defaultDiscountPercent: pct };
    const categoryFilter = Array.isArray(categories)
      ? categories.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const existingItems = await listCatalogItemsByUser(req, userId, { module: 'catalog' });

    const toUpdate = existingItems.filter((item) => {
      if (!item || item.active === false) return false;
      if (categoryFilter.length === 0) return true;
      const cat = String(item.category || '').trim().toLowerCase();
      return categoryFilter.includes(cat);
    });

    if (toUpdate.length === 0) {
      return badRequest(res, 'No hay productos en catálogo para actualizar');
    }

    const docs = toUpdate.map((existing) => {
      const staffPrice = resolveStaffUnitPrice(existing, staffCfg);
      return buildCatalogItemDocument(userId, { ...existing, staffPrice }, existing);
    });

    const results = await bulkPutDocuments(req, db, docs);
    const updated = [];
    const errors = [];
    results.forEach((result, idx) => {
      if (result.ok) {
        updated.push(sanitizeCatalogItem({ ...docs[idx], _rev: result.rev }));
      } else {
        errors.push({ index: idx, name: docs[idx]?.name, error: result.error || result.reason });
      }
    });

    const deliveryDb = getDeliveryDbName();
    await ensureDatabase(req, deliveryDb);
    const configId = `dlvconf-${userId}`;
    let configExisting;
    try { configExisting = await getDocument(req, deliveryDb, configId); } catch { configExisting = null; }
    if (!configExisting || configExisting.type !== 'delivery_config') configExisting = null;
    const configDoc = buildDeliveryConfigDocument(userId, {
      staffConsumption: {
        enabled: enabled !== false,
        pricingMode: 'staff_price_field',
        defaultDiscountPercent: pct,
        eligibleCategories: Array.isArray(categories)
          ? categories.map((c) => String(c || '').trim()).filter(Boolean)
          : (configExisting?.staffConsumption?.eligibleCategories || []),
      },
    }, configExisting);
    const configSaved = await putDocument(req, deliveryDb, configDoc._id, configDoc);

    return res.json({
      ok: true,
      updated: updated.length,
      errors: errors.length,
      discountPercent: pct,
      config: sanitizeDeliveryConfig({ ...configDoc, _rev: configSaved.rev }),
      items: updated,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aplicar precios empleado' });
  }
}

function normalizeStockLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Actualiza cantidades de productos existentes (recuento / carga inicial de stock). */
export async function bulkUpdateCatalogStock(req, res) {
  try {
    const { userId } = req.params;
    const { entries } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(entries) || entries.length === 0) {
      return badRequest(res, 'Falta el array entries en el body');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const existingItems = await listCatalogItemsByUser(req, userId);
    const bySku = new Map();
    const byName = new Map();

    for (const item of existingItems) {
      if (!item || item.active === false || item.deletedAt) continue;
      const skuKey = normalizeStockLookupKey(item.sku);
      const nameKey = normalizeStockLookupKey(item.name);
      if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, item);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
    }

    const errors = [];
    const notFound = [];
    const updated = [];
    const performerName = account?.fullName || userId;

    for (let idx = 0; idx < entries.length; idx += 1) {
      const entry = entries[idx];
      if (!entry || typeof entry !== 'object') continue;
      const skuKey = normalizeStockLookupKey(entry.sku);
      const nameKey = normalizeStockLookupKey(entry.name || entry.nombre);
      const qtyRaw = String(
        entry.stockQuantity ?? entry.quantity ?? entry.cantidad ?? '',
      ).trim();
      const qty = Number(qtyRaw.replace(',', '.'));

      if (!skuKey && !nameKey) {
        errors.push({ index: idx, error: 'Falta SKU o nombre' });
        continue;
      }
      if (!qtyRaw || !Number.isFinite(qty) || qty < 0) {
        errors.push({
          index: idx,
          sku: entry.sku,
          name: entry.name || entry.nombre,
          error: 'Cantidad no válida',
        });
        continue;
      }

      const match = (skuKey && bySku.get(skuKey)) || (nameKey && byName.get(nameKey));
      if (!match) {
        notFound.push({
          index: idx,
          sku: entry.sku || '',
          name: entry.name || entry.nombre || '',
        });
        continue;
      }

      const unit = String(entry.unit || entry.unidad || match.unit || 'ud').trim() || 'ud';
      const prevQty = Number(match.stockQuantity || 0);
      const diff = qty - prevQty;

      try {
        if (diff !== 0) {
          const movementType =
            prevQty === 0 && qty > 0 ? 'initial' : diff > 0 ? 'adjustment_in' : 'adjustment_out';
          await recordMovement(req, userId, {
            catalogItemId: match._id,
            movementType,
            quantity: Math.abs(diff),
            unitCost: Number(match.costPrice || 0),
            referenceType: 'stock_import',
            notes: `Recuento importado — ${prevQty} → ${qty} ${unit}`,
            performedBy: performerName,
          });
        }

        const needsMetaPatch =
          diff === 0 && (match.isStockItem !== true || String(match.unit || 'ud') !== unit);
        if (needsMetaPatch) {
          const fresh = await getDocument(req, db, match._id);
          const patched = buildCatalogItemDocument(
            userId,
            { ...fresh, isStockItem: true, unit },
            fresh,
          );
          await putDocument(req, db, patched._id, patched);
        }

        const saved = await getDocument(req, db, match._id);
        updated.push(sanitizeCatalogItem(saved));
        triggerReactiveAlert(userId, 'stock_updated', { itemId: match._id }).catch(() => null);
      } catch (err) {
        errors.push({
          index: idx,
          name: match.name,
          error: err instanceof Error ? err.message : 'Error al actualizar stock',
        });
      }
    }

    if (updated.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Ningún producto del archivo coincide con el catálogo',
        updated: 0,
        notFound,
        errors,
      });
    }

    if (updated.length > 0) {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName,
        targetUserId: userId,
        type: 'catalog_item',
        action: `Recuento de stock: ${updated.length} artículo(s) actualizado(s)`,
        entityId: updated[0]._id,
        entityLabel: `Stock importado (${updated.length})`,
        metadata: { count: updated.length, notFound: notFound.length },
      });
    }

    return res.json({
      ok: true,
      updated: updated.length,
      notFound: notFound.length,
      errors: errors.length,
      items: updated,
      notFoundDetails: notFound.length > 0 ? notFound : undefined,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar stock' });
  }
}

export async function updateCatalogItem(req, res) {
  try {
    const { userId, itemId } = req.params;
    const { item } = req.body || {};
    if (!item || typeof item !== 'object') return badRequest(res, 'Faltan datos del artículo');
    const existing = await ensureCatalogItemOwner(req, userId, itemId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Artículo no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCatalogDbName();
    const doc = buildCatalogItemDocument(userId, { ...existing, ...item }, existing);
    const duplicate = await findCatalogDuplicate(req, userId, doc, existing._id);
    if (duplicate) {
      return res.status(409).json({
        ok: false,
        error: `Ya existe un artículo con ese ${duplicate.duplicatedField === 'sku' ? 'código' : 'nombre'}`,
      });
    }
    const saved = await putDocument(req, db, doc._id, doc);
    const stockChanged = Number(existing.stockQuantity || 0) !== Number(doc.stockQuantity || 0);
    if (stockChanged) triggerReactiveAlert(userId, 'stock_updated', { itemId: doc._id }).catch(() => null);
    return res.json({ ok: true, item: sanitizeCatalogItem({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar artículo' });
  }
}

export async function removeCatalogItem(req, res) {
  try {
    const { userId, itemId } = req.params;
    const result = await removeCatalogItemIdWithRetry(req, userId, itemId);
    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error || 'Error al eliminar artículo' });
    }
    return res.json({ ok: true, id: itemId, status: result.status });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar artículo' });
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeCatalogItemIdWithRetry(req, userId, itemId, maxAttempts = 4) {
  const id = String(itemId || '').trim();
  if (!id) return { ok: false, error: 'Id vacío', status: 'error' };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const existing = await ensureCatalogItemOwner(req, userId, id);
      if (!existing || existing.deletedAt) {
        return { ok: true, status: 'gone' };
      }
      await softDeleteDocument(req, getCatalogDbName(), id);
      return { ok: true, status: 'deleted' };
    } catch (error) {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('no encontrado') || message.includes('not found')) {
        return { ok: true, status: 'gone' };
      }
      if (attempt >= maxAttempts - 1) {
        return { ok: false, error: error.message || 'Error al eliminar artículo', status: 'error' };
      }
      await sleepMs(120 * (attempt + 1));
    }
  }

  return { ok: false, error: 'Error al eliminar artículo', status: 'error' };
}

export async function bulkRemoveCatalogItems(req, res) {
  try {
    const { userId } = req.params;
    const { itemIds } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return badRequest(res, 'Falta el array itemIds en el body');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const uniqueIds = [...new Set(itemIds.map((id) => String(id || '').trim()).filter(Boolean))];
    let pending = uniqueIds;
    const removed = new Set();
    const errors = [];

    for (let pass = 0; pass < 6 && pending.length > 0; pass += 1) {
      const nextPending = [];
      for (const itemId of pending) {
        const result = await removeCatalogItemIdWithRetry(req, userId, itemId, 3);
        if (result.ok) {
          removed.add(itemId);
        } else {
          nextPending.push(itemId);
        }
      }
      pending = nextPending;
      if (pending.length > 0 && pass < 5) {
        await sleepMs(200 * (pass + 1));
      }
    }

    for (const itemId of pending) {
      errors.push({ itemId, error: 'No se pudo eliminar tras varios intentos' });
    }

    if (removed.size > 0) {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName,
        targetUserId: userId,
        type: 'catalog_item',
        action: `Borrado masivo: ${removed.size} artículo(s)`,
        entityId: [...removed][0],
        entityLabel: `Borrado de ${removed.size} artículos`,
        metadata: { count: removed.size },
      });
    }

    return res.json({
      ok: pending.length === 0,
      deleted: removed.size,
      failed: pending.length,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en borrado masivo' });
  }
}

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────

export async function listSuppliers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const suppliers = await listSuppliersByUser(req, userId);
    return res.json({ ok: true, suppliers: suppliers.map(sanitizeSupplier) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar proveedores' });
  }
}

export async function createSupplier(req, res) {
  try {
    const { userId } = req.params;
    const { supplier } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!supplier || typeof supplier !== 'object') return badRequest(res, 'Falta el objeto supplier');
    if (!supplier.name) return badRequest(res, 'Falta el nombre del proveedor');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const doc = buildSupplierDocument(userId, supplier);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, supplier: sanitizeSupplier({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear proveedor' });
  }
}

export async function updateSupplier(req, res) {
  try {
    const { userId, supplierId } = req.params;
    const { supplier } = req.body || {};
    if (!supplier || typeof supplier !== 'object') return badRequest(res, 'Faltan datos del proveedor');
    const existing = await ensureSupplierOwner(req, userId, supplierId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
    const db = getCatalogDbName();
    const doc = buildSupplierDocument(userId, { ...existing, ...supplier }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, supplier: sanitizeSupplier({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar proveedor' });
  }
}

export async function removeSupplier(req, res) {
  try {
    const { userId, supplierId } = req.params;
    const existing = await ensureSupplierOwner(req, userId, supplierId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
    const db = getCatalogDbName();
    await softDeleteDocument(req, db, supplierId);
    return res.json({ ok: true, id: supplierId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar proveedor' });
  }
}

// ─── PURCHASE INVOICES ───────────────────────────────────────────────────────

export async function listPurchaseInvoices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const invoices = await listPurchaseInvoicesByUser(req, userId);
    return res.json({ ok: true, invoices: invoices.map(sanitizePurchaseInvoice) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar facturas' });
  }
}

export async function createPurchaseInvoice(req, res) {
  try {
    const { userId } = req.params;
    const { invoice } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!invoice || typeof invoice !== 'object') return badRequest(res, 'Falta el objeto invoice');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const doc = buildPurchaseInvoiceDocument(userId, invoice);
    const saved = await putDocument(req, db, doc._id, doc);
    let reconciled = null;
    try {
      const { reconcilePurchaseInvoiceFromOcr } = await import('../services/ocrPurchasePipeline.js');
      reconciled = await reconcilePurchaseInvoiceFromOcr(req, userId, { ...doc, _rev: saved.rev }, {
        performedBy: account.fullName || userId,
        financeSource: 'invoice',
        entryMethod: doc.entryMethod || 'manual',
      });
    } catch (reconcileErr) {
      console.error('[createPurchaseInvoice] reconcile stock/finance:', reconcileErr?.message || reconcileErr);
    }
    const fresh = await getDocument(req, db, doc._id).catch(() => ({ ...doc, _rev: saved.rev }));
    return res.status(201).json({
      ok: true,
      invoice: sanitizePurchaseInvoice({ ...fresh, _rev: fresh._rev || saved.rev }),
      reconcile: reconciled,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear factura' });
  }
}

export async function updatePurchaseInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const { invoice } = req.body || {};
    if (!invoice || typeof invoice !== 'object') return badRequest(res, 'Faltan datos de la factura');
    const existing = await ensurePurchaseInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    const db = getCatalogDbName();
    const doc = buildPurchaseInvoiceDocument(userId, { ...existing, ...invoice }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar factura' });
  }
}

export async function removePurchaseInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const existing = await ensurePurchaseInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    const db = getCatalogDbName();
    await softDeleteDocument(req, db, invoiceId);
    return res.json({ ok: true, id: invoiceId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar factura' });
  }
}

// ─── PURCHASE INVOICE: VALIDATE / REJECT / DUPLICATE / PDF ──────────────────

export async function validatePurchaseInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const existing = await ensurePurchaseInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const currentStatus = existing.validationStatus || existing.status || 'pending_validation';
    if (currentStatus !== 'pending_validation' && currentStatus !== 'pending') {
      return res.status(400).json({ ok: false, error: `No se puede validar una factura en estado "${currentStatus}"` });
    }

    const db = getCatalogDbName();
    const now = new Date().toISOString();

    const updates = {
      status: 'validated',
      validationStatus: 'validated',
      validatedAt: now,
      validatedBy: userId,
    };

    let linkedExpenseId = existing.linkedExpenseId || '';
    let linkedTaxEntryId = existing.linkedTaxEntryId || '';
    let linkedDocumentId = existing.linkedDocumentId || '';

    try {
      const expense = await generateExpenseFromInvoice(req, userId, { ...existing, ...updates });
      linkedExpenseId = expense._id;
    } catch (err) {
      console.error('[validateInvoice] Error generating expense:', err.message);
    }

    try {
      const taxEntry = await generateInputTaxFromInvoice(req, userId, { ...existing, ...updates });
      linkedTaxEntryId = taxEntry._id;
    } catch (err) {
      console.error('[validateInvoice] Error generating tax entry:', err.message);
    }

    if (existing.pdfUrl) {
      try {
        const docRecord = await createDocumentFromInvoice(req, userId, existing);
        linkedDocumentId = docRecord._id;
      } catch (err) {
        console.error('[validateInvoice] Error creating document:', err.message);
      }
    }

    const doc = buildPurchaseInvoiceDocument(userId, {
      ...existing,
      ...updates,
      linkedExpenseId,
      linkedTaxEntryId,
      linkedDocumentId,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al validar factura' });
  }
}

export async function rejectPurchaseInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const existing = await ensurePurchaseInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const currentStatus = existing.validationStatus || existing.status;
    if (currentStatus !== 'validated') {
      return res.status(400).json({ ok: false, error: `Solo se puede rechazar una factura validada (estado actual: "${currentStatus}")` });
    }

    const db = getCatalogDbName();
    const doc = buildPurchaseInvoiceDocument(userId, {
      ...existing,
      status: 'pending_validation',
      validationStatus: 'pending_validation',
      validatedAt: '',
      validatedBy: '',
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al rechazar factura' });
  }
}

export async function checkDuplicateInvoice(req, res) {
  try {
    const { userId } = req.params;
    const { invoiceNumber, supplierId, supplierName } = req.body || {};
    if (!invoiceNumber) return res.json({ ok: true, duplicate: false });

    const invoices = await listPurchaseInvoicesByUser(req, userId);
    const normalizedNum = String(invoiceNumber).trim().toLowerCase().replace(/\s+/g, '');

    const match = invoices.find((inv) => {
      const invNum = String(inv.invoiceNumber || '').trim().toLowerCase().replace(/\s+/g, '');
      if (invNum !== normalizedNum) return false;
      if (supplierId && inv.supplierId) return inv.supplierId === supplierId;
      if (supplierName && inv.supplierName) {
        return inv.supplierName.toLowerCase().trim() === String(supplierName).toLowerCase().trim();
      }
      return true;
    });

    if (match) {
      return res.json({ ok: true, duplicate: true, existingInvoice: sanitizePurchaseInvoice(match) });
    }
    return res.json({ ok: true, duplicate: false });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al comprobar duplicados' });
  }
}

export async function uploadInvoicePdf(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const existing = await ensurePurchaseInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    if (!req.file) return res.status(400).json({ ok: false, error: 'No se ha recibido ningún archivo' });

    const db = getCatalogDbName();
    const attachmentName = req.file.originalname || 'factura.pdf';
    const contentType = req.file.mimetype || 'application/pdf';

    const latestDoc = await getDocument(req, db, invoiceId);
    const currentRev = latestDoc?._rev || existing._rev;

    const nano = req.app?.locals?.nano || req.nano;
    const couchDb = nano.use(db);
    await couchDb.attachment.insert(invoiceId, attachmentName, req.file.buffer, contentType, { rev: currentRev });

    const updatedDoc = await getDocument(req, db, invoiceId);
    const pdfUrl = `/api/delivery/invoices/${userId}/${invoiceId}/pdf`;

    const doc = buildPurchaseInvoiceDocument(userId, {
      ...updatedDoc,
      pdfUrl,
      pdfFilename: attachmentName,
    }, updatedDoc);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al subir PDF' });
  }
}

export async function getInvoicePdf(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const existing = await ensurePurchaseInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const db = getCatalogDbName();
    const doc = await getDocument(req, db, invoiceId);
    if (!doc || !doc._attachments) {
      return res.status(404).json({ ok: false, error: 'No hay documento adjunto' });
    }

    const attachmentName = Object.keys(doc._attachments)[0];
    if (!attachmentName) return res.status(404).json({ ok: false, error: 'No hay documento adjunto' });

    const nano = req.app?.locals?.nano || req.nano;
    const couchDb = nano.use(db);
    const stream = await couchDb.attachment.get(invoiceId, attachmentName);

    const contentType = doc._attachments[attachmentName].content_type || 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${attachmentName}"`);

    if (Buffer.isBuffer(stream)) {
      return res.send(stream);
    }
    stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener PDF' });
  }
}

// ─── DRIVER CASH SESSIONS ───────────────────────────────────────────────────

async function ensureDriverCashSessionOwner(req, userId, sessionId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, sessionId);
  if (!doc || doc.type !== 'driver_cash_session' || doc.user_id !== userId) return null;
  return doc;
}

export async function listDriverCashSessions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const sessions = await listDriverCashSessionsByUser(req, userId);
    return res.json({ ok: true, sessions: sessions.map(sanitizeDriverCashSession) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar sesiones de caja' });
  }
}

export async function createDriverCashSession(req, res) {
  try {
    const { userId } = req.params;
    const { session } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!session || typeof session !== 'object') return badRequest(res, 'Falta el objeto session en el body');
    if (!session.driverName) return badRequest(res, 'Falta el nombre del repartidor');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const existingSessions = await listDriverCashSessionsByUser(req, userId);
    const alreadyOpen = existingSessions.find(
      s => s.driverName === session.driverName && s.status === 'open' && !s.deletedAt
    );
    if (alreadyOpen) {
      return res.status(409).json({
        ok: false,
        error: `${session.driverName} ya tiene una caja abierta desde ${alreadyOpen.openedAt}`,
        existingSessionId: alreadyOpen._id,
      });
    }

    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const doc = buildDriverCashSessionDocument(userId, session);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'driver_cash_session',
      action: `Abrió caja repartidor ${doc.driverName} — ${doc.initialFloat.toFixed(2)}€`,
      entityId: doc._id,
      entityLabel: doc.driverName,
      metadata: { initialFloat: doc.initialFloat },
    });
    triggerReactiveAlert(userId, 'cash_session_changed', { sessionId: doc._id, sessionType: 'driver', action: 'opened' }).catch(() => null);
    return res.status(201).json({ ok: true, session: sanitizeDriverCashSession({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear sesión de caja' });
  }
}

export async function updateDriverCashSession(req, res) {
  try {
    const { userId, sessionId } = req.params;
    const { session } = req.body || {};
    if (!session || typeof session !== 'object') return badRequest(res, 'Faltan datos de la sesión');
    const existing = await ensureDriverCashSessionOwner(req, userId, sessionId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Sesión de caja no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    const doc = buildDriverCashSessionDocument(userId, { ...existing, ...session }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const wasClosed = (doc.status === 'closed' || doc.status === 'pending_review') && existing.status === 'open';
    const wasReopened = doc.status === 'open' && (existing.status === 'closed' || existing.status === 'pending_review');
    const action = wasClosed
      ? `Cerró caja repartidor ${doc.driverName} — Diferencia: ${doc.difference.toFixed(2)}€`
      : wasReopened
        ? `Reabrió caja repartidor ${doc.driverName}`
        : `Actualizó caja repartidor ${doc.driverName}`;
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'driver_cash_session',
      action,
      entityId: doc._id,
      entityLabel: doc.driverName,
      metadata: { status: doc.status, ...(wasClosed ? { difference: doc.difference, expectedCash: doc.expectedCash, actualCash: doc.actualCash } : {}) },
    });
    triggerReactiveAlert(userId, 'cash_session_changed', { sessionId: doc._id, sessionType: 'driver', action: doc.status }).catch(() => null);

    // CAJA-12: when driver session closes, register cash_in on open TPV register
    if (wasClosed) {
      try {
        const allTpvSessions = await listTpvRegisterSessionsByUser(req, userId);
        const driverPdvId = String(doc.salesPointId || existing.salesPointId || '').trim();
        const openTpvSession = driverPdvId
          ? findOpenTpvRegisterSessionForPointOfSale(allTpvSessions, driverPdvId)
          : allTpvSessions.find((s) => s.status === 'open');
        if (openTpvSession) {
          const driverCashCollected = (doc.transactions || [])
            .filter(t => t.paymentMethod === 'efectivo' && (t.type === 'cobro' || t.type === 'collection'))
            .reduce((s, t) => s + (t.amount || 0), 0);
          if (driverCashCollected > 0) {
            const cashInTx = {
              id: `tx-driver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'cash_in',
              paymentMethod: 'efectivo',
              amount: driverCashCollected,
              description: `Liquidación repartidor: ${doc.driverName}`,
              linkedDeliveryOrderId: doc._id,
              date: new Date().toISOString(),
              registeredBy: account.fullName || 'Sistema',
            };
            const updatedTxs = [...(openTpvSession.transactions || []), cashInTx];
            const tpvDoc = buildTpvRegisterSessionDocument(userId, { ...openTpvSession, transactions: updatedTxs }, openTpvSession);
            await putDocument(req, db, tpvDoc._id, tpvDoc);
          }
        }
      } catch (tpvErr) {
        console.error('[CAJA-12] Error syncing driver cash to TPV:', tpvErr?.message);
      }
    }

    return res.json({ ok: true, session: sanitizeDriverCashSession({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar sesión de caja' });
  }
}

export async function removeDriverCashSession(req, res) {
  try {
    const { userId, sessionId } = req.params;
    const existing = await ensureDriverCashSessionOwner(req, userId, sessionId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Sesión de caja no encontrada' });
    const db = getDeliveryDbName();
    await softDeleteDocument(req, db, sessionId);
    return res.json({ ok: true, id: sessionId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar sesión de caja' });
  }
}

// ─── TPV REGISTER SESSIONS ──────────────────────────────────────────────────

async function ensureTpvRegisterOwner(req, userId, sessionId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, sessionId);
  if (!doc || doc.type !== 'tpv_register_session' || doc.user_id !== userId) return null;
  return doc;
}

export async function listTpvRegisterSessions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    let sessions = await listTpvRegisterSessionsByUser(req, userId);
    if (req.callerIsWorker) {
      const workerSalesPoint = String(req.callerAccount?.employment?.salesPointId || '').trim();
      if (workerSalesPoint) {
        const pdvs = await listScopedPointsOfSaleForUser(req, userId);
        const allowedPdvIds = new Set(
          pdvs
            .filter((p) => p._id === workerSalesPoint || p.workCenterId === workerSalesPoint)
            .map((p) => p._id),
        );
        sessions = sessions.filter((s) => {
          const pid = String(s.pointOfSaleId || '').trim();
          return !pid || allowedPdvIds.has(pid);
        });
      }
    }
    const pdvFilter = String(req.query.salesPointId || req.query.pointOfSaleId || '').trim();
    if (pdvFilter) {
      sessions = sessions.filter((s) => String(s.pointOfSaleId || '') === pdvFilter);
    }
    const businessFilter = String(req.query.businessId || req.query.business_id || '').trim();
    if (businessFilter) {
      const scopedPdvs = await listScopedPointsOfSaleForBusiness(req, userId, businessFilter);
      const scopedPdvIds = new Set(scopedPdvs.map((p) => p._id));
      sessions = filterTpvRegisterSessionsForBusiness(sessions, businessFilter, scopedPdvIds);
    }
    return res.json({ ok: true, sessions: sessions.map(sanitizeTpvRegisterSession) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar sesiones de caja TPV' });
  }
}

/** Caja: una lectura al delivery DB (TPV + reparto). */
export async function listCajaBootstrap(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    let { tpvSessions, driverSessions } = await listCajaDataByUser(req, userId);

    if (req.callerIsWorker) {
      const workerSalesPoint = String(req.callerAccount?.employment?.salesPointId || '').trim();
      if (workerSalesPoint) {
        const pdvs = await listScopedPointsOfSaleForUser(req, userId);
        const allowedPdvIds = new Set(
          pdvs
            .filter((p) => p._id === workerSalesPoint || p.workCenterId === workerSalesPoint)
            .map((p) => p._id),
        );
        tpvSessions = tpvSessions.filter((s) => {
          const pid = String(s.pointOfSaleId || '').trim();
          return !pid || allowedPdvIds.has(pid);
        });
      }
    }

    const pdvFilter = String(req.query.salesPointId || req.query.pointOfSaleId || '').trim();
    if (pdvFilter) {
      tpvSessions = tpvSessions.filter((s) => String(s.pointOfSaleId || '') === pdvFilter);
    }

    const businessFilter = String(req.query.businessId || req.query.business_id || '').trim();
    if (businessFilter) {
      const scopedPdvs = await listScopedPointsOfSaleForBusiness(req, userId, businessFilter);
      const scopedPdvIds = new Set(scopedPdvs.map((p) => p._id));
      tpvSessions = filterTpvRegisterSessionsForBusiness(tpvSessions, businessFilter, scopedPdvIds);
    }

    return res.json({
      ok: true,
      sessions: tpvSessions.map(sanitizeTpvRegisterSession),
      driverSessions: driverSessions.map(sanitizeDriverCashSession),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error al cargar datos de caja',
    });
  }
}

export async function createTpvRegisterSession(req, res) {
  try {
    const { userId } = req.params;
    const { session } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!session || typeof session !== 'object') return badRequest(res, 'Falta el objeto session');
    const pdvId = String(session.pointOfSaleId || '').trim();
    if (!pdvId) return badRequest(res, 'Falta el punto de venta (tienda) de la caja');
    const requestedBusinessId = String(session.business_id || session.businessId || '').trim();
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);

    const scope = await resolveTpvSessionBusinessScope(req, userId, pdvId, requestedBusinessId);
    if (!scope.ok) {
      return badRequest(res, scope.error || 'El punto de venta no pertenece a la empresa seleccionada');
    }

    const businessId = scope.businessId;
    const scopedPdvIds = scope.scopedPdvIds;

    const allSessions = await listTpvRegisterSessionsByUser(req, userId);
    const scopedSessions = businessId
      ? filterTpvRegisterSessionsForBusiness(allSessions, businessId, scopedPdvIds)
      : allSessions;
    const openForPdv = (scopedSessions || []).filter(
      (s) => s.status === 'open' && !s.deletedAt && String(s.pointOfSaleId || '').trim() === pdvId,
    );

    for (const stale of openForPdv) {
      // Día local ES (no UTC): entre 00:00–02:00 en España UTC aún es el día anterior.
      const openDay = calendarDayInTimeZone(stale.openedAt, 'Europe/Madrid');
      const today = calendarDayInTimeZone(new Date(), 'Europe/Madrid');
      if (openDay && today && openDay < today) {
        const closedDoc = autoCloseTpvRegisterSessionDocument(
          userId,
          stale,
          `Cierre automático: jornada ${openDay} (nueva apertura ${today})`,
          account.fullName || 'Sistema',
        );
        await putDocument(req, db, closedDoc._id, closedDoc);
        triggerReactiveAlert(userId, 'cash_session_changed', {
          sessionId: closedDoc._id,
          sessionType: 'tpv',
          action: 'closed',
        }).catch(() => null);
      }
    }

    const refreshed = await listTpvRegisterSessionsByUser(req, userId);
    const refreshedScoped = businessId
      ? filterTpvRegisterSessionsForBusiness(refreshed, businessId, scopedPdvIds)
      : refreshed;
    const alreadyOpen = findOpenTpvRegisterSessionForPointOfSale(
      refreshedScoped,
      pdvId,
      businessId,
      scopedPdvIds,
    );
    if (alreadyOpen) {
      const pdvLabel = alreadyOpen.pointOfSaleName || 'esta tienda';
      return res.status(409).json({
        ok: false,
        error: `Ya hay una caja abierta en ${pdvLabel} desde ${new Date(alreadyOpen.openedAt).toLocaleString('es-ES')}. Ciérrala antes de abrir otra.`,
        existingSessionId: alreadyOpen._id,
        existingSession: sanitizeTpvRegisterSession(alreadyOpen),
      });
    }

    const openerWorkerId = String(session.workerId || session.openedByUserId || '').trim();
    if (openerWorkerId && businessId) {
      const vacationGate = await getApprovedVacationBlockingWork(req, businessId, openerWorkerId);
      if (vacationGate.blocked) {
        return res.status(403).json({
          ok: false,
          error: vacationGate.message || 'No puedes abrir el TPV: tienes vacaciones o baja aprobadas hoy.',
          code: vacationGate.code || 'VACATION_BLOCK',
        });
      }
    }

    const doc = buildTpvRegisterSessionDocument(userId, {
      ...session,
      business_id: businessId || session.business_id || session.businessId || '',
    });
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'tpv_register_session',
      action: `Abrió caja TPV "${doc.terminalName || 'Terminal'}" — ${doc.workerName} — ${doc.initialCashAmount.toFixed(2)}€`,
      entityId: doc._id,
      entityLabel: doc.terminalName || 'Terminal',
      metadata: { workerName: doc.workerName, initialCashAmount: doc.initialCashAmount },
    });
    triggerReactiveAlert(userId, 'cash_session_changed', { sessionId: doc._id, sessionType: 'tpv', action: 'opened' }).catch(() => null);
    broadcastTpvSessionLive(account, userId, { ...doc, _rev: saved.rev });
    return res.status(201).json({ ok: true, session: sanitizeTpvRegisterSession({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear sesión de caja TPV' });
  }
}

function mergeTpvRegisterTransactions(existingTxs, incomingTxs) {
  const existing = Array.isArray(existingTxs) ? existingTxs : [];
  const incoming = Array.isArray(incomingTxs) ? incomingTxs : [];
  const byId = new Map();
  for (const t of existing) {
    if (t && t.id) byId.set(t.id, t);
  }
  for (const t of incoming) {
    if (t && t.id) byId.set(t.id, t);
  }
  return [...byId.values()].sort((a, b) => {
    const ta = new Date(a.date || 0).getTime();
    const tb = new Date(b.date || 0).getTime();
    return ta - tb;
  });
}

export async function updateTpvRegisterSession(req, res) {
  try {
    const { userId, sessionId } = req.params;
    const { session } = req.body || {};
    if (!session || typeof session !== 'object') return badRequest(res, 'Faltan datos de la sesión');
    const existing = await ensureTpvRegisterOwner(req, userId, sessionId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Sesión de caja TPV no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    const mergedTransactions = mergeTpvRegisterTransactions(existing.transactions, session.transactions);
    const linkedOrderIds = [...new Set([
      ...(existing.linkedOrderIds || []),
      ...(session.linkedOrderIds || []),
      ...mergedTransactions.map((t) => String(t.linkedDeliveryOrderId || t.orderId || '').trim()).filter(Boolean),
    ])];
    const doc = buildTpvRegisterSessionDocument(userId, {
      ...existing,
      ...session,
      transactions: mergedTransactions,
      linkedOrderIds,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const action = doc.status === 'closed'
      ? `Cerró caja TPV "${doc.terminalName}" — Diferencia: ${doc.difference.toFixed(2)}€`
      : `Actualizó caja TPV "${doc.terminalName}"`;
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'tpv_register_session', action, entityId: doc._id,
      entityLabel: doc.terminalName || 'Terminal', metadata: { status: doc.status },
    });
    triggerReactiveAlert(userId, 'cash_session_changed', { sessionId: doc._id, sessionType: 'tpv', action: doc.status }).catch(() => null);

    // CAJA-11: generate finance movements when closing the register
    const wasClosed = doc.status === 'closed' && existing.status === 'open';
    if (wasClosed) {
      try {
        const finDb = getFinanceDbName();
        await ensureDatabase(req, finDb);
        const totalSales = (doc.transactions || []).filter(t => t.type === 'sale').reduce((s, t) => s + (t.amount || 0), 0);
        if (totalSales > 0) {
          const label = `Cierre caja ${doc.terminalName}${doc.pointOfSaleName ? ` (${doc.pointOfSaleName})` : ''} — ${new Date(doc.closedAt).toLocaleDateString('es-ES')}`;
          const finDoc = buildFinanceDocument(userId, {
            type: 'cobro',
            concept: label,
            category: 'Ventas TPV',
            categoryIcon: '💰',
            amountBase: totalSales,
            taxRate: 0,
            date: doc.closedAt,
            paymentMethod: 'mixto',
            tags: ['caja', 'tpv', doc.terminalName].filter(Boolean),
            notes: `Auto: cierre de caja ${doc._id}. Efectivo: ${doc.summary?.salesByMethod?.efectivo?.toFixed(2) || 0}€, Tarjeta: ${doc.summary?.salesByMethod?.tarjeta?.toFixed(2) || 0}€, Bizum: ${doc.summary?.salesByMethod?.bizum?.toFixed(2) || 0}€.`,
            linkedDocuments: [{ id: doc._id, type: 'tpv_register_session', name: label }],
          });
          await putDocument(req, finDb, finDoc._id, finDoc);
        }
      } catch (finErr) {
        console.error('[CAJA-11] Error creating finance entry on register close:', finErr?.message);
      }
    }

    const sanitizedSession = sanitizeTpvRegisterSession({ ...doc, _rev: saved.rev });
    broadcastTpvSessionLive(account, userId, { ...doc, _rev: saved.rev });

    return res.json({ ok: true, session: sanitizedSession });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar sesión de caja TPV' });
  }
}

export async function removeTpvRegisterSession(req, res) {
  try {
    const { userId, sessionId } = req.params;
    const existing = await ensureTpvRegisterOwner(req, userId, sessionId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Sesión no encontrada' });
    const db = getDeliveryDbName();
    await softDeleteDocument(req, db, sessionId);
    return res.json({ ok: true, id: sessionId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar sesión de caja TPV' });
  }
}

// ─── POINTS OF SALE ─────────────────────────────────────────────────────────

async function ensurePointOfSaleOwner(req, userId, pdvId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, pdvId);
  if (!doc || doc.type !== 'point_of_sale' || !pdvDocMatchesUser(doc, userId)) return null;
  return doc;
}

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

/** YYYY-MM-DD en zona horaria operativa (bares ES = Europe/Madrid). */
function calendarDayInTimeZone(value, timeZone = 'Europe/Madrid') {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Resuelve la empresa real del PDV (legacy sin businessId en tienda, tablet, etc.). */
async function resolveTpvSessionBusinessScope(req, userId, pdvId, requestedBusinessId) {
  const pdvDoc = await ensurePointOfSaleOwner(req, userId, pdvId);
  if (!pdvDoc) {
    return { ok: false, error: 'Punto de venta no encontrado' };
  }

  // La tienda manda: evita abrir caja de "limpieza" en un PDV de delivery.
  const fromPdv =
    normalizeBusinessScopeId(await resolveBusinessIdForPointOfSale(req, pdvDoc)) ||
    normalizeBusinessScopeId((await resolveBusinessDocumentForPointOfSale(req, pdvDoc))?.business_id);
  const requested = normalizeBusinessScopeId(requestedBusinessId);
  let businessId = fromPdv || requested;

  if (businessId) {
    await repairWorkCenterBusinessScopeForPdv(req, userId, pdvDoc, businessId).catch(() => false);
    const scopedPdvs = await listScopedPointsOfSaleForBusiness(req, userId, businessId);
    const scopedPdvIds = new Set(scopedPdvs.map((p) => p._id));
    scopedPdvIds.add(pdvId);
    return { ok: true, businessId, scopedPdvIds };
  }

  const wcId = String(pdvDoc.workCenterId || '').trim();
  const wc = wcId ? await findWorkCenterById(req, pdvDoc.workCenterId) : null;
  let hint = 'Ve a Ajustes → Tienda, edita la tienda y guarda con dirección completa (mín. 5 caracteres).';
  if (!wcId) hint = 'La caja no tiene tienda enlazada. ' + hint;
  else if (!wc) hint = 'La tienda enlazada ya no existe. Créala de nuevo en Ajustes → Tienda.';

  return {
    ok: false,
    error: `No se pudo abrir la caja con este código tablet. ${hint}`,
  };
}

async function ensureTerminalCodeOnPdv(req, pdv) {
  if (String(pdv?.terminalCode || '').trim()) return pdv;
  const db = getDeliveryDbName();
  let code = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateTerminalCode();
    const clash = await findPointOfSaleByTerminalCode(req, candidate);
    if (!clash) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('No se pudo generar un código de terminal único');
  const doc = buildPointOfSaleDocument(pdv.user_id, { terminalCode: code }, pdv);
  const saved = await putDocument(req, db, doc._id, doc);
  return { ...doc, _rev: saved.rev };
}

export async function listPointsOfSale(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const includeInactive =
      req.query.includeInactive === 'true' || req.query.includeInactive === '1';
    let pdvs;
    if (includeInactive) {
      const all = dedupeLinkedPointsOfSale(await listPointsOfSaleByUser(req, userId));
      const workCenterIds = await listActiveWorkCenterIds(req);
      pdvs = filterPointsOfSaleLinkedToWorkCenters(all, workCenterIds);
    } else {
      pdvs = await listScopedPointsOfSaleForUser(req, userId);
    }
    // Códigos tablet: solo bajo demanda (TPV/regenerar), no en cada listado.
    if (req.query.ensureTerminalCodes === 'true' || req.query.ensureTerminalCodes === '1') {
      pdvs = await Promise.all(pdvs.map((p) => ensureTerminalCodeOnPdv(req, p).catch(() => p)));
    }
    // Trabajadores con PDV asignado en empleo: solo ven ese centro (id PDV o workCenter enlazado).
    if (req.callerIsWorker) {
      const workerSalesPoint = String(req.callerAccount?.employment?.salesPointId || '').trim();
      if (workerSalesPoint) {
        pdvs = pdvs.filter(
          (p) => p._id === workerSalesPoint || p.workCenterId === workerSalesPoint,
        );
      }
    }
    return res.json({ ok: true, pointsOfSale: pdvs.map(sanitizePointOfSale) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar puntos de venta' });
  }
}

export async function createPointOfSale(req, res) {
  try {
    const { userId } = req.params;
    const { pointOfSale } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!pointOfSale || typeof pointOfSale !== 'object') return badRequest(res, 'Falta el objeto pointOfSale');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    let body = { ...pointOfSale };
    const existing = await listPointsOfSaleByUser(req, userId);
    const wcId = String(body.workCenterId || '').trim();

    const respondReusedPointOfSale = async (linked, patch = {}) => {
      const codes = existing
        .filter((p) => p._id !== linked._id)
        .map((d) => String(d.code || '').trim())
        .filter(Boolean);
      const updates = { ...patch, workCenterId: wcId || linked.workCenterId || '' };
      if (body.name) {
        const nextName = sanitizeStoreDisplayName(body.name);
        if (nextName) updates.name = nextName;
      }
      if (body.address && String(body.address).trim().length >= 5) {
        updates.address = String(body.address).trim();
      }
      if (body.active !== undefined) updates.active = Boolean(body.active);
      if (body.code) {
        const nextCode = sanitizePdvCodeInput(String(body.code || '').trim());
        if (nextCode && !isPdvCodeAlreadyUsed(nextCode, codes)) updates.code = nextCode;
      }
      const doc = buildPointOfSaleDocument(userId, { ...linked, ...updates }, linked);
      const saved = await putDocument(req, db, doc._id, doc);
      return res.json({
        ok: true,
        reused: true,
        pointOfSale: sanitizePointOfSale({ ...doc, _rev: saved.rev }),
      });
    };

    if (wcId) {
      const linked = findActivePointOfSaleForWorkCenter(existing, wcId);
      if (linked) {
        return respondReusedPointOfSale(linked);
      }
      const rawName = sanitizeStoreDisplayName(body.name) || '';
      const orphan = rawName ? findOrphanPointOfSaleByName(existing, rawName) : null;
      if (orphan) {
        return respondReusedPointOfSale(orphan);
      }
    }

    const codes = existing.map((d) => String(d.code || '').trim()).filter(Boolean);
    const names = existing.map((d) => String(d.name || '').trim()).filter(Boolean);
    const rawName = sanitizeStoreDisplayName(body.name) || 'PDV';
    let codeStr = sanitizePdvCodeInput(String(body.code || '').trim());
    if (!codeStr) {
      codeStr = suggestNextPdvCode(rawName, codes);
    }
    if (isPdvCodeAlreadyUsed(codeStr, codes)) {
      codeStr = suggestNextPdvCode(rawName, codes);
    }
    if (isPdvCodeAlreadyUsed(codeStr, codes)) {
      return badRequest(res, `Ya existe un punto de venta con el código «${codeStr}». Elige otro código.`);
    }
    const finalName = body.preserveDisplayName
      ? rawName
      : suggestNextPdvDisplayName(rawName, names, codes, codeStr);
    body = { ...body, code: codeStr, name: finalName };
    delete body.preserveDisplayName;
    if (!Array.isArray(body.terminals) || body.terminals.length === 0) {
      body = {
        ...body,
        terminals: [
          {
            id: randomUUID(),
            code: 'TPV-01',
            name: 'Terminal principal',
            datafonName: '',
            printerName: '',
            active: true,
          },
        ],
      };
    }
    const createErr = validatePointOfSaleCreateBody(body);
    if (createErr) return badRequest(res, createErr);

    const actorEmail = req.authUser?.email || account.email || '';
    const pdvLimitCheck = await assertCanCreatePointOfSale(req, userId, actorEmail);
    if (!pdvLimitCheck.ok) {
      return res.status(pdvLimitCheck.status).json({ ok: false, error: pdvLimitCheck.error, code: pdvLimitCheck.code });
    }

    if (wcId) {
      const again = findActivePointOfSaleForWorkCenter(await listPointsOfSaleByUser(req, userId), wcId);
      if (again) {
        return respondReusedPointOfSale(again);
      }
    }

    const doc = buildPointOfSaleDocument(userId, body);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'point_of_sale', action: `Creó punto de venta "${doc.name}" (${doc.code}) con ${doc.terminals.length} terminales`,
      entityId: doc._id, entityLabel: doc.name,
      metadata: { code: doc.code, terminalCount: doc.terminals.length },
    });
    return res.status(201).json({ ok: true, pointOfSale: sanitizePointOfSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear punto de venta' });
  }
}

export async function updatePointOfSale(req, res) {
  try {
    const { userId, pdvId } = req.params;
    let pointOfSale = req.body?.pointOfSale;
    if (!pointOfSale || typeof pointOfSale !== 'object') return badRequest(res, 'Faltan datos');
    if (Object.prototype.hasOwnProperty.call(pointOfSale, 'address')) {
      const a = String(pointOfSale.address || '').trim();
      if (a.length < 5) return badRequest(res, 'La dirección del local es obligatoria (mínimo 5 caracteres)');
    }
    if (Array.isArray(pointOfSale.terminals)) {
      if (pointOfSale.terminals.length === 0) {
        return badRequest(res, 'No puedes dejar el PDV sin terminales TPV');
      }
      const termErr = validatePointOfSaleTerminals(pointOfSale.terminals);
      if (termErr) return badRequest(res, termErr);
    }
    const existing = await ensurePointOfSaleOwner(req, userId, pdvId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Punto de venta no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (Object.prototype.hasOwnProperty.call(pointOfSale, 'code')) {
      const codeErr = validatePdvCodeInput(pointOfSale.code);
      if (codeErr) return badRequest(res, codeErr);
      const nextCode = sanitizePdvCodeInput(String(pointOfSale.code || '').trim());
      const allPdvs = await listPointsOfSaleByUser(req, userId);
      const otherCodes = allPdvs
        .filter((p) => p._id !== pdvId)
        .map((d) => String(d.code || '').trim())
        .filter(Boolean);
      if (isPdvCodeAlreadyUsed(nextCode, otherCodes)) {
        return badRequest(res, `Ya existe un punto de venta con el código «${nextCode}». Elige otro código.`);
      }
      pointOfSale = { ...pointOfSale, code: nextCode };
    }
    if (Object.prototype.hasOwnProperty.call(pointOfSale, 'name')) {
      const nameErr = validateStoreDisplayName(pointOfSale.name);
      if (nameErr) return badRequest(res, nameErr);
      pointOfSale = { ...pointOfSale, name: sanitizeStoreDisplayName(pointOfSale.name) };
    }
    const db = getDeliveryDbName();
    const doc = buildPointOfSaleDocument(userId, { ...existing, ...pointOfSale }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'point_of_sale', action: `Actualizó punto de venta "${doc.name}"`,
      entityId: doc._id, entityLabel: doc.name, metadata: { terminalCount: doc.terminals.length },
    });
    return res.json({ ok: true, pointOfSale: sanitizePointOfSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar punto de venta' });
  }
}

export async function removePointOfSale(req, res) {
  try {
    const { userId, pdvId } = req.params;
    const existing = await ensurePointOfSaleOwner(req, userId, pdvId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Punto de venta no encontrado' });
    const db = getDeliveryDbName();
    await softDeleteDocument(req, db, pdvId);
    return res.json({ ok: true, id: pdvId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar punto de venta' });
  }
}

export async function regeneratePointOfSaleTerminalCode(req, res) {
  try {
    const { userId, pdvId } = req.params;
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const existing = await ensurePointOfSaleOwner(req, userId, pdvId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Punto de venta no encontrado' });

    const db = getDeliveryDbName();
    let code = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = generateTerminalCode();
      const clash = await findPointOfSaleByTerminalCode(req, candidate, pdvId);
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) return res.status(500).json({ ok: false, error: 'No se pudo generar un código único' });

    const doc = buildPointOfSaleDocument(userId, { terminalCode: code }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'point_of_sale',
      action: `Regeneró código TPV tablet de "${doc.name}"`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { terminalCode: code },
    });
    return res.json({ ok: true, pointOfSale: sanitizePointOfSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al regenerar código de terminal' });
  }
}

// ─── DELIVERY CONFIG ─────────────────────────────────────────────────────────

export async function getDeliveryConfig(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const configId = `dlvconf-${userId}`;
    let doc;
    try { doc = await getDocument(req, db, configId); } catch { doc = null; }
    if (!doc || doc.type !== 'delivery_config') {
      doc = buildDeliveryConfigDocument(userId, {});
      const saved = await putDocument(req, db, doc._id, doc);
      doc._rev = saved.rev;
    }
    return res.json({ ok: true, config: sanitizeDeliveryConfig(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener configuración delivery' });
  }
}

export async function updateDeliveryConfig(req, res) {
  try {
    const { userId } = req.params;
    const { config } = req.body || {};
    if (!config || typeof config !== 'object') return badRequest(res, 'Falta el objeto config');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const configId = `dlvconf-${userId}`;
    let existing;
    try { existing = await getDocument(req, db, configId); } catch { existing = null; }
    if (!existing || existing.type !== 'delivery_config') existing = null;
    const doc = buildDeliveryConfigDocument(userId, config, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, config: sanitizeDeliveryConfig({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar configuración delivery' });
  }
}

// ─── STAFF CONSUMPTIONS ───────────────────────────────────────────────────────

async function loadDeliveryStaffConsumptionConfig(req, userId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const configId = `dlvconf-${userId}`;
  let doc;
  try { doc = await getDocument(req, db, configId); } catch { doc = null; }
  if (!doc || doc.type !== 'delivery_config') {
    doc = buildDeliveryConfigDocument(userId, {});
  }
  return sanitizeStaffConsumptionConfig(doc.staffConsumption);
}

async function registerStaffConsumptionInTpvSession(req, userId, {
  pdvId,
  consumptionDoc,
  paymentMethod,
  registeredBy,
}) {
  if (!pdvId) return null;
  const allSessions = await listTpvRegisterSessionsByUser(req, userId);
  const openSession = findOpenTpvRegisterSessionForPointOfSale(allSessions, pdvId);
  if (!openSession) return null;

  const now = new Date().toISOString();
  const db = getDeliveryDbName();
  const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const registerTx = {
    id: txId,
    type: 'staff_consumption',
    paymentMethod: normalizeTpvPaymentMethod(paymentMethod || 'efectivo'),
    amount: Math.round(Number(consumptionDoc.total || 0) * 100) / 100,
    description: `Consumo equipo · ${consumptionDoc.workerName || ''} · ${consumptionDoc.itemName || ''}`.trim(),
    staffConsumptionId: consumptionDoc._id,
    workerId: consumptionDoc.workerId || '',
    workerName: consumptionDoc.workerName || '',
    date: now,
    registeredBy: registeredBy || consumptionDoc.recordedByName || 'Sistema',
  };
  const updatedTxs = [...(openSession.transactions || []), registerTx];
  const sessionDoc = buildTpvRegisterSessionDocument(userId, {
    ...openSession,
    transactions: updatedTxs,
  }, openSession);
  const saved = await putDocument(req, db, sessionDoc._id, sessionDoc);
  const account = await findAccountByUserId(req, userId);
  broadcastTpvSessionLive(account, userId, { ...sessionDoc, _rev: saved.rev });
  return sanitizeTpvRegisterSession({ ...sessionDoc, _rev: saved.rev });
}

export async function listStaffConsumptions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { workerId, month, salesPointId } = req.query || {};
    let items = await listStaffConsumptionsByUser(req, userId);

    if (workerId) {
      const wid = String(workerId).trim();
      items = items.filter((doc) => String(doc.workerId || '') === wid);
    }
    if (salesPointId) {
      const pdv = String(salesPointId).trim();
      items = items.filter((doc) => String(doc.salesPointId || '') === pdv);
    }
    if (month) {
      const prefix = String(month).trim().slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(prefix)) {
        items = items.filter((doc) => String(doc.createdAt || '').slice(0, 7) === prefix);
      }
    }

    const sanitized = items.map(sanitizeStaffConsumption).filter(Boolean);
    const summary = {
      count: sanitized.length,
      total: Math.round(sanitized.reduce((sum, row) => sum + Number(row.total || 0), 0) * 100) / 100,
      cashNowTotal: Math.round(
        sanitized.filter((row) => row.paymentMode === 'cash_now').reduce((sum, row) => sum + Number(row.total || 0), 0) * 100,
      ) / 100,
      payrollTotal: Math.round(
        sanitized.filter((row) => row.paymentMode === 'payroll_deduction').reduce((sum, row) => sum + Number(row.total || 0), 0) * 100,
      ) / 100,
    };

    return res.json({ ok: true, items: sanitized, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar consumos del equipo' });
  }
}

export async function createStaffConsumption(req, res) {
  try {
    const { userId } = req.params;
    const body = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const workerId = String(body.workerId || '').trim();
    const workerName = String(body.workerName || '').trim();
    const catalogItemId = String(body.catalogItemId || '').trim();
    const quantity = Math.max(1, Number(body.quantity || 1));
    const paymentMode = String(body.paymentMode || '').trim();
    const salesPointId = String(body.salesPointId || '').trim();
    const salesPointName = String(body.salesPointName || '').trim();
    const registerSessionId = String(body.registerSessionId || '').trim();
    const paymentMethod = String(body.paymentMethod || 'efectivo').trim();

    if (!workerId) return badRequest(res, 'Falta workerId');
    if (!workerName) return badRequest(res, 'Falta workerName');
    if (!catalogItemId) return badRequest(res, 'Falta catalogItemId');
    if (!['cash_now', 'payroll_deduction'].includes(paymentMode)) {
      return badRequest(res, 'paymentMode inválido (cash_now | payroll_deduction)');
    }

    const staffCfg = await loadDeliveryStaffConsumptionConfig(req, userId);
    if (!staffCfg.enabled) {
      return badRequest(res, 'Los consumos de equipo están desactivados en la configuración');
    }

    const catalogDb = getCatalogDbName();
    await ensureDatabase(req, catalogDb);
    let catalogItem;
    try {
      catalogItem = await getDocument(req, catalogDb, catalogItemId);
    } catch {
      catalogItem = null;
    }
    if (!catalogItem || catalogItem.type !== 'catalog_item' || catalogItem.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado en catálogo' });
    }
    if (catalogItem.active === false || catalogItem.available === false) {
      return badRequest(res, 'El producto no está disponible');
    }

    const eligible = staffCfg.eligibleCategories || [];
    const category = String(catalogItem.category || '').trim();
    if (eligible.length > 0 && !eligible.some((c) => String(c).trim().toLowerCase() === category.toLowerCase())) {
      return badRequest(res, 'Este producto no está habilitado para consumo de equipo');
    }

    const unitPrice = resolveStaffUnitPrice(catalogItem, staffCfg);
    const publicUnitPrice = Number(catalogItem.unitPrice || 0);
    const recordedBy = String(req.callerUserId || account.user_id || '');
    const recordedByName = String(account.fullName || account.firstName || 'Trabajador');

    const doc = buildStaffConsumptionDocument(userId, {
      workerId,
      workerName,
      catalogItemId,
      itemName: catalogItem.name || '',
      category,
      quantity,
      unitPrice,
      publicUnitPrice,
      paymentMode,
      salesPointId,
      salesPointName,
      registerSessionId,
      recordedBy,
      recordedByName,
      notes: String(body.notes || ''),
    });

    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const saved = await putDocument(req, db, doc._id, doc);
    const consumption = sanitizeStaffConsumption({ ...doc, _rev: saved.rev });

    let cajaRegistration = { status: 'nothing_to_register' };
    if (paymentMode === 'cash_now') {
      try {
        const session = await registerStaffConsumptionInTpvSession(req, userId, {
          pdvId: salesPointId,
          consumptionDoc: consumption,
          paymentMethod,
          registeredBy: recordedByName,
        });
        if (session) {
          cajaRegistration = { status: 'registered', session };
        } else {
          cajaRegistration = {
            status: 'no_open_session',
            message: 'Consumo registrado, pero no hay caja abierta en esta tienda.',
          };
        }
      } catch (regErr) {
        console.error('[STAFF_CONSUMPTION] Error registrando en caja:', regErr?.message);
        cajaRegistration = {
          status: 'error',
          message: regErr?.message || 'No se pudo registrar el consumo en caja.',
        };
      }
    }

    let stockDeducted = 0;
    const stockWarnings = [];
    try {
      const stockResult = await deductStaffConsumptionStock(req, userId, {
        catalogItemId,
        quantity,
        consumptionId: consumption._id,
        workerId,
        workerName,
        itemName: catalogItem.name || '',
        performedBy: recordedBy,
      });
      stockDeducted = stockResult.deducted?.length ?? 0;
      if (stockResult.warnings?.length) stockWarnings.push(...stockResult.warnings);
    } catch (stockErr) {
      const msg = stockErr instanceof Error ? stockErr.message : String(stockErr);
      stockWarnings.push(`No se pudo descontar stock: ${msg}`);
      logger.warn({ tag: 'STAFF_CONSUMPTION', consumptionId: consumption._id, err: msg }, 'Error descontando stock');
    }

    return res.status(201).json({
      ok: true,
      consumption,
      stockDeducted,
      stockWarnings,
      cajaRegistration,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar consumo del equipo' });
  }
}

// ─── OPS CENTER ──────────────────────────────────────────────────────────────

function isSameDay(dateStr, targetDate) {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === targetDate;
}

const OPS_CASH_MOVEMENT_TYPES = new Set(['cash_in', 'cash_out', 'return']);

function collectOpsCashMovements(tpvSessions, targetDate, salesPointId) {
  const pdv = salesPointId ? String(salesPointId).trim() : '';
  const items = [];
  for (const sess of tpvSessions || []) {
    if (pdv && String(sess.pointOfSaleId || '') !== pdv) continue;
    for (const tx of sess.transactions || []) {
      if (!OPS_CASH_MOVEMENT_TYPES.has(tx.type)) continue;
      if (!isSameDay(tx.date, targetDate)) continue;
      items.push({
        id: String(tx.id || `${sess._id}-${tx.date}-${tx.type}`),
        type: tx.type,
        amount: Number(tx.amount || 0),
        description: String(tx.description || '').trim(),
        date: tx.date,
        terminalName: String(sess.terminalName || ''),
        pointOfSaleName: String(sess.pointOfSaleName || ''),
        workerName: String(tx.registeredBy || sess.workerName || ''),
      });
    }
  }
  return items.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
}

function minutesSince(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 60000);
}

function isInTimeSlot(dateStr, slot) {
  if (!dateStr || !slot) return true;
  const d = new Date(dateStr);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return hhmm >= slot.start && hhmm <= slot.end;
}

export function orderMatchesBusinessPdvs(order, pdvs) {
  if (!Array.isArray(pdvs) || pdvs.length === 0) return false;
  const primaryPdvId = pickPrimaryPdvId(pdvs);
  for (const p of pdvs) {
    if (orderMatchesPdvScope(order, p._id, primaryPdvId, p.name, p.workCenterId)) return true;
  }
  return false;
}

function scopeTpvSessionsForOps(tpvSessions, salesPointId, businessPdvs = null) {
  const pdv = salesPointId ? String(salesPointId).trim() : '';
  if (pdv) {
    return (tpvSessions || []).filter((s) => String(s.pointOfSaleId || '').trim() === pdv);
  }
  if (Array.isArray(businessPdvs) && businessPdvs.length > 0) {
    const ids = new Set(businessPdvs.map((p) => String(p._id || '').trim()).filter(Boolean));
    return (tpvSessions || []).filter((s) => ids.has(String(s.pointOfSaleId || '').trim()));
  }
  return tpvSessions || [];
}

function scopePointsOfSaleForOps(pointsOfSale, salesPointId, businessPdvs = null) {
  if (Array.isArray(businessPdvs) && businessPdvs.length > 0) return businessPdvs;
  const pdv = salesPointId ? String(salesPointId).trim() : '';
  if (!pdv) return pointsOfSale;
  return (pointsOfSale || []).filter((p) => p && p._id === pdv);
}

function buildAlerts(orders, tpvSessions, driverSessions, catalogItems, config, pointsOfSale = [], deliveryAlertCfg = null, cashCfg = null, targetDate = null) {
  const alerts = [];
  const now = new Date().toISOString();
  const dayKey = String(targetDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const activeOrderStatuses = ['nuevo', 'cocina', 'listo', 'en_reparto'];
  const alertCfg = deliveryAlertCfg || resolveDeliveryAlertConfig({}, null);
  const cash = cashCfg || {};
  const discrepancyThreshold = Number(cash.discrepancyThreshold || config.cashRegister?.discrepancyThreshold || 20);
  const maxCashHours = Number(cash.cashMaxOpenHours || 12);

  const deliveryReady = canEmitDeliveryAlerts({ deliveryOrders: orders, pointsOfSale, deliveryConfig: config });

  if (deliveryReady) {
    const activeOrders = orders.filter((o) => activeOrderStatuses.includes(o.status));
    const nowMs = Date.now();

    for (const o of activeOrders) {
      const phase = getOrderPhase(o);
      if (!phase) continue;
      const thr = alertCfg.delayThresholds?.[phase];
      if (!thr) continue;
      const start = getPhaseStartTime(o);
      if (Number.isNaN(start.getTime())) continue;
      const mins = (nowMs - start.getTime()) / 60_000;
      if (mins < thr) continue;
      const status = normalizeDeliveryOrderStatus(o.status);
      alerts.push({
        id: `delayed_${o._id}`, type: 'delayed_order', severity: mins >= thr * 2 ? 'critical' : 'warning',
        title: `Pedido ${o.orderNumber} retrasado`,
        message: `${Math.floor(mins)} min en ${status} (umbral CEO: ${thr} min)`,
        orderId: o._id, route: '/saas/delivery-kitchen', createdAt: start.toISOString(),
      });
    }

    const inKitchen = orders.filter((o) => o.status === 'cocina').length;
    const cap = alertCfg.kitchenCapacity || 10;
    const pct = cap > 0 ? (inKitchen / cap) * 100 : 0;
    if (pct >= (alertCfg.kitchenCriticalPercent || 90)) {
      alerts.push({
        id: 'kitchen_saturated', type: 'kitchen_saturated', severity: 'critical',
        title: 'Cocina saturada',
        message: `${inKitchen}/${cap} pedidos (${Math.round(pct)}%, umbral CEO: ${alertCfg.kitchenCriticalPercent}%)`,
        route: '/saas/delivery-ops#cocina', createdAt: now,
      });
    } else if (pct >= (alertCfg.kitchenWarningPercent || 70)) {
      alerts.push({
        id: 'kitchen_saturated_warn', type: 'kitchen_saturated', severity: 'warning',
        title: 'Cocina con carga alta',
        message: `${inKitchen}/${cap} pedidos (${Math.round(pct)}%, aviso CEO: ${alertCfg.kitchenWarningPercent}%)`,
        route: '/saas/delivery-ops#cocina', createdAt: now,
      });
    }
  }

  const pdvReady = canEmitPdvCashAlerts(pointsOfSale);

  if (pdvReady) {
    const openTpv = tpvSessions.filter(s => s.status === 'open');
    const hasActiveOrders = orders.some((o) => activeOrderStatuses.includes(o.status));

    if (hasActiveOrders && openTpv.length === 0) {
      alerts.push({
        id: 'register_not_open_today', type: 'register_not_open', severity: 'warning',
        title: 'Caja sin abrir',
        message: `Hay pedidos activos del ${dayKey} pero ninguna caja TPV está abierta.`,
        route: '/saas/vertical/delivery/caja', createdAt: now,
      });
    }

    for (const s of openTpv) {
      const hours = minutesSince(s.openedAt) / 60;
      if (hours >= maxCashHours) {
        alerts.push({
          id: `cash_pending_${s._id}`, type: 'cash_pending_close', severity: hours >= maxCashHours * 1.25 ? 'critical' : 'warning',
          title: 'Caja pendiente de cierre',
          message: `${s.terminalName || 'Terminal'} — ${s.pointOfSaleName || 'PDV'} abierta ${Math.round(hours)}h (máx. CEO: ${maxCashHours}h)`,
          sessionId: s._id, route: '/saas/vertical/delivery/caja', createdAt: s.openedAt || now,
        });
      }
    }

    const pendingValidation = tpvSessions.filter(
      (s) => s.status === 'closed' && s.closingValidationStatus === 'pending',
    );
    if (pendingValidation.length > 0) {
      alerts.push({
        id: 'cash_pending_validation', type: 'cash_pending_validation',
        severity: pendingValidation.length > 2 ? 'critical' : 'warning',
        title: `${pendingValidation.length} cierre${pendingValidation.length > 1 ? 's' : ''} pendiente${pendingValidation.length > 1 ? 's' : ''} de validación`,
        message: pendingValidation.slice(0, 2).map((s) => s.pointOfSaleName || s.terminalName || 'Caja').join(', '),
        sessionId: pendingValidation.length === 1 ? pendingValidation[0]._id : undefined,
        route: '/saas/vertical/delivery/caja', createdAt: now,
      });
    }

    const closedToday = tpvSessions.filter(
      (s) => s.status === 'closed' && String(s.closedAt || '').startsWith(dayKey),
    );
    for (const s of closedToday) {
      const diff = Math.abs(Number(s.difference || 0));
      if (diff >= discrepancyThreshold) {
        alerts.push({
          id: `register_discrep_${s._id}`, type: 'register_discrepancy',
          severity: diff >= discrepancyThreshold * 3 ? 'critical' : 'warning',
          title: 'Descuadre de caja',
          message: `${s.pointOfSaleName || s.terminalName || 'Caja'}: ${Number(s.difference) >= 0 ? '+' : ''}${Number(s.difference).toFixed(2)}€`,
          sessionId: s._id, route: '/saas/vertical/delivery/caja', createdAt: s.closedAt || now,
        });
      }
    }
  }

  if (Array.isArray(catalogItems) && canEmitCatalogStockAlerts(catalogItems)) {
    const critical = filterStockTrackedCatalogItems(catalogItems)
      .filter((i) => i.stockQuantity != null && i.minStock > 0 && i.stockQuantity <= i.minStock);
    for (const item of critical.slice(0, 5)) {
      alerts.push({
        id: `stock_${item._id}`, type: 'critical_stock', severity: item.stockQuantity <= 0 ? 'critical' : 'warning',
        title: `Stock crítico: ${item.name}`,
        message: `${item.stockQuantity} ${item.unit || 'uds'} (mín: ${item.minStock})`,
        itemId: item._id, route: '/saas/articles', createdAt: now,
      });
    }
  }

  if (deliveryReady) {
    const incidents = orders.filter(o => o.status === 'incident');
    if (incidents.length > 0) {
      alerts.push({
        id: 'open_incidents', type: 'open_incident', severity: 'warning',
        title: `${incidents.length} incidencia(s) abierta(s)`,
        message: incidents.slice(0, 2).map(o => `${o.orderNumber}: ${o.incidentType || 'General'}`).join(', '),
        route: '/saas/delivery-reparto', createdAt: incidents[0]?.updatedAt || incidents[0]?.createdAt || now,
      });
    }
  }

  return alerts;
}

export async function getOpsCenter(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    // El Centro Operativo agrega KPIs, ingresos, todas las cajas y pedidos del
    // negocio. No es para trabajadores: si el caller es un team member invitado
    // devolvemos 403 sin filtrar nada. El frontend ya redirige antes, esto es
    // defensa en profundidad.
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso al centro operativo' });
    }
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { salesPointId: salesPointIdRaw, channel, timeSlot, date: dateParam } = req.query;
    const businessIdQuery = String(req.query.businessId || req.query.business_id || '')
      .replace(/^business:/, '')
      .trim();
    const targetDate = dateParam || new Date().toISOString().slice(0, 10);

    const db = getDeliveryDbName();
    await ensureDatabase(req, db);

    let businessPdvs = null;
    if (businessIdQuery) {
      businessPdvs = await listScopedPointsOfSaleForBusiness(req, userId, businessIdQuery, {
        includeInactive: true,
      });
    }

    let salesPointId = salesPointIdRaw;
    if (salesPointId && businessPdvs && businessPdvs.length > 0) {
      const pdvOk = businessPdvs.some((p) => p._id === String(salesPointId).trim());
      if (!pdvOk) salesPointId = null;
    }

    const configId = `dlvconf-${userId}`;
    let configDoc;
    try { configDoc = await getDocument(req, db, configId); } catch { configDoc = null; }
    if (!configDoc || configDoc.type !== 'delivery_config') {
      configDoc = buildDeliveryConfigDocument(userId, {});
      const saved = await putDocument(req, db, configDoc._id, configDoc);
      configDoc._rev = saved.rev;
    }
    const config = sanitizeDeliveryConfig(configDoc);

    let slotObj = null;
    if (timeSlot && config.activeTimeSlots) {
      slotObj = config.activeTimeSlots.find(s => s.id === timeSlot) || null;
    }

    const allOrders = await listDeliveryOrdersByUser(req, userId);
    let dayOrders = allOrders.filter(o => isSameDay(o.createdAt, targetDate));

    if (salesPointId) {
      const pdvs = businessPdvs || (await listScopedPointsOfSaleForUser(req, userId));
      const primaryPdvId = pickPrimaryPdvId(pdvs);
      const pdv = String(salesPointId).trim();
      const pdvDoc = (pdvs || []).find((p) => p && p._id === pdv);
      const pdvName = String(pdvDoc?.name || '').trim();
      const pdvWorkCenterId = String(pdvDoc?.workCenterId || '').trim();
      dayOrders = dayOrders.filter((o) =>
        orderMatchesPdvScope(o, pdv, primaryPdvId, pdvName, pdvWorkCenterId),
      );
    } else if (businessPdvs && businessPdvs.length > 0) {
      dayOrders = dayOrders.filter((o) => orderMatchesBusinessPdvs(o, businessPdvs));
    }
    if (channel) dayOrders = dayOrders.filter(o => o.channel === channel);
    if (slotObj) dayOrders = dayOrders.filter(o => isInTimeSlot(o.createdAt, slotObj));

    const orders = dayOrders.map(sanitizeDeliveryOrder);

    const activeStatuses = ['nuevo', 'cocina', 'listo', 'en_reparto', 'incident'];
    const activeOrders = orders.filter(o => activeStatuses.includes(o.status));

    const byStatus = { nuevo: 0, cocina: 0, listo: 0, en_reparto: 0, entregado: 0, cancelled: 0, incident: 0 };
    for (const o of orders) { if (byStatus[o.status] !== undefined) byStatus[o.status]++; }

    const delivered = orders.filter(o => o.status === 'entregado');
    const revenue = delivered.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const avgTicket = delivered.length > 0 ? revenue / delivered.length : 0;

    const prepTimes = delivered
      .map(o => o.kitchenStartedAt && o.assemblyCompletedAt ? (new Date(o.assemblyCompletedAt) - new Date(o.kitchenStartedAt)) / 60000 : null)
      .filter(Boolean);
    const avgPrepTime = prepTimes.length > 0 ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : 0;

    const deliveryTimes = delivered
      .map(o => o.createdAt && o.deliveredAt ? (new Date(o.deliveredAt) - new Date(o.createdAt)) / 60000 : null)
      .filter(Boolean);
    const avgDeliveryTime = deliveryTimes.length > 0 ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;
    const businessOp = businessIdQuery
      ? await getBusinessAlertsOperational(req, businessIdQuery)
      : (account.businessId ? await getBusinessAlertsOperational(req, account.businessId) : null);
    const deliveryAlertCfg = resolveDeliveryAlertConfig(account, businessOp);
    const cashCfg = resolveCashRegisterAlertConfig(account, businessOp);
    const delayThreshold = deliveryAlertCfg.delayThresholds?.delivery || config.delayThresholdMinutes || 40;
    const deliveredOnTime = deliveryTimes.filter(t => t <= delayThreshold).length;
    const deliveredLate = deliveryTimes.filter(t => t > delayThreshold).length;

    const [tpvSessions, driverSessions, pointsOfSaleAll] = await Promise.all([
      listTpvRegisterSessionsByUser(req, userId),
      listDriverCashSessionsByUser(req, userId),
      listScopedPointsOfSaleForUser(req, userId).catch(() => []),
    ]);
    const pointsOfSale = businessPdvs || pointsOfSaleAll;
    const scopedTpvSessions = scopeTpvSessionsForOps(tpvSessions, salesPointId, businessPdvs);
    const scopedPointsOfSale = scopePointsOfSaleForOps(pointsOfSale, salesPointId, businessPdvs);
    let openTpv = scopedTpvSessions.filter(s => s.status === 'open');
    const openDriverSessions = driverSessions.filter(s => s.status === 'open');

    let catalogItems = [];
    try { catalogItems = await listCatalogItemsByUser(req, userId, { module: 'stock' }); } catch { /* ignore */ }

    const alerts = buildAlerts(
      orders,
      scopedTpvSessions,
      driverSessions,
      catalogItems,
      config,
      scopedPointsOfSale,
      deliveryAlertCfg,
      cashCfg,
      targetDate,
    );

    const inKitchen = orders.filter(o => o.status === 'cocina');
    const kitchenOldest = inKitchen.reduce((max, o) => Math.max(max, minutesSince(o.createdAt)), 0);
    const kitchenAvgWait = inKitchen.length > 0
      ? inKitchen.reduce((s, o) => s + minutesSince(o.createdAt), 0) / inKitchen.length : 0;

    // "Pedidos en reparto" para el ops center: ahora vienen marcados con el
    // estado intermedio 'en_reparto'. Mantenemos la rama 'listo' con repartidor
    // por compatibilidad con pedidos anteriores al cambio.
    const inDelivery = orders.filter(o => (o.status === 'en_reparto' || (o.status === 'listo' && !!o.assignedDriver)) && o.deliveryType === 'domicilio');
    const drivers = new Set(inDelivery.map(o => o.assignedDriver).filter(Boolean));

    const revenueByChannel = {};
    for (const o of delivered) {
      const ch = o.channel || 'direct';
      revenueByChannel[ch] = (revenueByChannel[ch] || 0) + (o.totalAmount || 0);
    }

    const revenueByHour = {};
    for (const o of delivered) {
      if (!o.createdAt) continue;
      const hour = o.createdAt.slice(11, 13) + ':00';
      if (!revenueByHour[hour]) revenueByHour[hour] = { hour, revenue: 0, orders: 0 };
      revenueByHour[hour].revenue += o.totalAmount || 0;
      revenueByHour[hour].orders++;
    }

    const revenueByBrand = {};
    const revenueByCategory = {};
    for (const o of delivered) {
      accumulateDeliveredOrderLines(o, revenueByBrand, revenueByCategory);
    }

    const pdvs = pointsOfSale;

    let brandLabels = {};
    const brandBusinessId = businessIdQuery || String(account.business_id || account.businessId || '').trim();
    if (brandBusinessId) {
      try {
        const brands = await listBrandsByBusiness(req, brandBusinessId);
        brandLabels = Object.fromEntries(
          (brands || []).map((b) => [String(b._id || b.id || ''), String(b.name || '').trim()]).filter(([id]) => id),
        );
      } catch {
        brandLabels = {};
      }
    }

    return res.json({
      ok: true,
      date: targetDate,
      filters: {
        salesPointId: salesPointId || null,
        channel: channel || null,
        timeSlot: timeSlot || null,
        businessId: businessIdQuery || null,
      },
      config,
      kpis: {
        totalOrders: orders.length,
        byStatus,
        revenue: Math.round(revenue * 100) / 100,
        averageTicket: Math.round(avgTicket * 100) / 100,
        avgPrepTimeMinutes: Math.round(avgPrepTime * 10) / 10,
        avgDeliveryTimeMinutes: Math.round(avgDeliveryTime * 10) / 10,
        deliveredOnTime, deliveredLate,
        onTimePercentage: deliveryTimes.length > 0 ? Math.round(deliveredOnTime / deliveryTimes.length * 1000) / 10 : 100,
      },
      activeOrders,
      alerts,
      cashStatus: {
        openTpvSessions: openTpv.map(sanitizeTpvRegisterSession),
        openDriverSessions: openDriverSessions.map(sanitizeDriverCashSession),
        totalCashInRegisters: openTpv.reduce((s, sess) => {
          const txTotal = (sess.transactions || []).filter(t => t.paymentMethod === 'efectivo')
            .reduce((sum, t) => sum + (t.type === 'sale' || t.type === 'cash_in' ? t.amount : -t.amount), 0);
          return s + (sess.initialCashAmount || 0) + txTotal;
        }, 0),
        pendingClose: openTpv.filter(s => minutesSince(s.openedAt) / 60 > 14).length,
        pendingValidation: scopedTpvSessions.filter(s => s.status === 'closed' && s.closingValidationStatus === 'pending').length,
        todayTotalSales: (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          return scopedTpvSessions.filter(s => s.openedAt?.startsWith(todayStr)).reduce((sum, s) => {
            return sum + (s.transactions || []).filter(t => t.type === 'sale').reduce((ts, t) => ts + (t.amount || 0), 0);
          }, 0);
        })(),
        todaySalesByMethod: (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const result = { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 };
          for (const s of scopedTpvSessions.filter(s => s.openedAt?.startsWith(todayStr))) {
            for (const t of (s.transactions || []).filter(t => t.type === 'sale')) {
              result[t.paymentMethod] = (result[t.paymentMethod] || 0) + (t.amount || 0);
            }
          }
          return result;
        })(),
        todayDiscrepancy: (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          return scopedTpvSessions.filter(s => s.status === 'closed' && s.closedAt?.startsWith(todayStr)).reduce((sum, s) => sum + (s.difference || 0), 0);
        })(),
        openIncidentCount: scopedTpvSessions.reduce((sum, s) => sum + (s.incidents || []).filter(i => !i.resolvedAt).length, 0),
        recentCashMovements: collectOpsCashMovements(scopedTpvSessions, targetDate, salesPointId),
      },
      kitchenStatus: {
        ordersInKitchen: inKitchen.length,
        capacity: config.maxKitchenCapacity,
        saturationPercent: config.maxKitchenCapacity > 0 ? Math.round(inKitchen.length / config.maxKitchenCapacity * 1000) / 10 : 0,
        oldestOrderMinutes: Math.round(kitchenOldest * 10) / 10,
        avgWaitMinutes: Math.round(kitchenAvgWait * 10) / 10,
      },
      deliveryStatus: {
        ordersInDelivery: inDelivery.length,
        driversActive: drivers.size,
        avgDeliveryMinutes: Math.round(avgDeliveryTime * 10) / 10,
        delayedCount: orders.filter(o => activeStatuses.includes(o.status) && minutesSince(o.createdAt) > delayThreshold).length,
      },
      revenueByChannel,
      revenueByHour: Object.values(revenueByHour).sort((a, b) => a.hour.localeCompare(b.hour)),
      revenueByBrand: roundRevenueMap(revenueByBrand),
      revenueByCategory: roundRevenueMap(revenueByCategory),
      brandLabels,
      pointsOfSale: pdvs.map(sanitizePointOfSale),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar centro operativo' });
  }
}

// ─── SSE BROADCASTING HELPERS ────────────────────────────────────────────────

function resolveAccountBusinessId(account) {
  return String(account?.business_id || account?.businessId || '').replace(/^business:/, '').trim();
}

/** Empresa del pedido/sesión (multi-empresa): no usar solo la ficha de cuenta. */
function resolveLiveBusinessId(account, doc) {
  return (
    String(doc?.business_id || doc?.businessId || '')
      .replace(/^business:/, '')
      .trim() || resolveAccountBusinessId(account)
  );
}

function broadcastDeliveryOrderSse(account, ownerUserId, action, orderDoc, meta = {}) {
  const sanitized = sanitizeDeliveryOrder(orderDoc);
  const businessId = resolveLiveBusinessId(account, orderDoc);

  if (action === 'created') {
    broadcastToUser(ownerUserId, 'delivery_order_created', sanitized);
    if (businessId) {
      broadcastToBusiness(businessId, 'delivery:order_created', { order: sanitized, userId: ownerUserId });
    }
    return;
  }

  if (action === 'updated') {
    broadcastToUser(ownerUserId, 'delivery_order_updated', sanitized);
    const oldStatus = meta.oldStatus;
    const newStatus = sanitized.status;
    if (businessId && oldStatus && newStatus && oldStatus !== newStatus) {
      broadcastToBusiness(businessId, 'delivery:order_status_changed', {
        orderId: sanitized._id,
        order: sanitized,
        oldStatus,
        newStatus,
        updatedBy: meta.updatedBy || ownerUserId,
      });
      if (newStatus === 'incident') {
        broadcastToBusiness(businessId, 'delivery:incident_reported', {
          orderId: sanitized._id,
          order: sanitized,
          incidentType: sanitized.incidentType,
        });
      }
      if (oldStatus === 'incident' && newStatus !== 'incident') {
        broadcastToBusiness(businessId, 'delivery:incident_resolved', {
          orderId: sanitized._id,
          order: sanitized,
          newStatus,
        });
      }
    } else if (businessId) {
      // Cobros / cambios sin cambio de estado: ops y dashboard deben enterarse
      broadcastToBusiness(businessId, 'delivery:order_updated', {
        orderId: sanitized._id,
        order: sanitized,
        updatedBy: meta.updatedBy || ownerUserId,
      });
    }
    return;
  }

  if (action === 'cancelled') {
    broadcastToUser(ownerUserId, 'delivery_order_cancelled', { order: sanitized, reason: meta.reason });
    if (businessId) {
      broadcastToBusiness(businessId, 'delivery:order_status_changed', {
        orderId: sanitized._id,
        order: sanitized,
        oldStatus: meta.oldStatus,
        newStatus: 'cancelled',
        updatedBy: ownerUserId,
      });
    }
    return;
  }

  if (action === 'reopened') {
    broadcastToUser(ownerUserId, 'delivery_order_reopened', sanitized);
    if (businessId) {
      broadcastToBusiness(businessId, 'delivery:order_status_changed', {
        orderId: sanitized._id,
        order: sanitized,
        oldStatus: meta.oldStatus,
        newStatus: sanitized.status,
        updatedBy: ownerUserId,
      });
    }
    return;
  }

  if (action === 'refunded') {
    broadcastToUser(ownerUserId, 'delivery_order_updated', sanitized);
    if (businessId) {
      broadcastToBusiness(businessId, 'delivery:order_updated', {
        orderId: sanitized._id,
        order: sanitized,
        updatedBy: ownerUserId,
      });
      broadcastToBusiness(businessId, 'delivery_payment_registered', sanitized);
    }
  }
}

function emitDeliveryEvent(account, event, payload) {
  const businessId =
    resolveLiveBusinessId(account, payload?.order || payload) || resolveAccountBusinessId(account);
  if (!businessId) return;
  try {
    broadcastToBusiness(businessId, event, payload);
  } catch {
    /* ignore */
  }
}

function broadcastTpvSessionLive(account, ownerUserId, sessionDoc) {
  const sanitized = sanitizeTpvRegisterSession(sessionDoc);
  broadcastToUser(ownerUserId, 'tpv_session_updated', sanitized);
  const businessId = resolveLiveBusinessId(account, sessionDoc);
  if (businessId) {
    try {
      broadcastToBusiness(businessId, 'tpv_session_updated', sanitized);
    } catch {
      /* ignore */
    }
  }
}

function broadcastDeliveryPaymentLive(account, ownerUserId, orderDoc) {
  const sanitized = sanitizeDeliveryOrder(orderDoc);
  broadcastToUser(ownerUserId, 'delivery_payment_registered', sanitized);
  const businessId = resolveLiveBusinessId(account, orderDoc);
  if (businessId) {
    try {
      broadcastToBusiness(businessId, 'delivery_payment_registered', sanitized);
      // Alias para clientes que solo escuchan cambios de pedido
      broadcastToBusiness(businessId, 'delivery:order_updated', {
        orderId: sanitized._id,
        order: sanitized,
      });
    } catch {
      /* ignore */
    }
  }
}

// ─── SCALE DEVICES ──────────────────────────────────────────────────────────

async function ensureScaleDeviceOwner(req, userId, deviceId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, deviceId);
  if (!doc || doc.type !== 'scale_device' || doc.user_id !== userId) return null;
  return doc;
}

export async function listScaleDevices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const devices = await listScaleDevicesByUser(req, userId);
    return res.json({ ok: true, scaleDevices: devices.map(sanitizeScaleDevice) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar dispositivos de báscula' });
  }
}

export async function getScaleDevice(req, res) {
  try {
    const { userId, deviceId } = req.params;
    if (!userId || !deviceId) return badRequest(res, 'Faltan parámetros');
    const doc = await ensureScaleDeviceOwner(req, userId, deviceId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Dispositivo no encontrado' });
    return res.json({ ok: true, scaleDevice: sanitizeScaleDevice(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener dispositivo' });
  }
}

export async function createScaleDevice(req, res) {
  try {
    const { userId } = req.params;
    const { scaleDevice } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!scaleDevice || typeof scaleDevice !== 'object') return badRequest(res, 'Falta el objeto scaleDevice');
    if (!scaleDevice.name) return badRequest(res, 'El nombre del dispositivo es obligatorio');
    if (!scaleDevice.connectionType) return badRequest(res, 'El tipo de conexión es obligatorio');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const doc = buildScaleDeviceDocument(userId, scaleDevice);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'scale_device',
      action: `Registró báscula "${doc.name}" (${doc.brand} ${doc.model}) — ${doc.connectionType}`,
      entityId: doc._id, entityLabel: doc.name,
      metadata: { brand: doc.brand, model: doc.model, connectionType: doc.connectionType },
    });
    return res.status(201).json({ ok: true, scaleDevice: sanitizeScaleDevice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear dispositivo de báscula' });
  }
}

export async function updateScaleDevice(req, res) {
  try {
    const { userId, deviceId } = req.params;
    const { scaleDevice } = req.body || {};
    if (!scaleDevice || typeof scaleDevice !== 'object') return badRequest(res, 'Faltan datos del dispositivo');
    const existing = await ensureScaleDeviceOwner(req, userId, deviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Dispositivo no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getDeliveryDbName();
    const doc = buildScaleDeviceDocument(userId, { ...existing, ...scaleDevice }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'scale_device', action: `Actualizó báscula "${doc.name}"`,
      entityId: doc._id, entityLabel: doc.name,
      metadata: { connectionType: doc.connectionType },
    });
    return res.json({ ok: true, scaleDevice: sanitizeScaleDevice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar dispositivo' });
  }
}

export async function removeScaleDevice(req, res) {
  try {
    const { userId, deviceId } = req.params;
    const existing = await ensureScaleDeviceOwner(req, userId, deviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Dispositivo no encontrado' });
    const db = getDeliveryDbName();
    await softDeleteDocument(req, db, deviceId);
    return res.json({ ok: true, id: deviceId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar dispositivo' });
  }
}

export async function assignScaleToTerminal(req, res) {
  try {
    const { userId, pdvId, terminalId } = req.params;
    const { scaleDeviceId } = req.body || {};
    const pdv = await ensurePointOfSaleOwner(req, userId, pdvId);
    if (!pdv) return res.status(404).json({ ok: false, error: 'Punto de venta no encontrado' });

    let scaleName = '';
    if (scaleDeviceId) {
      const scaleDoc = await ensureScaleDeviceOwner(req, userId, scaleDeviceId);
      if (!scaleDoc) return res.status(404).json({ ok: false, error: 'Dispositivo de báscula no encontrado' });
      scaleName = scaleDoc.name || '';
    }

    const updatedTerminals = (pdv.terminals || []).map((t) => {
      if (t.id === terminalId) {
        return { ...t, scaleDeviceId: scaleDeviceId || '', scaleName };
      }
      if (scaleDeviceId && t.scaleDeviceId === scaleDeviceId) {
        return { ...t, scaleDeviceId: '', scaleName: '' };
      }
      return t;
    });

    const terminalFound = updatedTerminals.some((t) => t.id === terminalId);
    if (!terminalFound) return res.status(404).json({ ok: false, error: 'Terminal no encontrado en este punto de venta' });

    const db = getDeliveryDbName();
    const doc = buildPointOfSaleDocument(userId, { ...pdv, terminals: updatedTerminals }, pdv);
    const saved = await putDocument(req, db, doc._id, doc);

    const account = await findAccountByUserId(req, userId);
    const terminalName = updatedTerminals.find((t) => t.id === terminalId)?.name || terminalId;
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || '', targetUserId: userId,
      type: 'scale_device',
      action: scaleDeviceId
        ? `Asignó báscula "${scaleName}" al terminal "${terminalName}" en "${doc.name}"`
        : `Desasignó báscula del terminal "${terminalName}" en "${doc.name}"`,
      entityId: doc._id, entityLabel: doc.name,
      metadata: { terminalId, scaleDeviceId: scaleDeviceId || '' },
    });

    emitDeliveryEvent(account, 'scale:assignment_changed', {
      pdvId, terminalId, scaleDeviceId: scaleDeviceId || '',
    });

    return res.json({ ok: true, pointOfSale: sanitizePointOfSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al asignar báscula' });
  }
}

export async function getTerminalScale(req, res) {
  try {
    const { userId, pdvId, terminalId } = req.params;
    const pdv = await ensurePointOfSaleOwner(req, userId, pdvId);
    if (!pdv) return res.status(404).json({ ok: false, error: 'Punto de venta no encontrado' });

    const terminal = (pdv.terminals || []).find((t) => t.id === terminalId);
    if (!terminal) return res.status(404).json({ ok: false, error: 'Terminal no encontrado' });

    if (!terminal.scaleDeviceId) {
      return res.json({ ok: true, scaleDevice: null });
    }

    const scaleDoc = await ensureScaleDeviceOwner(req, userId, terminal.scaleDeviceId);
    return res.json({ ok: true, scaleDevice: scaleDoc ? sanitizeScaleDevice(scaleDoc) : null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener báscula del terminal' });
  }
}

export async function reportScaleStatus(req, res) {
  try {
    const { userId, deviceId } = req.params;
    const { status, message, terminalId, pdvId } = req.body || {};
    if (!status) return badRequest(res, 'Falta el estado');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (status === 'disconnected' || status === 'error') {
      const scaleDoc = await ensureScaleDeviceOwner(req, userId, deviceId);
      const scaleName = scaleDoc?.name || deviceId;
      emitDeliveryEvent(account, 'scale:status_changed', {
        deviceId, status, message: message || '',
        terminalId: terminalId || '', pdvId: pdvId || '', scaleName,
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reportar estado' });
  }
}

// ─── DRIVERS ──────────────────────────────────────────────────────────────────

export async function listDrivers(req, res) {
  try {
    const { userId } = req.params;
    const docs = await listDriversByUser(req, userId);
    return res.json({ ok: true, drivers: docs.map(sanitizeDriver) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar repartidores' });
  }
}

export async function createDriver(req, res) {
  try {
    const { userId } = req.params;
    const data = req.body || {};
    if (!data.name?.trim()) return badRequest(res, 'El nombre es obligatorio');
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const doc = buildDriverDocument(userId, data);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, driver: sanitizeDriver({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear repartidor' });
  }
}

export async function updateDriver(req, res) {
  try {
    const { userId, driverId } = req.params;
    const data = req.body || {};
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, driverId);
    if (!existing || existing.type !== 'driver' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Repartidor no encontrado' });
    }
    const doc = buildDriverDocument(userId, data, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, driver: sanitizeDriver({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar repartidor' });
  }
}

export async function removeDriver(req, res) {
  try {
    const { userId, driverId } = req.params;
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, driverId);
    if (!existing || existing.type !== 'driver' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Repartidor no encontrado' });
    }
    await softDeleteDocument(req, db, driverId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar repartidor' });
  }
}

export async function getDriversStats(req, res) {
  try {
    const { userId } = req.params;
    const drivers = await listDriversByUser(req, userId);
    const orders = await listDeliveryOrdersByUser(req, userId);
    const stats = drivers.map(d => {
      const driverOrders = orders.filter(o => o.driverId === d._id);
      return {
        driverId: d._id,
        name: d.name,
        totalOrders: driverOrders.length,
        delivered: driverOrders.filter(o => o.status === 'entregado').length,
        pending: driverOrders.filter(o => !['entregado', 'cancelado'].includes(o.status)).length,
      };
    });
    return res.json({ ok: true, stats });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estadísticas' });
  }
}

export async function getRepartoConfig(req, res) {
  try {
    const { userId } = req.params;
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const config = docs.find(d => d?.type === 'reparto_config' && d?.user_id === userId);
    return res.json({ ok: true, config: config ? sanitizeRepartoConfig(config) : null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener configuración' });
  }
}

export async function saveRepartoConfig(req, res) {
  try {
    const { userId } = req.params;
    const data = req.body || {};
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find(d => d?.type === 'reparto_config' && d?.user_id === userId);
    const doc = buildRepartoConfigDocument(userId, data, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, config: sanitizeRepartoConfig({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al guardar configuración' });
  }
}

export async function autoAssignDriver(req, res) {
  try {
    const { userId, orderId } = req.params;
    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const order = await getDocument(req, db, orderId);
    if (!order || order.type !== 'delivery_order' || order.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    const drivers = await listDriversByUser(req, userId);
    const active = drivers.filter(d => d.active !== false && !d.deletedAt);
    if (active.length === 0) {
      return badRequest(res, 'No hay repartidores disponibles');
    }
    const orders = await listDeliveryOrdersByUser(req, userId);
    let best = active[0];
    let minLoad = Infinity;
    for (const d of active) {
      const load = orders.filter(o => o.driverId === d._id && !['entregado', 'cancelado'].includes(o.status)).length;
      if (load < minLoad) { minLoad = load; best = d; }
    }
    const updated = { ...order, driverId: best._id, driverName: best.name, updatedAt: new Date().toISOString() };
    const saved = await putDocument(req, db, updated._id, updated);
    return res.json({ ok: true, order: sanitizeDeliveryOrder({ ...updated, _rev: saved.rev }), assignedDriver: sanitizeDriver(best) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al asignar repartidor' });
  }
}
