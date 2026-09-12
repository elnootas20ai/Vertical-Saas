import {
  getCatalogDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  findDocuments,
  ensureIndex,
} from './couchdb.js';
import { applyWarehouseStockDelta } from '../shared/stock/warehouseStockQty.js';
import logger from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';

const VALID_MOVEMENT_TYPES = [
  'purchase_reception',
  'sale',
  'internal_consumption',
  'adjustment_in',
  'adjustment_out',
  'transfer',
  // Traspaso entre tiendas: salida en almacén origen / entrada en destino.
  'transfer_out',
  'transfer_in',
  'return_supplier',
  'return_customer',
  'initial',
  'recipe_consumption',
  'recipe_consumption_reversal',
  'waste',
  'sale_reversal',
  'material_delivery',
  'material_return',
];

const INBOUND_TYPES = new Set(['purchase_reception', 'adjustment_in', 'return_customer', 'initial', 'sale_reversal', 'recipe_consumption_reversal', 'material_return', 'transfer_in']);
const OUTBOUND_TYPES = new Set(['sale', 'internal_consumption', 'adjustment_out', 'return_supplier', 'recipe_consumption', 'waste', 'material_delivery', 'transfer_out']);

const stockMovementIndexReady = new Set();
const stockMovementRefIndexReady = new Set();

async function ensureStockMovementListIndex(req, dbName) {
  if (stockMovementIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]+/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id', 'createdAt'], `idx-${safeDb}-stock-mov-user-date`).catch(
    () => null,
  );
  await ensureIndex(req, dbName, ['type', 'user_id', 'catalogItemId', 'createdAt'], `idx-${safeDb}-stock-mov-item-date`).catch(
    () => null,
  );
  stockMovementIndexReady.add(dbName);
}

async function ensureStockMovementReferenceIndex(req, dbName) {
  if (stockMovementRefIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]+/g, '-');
  await ensureIndex(
    req,
    dbName,
    ['type', 'user_id', 'referenceId', 'referenceType'],
    `idx-${safeDb}-stock-mov-ref`,
  ).catch(() => null);
  stockMovementRefIndexReady.add(dbName);
}

function normalizeMovementListLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 120;
  return Math.min(Math.max(Math.floor(n), 1), 500);
}

function buildStockMovementDocument(userId, data = {}) {
  const now = new Date().toISOString();
  const id = String(data.movementId || `smov-${uuidv4()}`);
  const movementType = VALID_MOVEMENT_TYPES.includes(data.movementType) ? data.movementType : 'adjustment_in';

  return {
    _id: id,
    _rev: data._rev,
    type: 'stock_movement',
    id,
    user_id: userId,
    catalogItemId: String(data.catalogItemId || ''),
    catalogItemName: String(data.catalogItemName || ''),
    sku: String(data.sku || ''),
    warehouseId: String(data.warehouseId || ''),
    warehouseToId: String(data.warehouseToId || ''),
    businessId: String(data.businessId || data.business_id || '').replace(/^business:/, '').trim(),
    salesPointId: String(data.salesPointId || '').trim(),
    workCenterId: String(data.workCenterId || '').trim(),
    movementType,
    quantity: Math.abs(Number(data.quantity || 0)),
    previousStock: Number(data.previousStock || 0),
    newStock: Number(data.newStock || 0),
    previousGlobalStock: Number(data.previousGlobalStock ?? data.previousStock ?? 0),
    newGlobalStock: Number(data.newGlobalStock ?? data.newStock ?? 0),
    costApplicationVersion: Number(data.costApplicationVersion ?? 1),
    applied: data.applied !== false,
    unitCost: Number(data.unitCost || 0),
    totalCost: Number(data.totalCost || 0),
    referenceId: String(data.referenceId || ''),
    referenceType: String(data.referenceType || ''),
    notes: String(data.notes || ''),
    performedBy: String(data.performedBy || ''),
    recipeId: String(data.recipeId || ''),
    parentItemId: String(data.parentItemId || ''),
    parentItemName: String(data.parentItemName || ''),
    wasteRecordId: String(data.wasteRecordId || ''),
    createdAt: now,
  };
}

function sanitizeStockMovement(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    type: 'stock_movement',
    id: doc._id,
    user_id: doc.user_id,
    catalogItemId: doc.catalogItemId || '',
    catalogItemName: doc.catalogItemName || '',
    sku: doc.sku || '',
    warehouseId: doc.warehouseId || '',
    warehouseToId: doc.warehouseToId || '',
    businessId: doc.businessId || doc.business_id || '',
    salesPointId: doc.salesPointId || '',
    workCenterId: doc.workCenterId || '',
    movementType: doc.movementType || '',
    quantity: Number(doc.quantity || 0),
    previousStock: Number(doc.previousStock || 0),
    newStock: Number(doc.newStock || 0),
    previousGlobalStock: Number(doc.previousGlobalStock ?? doc.previousStock ?? 0),
    newGlobalStock: Number(doc.newGlobalStock ?? doc.newStock ?? 0),
    costApplicationVersion: Number(doc.costApplicationVersion || 0),
    applied: doc.applied !== false,
    unitCost: Number(doc.unitCost || 0),
    totalCost: Number(doc.totalCost || 0),
    referenceId: doc.referenceId || '',
    referenceType: doc.referenceType || '',
    notes: doc.notes || '',
    performedBy: doc.performedBy || '',
    recipeId: doc.recipeId || '',
    parentItemId: doc.parentItemId || '',
    parentItemName: doc.parentItemName || '',
    wasteRecordId: doc.wasteRecordId || '',
    createdAt: doc.createdAt || '',
  };
}

export async function recordMovement(req, userId, movementData) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const { catalogItemId, movementType, quantity } = movementData;
  if (!catalogItemId) throw new Error('catalogItemId es obligatorio');
  if (!quantity || quantity <= 0) throw new Error('quantity debe ser mayor que 0');
  if (!VALID_MOVEMENT_TYPES.includes(movementType)) throw new Error(`movementType inválido: ${movementType}`);
  const idempotencyKey = String(movementData.idempotencyKey || '').trim();
  const deterministicMovementId = idempotencyKey
    ? `smov-${createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex').slice(0, 32)}`
    : '';

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const catItem = await getDocument(req, db, catalogItemId);
      if (!catItem || catItem.type !== 'catalog_item' || catItem.user_id !== userId) {
        throw new Error(`Artículo de catálogo no encontrado: ${catalogItemId}`);
      }
      const existingMovement = deterministicMovementId
        ? await getDocument(req, db, deterministicMovementId).catch(() => null)
        : null;
      if (
        existingMovement
        && (
          existingMovement.type !== 'stock_movement'
          || existingMovement.user_id !== userId
          || existingMovement.catalogItemId !== catalogItemId
        )
      ) {
        throw new Error('La clave idempotente pertenece a otro movimiento');
      }
      const appliedMovementIds = Array.isArray(catItem.appliedStockMovementIds)
        ? catItem.appliedStockMovementIds.map(String)
        : [];
      if (deterministicMovementId && appliedMovementIds.includes(deterministicMovementId)) {
        if (!existingMovement) {
          throw new Error(`Movimiento idempotente no encontrado: ${deterministicMovementId}`);
        }
        let appliedMovement = existingMovement;
        if (existingMovement.applied === false) {
          const finalized = { ...existingMovement, applied: true };
          const finalizedSave = await putDocument(req, db, finalized._id, finalized);
          appliedMovement = { ...finalized, _rev: finalizedSave.rev };
        }
        return sanitizeStockMovement(appliedMovement);
      }

      const warehouseId = String(movementData.warehouseId || '').trim();
      let warehouseName = '';
      let warehouseDoc = null;
      if (warehouseId) {
        try {
          const whDoc = await getDocument(req, db, warehouseId);
          if (whDoc?.type === 'warehouse' && whDoc.user_id === userId) {
            warehouseDoc = whDoc;
            warehouseName = String(whDoc.name || '');
          }
        } catch {
          /* noop */
        }
        if (!warehouseDoc) {
          throw new Error('Almacén no encontrado o fuera del ámbito de la cuenta');
        }
      }

      let previousStock;
      let newStock;
      let nextWarehouseStock = catItem.warehouseStock;
      let nextStockQuantity = Number(catItem.stockQuantity || 0);

      if (movementType === 'transfer') {
        // Transferencias: qty global se mantiene; detalle por almacén queda en movimientos.
        previousStock = warehouseId
          ? applyWarehouseStockDelta(catItem, warehouseId, 0, warehouseName).previousQty
          : Number(catItem.stockQuantity || 0);
        newStock = previousStock;
      } else if (INBOUND_TYPES.has(movementType) || OUTBOUND_TYPES.has(movementType)) {
        const signed = INBOUND_TYPES.has(movementType) ? Math.abs(quantity) : -Math.abs(quantity);
        const applied = applyWarehouseStockDelta(catItem, warehouseId, signed, warehouseName);
        previousStock = applied.previousQty;
        newStock = applied.nextQty;
        nextWarehouseStock = applied.warehouseStock;
        nextStockQuantity = warehouseId ? applied.stockQuantity : applied.nextQty;
      } else {
        previousStock = Number(catItem.stockQuantity || 0);
        newStock = previousStock;
      }

      const movDoc = buildStockMovementDocument(userId, {
        ...movementData,
        movementId: deterministicMovementId || undefined,
        _rev: existingMovement?._rev,
        applied: deterministicMovementId ? false : true,
        catalogItemName: catItem.name || '',
        sku: catItem.sku || '',
        previousStock,
        newStock,
        previousGlobalStock: Number(catItem.stockQuantity || 0),
        newGlobalStock: nextStockQuantity,
        totalCost: Math.abs(quantity) * Number(movementData.unitCost || catItem.costPrice || 0),
        businessId: movementData.businessId
          || movementData.business_id
          || warehouseDoc?.businessId
          || warehouseDoc?.business_id
          || catItem.businessId
          || catItem.business_id
          || '',
        salesPointId: movementData.salesPointId || warehouseDoc?.salesPointId || '',
        workCenterId: movementData.workCenterId || catItem.workCenterId || '',
      });

      const movementSave = await putDocument(req, db, movDoc._id, movDoc);

      await putDocument(req, db, catItem._id, {
        ...catItem,
        isStockItem: true,
        stockQuantity: nextStockQuantity,
        ...(warehouseId && movementType !== 'transfer'
          ? { warehouseStock: nextWarehouseStock }
          : {}),
        ...(deterministicMovementId
          ? {
              appliedStockMovementIds: [
                ...appliedMovementIds,
                deterministicMovementId,
              ].slice(-500),
            }
          : {}),
        updatedAt: new Date().toISOString(),
      });

      let finalMovement = { ...movDoc, _rev: movementSave.rev };
      if (deterministicMovementId) {
        const finalized = { ...finalMovement, applied: true };
        const finalizedSave = await putDocument(req, db, finalized._id, finalized);
        finalMovement = { ...finalized, _rev: finalizedSave.rev };
      }

      logger.info({
        tag: 'STOCK_MOVEMENT',
        movementType,
        catalogItemId,
        quantity,
        previousStock,
        newStock,
        warehouseId: warehouseId || undefined,
        userId,
      }, 'Movimiento de stock registrado');

      return sanitizeStockMovement(finalMovement);
    } catch (err) {
      if (err?.statusCode === 409 && attempt < MAX_RETRIES - 1) {
        logger.warn({ tag: 'STOCK_MOVEMENT', attempt }, 'Conflicto CouchDB, reintentando...');
        continue;
      }
      throw err;
    }
  }
}

/**
 * Aplica el coste medio de una recepción una sola vez por movimiento.
 * Se ejecuta tras la acción de recepción; no usa workers ni procesos periódicos.
 */
export async function applyPurchaseMovementCost(req, userId, movement) {
  const movementId = String(movement?._id || movement?.id || '').trim();
  const catalogItemId = String(movement?.catalogItemId || '').trim();
  const receivedQty = Number(movement?.quantity || 0);
  const unitCost = Number(movement?.unitCost || 0);
  if (
    !movementId
    || !catalogItemId
    || receivedQty <= 0
    || unitCost <= 0
    || Number(movement.costApplicationVersion || 0) < 1
  ) return false;

  const db = getCatalogDbName();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const item = await getDocument(req, db, catalogItemId);
    if (!item || item.type !== 'catalog_item' || item.user_id !== userId) return false;
    const appliedKeys = Array.isArray(item.purchaseCostMovementIds)
      ? item.purchaseCostMovementIds.map(String)
      : [];
    if (appliedKeys.includes(movementId)) return false;

    const previousQty = Math.max(
      0,
      Number(movement.previousGlobalStock ?? (Number(item.stockQuantity || 0) - receivedQty)),
    );
    const previousCost = Number(item.costPrice || 0);
    const denominator = previousQty + receivedQty;
    const costPrice = previousQty > 0 && previousCost > 0 && denominator > 0
      ? Math.round(((previousQty * previousCost + receivedQty * unitCost) / denominator) * 100) / 100
      : unitCost;
    try {
      await putDocument(req, db, item._id, {
        ...item,
        costPrice,
        lastPurchasePrice: unitCost,
        lastPurchaseDate: movement.createdAt || new Date().toISOString(),
        purchaseCostMovementIds: [...appliedKeys, movementId].slice(-100),
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      if (error?.statusCode === 409 && attempt < 2) continue;
      throw error;
    }
  }
  return false;
}

export async function listMovementsByReference(req, userId, referenceId, referenceType, options = {}) {
  const uid = String(userId || '').trim();
  const refId = String(referenceId || '').trim();
  const refType = String(referenceType || '').trim();
  if (!uid || !refId) return [];

  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureStockMovementReferenceIndex(req, db);

  const selector = {
    type: 'stock_movement',
    user_id: uid,
    referenceId: refId,
    ...(refType ? { referenceType: refType } : {}),
  };
  const movementTypes = options.movementTypes;
  if (Array.isArray(movementTypes) && movementTypes.length > 0) {
    selector.movementType = { $in: movementTypes };
  }

  const maxDocs = Math.min(Math.max(Number(options.maxDocs) || 500, 1), 2000);
  let docs;
  try {
    docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs });
  } catch {
    docs = [];
  }

  return docs.filter(
    (doc) =>
      doc?.type === 'stock_movement' &&
      doc?.user_id === uid &&
      doc?.applied !== false &&
      doc?.referenceId === refId &&
      (!refType || doc?.referenceType === refType),
  );
}

export async function listMovementsByUser(req, userId, filters = {}) {
  const uid = String(userId || '').trim();
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureStockMovementListIndex(req, db);

  const listLimit = normalizeMovementListLimit(filters.limit);
  const catalogItemId = String(filters.catalogItemId || '').trim();
  const warehouseId = String(filters.warehouseId || '').trim();

  const selector = uid
    ? catalogItemId
      ? { type: 'stock_movement', user_id: uid, catalogItemId }
      : { type: 'stock_movement', user_id: uid }
    : { type: 'stock_movement' };

  const sort =
    catalogItemId && uid
      ? [{ type: 'asc' }, { user_id: 'asc' }, { catalogItemId: 'asc' }, { createdAt: 'desc' }]
      : uid
        ? [{ type: 'asc' }, { user_id: 'asc' }, { createdAt: 'desc' }]
        : [{ type: 'asc' }, { createdAt: 'desc' }];

  const maxDocs = warehouseId ? Math.min(listLimit * 4, 2000) : listLimit;

  let docs;
  try {
    docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs, sort });
  } catch {
    try {
      docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs });
    } catch {
      docs = [];
    }
  }

  let movements = docs.filter(
    (doc) =>
      doc?.type === 'stock_movement'
      && doc?.applied !== false
      && (!uid || doc?.user_id === uid),
  );

  if (warehouseId) {
    movements = movements.filter(
      (m) => m.warehouseId === warehouseId || m.warehouseToId === warehouseId,
    );
  }
  if (filters.movementType) {
    movements = movements.filter((m) => m.movementType === filters.movementType);
  }
  if (filters.dateFrom) {
    movements = movements.filter((m) => m.createdAt >= filters.dateFrom);
  }
  if (filters.dateTo) {
    movements = movements.filter((m) => m.createdAt <= filters.dateTo);
  }

  return movements
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, listLimit)
    .map(sanitizeStockMovement);
}

export async function getMovementsSummary(req, userId, filters = {}) {
  const movements = await listMovementsByUser(req, userId, {
    ...filters,
    limit: filters.limit ?? 2000,
  });

  let totalIn = 0;
  let totalOut = 0;
  let totalInValue = 0;
  let totalOutValue = 0;

  for (const m of movements) {
    if (INBOUND_TYPES.has(m.movementType)) {
      totalIn += m.quantity;
      totalInValue += m.totalCost;
    } else if (OUTBOUND_TYPES.has(m.movementType)) {
      totalOut += m.quantity;
      totalOutValue += m.totalCost;
    }
  }

  return {
    totalMovements: movements.length,
    totalIn,
    totalOut,
    totalInValue: Math.round(totalInValue * 100) / 100,
    totalOutValue: Math.round(totalOutValue * 100) / 100,
    netChange: totalIn - totalOut,
    netValue: Math.round((totalInValue - totalOutValue) * 100) / 100,
  };
}

export { sanitizeStockMovement, VALID_MOVEMENT_TYPES, INBOUND_TYPES, OUTBOUND_TYPES, normalizeMovementListLimit };
