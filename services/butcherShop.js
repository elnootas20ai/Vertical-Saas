import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
} from './couchdb.js';

function getDbPrefix() {
  return (process.env.VITE_COUCHDB_DB || 'vertial').toLowerCase().replace(/[^a-z0-9_$()+\-/]/g, '_');
}

export function getButcherDbName() {
  const raw = process.env.VITE_BUTCHER_DB || `${getDbPrefix()}-butcher`;
  return raw.toLowerCase().replace(/[^a-z0-9_$()+\-/]/g, '_');
}

const ORDER_TYPES = ['simple', 'reservation', 'special'];
const ORDER_STATUSES = ['pending', 'preparing', 'ready', 'picked_up', 'cancelled'];
const SALE_STATUSES = ['completed', 'pending', 'voided'];
const PAYMENT_METHODS = ['cash', 'card', 'bizum', 'mixed'];

function normalizeOrderType(v) { return ORDER_TYPES.includes(String(v || '')) ? String(v) : 'simple'; }
function normalizeOrderStatus(v) { return ORDER_STATUSES.includes(String(v || '')) ? String(v) : 'pending'; }
function normalizeSaleStatus(v) { return SALE_STATUSES.includes(String(v || '')) ? String(v) : 'completed'; }
function normalizePayment(v) { return PAYMENT_METHODS.includes(String(v || '')) ? String(v) : 'cash'; }

function sanitizeLineItem(it) {
  return {
    productId: it.productId || null,
    productName: String(it.productName || ''),
    quantity: Number(it.quantity || 0),
    unit: String(it.unit || 'kg'),
    pricePerUnit: Number(it.pricePerUnit || 0),
    subtotal: Number(it.subtotal || (Number(it.quantity || 0) * Number(it.pricePerUnit || 0))),
    notes: String(it.notes || ''),
  };
}

// ── Butcher Client ──────────────────────────────────────────────────────────

export function buildButcherClientDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `butcher_client-${uuidv4()}`;
  const rawUsual = Array.isArray(data.usualProducts) ? data.usualProducts : (existing?.preferences?.usualProducts || []);
  const rawTags = Array.isArray(data.tags) ? data.tags.map(String) : (existing?.tags || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'butcher_client',
    id,
    user_id: userId,
    name: String(data.name || existing?.name || '').trim(),
    phone: String(data.phone || existing?.phone || '').trim(),
    email: String(data.email || existing?.email || '').trim().toLowerCase(),
    observations: String(data.observations || existing?.observations || ''),
    tags: rawTags,
    preferences: {
      usualProducts: rawUsual.map((p) => ({
        productName: String(p.productName || ''),
        productId: p.productId || null,
        quantity: Number(p.quantity || 0),
        unit: String(p.unit || 'kg'),
        frequency: p.frequency || null,
      })),
      preferredDay: data.preferences?.preferredDay ?? existing?.preferences?.preferredDay ?? null,
      preferredTime: data.preferences?.preferredTime ?? existing?.preferences?.preferredTime ?? null,
      cuttingPreferences: String(data.preferences?.cuttingPreferences ?? existing?.preferences?.cuttingPreferences ?? ''),
      packagingNotes: String(data.preferences?.packagingNotes ?? existing?.preferences?.packagingNotes ?? ''),
    },
    linkedCrmClientId: String(data.linkedCrmClientId || existing?.linkedCrmClientId || ''),
    totalOrders: Number(data.totalOrders ?? existing?.totalOrders ?? 0),
    totalSpent: Number(data.totalSpent ?? existing?.totalSpent ?? 0),
    lastVisit: data.lastVisit || existing?.lastVisit || null,
    lastHabitAnalysis: data.lastHabitAnalysis || existing?.lastHabitAnalysis || null,
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeButcherClient(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_client', id: doc._id, user_id: doc.user_id,
    name: doc.name || '', phone: doc.phone || '', email: doc.email || '',
    observations: doc.observations || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    preferences: {
      usualProducts: Array.isArray(doc.preferences?.usualProducts) ? doc.preferences.usualProducts : [],
      preferredDay: doc.preferences?.preferredDay || null,
      preferredTime: doc.preferences?.preferredTime || null,
      cuttingPreferences: doc.preferences?.cuttingPreferences || '',
      packagingNotes: doc.preferences?.packagingNotes || '',
    },
    linkedCrmClientId: doc.linkedCrmClientId || '',
    totalOrders: Number(doc.totalOrders || 0),
    totalSpent: Number(doc.totalSpent || 0),
    lastVisit: doc.lastVisit || null,
    lastHabitAnalysis: doc.lastHabitAnalysis || null,
    active: doc.active !== false,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

export async function listButcherClientsByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'butcher_client' && d?.active !== false && (!userId || d?.user_id === userId))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function searchButcherClientsFn(req, userId, query) {
  const all = await listButcherClientsByUser(req, userId);
  if (!query) return all;
  const q = String(query).toLowerCase().trim();
  return all.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q));
}

// ── Butcher Order ───────────────────────────────────────────────────────────

export function buildButcherOrderDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `butcher_order-${uuidv4()}`;
  const rawItems = Array.isArray(data.items) ? data.items : (existing?.items || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'butcher_order',
    id,
    user_id: userId,
    orderNumber: String(data.orderNumber || existing?.orderNumber || ''),
    orderType: normalizeOrderType(data.orderType ?? existing?.orderType),
    clientId: data.clientId || existing?.clientId || null,
    clientName: String(data.clientName || existing?.clientName || ''),
    clientPhone: String(data.clientPhone || existing?.clientPhone || ''),
    items: rawItems.map(sanitizeLineItem),
    total: Number(data.total ?? existing?.total ?? 0),
    pickupDate: String(data.pickupDate || existing?.pickupDate || ''),
    pickupTime: String(data.pickupTime || existing?.pickupTime || ''),
    status: normalizeOrderStatus(data.status ?? existing?.status),
    priority: String(data.priority || existing?.priority || 'normal'),
    notes: String(data.notes || existing?.notes || ''),
    preparedBy: String(data.preparedBy || existing?.preparedBy || ''),
    stockReserved: Boolean(data.stockReserved || existing?.stockReserved || false),
    linkedSaleId: data.linkedSaleId || existing?.linkedSaleId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: data.deletedAt || existing?.deletedAt || null,
  };
}

export function sanitizeButcherOrder(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_order', id: doc._id, user_id: doc.user_id,
    orderNumber: doc.orderNumber || '', orderType: normalizeOrderType(doc.orderType),
    clientId: doc.clientId || null, clientName: doc.clientName || '', clientPhone: doc.clientPhone || '',
    items: Array.isArray(doc.items) ? doc.items : [],
    total: Number(doc.total || 0), pickupDate: doc.pickupDate || '', pickupTime: doc.pickupTime || '',
    status: normalizeOrderStatus(doc.status), priority: doc.priority || 'normal',
    notes: doc.notes || '', preparedBy: doc.preparedBy || '',
    stockReserved: Boolean(doc.stockReserved), linkedSaleId: doc.linkedSaleId || null,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherOrdersByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'butcher_order' && !d?.deletedAt && (!userId || d?.user_id === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getNextButcherOrderNumber(req, userId, orderType) {
  const prefix = orderType === 'reservation' ? 'RES' : orderType === 'special' ? 'ENC' : 'PED';
  const orders = await listButcherOrdersByUser(req, userId);
  const sameType = orders.filter((o) => o.orderNumber && o.orderNumber.startsWith(prefix));
  const maxNum = sameType.reduce((max, o) => {
    const n = parseInt(o.orderNumber.replace(`${prefix}-`, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

// ── Butcher Sale ────────────────────────────────────────────────────────────

export function buildButcherSaleDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `butcher_sale-${uuidv4()}`;
  const rawItems = Array.isArray(data.items) ? data.items : (existing?.items || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'butcher_sale',
    id,
    user_id: userId,
    ticketNumber: String(data.ticketNumber || existing?.ticketNumber || ''),
    clientId: data.clientId || existing?.clientId || null,
    clientName: String(data.clientName || existing?.clientName || ''),
    clientPhone: String(data.clientPhone || existing?.clientPhone || ''),
    date: String(data.date || existing?.date || now.slice(0, 10)),
    items: rawItems.map(sanitizeLineItem),
    totalWeight: Number(data.totalWeight ?? existing?.totalWeight ?? 0),
    total: Number(data.total ?? existing?.total ?? 0),
    paymentMethod: normalizePayment(data.paymentMethod ?? existing?.paymentMethod),
    paymentDetails: data.paymentDetails || existing?.paymentDetails || null,
    status: normalizeSaleStatus(data.status ?? existing?.status),
    fromOrderId: data.fromOrderId || existing?.fromOrderId || null,
    soldBy: String(data.soldBy || existing?.soldBy || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: data.deletedAt || existing?.deletedAt || null,
  };
}

export function sanitizeButcherSale(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_sale', id: doc._id, user_id: doc.user_id,
    ticketNumber: doc.ticketNumber || '', clientId: doc.clientId || null,
    clientName: doc.clientName || '', clientPhone: doc.clientPhone || '',
    date: doc.date || '', items: Array.isArray(doc.items) ? doc.items : [],
    totalWeight: Number(doc.totalWeight || 0), total: Number(doc.total || 0),
    paymentMethod: normalizePayment(doc.paymentMethod),
    paymentDetails: doc.paymentDetails || null,
    status: normalizeSaleStatus(doc.status),
    fromOrderId: doc.fromOrderId || null, soldBy: doc.soldBy || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherSalesByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'butcher_sale' && !d?.deletedAt && (!userId || d?.user_id === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getNextButcherTicketNumber(req, userId) {
  const sales = await listButcherSalesByUser(req, userId);
  const maxNum = sales.reduce((max, s) => {
    const n = parseInt((s.ticketNumber || '').replace('TK-', ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `TK-${String(maxNum + 1).padStart(5, '0')}`;
}

export async function updateButcherClientCounters(req, userId, clientId, saleTotal) {
  if (!clientId) return;
  const db = getButcherDbName();
  try {
    const doc = await getDocument(req, db, clientId);
    if (!doc || doc.type !== 'butcher_client') return;
    doc.totalOrders = (Number(doc.totalOrders) || 0) + 1;
    doc.totalSpent = (Number(doc.totalSpent) || 0) + Number(saleTotal || 0);
    doc.lastVisit = new Date().toISOString();
    doc.updatedAt = new Date().toISOString();
    await putDocument(req, db, doc._id, doc);
  } catch { /* non-blocking */ }
}
