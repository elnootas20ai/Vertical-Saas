import {
  getWebDbName,
  getCatalogDbName,
  getDeliveryDbName,
  buildWebConfigDocument,
  sanitizeWebConfig,
  sanitizeDeliveryIntegrations,
  getWebConfigByBusinessId,
  getWebConfigBySlug,
  buildWebOrderDocument,
  sanitizeWebOrder,
  listWebOrdersByBusiness,
  listCatalogItemsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findBusinessById,
} from '../services/couchdb.js';
import { computeVolumeDiscount } from '../shared/volumeDiscount.js';
import { calculateShippingRates } from '../services/shippingService.js';
import { assertBusinessTeamAccess } from '../services/businessAccess.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function errorMsg(error) {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.reason === 'string') return error.reason;
  if (typeof error.error === 'string') return error.error;
  try { return JSON.stringify(error); } catch { return 'Error interno'; }
}

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

async function isWebOrderingAllowedForBusiness(req, businessId) {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return false;
  const business = await findBusinessById(req, bid);
  return String(business?.businessType || '').trim() !== 'restaurant';
}

/** Tiendas marcadas en web_config para el selector público. */
async function resolvePublicWebStores(req, config) {
  const ids = Array.isArray(config?.salesPointIds)
    ? config.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return [];
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const stores = [];
  for (const id of ids) {
    try {
      const doc = await getDocument(req, db, id);
      if (!doc || doc.type !== 'point_of_sale' || doc.deletedAt || doc.active === false) continue;
      stores.push({
        id: doc._id,
        name: String(doc.name || '').trim() || 'Tienda',
        code: String(doc.code || '').trim(),
        address: String(doc.address || '').trim(),
      });
    } catch {
      /* PDV borrado o inaccesible */
    }
  }
  return stores;
}

async function loadEnabledStorefrontConfig(req, res, slug) {
  const config = await getWebConfigBySlug(req, slug);
  if (!config || !config.enabled) {
    res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
    return null;
  }
  if (!(await isWebOrderingAllowedForBusiness(req, config.business_id))) {
    res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
    return null;
  }
  return config;
}

// ─── PUBLIC ENDPOINTS (no auth) ──────────────────────────────────────────────

export async function getPublicStorefront(req, res) {
  try {
    const { slug } = req.params;
    if (!slug) return badRequest(res, 'Falta slug');

    const config = await loadEnabledStorefrontConfig(req, res, slug);
    if (!config) return;

    const business = await findBusinessById(req, config.business_id).catch(() => null);
    const catalogOwnerId = String(
      business?.owner_user_id || business?.user_id || config.business_id || '',
    ).trim();

    const [catalogItems, stores] = await Promise.all([
      listCatalogItemsByUser(req, catalogOwnerId, { module: 'catalog' }),
      resolvePublicWebStores(req, config),
    ]);
    const activeItems = catalogItems
      .filter((item) => {
        if (item.active === false) return false;
        if (item.webVisible === false) return false;
        if (String(item.module || '') === 'stock') return false;
        return true;
      })
      .map((item) => ({
        _id: item._id,
        name: item.name,
        description: item.description,
        category: String(item.category || '').trim() || 'Carta',
        unitPrice: item.unitPrice,
        unit: item.unit,
        allergens: item.allergens || [],
        image: item.image || (Array.isArray(item.images) ? item.images[0] : '') || '',
        available: item.available !== false,
        vertical: item.vertical || '',
        customFields: item.customFields || {},
      }));

    return res.json({
      ok: true,
      config: sanitizeWebConfig(config),
      catalog: activeItems,
      stores,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function getPublicShippingRates(req, res) {
  try {
    const { slug } = req.params;
    const { postalCode } = req.body || {};
    if (!slug) return badRequest(res, 'Falta slug');

    const config = await loadEnabledStorefrontConfig(req, res, slug);
    if (!config) return;

    if (!config.deliveryEnabled) {
      return res.json({ ok: true, options: [], error: 'El envío a domicilio no está disponible' });
    }

    const result = calculateShippingRates(postalCode, config);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function createPublicOrder(req, res) {
  try {
    const { slug } = req.params;
    const { order } = req.body || {};
    if (!slug) return badRequest(res, 'Falta slug');
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order');

    const config = await loadEnabledStorefrontConfig(req, res, slug);
    if (!config) return;

    if (!config.isOpen) {
      return res.status(400).json({ ok: false, error: config.closedMessage || 'Tienda cerrada' });
    }

    if (!order.customerName || !order.customerPhone) {
      return badRequest(res, 'Nombre y teléfono son obligatorios');
    }

    if (order.tableId) {
      // Pedido desde QR de mesa: no exige flags delivery/pickup de la web de calle.
    } else {
      if (order.orderType === 'delivery' && !config.deliveryEnabled) {
        return badRequest(res, 'El envío a domicilio no está disponible');
      }
      if (order.orderType === 'pickup' && !config.pickupEnabled) {
        return badRequest(res, 'La recogida no está disponible');
      }
    }

    const db = getWebDbName();
    await ensureDatabase(req, db);

    const items = Array.isArray(order.items) ? order.items : [];
    const { rule: volRule, discountAmount: volDiscountAmount } = computeVolumeDiscount(
      config.volumeDiscounts || [],
      items,
    );

    let promoDiscountAmount = 0;
    let appliedPromoCode = '';
    if (order.promoCode && Array.isArray(config.promos)) {
      const promo = config.promos.find(
        (p) => p.code && p.code.toLowerCase() === String(order.promoCode).toLowerCase() && p.active,
      );
      if (promo) {
        appliedPromoCode = promo.code;
        const subtotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
        if (promo.discountType === 'percentage') {
          promoDiscountAmount = Math.round(subtotal * (promo.discountValue / 100) * 100) / 100;
        } else {
          promoDiscountAmount = Math.min(promo.discountValue, subtotal);
        }
      }
    }

    let resolvedDeliveryFee = 0;
    let shippingCarrier = '';
    let shippingZoneName = '';
    let resolvedEstimatedTime = config.estimatedDeliveryTime;

    if (order.orderType === 'delivery') {
      const shippingResult = calculateShippingRates(order.customerPostalCode, config);
      const selectedOption = order.selectedShippingOptionId
        ? shippingResult.options.find((o) => o.id === order.selectedShippingOptionId)
        : shippingResult.options[0];

      if (selectedOption) {
        resolvedDeliveryFee = selectedOption.rate;
        shippingCarrier = selectedOption.carrier;
        if (selectedOption.estimatedTime) resolvedEstimatedTime = selectedOption.estimatedTime;
      } else {
        resolvedDeliveryFee = config.deliveryFee || 0;
      }

      if (shippingResult.zone) {
        shippingZoneName = shippingResult.zone.name;
      }
    }

    const doc = buildWebOrderDocument(config.business_id, {
      ...order,
      promoCode: appliedPromoCode,
      promoDiscount: promoDiscountAmount,
      volumeDiscount: volDiscountAmount,
      volumeDiscountLabel: volRule ? volRule.label : '',
      deliveryFee: resolvedDeliveryFee,
      shippingCarrier,
      shippingZoneName,
      estimatedTime: resolvedEstimatedTime,
      statusHistory: [{ status: 'pending', date: new Date().toISOString(), notes: 'Pedido recibido' }],
    });
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({
      ok: true,
      order: sanitizeWebOrder({ ...doc, _rev: saved.rev }),
      message: config.orderConfirmMessage,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

// ─── PROTECTED ENDPOINTS (require auth) ──────────────────────────────────────

export async function getWebConfig(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const config = await getWebConfigByBusinessId(req, businessId);
    return res.json({ ok: true, config: config ? sanitizeWebConfig(config) : null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function saveWebConfig(req, res) {
  try {
    const { businessId } = req.params;
    const { config } = req.body || {};
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!config || typeof config !== 'object') return badRequest(res, 'Falta el objeto config');
    if (!(await isWebOrderingAllowedForBusiness(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'La tienda web no está disponible para bar/restaurante' });
    }

    if (config.slug) {
      const existing = await getWebConfigBySlug(req, config.slug);
      if (existing && existing.business_id !== businessId) {
        return badRequest(res, 'Ese nombre de URL ya está en uso por otro negocio');
      }
    }

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const current = await getWebConfigByBusinessId(req, businessId);
    const doc = buildWebConfigDocument(businessId, config, current);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, config: sanitizeWebConfig({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function getDeliveryIntegrations(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    const access = await assertBusinessTeamAccess(req, businessId);
    if (!access.ok) return res.status(access.status || 403).json({ ok: false, error: access.error });

    const config = await getWebConfigByBusinessId(req, businessId);
    return res.json({ ok: true, integrations: sanitizeDeliveryIntegrations(config) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function saveDeliveryIntegrations(req, res) {
  try {
    const { businessId } = req.params;
    const { integrations } = req.body || {};
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!integrations || typeof integrations !== 'object') return badRequest(res, 'Falta el objeto integrations');
    const access = await assertBusinessTeamAccess(req, businessId);
    if (!access.ok) return res.status(access.status || 403).json({ ok: false, error: access.error });

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const current = await getWebConfigByBusinessId(req, businessId);
    const prev = current?.integrations || {};

    // Preservar campos OAuth internos al guardar token/enabled desde la UI.
    const merged = {};
    for (const key of ['uber', 'globo', 'justead', 'flipdish']) {
      const incoming = integrations[key] && typeof integrations[key] === 'object' ? integrations[key] : {};
      const existing = prev[key] && typeof prev[key] === 'object' ? prev[key] : {};
      merged[key] = {
        ...existing,
        enabled: Boolean(incoming.enabled),
        token: String(incoming.token ?? existing.token ?? ''),
      };
    }

    const doc = buildWebConfigDocument(businessId, { integrations: merged }, current);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({
      ok: true,
      integrations: sanitizeDeliveryIntegrations({ ...doc, _rev: saved.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function listWebOrders(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const orders = await listWebOrdersByBusiness(req, businessId);
    return res.json({ ok: true, orders: orders.map(sanitizeWebOrder) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function updateWebOrder(req, res) {
  try {
    const { businessId, orderId } = req.params;
    const { order } = req.body || {};
    if (!businessId || !orderId) return badRequest(res, 'Faltan parámetros');
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order');

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, orderId);
    if (!existing || existing.type !== 'web_order' || existing.business_id !== businessId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }

    const statusHistory = [...(existing.statusHistory || [])];
    if (order.status && order.status !== existing.status) {
      statusHistory.push({ status: order.status, date: new Date().toISOString(), notes: order.statusNote || '' });
    }

    const doc = buildWebOrderDocument(businessId, { ...existing, ...order, statusHistory }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, order: sanitizeWebOrder({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}
