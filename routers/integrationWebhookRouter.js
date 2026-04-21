import { Router } from 'express';
import {
  getWebDbName,
  ensureDatabase,
  getDeliveryDbName,
  buildDeliveryOrderDocument,
  sanitizeDeliveryOrder,
  putDocument,
  listDeliveryOrdersByUser,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { broadcastToUser } from '../services/sseService.js';
import logger from '../services/logger.js';

const webhookRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getIntegrationConfig(req, businessId) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  try {
    const { default: nano } = await import('nano');
    const url = process.env.COUCHDB_URL || 'http://localhost:5984';
    const couch = nano(url);
    const dbConn = couch.db.use(db);
    const doc = await dbConn.get(`web_config:${businessId}`);
    return doc?.integrations || {};
  } catch {
    return {};
  }
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

const ADAPTERS = { globo: mapGlovoToOrder, justead: mapJustEatToOrder, uber: mapUberEatsToOrder };
const PLATFORM_KEYS = { glovo: 'globo', justeat: 'justead', ubereats: 'uber' };

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

    logger.info({ platform, businessId, orderId: doc._id, orderNumber: doc.orderNumber }, 'Webhook: pedido creado');
    return res.status(201).json({ ok: true, order: sanitized });
  } catch (error) {
    logger.error({ platform, error: error.message }, 'Error procesando webhook');
    return res.status(500).json({ ok: false, error: error.message || 'Error procesando webhook' });
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

webhookRouter.post('/glovo/:businessId', (req, res) => handlePlatformWebhook('glovo', req, res));
webhookRouter.post('/justeat/:businessId', (req, res) => handlePlatformWebhook('justeat', req, res));
webhookRouter.post('/ubereats/:businessId', (req, res) => handlePlatformWebhook('ubereats', req, res));

export { webhookRouter };
