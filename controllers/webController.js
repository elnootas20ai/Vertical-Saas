import {
  getWebDbName,
  getCatalogDbName,
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
} from '../services/couchdb.js';
import { computeVolumeDiscount } from '../shared/volumeDiscount.js';
import { calculateShippingRates } from '../services/shippingService.js';

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

// ─── PUBLIC ENDPOINTS (no auth) ──────────────────────────────────────────────

export async function getPublicStorefront(req, res) {
  try {
    const { slug } = req.params;
    if (!slug) return badRequest(res, 'Falta slug');

    const config = await getWebConfigBySlug(req, slug);
    if (!config || !config.enabled) {
      return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
    }

    const catalogItems = await listCatalogItemsByUser(req, config.business_id);
    const activeItems = catalogItems
      .filter((item) => item.active && item.webVisible !== false)
      .map((item) => ({
        _id: item._id,
        name: item.name,
        description: item.description,
        category: item.category,
        unitPrice: item.unitPrice,
        unit: item.unit,
        allergens: item.allergens || [],
        image: item.image || '',
        available: item.available !== false,
        vertical: item.vertical || '',
        customFields: item.customFields || {},
      }));

    return res.json({
      ok: true,
      config: sanitizeWebConfig(config),
      catalog: activeItems,
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

    const config = await getWebConfigBySlug(req, slug);
    if (!config || !config.enabled) {
      return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
    }

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

    const config = await getWebConfigBySlug(req, slug);
    if (!config || !config.enabled) {
      return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
    }

    if (!config.isOpen) {
      return res.status(400).json({ ok: false, error: config.closedMessage || 'Tienda cerrada' });
    }

    if (!order.customerName || !order.customerPhone) {
      return badRequest(res, 'Nombre y teléfono son obligatorios');
    }

    if (order.orderType === 'delivery' && !config.deliveryEnabled) {
      return badRequest(res, 'El envío a domicilio no está disponible');
    }
    if (order.orderType === 'pickup' && !config.pickupEnabled) {
      return badRequest(res, 'La recogida no está disponible');
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

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const current = await getWebConfigByBusinessId(req, businessId);
    const doc = buildWebConfigDocument(businessId, { integrations }, current);
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
