import { Router } from 'express';
import {
  getWebDbName,
  ensureDatabase,
  getDeliveryDbName,
  buildDeliveryOrderDocument,
  sanitizeDeliveryOrder,
  putDocument,
  listDeliveryOrdersByUser,
  getWebConfigByBusinessId,
  findDocuments,
} from '../services/couchdb.js';
import { broadcastToUser, broadcastToBusiness } from '../services/sseService.js';
import {
  fetchUberOrderDetails,
  parseUberWebhookEvent,
  verifyUberWebhookSignature,
} from '../services/uberEatsWebhook.js';
import { isUberEatsConfigured } from '../services/uberEatsOAuth.js';
import logger from '../services/logger.js';

const webhookRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getIntegrationConfig(req, businessId) {
  try {
    const doc = await getWebConfigByBusinessId(req, businessId);
    return doc?.integrations || {};
  } catch {
    return {};
  }
}

/** Negocio Vertial con Uber OAuth (opcionalmente filtrado por store_id Uber). */
async function findUberOauthBusiness(req, storeId = '') {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  let docs = [];
  try {
    docs = await findDocuments(req, db, { type: 'web_config' }, { limit: 200 });
  } catch {
    docs = [];
  }
  const withOauth = (docs || []).filter((d) => {
    const uber = d?.integrations?.uber;
    return Boolean(uber?.oauth || uber?.accessToken) && !d.deletedAt;
  });
  if (!withOauth.length) return null;
  if (storeId) {
    const match = withOauth.find((d) => String(d.integrations?.uber?.storeId || '') === storeId);
    if (match) return match;
  }
  return withOauth[0];
}

function validateWebhookToken(integrations, platform, providedToken) {
  const entry = integrations[platform];
  if (!entry?.enabled) return false;
  if (!entry.token || !providedToken) return false;
  return entry.token === providedToken;
}

async function checkDuplicateExternalOrder(req, userId, externalOrderId) {
  if (!externalOrderId) return false;
  const orders = await listDeliveryOrdersByUser(req, userId);
  return orders.some((o) => o.externalOrderId === externalOrderId && !o.deletedAt);
}

// ─── Platform Adapters ───────────────────────────────────────────────────────

function mapGlovoToOrder(payload) {
  return {
    channel: 'glovo',
    externalOrderId: String(payload.order_id || payload.id || ''),
    customerName: String(payload.customer?.name || payload.customer_name || ''),
    customerPhone: String(payload.customer?.phone || payload.customer_phone || ''),
    customerAddress: String(payload.delivery_address?.label || payload.address || ''),
    deliveryType: payload.delivery_address ? 'domicilio' : 'recogida',
    items: Array.isArray(payload.products || payload.items)
      ? (payload.products || payload.items).map((p, i) => ({
          id: `ext-${i}`, name: String(p.name || p.product_name || ''),
          quantity: Number(p.quantity || 1), unitPrice: Number(p.price || 0),
          total: Number(p.price || 0) * Number(p.quantity || 1), notes: String(p.notes || ''),
        }))
      : [],
    notes: String(payload.special_instructions || payload.notes || ''),
    observations: String(payload.customer_comment || ''),
    paymentMethod: 'plataforma',
    paymentStatus: 'paid',
    status: 'nuevo',
  };
}

function mapJustEatToOrder(payload) {
  const body = payload.Body || payload;
  return {
    channel: 'justeat',
    externalOrderId: String(body.OrderId || body.Id || payload.order_id || ''),
    customerName: String(body.Customer?.Name || payload.customer_name || ''),
    customerPhone: String(body.Customer?.PhoneNumber || payload.customer_phone || ''),
    customerAddress: String(body.FulfilmentDetail?.Address?.Line1 || payload.address || ''),
    deliveryType: body.FulfilmentDetail?.Method === 'Collection' ? 'recogida' : 'domicilio',
    items: Array.isArray(body.Items || payload.items)
      ? (body.Items || payload.items).map((p, i) => ({
          id: `ext-${i}`, name: String(p.Name || p.name || ''),
          quantity: Number(p.Quantity || p.quantity || 1), unitPrice: Number(p.UnitPrice || p.price || 0),
          total: Number(p.UnitPrice || p.price || 0) * Number(p.Quantity || p.quantity || 1), notes: '',
        }))
      : [],
    notes: String(body.NoteToRestaurant || payload.notes || ''),
    observations: '',
    paymentMethod: 'plataforma',
    paymentStatus: 'paid',
    status: 'nuevo',
  };
}

function mapUberEatsToOrder(payload) {
  const cart = payload.cart || payload;
  return {
    channel: 'ubereats',
    externalOrderId: String(payload.id || payload.order_id || ''),
    customerName: String(payload.eater?.first_name || payload.customer_name || ''),
    customerPhone: String(payload.eater?.phone || payload.customer_phone || ''),
    customerAddress: String(payload.delivery_info?.location?.address || payload.address || ''),
    deliveryType: payload.type === 'PICK_UP' ? 'recogida' : 'domicilio',
    items: Array.isArray(cart.items)
      ? cart.items.map((p, i) => ({
          id: `ext-${i}`, name: String(p.title || p.name || ''),
          quantity: Number(p.quantity || 1), unitPrice: Number(p.price?.amount || p.price || 0) / 100,
          total: (Number(p.price?.amount || p.price || 0) / 100) * Number(p.quantity || 1), notes: String(p.special_instructions || ''),
        }))
      : [],
    notes: String(payload.special_instructions || ''),
    observations: '',
    paymentMethod: 'plataforma',
    paymentStatus: 'paid',
    status: 'nuevo',
  };
}

function mapFlipdishToOrder(payload) {
  const body = payload.Body || payload.Order || payload;
  return {
    channel: 'flipdish',
    externalOrderId: String(body.OrderId || body.id || payload.order_id || ''),
    customerName: String(body.CustomerName || body.customer?.name || payload.customer_name || ''),
    customerPhone: String(body.CustomerPhone || body.customer?.phone || payload.customer_phone || ''),
    customerAddress: String(body.DeliveryAddress || body.delivery_address || payload.address || ''),
    deliveryType: body.IsPickup || body.is_pickup ? 'recogida' : 'domicilio',
    items: Array.isArray(body.Items || body.items || payload.products)
      ? (body.Items || body.items || payload.products).map((p, i) => ({
          id: `ext-${i}`, name: String(p.Name || p.name || p.product_name || ''),
          quantity: Number(p.Quantity || p.quantity || 1), unitPrice: Number(p.Price || p.price || 0),
          total: Number(p.Price || p.price || 0) * Number(p.Quantity || p.quantity || 1), notes: '',
        }))
      : [],
    notes: String(body.Notes || payload.notes || ''),
    observations: '',
    paymentMethod: 'plataforma',
    paymentStatus: 'paid',
    status: 'nuevo',
  };
}

const ADAPTERS = { globo: mapGlovoToOrder, justead: mapJustEatToOrder, uber: mapUberEatsToOrder, flipdish: mapFlipdishToOrder };
const PLATFORM_KEYS = { glovo: 'globo', justeat: 'justead', ubereats: 'uber', flipdish: 'flipdish' };

// ─── Generic Webhook Handler ─────────────────────────────────────────────────

async function handlePlatformWebhook(platform, req, res) {
  try {
    const { businessId } = req.params;
    const token = req.headers['x-webhook-token'] || req.query.token || '';
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const integrations = await getIntegrationConfig(req, businessId);
    const platformKey = PLATFORM_KEYS[platform] || platform;
    if (!validateWebhookToken(integrations, platformKey, token)) {
      return res.status(401).json({ ok: false, error: 'Token de webhook inválido o integración deshabilitada' });
    }

    const adapter = ADAPTERS[platformKey];
    if (!adapter) return res.status(400).json({ ok: false, error: `Plataforma ${platform} no soportada` });

    const orderData = adapter(req.body);
    if (orderData.externalOrderId) {
      const isDup = await checkDuplicateExternalOrder(req, businessId, orderData.externalOrderId);
      if (isDup) return res.status(409).json({ ok: false, error: 'Pedido duplicado (externalOrderId ya existe)' });
    }

    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const doc = buildDeliveryOrderDocument(businessId, orderData);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(businessId, 'delivery_order_created', sanitized);
    try {
      broadcastToBusiness(businessId, 'delivery:order_created', { order: sanitized, userId: businessId });
    } catch { /* ignore */ }

    logger.info({ platform, businessId, orderId: doc._id, orderNumber: doc.orderNumber }, 'Webhook: pedido creado');
    return res.status(201).json({ ok: true, order: sanitized });
  } catch (error) {
    logger.error({ platform, error: error.message }, 'Error procesando webhook');
    return res.status(500).json({ ok: false, error: error.message || 'Error procesando webhook' });
  }
}

/**
 * Webhook primario Uber Eats Marketplace (una sola URL en el portal).
 * Contrato Uber: HTTP 200 + body vacío. Firma: X-Uber-Signature (HMAC-SHA256).
 */
async function handleUberPrimaryWebhook(req, res) {
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
  const signature = req.headers['x-uber-signature'] || req.headers['X-Uber-Signature'];

  // Si viene firma, validarla. Sin firma (probe del portal) aceptamos si Uber está configurado.
  if (signature) {
    if (!verifyUberWebhookSignature(rawBody, signature)) {
      logger.warn({ hasSecret: isUberEatsConfigured() }, 'Uber webhook: firma inválida');
      return res.status(401).end();
    }
  } else if (!isUberEatsConfigured()) {
    return res.status(503).end();
  }

  const event = parseUberWebhookEvent(req.body || {});
  // ACK inmediato (Uber reintenta si no hay 200 vacío)
  res.status(200).end();

  setImmediate(() => {
    void (async () => {
      try {
        logger.info(
          {
            eventType: event.eventType,
            eventId: event.eventId,
            orderId: event.orderId,
            storeId: event.storeId,
          },
          'Uber webhook recibido',
        );

        if (event.eventType === 'store.provisioned' && event.storeId) {
          const cfg = await findUberOauthBusiness(req);
          if (cfg?.business_id) {
            const current = await getWebConfigByBusinessId(req, cfg.business_id);
            const prevUber = current?.integrations?.uber || {};
            const next = {
              ...(current?.integrations || {}),
              uber: { ...prevUber, storeId: event.storeId, enabled: true },
            };
            const { buildWebConfigDocument } = await import('../services/couchdb.js');
            const doc = buildWebConfigDocument(cfg.business_id, { integrations: next }, current);
            await putDocument(req, getWebDbName(), doc._id, doc);
            logger.info({ businessId: cfg.business_id, storeId: event.storeId }, 'Uber store.provisioned guardado');
          }
          return;
        }

        if (event.eventType !== 'orders.notification' && event.eventType !== 'orders.scheduled.notification') {
          return;
        }

        const cfg = await findUberOauthBusiness(req, event.storeId);
        if (!cfg?.business_id) {
          logger.warn({ storeId: event.storeId }, 'Uber webhook: no hay negocio OAuth conectado');
          return;
        }
        const bearer = String(cfg.integrations?.uber?.accessToken || '').trim();
        if (!bearer) {
          logger.warn({ businessId: cfg.business_id }, 'Uber webhook: sin accessToken OAuth (¿faltan scopes eats.order?)');
          return;
        }

        let orderPayload;
        try {
          orderPayload = await fetchUberOrderDetails({
            accessToken: bearer,
            resourceHref: event.resourceHref,
            orderId: event.orderId,
          });
        } catch (err) {
          logger.error({ err: err.message, orderId: event.orderId }, 'Uber webhook: no se pudo GET order');
          return;
        }

        const businessId = cfg.business_id;
        const orderData = mapUberEatsToOrder({ ...orderPayload, id: orderPayload.id || event.orderId });
        if (!orderData.externalOrderId) orderData.externalOrderId = event.orderId;

        if (orderData.externalOrderId) {
          const isDup = await checkDuplicateExternalOrder(req, businessId, orderData.externalOrderId);
          if (isDup) {
            logger.info({ orderId: orderData.externalOrderId }, 'Uber webhook: pedido ya existía');
            return;
          }
        }

        const db = getDeliveryDbName();
        await ensureDatabase(req, db);
        const doc = buildDeliveryOrderDocument(businessId, orderData);
        const saved = await putDocument(req, db, doc._id, doc);
        const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });
        broadcastToUser(businessId, 'delivery_order_created', sanitized);
        try {
          broadcastToBusiness(businessId, 'delivery:order_created', { order: sanitized, userId: businessId });
        } catch { /* ignore */ }
        logger.info(
          { businessId, orderId: doc._id, externalOrderId: orderData.externalOrderId },
          'Uber webhook: pedido creado en Vertial',
        );
      } catch (error) {
        logger.error({ error: error?.message || String(error) }, 'Uber webhook: error post-ACK');
      }
    })();
  });
}

/**
 * Token endpoint mínimo si el portal Uber exige auth "oAuth" hacia Vertial.
 * Client credentials = UBER_EATS_CLIENT_ID / UBER_EATS_CLIENT_SECRET del .env.
 */
webhookRouter.post('/ubereats/token', (req, res) => {
  const id = String(process.env.UBER_EATS_CLIENT_ID || '').trim();
  const secret = String(process.env.UBER_EATS_CLIENT_SECRET || '').trim();
  const body = req.body || {};
  const grant = String(body.grant_type || req.query.grant_type || 'client_credentials');
  let clientId = String(body.client_id || '').trim();
  let clientSecret = String(body.client_secret || '').trim();
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx >= 0) {
        clientId = decoded.slice(0, idx);
        clientSecret = decoded.slice(idx + 1);
      }
    } catch { /* ignore */ }
  }
  if (!id || !secret || clientId !== id || clientSecret !== secret || grant !== 'client_credentials') {
    return res.status(401).json({ error: 'invalid_client' });
  }
  const token = Buffer.from(`uber-wh:${Date.now()}:${cryptoRandom()}`).toString('base64url');
  return res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

webhookRouter.post('/glovo/:businessId', (req, res) => handlePlatformWebhook('glovo', req, res));
webhookRouter.post('/justeat/:businessId', (req, res) => handlePlatformWebhook('justeat', req, res));
// Primario Uber (sin businessId) ANTES de /:businessId
// GET/HEAD: solo para comprobar la URL en el navegador (Uber envía POST).
webhookRouter.get('/ubereats', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'uber-eats-webhook',
    method: 'POST',
    hint: 'Este endpoint recibe webhooks POST de Uber. Abrirlo en el navegador (GET) solo comprueba que está vivo.',
  });
});
webhookRouter.head('/ubereats', (_req, res) => res.status(200).end());
webhookRouter.post('/ubereats', (req, res) => {
  void handleUberPrimaryWebhook(req, res);
});
webhookRouter.post('/ubereats/:businessId', (req, res) => handlePlatformWebhook('ubereats', req, res));
webhookRouter.post('/flipdish/:businessId', (req, res) => handlePlatformWebhook('flipdish', req, res));

export { webhookRouter };
