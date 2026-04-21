/**
 * Cleaning Materials Service — Materiales y consumos de limpieza
 *
 * Modelos: material_delivery, material_return, material_request, material_inventory_count
 * Todos se almacenan en la BD de cleaning (getCleaningDbName).
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getCleaningDbName,
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
} from './couchdb.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MATERIAL_TYPES = [
  'detergent', 'disinfectant', 'degreaser', 'glass_cleaner',
  'floor_cleaner', 'utensil', 'consumable', 'protective', 'other',
];

export const DELIVERY_STATUSES = ['draft', 'delivered', 'partial_return', 'returned', 'cancelled'];
export const RETURN_STATUSES = ['pending', 'inspected', 'accepted', 'partial', 'rejected'];
export const RETURN_CONDITIONS = ['good', 'damaged', 'unusable', 'expired'];
export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
export const INVENTORY_COUNT_STATUSES = ['in_progress', 'completed', 'approved'];

// ─── Normalizers ─────────────────────────────────────────────────────────────

function norm(value, allowed, fallback) {
  return allowed.includes(String(value || '')) ? String(value) : fallback;
}

// ─── Line Sanitizers ─────────────────────────────────────────────────────────

function sanitizeDeliveryLine(line) {
  if (!line) return null;
  return {
    id: String(line.id || uuidv4()),
    catalogItemId: String(line.catalogItemId || ''),
    materialName: String(line.materialName || ''),
    sku: String(line.sku || ''),
    quantity: Math.max(0, Number(line.quantity || 0)),
    unit: String(line.unit || 'ud'),
    deliveryUnit: String(line.deliveryUnit || ''),
    deliveryUnitQty: Number(line.deliveryUnitQty || 0),
    requiresReturn: Boolean(line.requiresReturn),
    returnedQuantity: Number(line.returnedQuantity || 0),
    returnStatus: ['pending', 'returned', 'partial', 'not_applicable'].includes(line.returnStatus)
      ? line.returnStatus
      : (line.requiresReturn ? 'pending' : 'not_applicable'),
    unitCost: Number(line.unitCost || 0),
    notes: String(line.notes || ''),
  };
}

function sanitizeReturnLine(line) {
  if (!line) return null;
  return {
    id: String(line.id || uuidv4()),
    catalogItemId: String(line.catalogItemId || ''),
    materialName: String(line.materialName || ''),
    quantityReturned: Math.max(0, Number(line.quantityReturned || 0)),
    quantityOriginal: Number(line.quantityOriginal || 0),
    condition: norm(line.condition, RETURN_CONDITIONS, 'good'),
    reusable: Boolean(line.reusable),
    notes: String(line.notes || ''),
  };
}

function sanitizeCountLine(line) {
  if (!line) return null;
  const expected = Number(line.expectedQuantity || 0);
  const actual = Number(line.actualQuantity || 0);
  const disc = actual - expected;
  const uc = Number(line.unitCost || 0);
  return {
    id: String(line.id || uuidv4()),
    catalogItemId: String(line.catalogItemId || ''),
    materialName: String(line.materialName || ''),
    sku: String(line.sku || ''),
    expectedQuantity: expected,
    actualQuantity: actual,
    discrepancy: disc,
    discrepancyPercentage: expected !== 0 ? Math.round((disc / expected) * 100) : (actual > 0 ? 100 : 0),
    unitCost: uc,
    discrepancyValue: disc * uc,
    notes: String(line.notes || ''),
  };
}

// ─── Material Delivery (Entrega de material a trabajador) ────────────────────

export function buildMaterialDeliveryDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `mdel-${uuidv4()}`;
  const deliveryNumber = existing?.deliveryNumber || `ENT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const lines = Array.isArray(data.lines)
    ? data.lines.map(sanitizeDeliveryLine).filter(Boolean)
    : (existing?.lines || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'material_delivery',
    id,
    user_id: userId,
    deliveryNumber,
    date: String(data.date || existing?.date || now.slice(0, 10)),
    time: String(data.time || existing?.time || now.slice(11, 16)),
    workerId: String(data.workerId || existing?.workerId || ''),
    workerName: String(data.workerName || existing?.workerName || ''),
    warehouseId: String(data.warehouseId || existing?.warehouseId || ''),
    warehouseName: String(data.warehouseName || existing?.warehouseName || ''),
    vehicleId: String(data.vehicleId || existing?.vehicleId || ''),
    serviceId: String(data.serviceId || existing?.serviceId || ''),
    serviceNumber: String(data.serviceNumber || existing?.serviceNumber || ''),
    clientId: String(data.clientId || existing?.clientId || ''),
    clientName: String(data.clientName || existing?.clientName || ''),
    lines,
    status: norm(data.status ?? existing?.status, DELIVERY_STATUSES, 'draft'),
    deliveredBy: String(data.deliveredBy || existing?.deliveredBy || ''),
    deliveredByName: String(data.deliveredByName || existing?.deliveredByName || ''),
    receivedConfirmation: Boolean(data.receivedConfirmation ?? existing?.receivedConfirmation),
    receivedAt: String(data.receivedAt || existing?.receivedAt || ''),
    workerSignature: String(data.workerSignature || existing?.workerSignature || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeMaterialDelivery(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'material_delivery', id: doc._id,
    user_id: doc.user_id,
    deliveryNumber: doc.deliveryNumber || '',
    date: doc.date || '', time: doc.time || '',
    workerId: doc.workerId || '', workerName: doc.workerName || '',
    warehouseId: doc.warehouseId || '', warehouseName: doc.warehouseName || '',
    vehicleId: doc.vehicleId || '',
    serviceId: doc.serviceId || '', serviceNumber: doc.serviceNumber || '',
    clientId: doc.clientId || '', clientName: doc.clientName || '',
    lines: Array.isArray(doc.lines) ? doc.lines.map(sanitizeDeliveryLine).filter(Boolean) : [],
    status: norm(doc.status, DELIVERY_STATUSES, 'draft'),
    deliveredBy: doc.deliveredBy || '', deliveredByName: doc.deliveredByName || '',
    receivedConfirmation: Boolean(doc.receivedConfirmation),
    receivedAt: doc.receivedAt || '', workerSignature: doc.workerSignature || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '',
    deletedAt: doc.deletedAt || null,
  };
}

export async function listMaterialDeliveriesByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'material_delivery' && !d?.deletedAt && d?.user_id === userId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function listMaterialDeliveriesByWorker(req, userId, workerId) {
  const all = await listMaterialDeliveriesByUser(req, userId);
  return all.filter((d) => d.workerId === workerId);
}

export async function listMaterialDeliveriesByService(req, userId, serviceId) {
  const all = await listMaterialDeliveriesByUser(req, userId);
  return all.filter((d) => d.serviceId === serviceId);
}

// ─── Material Return (Devolución de material) ────────────────────────────────

export function buildMaterialReturnDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `mret-${uuidv4()}`;
  const returnNumber = existing?.returnNumber || `DEV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const lines = Array.isArray(data.lines)
    ? data.lines.map(sanitizeReturnLine).filter(Boolean)
    : (existing?.lines || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'material_return',
    id,
    user_id: userId,
    returnNumber,
    date: String(data.date || existing?.date || now.slice(0, 10)),
    time: String(data.time || existing?.time || now.slice(11, 16)),
    workerId: String(data.workerId || existing?.workerId || ''),
    workerName: String(data.workerName || existing?.workerName || ''),
    deliveryId: String(data.deliveryId || existing?.deliveryId || ''),
    deliveryNumber: String(data.deliveryNumber || existing?.deliveryNumber || ''),
    warehouseId: String(data.warehouseId || existing?.warehouseId || ''),
    warehouseName: String(data.warehouseName || existing?.warehouseName || ''),
    lines,
    status: norm(data.status ?? existing?.status, RETURN_STATUSES, 'pending'),
    inspectedBy: String(data.inspectedBy || existing?.inspectedBy || ''),
    inspectedByName: String(data.inspectedByName || existing?.inspectedByName || ''),
    inspectedAt: String(data.inspectedAt || existing?.inspectedAt || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeMaterialReturn(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'material_return', id: doc._id,
    user_id: doc.user_id,
    returnNumber: doc.returnNumber || '',
    date: doc.date || '', time: doc.time || '',
    workerId: doc.workerId || '', workerName: doc.workerName || '',
    deliveryId: doc.deliveryId || '', deliveryNumber: doc.deliveryNumber || '',
    warehouseId: doc.warehouseId || '', warehouseName: doc.warehouseName || '',
    lines: Array.isArray(doc.lines) ? doc.lines.map(sanitizeReturnLine).filter(Boolean) : [],
    status: norm(doc.status, RETURN_STATUSES, 'pending'),
    inspectedBy: doc.inspectedBy || '', inspectedByName: doc.inspectedByName || '',
    inspectedAt: doc.inspectedAt || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '',
    deletedAt: doc.deletedAt || null,
  };
}

export async function listMaterialReturnsByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'material_return' && !d?.deletedAt && d?.user_id === userId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ─── Material Request (Solicitud del trabajador) ─────────────────────────────

export function buildMaterialRequestDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `mreq-${uuidv4()}`;
  const requestNumber = existing?.requestNumber || `SOL-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'material_request',
    id,
    user_id: userId,
    requestNumber,
    workerId: String(data.workerId || existing?.workerId || ''),
    workerName: String(data.workerName || existing?.workerName || ''),
    catalogItemId: String(data.catalogItemId || existing?.catalogItemId || ''),
    materialName: String(data.materialName || existing?.materialName || ''),
    quantity: Math.max(0, Number(data.quantity || existing?.quantity || 0)),
    unit: String(data.unit || existing?.unit || 'ud'),
    reason: String(data.reason || existing?.reason || ''),
    status: norm(data.status, REQUEST_STATUSES, existing?.status || 'pending'),
    reviewedBy: String(data.reviewedBy || existing?.reviewedBy || ''),
    reviewedByName: String(data.reviewedByName || existing?.reviewedByName || ''),
    reviewedAt: String(data.reviewedAt || existing?.reviewedAt || ''),
    deliveryId: String(data.deliveryId || existing?.deliveryId || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeMaterialRequest(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'material_request', id: doc._id,
    user_id: doc.user_id,
    requestNumber: doc.requestNumber || '',
    workerId: doc.workerId || '', workerName: doc.workerName || '',
    catalogItemId: doc.catalogItemId || '', materialName: doc.materialName || '',
    quantity: Number(doc.quantity || 0), unit: doc.unit || 'ud',
    reason: doc.reason || '', status: doc.status || 'pending',
    reviewedBy: doc.reviewedBy || '', reviewedByName: doc.reviewedByName || '',
    reviewedAt: doc.reviewedAt || '', deliveryId: doc.deliveryId || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '',
    deletedAt: doc.deletedAt || null,
  };
}

export async function listMaterialRequestsByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'material_request' && !d?.deletedAt && d?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── Inventory Count (Inventario físico) ─────────────────────────────────────

export function buildMaterialInventoryCountDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `minv-${uuidv4()}`;
  const countNumber = existing?.countNumber || `INV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const status = norm(data.status, INVENTORY_COUNT_STATUSES, existing?.status || 'in_progress');

  const lines = Array.isArray(data.lines)
    ? data.lines.map(sanitizeCountLine).filter(Boolean)
    : (existing?.lines || []);
  const discItems = lines.filter((l) => l.discrepancy !== 0);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'material_inventory_count',
    id,
    user_id: userId,
    countNumber,
    date: String(data.date || existing?.date || now.slice(0, 10)),
    countedBy: String(data.countedBy || existing?.countedBy || ''),
    countedByName: String(data.countedByName || existing?.countedByName || ''),
    warehouseId: String(data.warehouseId || existing?.warehouseId || ''),
    warehouseName: String(data.warehouseName || existing?.warehouseName || ''),
    workerId: String(data.workerId || existing?.workerId || ''),
    lines,
    status,
    approvedBy: String(data.approvedBy || existing?.approvedBy || ''),
    approvedAt: String(data.approvedAt || existing?.approvedAt || ''),
    summary: {
      totalItems: lines.length,
      matchingItems: lines.length - discItems.length,
      discrepancyItems: discItems.length,
      totalDiscrepancyValue: discItems.reduce((s, l) => s + Math.abs(l.discrepancyValue), 0),
    },
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeMaterialInventoryCount(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'material_inventory_count', id: doc._id,
    user_id: doc.user_id,
    countNumber: doc.countNumber || '', date: doc.date || '',
    countedBy: doc.countedBy || '', countedByName: doc.countedByName || '',
    warehouseId: doc.warehouseId || '', warehouseName: doc.warehouseName || '',
    workerId: doc.workerId || '',
    lines: Array.isArray(doc.lines) ? doc.lines : [],
    status: doc.status || 'in_progress',
    approvedBy: doc.approvedBy || '', approvedAt: doc.approvedAt || '',
    summary: doc.summary || { totalItems: 0, matchingItems: 0, discrepancyItems: 0, totalDiscrepancyValue: 0 },
    notes: doc.notes || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '',
    deletedAt: doc.deletedAt || null,
  };
}

// ─── Helpers for Cleaning Materials (catalog_item with subtype) ──────────────

export async function listCleaningMaterials(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'catalog_item' && !d?.deletedAt && d?.user_id === userId && d?.subtype === 'cleaning_material')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

export async function getCleaningMaterialsSummary(req, userId) {
  const items = await listCleaningMaterials(req, userId);
  const active = items.filter((i) => i.active !== false);
  const lowStock = active.filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) > 0 && Number(i.stockQuantity) <= i.minStock);
  const outOfStock = active.filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) <= 0);
  const totalValue = active.reduce((s, i) => s + (Number(i.stockQuantity || 0) * Number(i.costPrice || 0)), 0);

  return {
    totalMaterials: active.length,
    stockValue: Math.round(totalValue * 100) / 100,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
  };
}
