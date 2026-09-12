import {
  buildWebOrderDocument,
  ensureDatabase,
  findBusinessById,
  filterCatalogDocsByBusinessScope,
  getDocument,
  getWebDbName,
  listCatalogItemsByUser,
  listBusinessesByUser,
  listScopedPointsOfSaleForBusiness,
  putDocument,
  sanitizePointOfSalePublicOrderingConfig,
  sanitizeWebOrder,
} from './couchdb.js';
import { resolveMesaQrContext } from './mesaQrService.js';
import { resolveCustomerKioskContext } from './customerKioskService.js';
import { broadcastToBusiness, broadcastToUser } from './sseService.js';
import { getPublicOrderAdapter } from './adapters/publicOrderAdapterRegistry.js';
import { resolvePublicOrderingPolicy } from '../shared/publicOrderingPolicy.js';

function businessIdOf(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function publicOrderPolicyForBusiness(business, orderContext = {}) {
  return resolvePublicOrderingPolicy(business?.businessType, orderContext);
}

async function serverPriceItems(req, ownerUserId, businessId, rawItems) {
  const catalog = await listCatalogItemsByUser(req, ownerUserId, {
    module: 'catalog',
  });
  const ownerBusinesses = await listBusinessesByUser(req, ownerUserId).catch(() => []);
  const scopedCatalog = filterCatalogDocsByBusinessScope(
    catalog,
    businessId,
    Math.max(1, ownerBusinesses.length),
  );
  const active = new Map(
    scopedCatalog
      .filter((item) => (
        item
        && item.active !== false
        && item.available !== false
        && item.webVisible !== false
        && String(item.module || '') !== 'stock'
      ))
      .map((item) => [String(item._id), item]),
  );

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError('Añade al menos un producto al pedido');
  }

  return rawItems.map((raw) => {
    const catalogItem = active.get(String(raw?.id || raw?.catalogItemId || ''));
    if (!catalogItem) throw httpError('Uno de los productos ya no está disponible', 409);
    const quantity = Math.floor(Number(raw?.quantity || 0));
    if (!(quantity > 0) || quantity > 99) throw httpError('Cantidad de producto no válida');
    const unitPrice = Math.round(Number(catalogItem.unitPrice || 0) * 100) / 100;
    return {
      id: catalogItem._id,
      catalogItemId: catalogItem._id,
      name: String(catalogItem.name || ''),
      category: String(catalogItem.category || ''),
      productionArea: String(catalogItem.productionArea || ''),
      taxRate: Number(catalogItem.taxRate ?? 10),
      quantity,
      unitPrice,
      total: Math.round(unitPrice * quantity * 100) / 100,
      notes: String(raw?.notes || '').slice(0, 500),
      _salesPointId: String(catalogItem.salesPointId || ''),
    };
  });
}

export async function preparePublicOrderRequest(req, { config, slug, order }) {
  const businessId = businessIdOf(config?.business_id);
  const business = await findBusinessById(req, businessId);
  if (!business) throw httpError('Negocio no encontrado', 404);
  const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
  if (!ownerUserId) throw httpError('No se pudo identificar al titular del negocio', 409);

  const policy = publicOrderPolicyForBusiness(business, order);
  if (!policy.supported) {
    throw httpError('Este tipo de negocio no admite pedidos web', 403);
  }
  const items = await serverPriceItems(req, ownerUserId, businessId, order.items);
  let mesa = null;
  let kiosk = null;
  let salesPointId = '';

  if (order.mesaToken) {
    if (!policy.supportsTableQr) throw httpError('Este negocio no admite pedidos por mesa', 403);
    mesa = await resolveMesaQrContext(req, {
      token: order.mesaToken,
      tableId: order.tableId,
      businessId,
      slug,
    });
    salesPointId = mesa.salesPointId;
  } else if (order.kioskToken) {
    kiosk = await resolveCustomerKioskContext(req, {
      token: order.kioskToken,
      businessId,
      slug,
    });
    salesPointId = kiosk.salesPointId;
    const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    if (subtotal < kiosk.fulfillment.minimumOrder) {
      throw httpError(`El pedido mínimo de esta tienda es ${kiosk.fulfillment.minimumOrder.toFixed(2)} €`);
    }
    order = {
      ...order,
      customerName: String(order.customerName || '').trim() || 'Cliente kiosco',
      customerPhone: '',
      salesPointName: kiosk.salesPointName,
      _resolvedFulfillment: kiosk.fulfillment,
    };
  } else {
    if (!String(order.customerName || '').trim() || !String(order.customerPhone || '').trim()) {
      throw httpError('Nombre y teléfono son obligatorios');
    }
    if (!policy.allowedOrderTypes.includes(String(order.orderType || ''))) {
      throw httpError('El método de entrega no está disponible');
    }
    if (order.orderType === 'delivery' && !String(order.customerAddress || '').trim()) {
      throw httpError('La dirección de entrega es obligatoria');
    }
    const configured = Array.isArray(config.salesPointIds)
      ? config.salesPointIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const scopedPdvs = await listScopedPointsOfSaleForBusiness(
      req,
      ownerUserId,
      businessId,
    ).catch(() => []);
    const scopedById = new Map(
      (scopedPdvs || [])
        .filter((pdv) => pdv && pdv.active !== false && !pdv.deletedAt)
        .map((pdv) => [String(pdv._id || ''), pdv]),
    );
    salesPointId = String(order.salesPointId || '').trim();
    if (!salesPointId && configured.length === 1) salesPointId = configured[0];
    if (!salesPointId || !scopedById.has(salesPointId)) {
      throw httpError('La tienda seleccionada no está disponible');
    }
    if (configured.length > 0 && !configured.includes(salesPointId)) {
      throw httpError('La tienda seleccionada no está disponible');
    }
    const pdv = scopedById.get(salesPointId);
    const fulfillment = pdv?.publicOrderingConfig
      ? sanitizePointOfSalePublicOrderingConfig(pdv.publicOrderingConfig)
      : sanitizePointOfSalePublicOrderingConfig({
        pickupEnabled: config.pickupEnabled,
        deliveryEnabled: config.deliveryEnabled,
        minimumOrder: config.minimumOrder,
        deliveryFee: config.deliveryFee,
        estimatedDeliveryTime: config.estimatedDeliveryTime,
        deliveryRadius: config.deliveryRadius,
        shippingMode: config.shippingMode,
        shippingZones: config.shippingZones,
      });
    if (order.orderType === 'delivery' && !fulfillment.deliveryEnabled) {
      throw httpError('El envío a domicilio no está disponible');
    }
    if (order.orderType === 'pickup' && !fulfillment.pickupEnabled) {
      throw httpError('La recogida no está disponible');
    }
    const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    if (subtotal < fulfillment.minimumOrder) {
      throw httpError(`El pedido mínimo de esta tienda es ${fulfillment.minimumOrder.toFixed(2)} €`);
    }
    order = {
      ...order,
      salesPointName: String(pdv?.name || pdv?.code || ''),
      _resolvedFulfillment: fulfillment,
    };
  }

  return {
    business,
    ownerUserId,
    policy,
    fulfillment: order._resolvedFulfillment || null,
    order: {
      ...order,
      _resolvedFulfillment: undefined,
      items: items.map((item) => {
        if (item._salesPointId && item._salesPointId !== salesPointId) {
          throw httpError('Uno de los productos no está disponible en esta tienda', 409);
        }
        const { _salesPointId: _scope, ...publicItem } = item;
        return publicItem;
      }),
      salesPointId,
      customerName: String(order.customerName || '').trim() || 'Cliente mesa',
      customerPhone: String(order.customerPhone || '').trim(),
      orderType: mesa ? 'sala' : kiosk ? 'pickup' : order.orderType,
      sourceChannel: kiosk ? 'customer_kiosk' : policy.sourceChannel,
      targetKind: policy.targetKind,
      reviewStatus: 'pending',
      ...(mesa ? {
        tableId: mesa.table._id,
        tableNumber: mesa.table.number,
        tableName: mesa.table.name,
        mesaToken: String(mesa.table.qrCode || ''),
      } : {}),
    },
  };
}

async function loadScopedPublicOrder(req, businessId, orderId) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const order = await getDocument(req, db, orderId);
  if (
    !order
    || order.type !== 'web_order'
    || businessIdOf(order.business_id) !== businessIdOf(businessId)
    || order.deletedAt
  ) {
    throw httpError('Solicitud no encontrada', 404);
  }
  return { db, order };
}

export async function reviewPublicOrderRequest(req, {
  businessId,
  orderId,
  action,
  reviewerId,
  reason = '',
}) {
  const { db, order } = await loadScopedPublicOrder(req, businessId, orderId);
  if (action === 'reject') {
    if (order.reviewStatus === 'accepted') throw httpError('El pedido ya fue aceptado', 409);
    if (order.reviewStatus === 'rejected') return sanitizeWebOrder(order);
    const now = new Date().toISOString();
    const rejected = buildWebOrderDocument(businessId, {
      ...order,
      status: 'cancelled',
      reviewStatus: 'rejected',
      reviewedAt: now,
      reviewedBy: reviewerId,
      rejectionReason: String(reason || '').trim(),
      statusHistory: [
        ...(order.statusHistory || []),
        { status: 'cancelled', date: now, notes: String(reason || 'Rechazado por el equipo') },
      ],
    }, order);
    const result = await putDocument(req, db, rejected._id, rejected);
    const saved = sanitizeWebOrder({ ...rejected, _rev: result.rev });
    broadcastToBusiness(businessId, 'public_order:updated', { order: saved });
    return saved;
  }

  if (order.reviewStatus === 'rejected') throw httpError('El pedido ya fue rechazado', 409);
  if (order.reviewStatus === 'accepted') return sanitizeWebOrder(order);

  const business = await findBusinessById(req, businessId);
  if (!business) throw httpError('Negocio no encontrado', 404);
  const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
  const targetKind = String(order.targetKind || (order.tableId ? 'restaurant_table' : 'delivery_ops'));
  const adapter = getPublicOrderAdapter(targetKind);
  if (!adapter) {
    throw httpError('Este tipo de solicitud aún no tiene un adaptador', 409);
  }
  const links = await adapter(req, { order, ownerUserId, businessId });

  const now = new Date().toISOString();
  const accepted = buildWebOrderDocument(businessId, {
    ...order,
    ...links,
    status: 'confirmed',
    reviewStatus: 'accepted',
    reviewedAt: now,
    reviewedBy: reviewerId,
    statusHistory: [
      ...(order.statusHistory || []),
      { status: 'confirmed', date: now, notes: 'Aceptado por el equipo' },
    ],
  }, order);
  let result;
  try {
    result = await putDocument(req, db, accepted._id, accepted);
  } catch (error) {
    if (Number(error?.statusCode) === 409 || /conflict/i.test(String(error?.message || ''))) {
      const fresh = await getDocument(req, db, accepted._id);
      if (fresh?.reviewStatus === 'accepted') return sanitizeWebOrder(fresh);
      throw httpError('El pedido cambió mientras se aceptaba; actualiza la bandeja', 409);
    }
    throw error;
  }
  const saved = sanitizeWebOrder({ ...accepted, _rev: result.rev });
  broadcastToBusiness(businessId, 'public_order:updated', { order: saved });
  broadcastToUser(ownerUserId, 'public_order_updated', saved);
  return saved;
}
