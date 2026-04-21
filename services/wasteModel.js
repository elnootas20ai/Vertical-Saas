import { v4 as uuidv4 } from 'uuid';
import {
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
} from './couchdb.js';

const VALID_WASTE_TYPES = ['expiry', 'breakage', 'spoilage', 'theft', 'overproduction', 'preparation_error', 'spillage', 'return_unusable', 'other'];
const VALID_WASTE_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_REVIEW_STATUSES = ['pending', 'reviewed', 'disputed'];

export function buildWasteRecordDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `waste-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'waste_record',
    id,
    user_id: userId,
    catalogItemId: String(data.catalogItemId || existing?.catalogItemId || ''),
    catalogItemName: String(data.catalogItemName || existing?.catalogItemName || ''),
    warehouseId: String(data.warehouseId || existing?.warehouseId || ''),
    warehouseName: String(data.warehouseName || existing?.warehouseName || ''),
    quantity: Math.abs(Number(data.quantity || 0)),
    unit: String(data.unit || existing?.unit || 'ud'),
    wasteType: VALID_WASTE_TYPES.includes(data.wasteType) ? data.wasteType : (existing?.wasteType || 'other'),
    severity: VALID_WASTE_SEVERITIES.includes(data.severity) ? data.severity : (existing?.severity || 'low'),
    estimatedCost: Number(data.estimatedCost || 0),
    notes: String(data.notes || existing?.notes || ''),
    evidence: Array.isArray(data.evidence) ? data.evidence.map(String) : (existing?.evidence || []),
    reportedBy: String(data.reportedBy || existing?.reportedBy || ''),
    reportedByName: String(data.reportedByName || existing?.reportedByName || ''),
    reviewedBy: String(data.reviewedBy || existing?.reviewedBy || ''),
    reviewStatus: VALID_REVIEW_STATUSES.includes(data.reviewStatus) ? data.reviewStatus : (existing?.reviewStatus || 'pending'),
    reviewNotes: String(data.reviewNotes || existing?.reviewNotes || ''),
    batchNumber: String(data.batchNumber || existing?.batchNumber || ''),
    expiryDate: String(data.expiryDate || existing?.expiryDate || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeWasteRecord(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'waste_record',
    id: doc._id,
    user_id: doc.user_id,
    catalogItemId: doc.catalogItemId || '',
    catalogItemName: doc.catalogItemName || '',
    warehouseId: doc.warehouseId || '',
    warehouseName: doc.warehouseName || '',
    quantity: Number(doc.quantity || 0),
    unit: doc.unit || 'ud',
    wasteType: doc.wasteType || 'other',
    severity: doc.severity || 'low',
    estimatedCost: Number(doc.estimatedCost || 0),
    notes: doc.notes || '',
    evidence: Array.isArray(doc.evidence) ? doc.evidence : [],
    reportedBy: doc.reportedBy || '',
    reportedByName: doc.reportedByName || '',
    reviewedBy: doc.reviewedBy || '',
    reviewStatus: doc.reviewStatus || 'pending',
    reviewNotes: doc.reviewNotes || '',
    batchNumber: doc.batchNumber || '',
    expiryDate: doc.expiryDate || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listWasteRecordsByUser(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'waste_record' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export { VALID_WASTE_TYPES, VALID_WASTE_SEVERITIES, VALID_REVIEW_STATUSES };
