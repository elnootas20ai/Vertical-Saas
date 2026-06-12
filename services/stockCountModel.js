import { v4 as uuidv4 } from 'uuid';
import {
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
} from './couchdb.js';

const VALID_COUNT_STATUSES = ['draft', 'in_progress', 'completed', 'cancelled'];
const VALID_COUNT_TYPES = ['full', 'partial', 'spot_check'];

export function buildStockCountDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `scount-${uuidv4()}`;

  const sanitizeLines = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(line => {
      const theoretical = Number(line.theoreticalStock ?? 0);
      const counted = line.countedStock !== null && line.countedStock !== undefined
        ? Number(line.countedStock)
        : null;
      const difference = counted !== null ? counted - theoretical : null;
      const differencePercent = counted !== null && theoretical > 0
        ? Math.round(((counted - theoretical) / theoretical) * 10000) / 100
        : null;
      const costPrice = Number(line.costPrice || 0);
      const differenceValue = difference !== null ? Math.round(difference * costPrice * 100) / 100 : null;

      return {
        catalogItemId: String(line.catalogItemId || ''),
        catalogItemName: String(line.catalogItemName || ''),
        sku: String(line.sku || ''),
        stockCategory: line.stockCategory || 'other',
        unit: String(line.unit || 'ud'),
        costPrice,
        minStock: Number(line.minStock ?? 0),
        theoreticalStock: theoretical,
        countedStock: counted,
        difference,
        differencePercent,
        differenceValue,
        notes: String(line.notes || ''),
        countedBy: String(line.countedBy || ''),
        countedAt: line.countedAt || null,
      };
    });
  };

  const lines = sanitizeLines(data.lines ?? existing?.lines);
  const totalTheoreticalValue = lines.reduce((s, l) => s + l.theoreticalStock * l.costPrice, 0);
  const totalCountedValue = lines.filter(l => l.countedStock !== null).reduce((s, l) => s + l.countedStock * l.costPrice, 0);
  const totalDifferenceValue = lines.filter(l => l.differenceValue !== null).reduce((s, l) => s + l.differenceValue, 0);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'stock_count',
    id,
    user_id: userId,
    name: String(data.name || existing?.name || ''),
    warehouseId: String(data.warehouseId || existing?.warehouseId || ''),
    warehouseName: String(data.warehouseName || existing?.warehouseName || ''),
    status: VALID_COUNT_STATUSES.includes(data.status) ? data.status : (existing?.status || 'draft'),
    countType: VALID_COUNT_TYPES.includes(data.countType) ? data.countType : (existing?.countType || 'full'),
    filterCategories: Array.isArray(data.filterCategories) ? data.filterCategories : (existing?.filterCategories || []),
    lines,
    totalTheoreticalValue: Math.round(totalTheoreticalValue * 100) / 100,
    totalCountedValue: Math.round(totalCountedValue * 100) / 100,
    totalDifferenceValue: Math.round(totalDifferenceValue * 100) / 100,
    adjustmentsGenerated: Boolean(data.adjustmentsGenerated ?? existing?.adjustmentsGenerated),
    startedAt: data.startedAt || existing?.startedAt || '',
    completedAt: data.completedAt || existing?.completedAt || '',
    startedBy: String(data.startedBy || existing?.startedBy || ''),
    completedBy: String(data.completedBy || existing?.completedBy || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeStockCount(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'stock_count',
    id: doc._id,
    user_id: doc.user_id,
    name: doc.name || '',
    warehouseId: doc.warehouseId || '',
    warehouseName: doc.warehouseName || '',
    status: doc.status || 'draft',
    countType: doc.countType || 'full',
    filterCategories: Array.isArray(doc.filterCategories) ? doc.filterCategories : [],
    lines: Array.isArray(doc.lines) ? doc.lines : [],
    totalTheoreticalValue: Number(doc.totalTheoreticalValue || 0),
    totalCountedValue: Number(doc.totalCountedValue || 0),
    totalDifferenceValue: Number(doc.totalDifferenceValue || 0),
    adjustmentsGenerated: Boolean(doc.adjustmentsGenerated),
    startedAt: doc.startedAt || '',
    completedAt: doc.completedAt || '',
    startedBy: doc.startedBy || '',
    completedBy: doc.completedBy || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listStockCountsByUser(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'stock_count' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export { VALID_COUNT_STATUSES, VALID_COUNT_TYPES };
