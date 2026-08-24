import {
  getCatalogDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  getAllDocuments,
} from './couchdb.js';
import { applyWarehouseStockDelta } from '../shared/stock/warehouseStockQty.js';
import logger from './logger.js';
import { v4 as uuidv4 } from 'uuid';

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

function buildStockMovementDocument(userId, data = {}) {
  const now = new Date().toISOString();
  const id = `smov-${uuidv4()}`;
  const movementType = VALID_MOVEMENT_TYPES.includes(data.movementType) ? data.movementType : 'adjustment_in';

  return {
    _id: id,
    type: 'stock_movement',
    id,
    user_id: userId,
    catalogItemId: String(data.catalogItemId || ''),
    catalogItemName: String(data.catalogItemName || ''),
    sku: String(data.sku || ''),
    warehouseId: String(data.warehouseId || ''),
    warehouseToId: String(data.warehouseToId || ''),
    movementType,
    quantity: Math.abs(Number(data.quantity || 0)),
    previousStock: Number(data.previousStock || 0),
    newStock: Number(data.newStock || 0),
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
    movementType: doc.movementType || '',
    quantity: Number(doc.quantity || 0),
    previousStock: Number(doc.previousStock || 0),
    newStock: Number(doc.newStock || 0),
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

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const catItem = await getDocument(req, db, catalogItemId);
      if (!catItem || catItem.type !== 'catalog_item') {
        throw new Error(`Artículo de catálogo no encontrado: ${catalogItemId}`);
      }

      const warehouseId = String(movementData.warehouseId || '').trim();
      let warehouseName = '';
      if (warehouseId) {
        try {
          const whDoc = await getDocument(req, db, warehouseId);
          if (whDoc?.type === 'warehouse') warehouseName = String(whDoc.name || '');
        } catch {
          /* noop */
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
        catalogItemName: catItem.name || '',
        sku: catItem.sku || '',
        previousStock,
        newStock,
        totalCost: Math.abs(quantity) * Number(movementData.unitCost || catItem.costPrice || 0),
      });

      await putDocument(req, db, movDoc._id, movDoc);

      await putDocument(req, db, catItem._id, {
        ...catItem,
        isStockItem: true,
        stockQuantity: nextStockQuantity,
        ...(warehouseId && movementType !== 'transfer'
          ? { warehouseStock: nextWarehouseStock }
          : {}),
        updatedAt: new Date().toISOString(),
      });

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

      return sanitizeStockMovement(movDoc);
    } catch (err) {
      if (err?.statusCode === 409 && attempt < MAX_RETRIES - 1) {
        logger.warn({ tag: 'STOCK_MOVEMENT', attempt }, 'Conflicto CouchDB, reintentando...');
        continue;
      }
      throw err;
    }
  }
}

export async function listMovementsByUser(req, userId, filters = {}) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);

  let movements = docs.filter(
    (doc) => doc?.type === 'stock_movement' && doc?.user_id === userId,
  );

  if (filters.catalogItemId) {
    movements = movements.filter((m) => m.catalogItemId === filters.catalogItemId);
  }
  if (filters.warehouseId) {
    movements = movements.filter((m) => m.warehouseId === filters.warehouseId || m.warehouseToId === filters.warehouseId);
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
    .map(sanitizeStockMovement);
}

export async function getMovementsSummary(req, userId, filters = {}) {
  const movements = await listMovementsByUser(req, userId, filters);

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

export { sanitizeStockMovement, VALID_MOVEMENT_TYPES, INBOUND_TYPES, OUTBOUND_TYPES };
