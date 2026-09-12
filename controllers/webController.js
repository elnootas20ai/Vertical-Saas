import { resolveCname } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import {
  getWebDbName,
  getCatalogDbName,
  getDeliveryDbName,
  buildWebConfigDocument,
  sanitizeWebConfig,
  sanitizeDeliveryIntegrations,
  getWebConfigByBusinessId,
  getWebConfigBySlug,
  getWebConfigByCustomDomain,
  buildWebOrderDocument,
  sanitizeWebOrder,
  listWebOrdersByBusiness,
  listCatalogItemsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findBusinessById,
  filterCatalogDocsByBusinessScope,
  listBusinessesByUser,
  listBrandsByBusiness,
  listScopedPointsOfSaleForBusiness,
  sanitizePointOfSalePublicOrderingConfig,
  findAccountByUserId,
} from '../services/couchdb.js';
import { computeVolumeDiscount } from '../shared/volumeDiscount.js';
import { calculateShippingRates } from '../services/shippingService.js';
import { assertBusinessTeamAccess } from '../services/businessAccess.js';
import {
  preparePublicOrderRequest,
  publicOrderPolicyForBusiness,
  reviewPublicOrderRequest,
} from '../services/publicOrderingService.js';
import { broadcastToBusiness } from '../services/sseService.js';
import {
  issueCustomerKioskToken,
  listCustomerKiosks,
  resolveCustomerKioskContext,
  revokeCustomerKiosk,
} from '../services/customerKioskService.js';
import { accountHasRestaurantFeature } from '../shared/billing/restaurantPlanFeatures.js';

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
  return Boolean(business && publicOrderPolicyForBusiness(business).supported);
}

async function restaurantWebAccess(req, businessId, featureId) {
  const business = await findBusinessById(req, normalizeBusinessScopeId(businessId));
  if (!business) return false;
  if (String(business.businessType || '').trim() !== 'restaurant') return true;
  const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
  const account = await findAccountByUserId(req, ownerUserId).catch(() => null);
  return accountHasRestaurantFeature(account, featureId);
}

async function restaurantHasAnyPublicOrderingAccess(req, businessId) {
  const [web, tableQr] = await Promise.all([
    restaurantWebAccess(req, businessId, 'public_web_orders'),
    restaurantWebAccess(req, businessId, 'table_qr_orders'),
  ]);
  return web || tableQr;
}

/** Tiendas marcadas en web_config para el selector público. */
function legacyFulfillmentConfig(config) {
  return {
    pickupEnabled: config?.pickupEnabled !== false,
    deliveryEnabled: Boolean(config?.deliveryEnabled),
    minimumOrder: Math.max(0, Number(config?.minimumOrder || 0)),
    deliveryFee: Math.max(0, Number(config?.deliveryFee || 0)),
    estimatedDeliveryTime: String(config?.estimatedDeliveryTime || '30-45 min'),
    deliveryRadius: String(config?.deliveryRadius || ''),
    shippingMode: config?.shippingMode === 'zones' ? 'zones' : 'fixed',
    shippingZones: Array.isArray(config?.shippingZones) ? config.shippingZones : [],
    customerKioskEnabled: false,
  };
}

async function resolvePublicWebStores(req, config, ownerUserId) {
  const ids = Array.isArray(config?.salesPointIds)
    ? config.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return [];
  const scoped = await listScopedPointsOfSaleForBusiness(
    req,
    ownerUserId,
    config.business_id,
  ).catch(() => []);
  const scopedById = new Map((scoped || []).map((item) => [String(item._id), item]));
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const stores = [];
  for (const id of ids) {
    try {
      const doc = scopedById.get(id) || await getDocument(req, db, id);
      if (!doc || doc.type !== 'point_of_sale' || doc.deletedAt || doc.active === false) continue;
      const docBusinessId = normalizeBusinessScopeId(doc.businessId || doc.business_id);
      if (docBusinessId && docBusinessId !== normalizeBusinessScopeId(config.business_id)) continue;
      stores.push({
        id: doc._id,
        name: String(doc.name || '').trim() || 'Tienda',
        code: String(doc.code || '').trim(),
        address: String(doc.address || '').trim(),
        fulfillment: doc.publicOrderingConfig
          ? sanitizePointOfSalePublicOrderingConfig(doc.publicOrderingConfig)
          : legacyFulfillmentConfig(config),
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
  if (!(await restaurantHasAnyPublicOrderingAccess(req, config.business_id))) {
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

    const [catalogItems, stores, ownerBusinesses, brands] = await Promise.all([
      listCatalogItemsByUser(req, catalogOwnerId, { module: 'catalog' }),
      resolvePublicWebStores(req, config, catalogOwnerId),
      listBusinessesByUser(req, catalogOwnerId).catch(() => []),
      listBrandsByBusiness(req, config.business_id).catch(() => []),
    ]);
    const activeItems = filterCatalogDocsByBusinessScope(
      catalogItems,
      config.business_id,
      Math.max(1, ownerBusinesses.length),
    )
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

    const brand = (brands || []).find((item) => item.active !== false && item.isDefault)
      || (brands || []).find((item) => item.active !== false)
      || null;
    const publicConfig = sanitizeWebConfig(config);
    if (!publicConfig.storeLogo) publicConfig.storeLogo = String(brand?.logo || business?.logo || '');
    if (!publicConfig.address) {
      publicConfig.address = [business?.address, business?.city]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(', ');
    }
    if (!publicConfig.phone) publicConfig.phone = String(business?.phone || '');

    return res.json({
      ok: true,
      config: publicConfig,
      catalog: activeItems,
      stores,
      orderingMode: publicOrderPolicyForBusiness(business).mode,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function getPublicStorefrontByHost(req, res) {
  try {
    const host = String(req.query?.host || req.headers['x-forwarded-host'] || req.hostname || '')
      .split(',')[0]
      .split(':')[0]
      .trim()
      .toLowerCase();
    if (!host) return badRequest(res, 'Falta dominio');
    const config = await getWebConfigByCustomDomain(req, host);
    if (!config || !config.enabled) {
      return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
    }
    req.params.slug = config.slug;
    return getPublicStorefront(req, res);
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function getPublicShippingRates(req, res) {
  try {
    const { slug } = req.params;
    const { postalCode, salesPointId } = req.body || {};
    if (!slug) return badRequest(res, 'Falta slug');

    const config = await loadEnabledStorefrontConfig(req, res, slug);
    if (!config) return;

    const business = await findBusinessById(req, config.business_id).catch(() => null);
    const ownerUserId = String(business?.owner_user_id || business?.user_id || '').trim();
    const stores = await resolvePublicWebStores(req, config, ownerUserId);
    const store = stores.find((item) => item.id === String(salesPointId || ''))
      || (stores.length === 1 ? stores[0] : null);
    const fulfillment = store?.fulfillment || legacyFulfillmentConfig(config);

    if (!fulfillment.deliveryEnabled) {
      return res.json({ ok: true, options: [], error: 'El envío a domicilio no está disponible' });
    }

    const result = calculateShippingRates(postalCode, fulfillment);
    if (fulfillment.shippingMode === 'zones' && result.fallback) {
      return res.json({
        ok: true,
        zone: null,
        options: [],
        fallback: true,
        error: 'No hay reparto disponible para este código postal',
      });
    }
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
    const requiredFeature = order.mesaToken ? 'table_qr_orders' : 'public_web_orders';
    if (!(await restaurantWebAccess(req, config.business_id, requiredFeature))) {
      return res.status(403).json({
        ok: false,
        error: order.mesaToken
          ? 'Los pedidos QR de mesa no están activos'
          : 'Los pedidos web no están activos',
      });
    }
    const idempotencyKey = String(
      req.headers['idempotency-key'] || order.idempotencyKey || '',
    ).trim().slice(0, 200);
    const idempotentId = idempotencyKey
      ? `webord-idem-${createHash('sha256')
        .update(`${normalizeBusinessScopeId(config.business_id)}:${idempotencyKey}`)
        .digest('hex')
        .slice(0, 40)}`
      : '';
    if (idempotentId) {
      const prior = await getDocument(req, getWebDbName(), idempotentId).catch(() => null);
      if (prior?.type === 'web_order' && normalizeBusinessScopeId(prior.business_id) === normalizeBusinessScopeId(config.business_id)) {
        return res.status(200).json({
          ok: true,
          order: sanitizeWebOrder(prior),
          message: config.orderConfirmMessage,
          idempotent: true,
        });
      }
    }

    if (!config.isOpen) {
      return res.status(400).json({ ok: false, error: config.closedMessage || 'Tienda cerrada' });
    }

    const prepared = await preparePublicOrderRequest(req, { config, slug, order });
    const normalizedOrder = prepared.order;
    const effectiveFulfillment = prepared.fulfillment || config;

    const db = getWebDbName();
    await ensureDatabase(req, db);

    const items = normalizedOrder.items;
    const { rule: volRule, discountAmount: volDiscountAmount } = computeVolumeDiscount(
      config.volumeDiscounts || [],
      items,
    );

    let promoDiscountAmount = 0;
    let appliedPromoCode = '';
    if (normalizedOrder.promoCode && Array.isArray(config.promos)) {
      const promo = config.promos.find(
        (p) => p.code && p.code.toLowerCase() === String(normalizedOrder.promoCode).toLowerCase() && p.active,
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
    let resolvedEstimatedTime = effectiveFulfillment.estimatedDeliveryTime || config.estimatedDeliveryTime;

    if (normalizedOrder.orderType === 'delivery') {
      const shippingResult = calculateShippingRates(normalizedOrder.customerPostalCode, effectiveFulfillment);
      if (effectiveFulfillment.shippingMode === 'zones' && shippingResult.fallback) {
        return badRequest(res, 'No hay reparto disponible para este código postal');
      }
      const selectedOption = normalizedOrder.selectedShippingOptionId
        ? shippingResult.options.find((o) => o.id === normalizedOrder.selectedShippingOptionId)
        : shippingResult.options[0];

      if (normalizedOrder.selectedShippingOptionId && !selectedOption) {
        return badRequest(res, 'La tarifa de reparto seleccionada ya no está disponible');
      }
      if (selectedOption) {
        resolvedDeliveryFee = selectedOption.rate;
        shippingCarrier = selectedOption.carrier;
        if (selectedOption.estimatedTime) resolvedEstimatedTime = selectedOption.estimatedTime;
      } else {
        resolvedDeliveryFee = effectiveFulfillment.deliveryFee || 0;
      }

      if (shippingResult.zone) {
        shippingZoneName = shippingResult.zone.name;
      }
    }

    const doc = buildWebOrderDocument(config.business_id, {
      ...(idempotentId ? { _id: idempotentId, idempotencyKey } : {}),
      ...normalizedOrder,
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
    let saved;
    try {
      saved = await putDocument(req, db, doc._id, doc);
    } catch (error) {
      if (idempotentId && (Number(error?.statusCode) === 409 || /conflict/i.test(String(error?.message || '')))) {
        const prior = await getDocument(req, db, idempotentId);
        return res.status(200).json({
          ok: true,
          order: sanitizeWebOrder(prior),
          message: config.orderConfirmMessage,
          idempotent: true,
        });
      }
      throw error;
    }
    const sanitized = sanitizeWebOrder({ ...doc, _rev: saved.rev });
    broadcastToBusiness(config.business_id, 'public_order:created', { order: sanitized });

    return res.status(201).json({
      ok: true,
      order: sanitized,
      message: config.orderConfirmMessage,
    });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}

// ─── PROTECTED ENDPOINTS (require auth) ──────────────────────────────────────

export async function getWebConfig(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await restaurantHasAnyPublicOrderingAccess(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos públicos requieren el plan Pro' });
    }

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
    if (!(await restaurantHasAnyPublicOrderingAccess(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos públicos requieren el plan Pro' });
    }
    if (!(await isWebOrderingAllowedForBusiness(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos web no están disponibles para este tipo de negocio' });
    }

    if (config.slug) {
      const existing = await getWebConfigBySlug(req, config.slug);
      if (existing && existing.business_id !== businessId) {
        return badRequest(res, 'Ese nombre de URL ya está en uso por otro negocio');
      }
    }
    const normalizedDomain = String(config.customDomain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');
    if (normalizedDomain) {
      const domainOwner = await getWebConfigByCustomDomain(req, normalizedDomain);
      if (domainOwner && normalizeBusinessScopeId(domainOwner.business_id) !== normalizeBusinessScopeId(businessId)) {
        return badRequest(res, 'Ese dominio ya está vinculado a otro negocio');
      }
    }

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const current = await getWebConfigByBusinessId(req, businessId);
    const domainChanged = normalizedDomain !== String(current?.customDomain || '');
    const doc = buildWebConfigDocument(businessId, {
      ...config,
      customDomain: normalizedDomain,
      ...(domainChanged
        ? {
          customDomainStatus: normalizedDomain ? 'pending' : 'unconfigured',
          customDomainCheckedAt: '',
        }
        : {}),
    }, current);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, config: sanitizeWebConfig({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function verifyWebCustomDomain(req, res) {
  try {
    const { businessId } = req.params;
    const config = await getWebConfigByBusinessId(req, businessId);
    if (!config?.customDomain) return badRequest(res, 'Configura primero un dominio');
    const expected = String(process.env.WEB_CNAME_TARGET || 'shops.vertialapp.com').toLowerCase();
    let status = 'pending';
    try {
      const records = await resolveCname(config.customDomain);
      if (records.some((record) => String(record).replace(/\.$/, '').toLowerCase() === expected)) {
        status = 'active';
      }
    } catch {
      status = 'pending';
    }
    const db = getWebDbName();
    const doc = buildWebConfigDocument(businessId, {
      ...config,
      customDomainStatus: status,
      customDomainCheckedAt: new Date().toISOString(),
    }, config);
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
    // Si el cliente manda oauth:false (p. ej. tras desconectar), NO reinyectar tokens viejos.
    const merged = {};
    for (const key of ['uber', 'globo', 'justead', 'flipdish']) {
      const incoming = integrations[key] && typeof integrations[key] === 'object' ? integrations[key] : {};
      const existing = prev[key] && typeof prev[key] === 'object' ? prev[key] : {};
      const wipeOauth = incoming.oauth === false || incoming.disconnected === true;
      if (wipeOauth && key === 'uber') {
        merged[key] = {
          enabled: Boolean(incoming.enabled),
          token: String(incoming.token ?? ''),
          oauth: false,
          accessToken: '',
          refreshToken: '',
          tokenType: '',
          scope: '',
          expiresAt: '',
          connectedAt: '',
          storeId: '',
          storeName: '',
          provisionedAt: '',
          disconnectedAt: new Date().toISOString(),
        };
        continue;
      }
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
    if (!(await restaurantHasAnyPublicOrderingAccess(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos públicos requieren el plan Pro' });
    }

    let orders = await listWebOrdersByBusiness(req, businessId);
    const targetKind = String(req.query?.targetKind || '').trim();
    const reviewStatus = String(req.query?.reviewStatus || '').trim();
    const salesPointId = String(req.query?.salesPointId || '').trim();
    const tableId = String(req.query?.tableId || '').trim();
    if (targetKind) {
      orders = orders.filter((order) => (
        String(order.targetKind || (order.tableId ? 'restaurant_table' : 'delivery_ops')) === targetKind
      ));
    }
    if (reviewStatus) {
      orders = orders.filter((order) => (
        String(order.reviewStatus || (order.status === 'pending' ? 'pending' : 'accepted')) === reviewStatus
      ));
    }
    if (salesPointId) {
      orders = orders.filter((order) => String(order.salesPointId || '') === salesPointId);
    }
    if (tableId) {
      orders = orders.filter((order) => String(order.tableId || '') === tableId);
    }
    return res.json({ ok: true, orders: orders.map(sanitizeWebOrder) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function acceptPublicOrder(req, res) {
  try {
    const { businessId, orderId } = req.params;
    if (!(await restaurantHasAnyPublicOrderingAccess(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos públicos requieren el plan Pro' });
    }
    const order = await reviewPublicOrderRequest(req, {
      businessId,
      orderId,
      action: 'accept',
      reviewerId: String(req.callerAccount?.user_id || req.user?.userId || ''),
    });
    return res.json({ ok: true, order });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function rejectPublicOrder(req, res) {
  try {
    const { businessId, orderId } = req.params;
    if (!(await restaurantHasAnyPublicOrderingAccess(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos públicos requieren el plan Pro' });
    }
    const order = await reviewPublicOrderRequest(req, {
      businessId,
      orderId,
      action: 'reject',
      reviewerId: String(req.callerAccount?.user_id || req.user?.userId || ''),
      reason: String(req.body?.reason || ''),
    });
    return res.json({ ok: true, order });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function updateWebOrder(req, res) {
  try {
    const { businessId, orderId } = req.params;
    const { order } = req.body || {};
    if (!businessId || !orderId) return badRequest(res, 'Faltan parámetros');
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order');
    if (!(await restaurantHasAnyPublicOrderingAccess(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos públicos requieren el plan Pro' });
    }

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, orderId);
    if (!existing || existing.type !== 'web_order' || existing.business_id !== businessId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    if (existing.reviewStatus !== 'accepted') {
      return res.status(409).json({
        ok: false,
        error: 'Acepta o rechaza primero la solicitud desde la bandeja',
      });
    }

    const statusHistory = [...(existing.statusHistory || [])];
    const allowedTransitions = {
      confirmed: ['preparing', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['delivering', 'delivered', 'cancelled'],
      delivering: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };
    const nextStatus = String(order.status || existing.status);
    if (
      nextStatus !== existing.status
      && !(allowedTransitions[existing.status] || []).includes(nextStatus)
    ) {
      return badRequest(res, 'Cambio de estado no permitido');
    }
    if (nextStatus !== existing.status) {
      statusHistory.push({ status: nextStatus, date: new Date().toISOString(), notes: order.statusNote || '' });
    }

    const doc = buildWebOrderDocument(businessId, {
      ...existing,
      status: nextStatus,
      paymentStatus: String(order.paymentStatus || existing.paymentStatus || 'pending'),
      statusHistory,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeWebOrder({ ...doc, _rev: saved.rev });
    broadcastToBusiness(businessId, 'public_order:updated', { order: sanitized });
    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function getPublicCustomerKiosk(req, res) {
  try {
    const context = await resolveCustomerKioskContext(req, { token: req.params.token });
    return res.json({
      ok: true,
      kiosk: {
        token: context.token,
        webSlug: context.webSlug,
        salesPointId: context.salesPointId,
        salesPointName: context.salesPointName,
        storeName: context.storeName,
      },
    });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function getCustomerKiosks(req, res) {
  try {
    if (!(await restaurantWebAccess(req, req.params.businessId, 'public_web_orders'))) {
      return res.status(403).json({ ok: false, error: 'El kiosco de pedidos requiere el plan Pro' });
    }
    const business = await findBusinessById(req, req.params.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
    const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
    const kiosks = await listCustomerKiosks(req, {
      ownerUserId,
      businessId: req.params.businessId,
    });
    return res.json({ ok: true, kiosks });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function createCustomerKiosk(req, res) {
  try {
    if (!(await restaurantWebAccess(req, req.params.businessId, 'public_web_orders'))) {
      return res.status(403).json({ ok: false, error: 'El kiosco de pedidos requiere el plan Pro' });
    }
    const business = await findBusinessById(req, req.params.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
    const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
    const result = await issueCustomerKioskToken(req, {
      ownerUserId,
      businessId: req.params.businessId,
      salesPointId: req.body?.salesPointId,
      name: req.body?.name,
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}

export async function deleteCustomerKiosk(req, res) {
  try {
    if (!(await restaurantWebAccess(req, req.params.businessId, 'public_web_orders'))) {
      return res.status(403).json({ ok: false, error: 'El kiosco de pedidos requiere el plan Pro' });
    }
    await revokeCustomerKiosk(req, {
      businessId: req.params.businessId,
      kioskId: req.params.kioskId,
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: errorMsg(error) });
  }
}
