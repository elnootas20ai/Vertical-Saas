/**
 * Almacén por tienda (PDV): mismo catálogo, stock separado.
 * Crea/actualiza warehouses ligados por salesPointId.
 */
import {
  getCatalogDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  listWarehousesByUser,
  buildWarehouseDocument,
  listPointsOfSaleByUser,
} from './couchdb.js';
import { storeWarehouseDisplayName } from '../shared/stock/warehouseStockQty.js';
import logger from './logger.js';

function activePdvs(pointsOfSale = []) {
  return (pointsOfSale || []).filter((p) => p && !p.deletedAt && p.active !== false);
}

export function findWarehouseForSalesPoint(warehouses, salesPointId) {
  const pdvId = String(salesPointId || '').trim();
  if (!pdvId) return null;
  const list = (warehouses || []).filter((w) => w && !w.deletedAt && w.active !== false);
  return list.find((w) => String(w.salesPointId || '').trim() === pdvId) || null;
}

/**
 * Asegura un almacén por cada PDV activo. Idempotente.
 * @returns {Promise<{ warehouses: object[], created: number, linked: number }>}
 */
export async function ensureStoreWarehouses(req, userId, pointsOfSale) {
  const uid = String(userId || '').trim();
  if (!uid) return { warehouses: [], created: 0, linked: 0 };

  const pdvs = activePdvs(
    pointsOfSale && pointsOfSale.length
      ? pointsOfSale
      : await listPointsOfSaleByUser(req, uid).catch(() => []),
  );

  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  let warehouses = await listWarehousesByUser(req, uid);
  let created = 0;
  let linked = 0;

  for (const pdv of pdvs) {
    const pdvId = String(pdv._id || '').trim();
    if (!pdvId) continue;
    const desiredName = storeWarehouseDisplayName(pdv.name || pdv.code || 'Tienda');

    let hit = findWarehouseForSalesPoint(warehouses, pdvId);
    if (hit) {
      const needsName = String(hit.name || '').trim() !== desiredName;
      if (needsName) {
        const fresh = await getDocument(req, db, hit._id);
        if (fresh && fresh.type === 'warehouse') {
          const next = buildWarehouseDocument(
            uid,
            { ...fresh, name: desiredName, salesPointId: pdvId, warehouseType: 'store' },
            fresh,
          );
          const saved = await putDocument(req, db, next._id, next);
          hit = { ...next, _rev: saved.rev };
          warehouses = warehouses.map((w) => (w._id === hit._id ? hit : w));
          linked += 1;
        }
      }
      continue;
    }

    // Reutilizar almacén homónimo sin salesPointId (migración suave).
    const byName = warehouses.find(
      (w) =>
        w.active !== false &&
        !w.deletedAt &&
        !String(w.salesPointId || '').trim() &&
        String(w.name || '').trim().toLowerCase() === desiredName.toLowerCase(),
    );
    if (byName) {
      const fresh = await getDocument(req, db, byName._id);
      if (fresh && fresh.type === 'warehouse') {
        const next = buildWarehouseDocument(
          uid,
          { ...fresh, name: desiredName, salesPointId: pdvId, warehouseType: 'store' },
          fresh,
        );
        const saved = await putDocument(req, db, next._id, next);
        const updated = { ...next, _rev: saved.rev };
        warehouses = warehouses.map((w) => (w._id === updated._id ? updated : w));
        linked += 1;
      }
      continue;
    }

    const doc = buildWarehouseDocument(uid, {
      name: desiredName,
      salesPointId: pdvId,
      warehouseType: 'store',
      isDefault: warehouses.filter((w) => w.active !== false && !w.deletedAt).length === 0,
      active: true,
    });
    const saved = await putDocument(req, db, doc._id, doc);
    warehouses.push({ ...doc, _rev: saved.rev });
    created += 1;
    logger.info(
      { tag: 'STORE_WAREHOUSE', userId: uid, salesPointId: pdvId, warehouseId: doc._id, name: desiredName },
      'Almacén de tienda creado',
    );
  }

  return { warehouses, created, linked };
}

export async function resolveWarehouseIdForSalesPoint(req, userId, salesPointId) {
  const pdvId = String(salesPointId || '').trim();
  if (!pdvId || !userId) return '';
  const { warehouses } = await ensureStoreWarehouses(req, userId);
  const hit = findWarehouseForSalesPoint(warehouses, pdvId);
  return hit?._id || '';
}
