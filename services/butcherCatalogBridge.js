/**
 * Puente bt_catalog (TPV carnicería) ↔ catalog_item (core SaaS).
 */

import {
  ensureDatabase,
  getDocument,
  putDocument,
  getCatalogDbName,
  buildCatalogItemDocument,
  getAllDocuments,
} from './couchdb.js';
import { getButcherOpsDbName } from './butcherStockPipeline.js';
import logger from './logger.js';

const TAG = 'BUTCHER_CATALOG_BRIDGE';

/**
 * Tras guardar un bt_catalog, espeja en catalog_item (stock core + autoReorder).
 */
export async function syncButcherCatalogToCore(req, userId, btDoc) {
  try {
    if (!btDoc || !userId) return null;
    const catalogDb = getCatalogDbName();
    await ensureDatabase(req, catalogDb);

    let existing = null;
    if (btDoc.catalogItemId) {
      try {
        existing = await getDocument(req, catalogDb, btDoc.catalogItemId);
        if (existing?.deletedAt || existing?.type !== 'catalog_item') existing = null;
      } catch { existing = null; }
    }

    if (!existing) {
      const all = await getAllDocuments(req, catalogDb);
      const name = String(btDoc.nombre || '').trim().toLowerCase();
      existing = all.find((d) =>
        d?.type === 'catalog_item'
        && !d.deletedAt
        && d.user_id === userId
        && d.vertical === 'butcherShop'
        && String(d.name || '').trim().toLowerCase() === name,
      ) || null;
    }

    const stock = Number(btDoc.stock ?? 0);
    const minStock = Number(btDoc.stockMinimo ?? 0);
    const unitPrice = Number(btDoc.precioKg ?? btDoc.precioUnidad ?? 0);
    const costPrice = Number(btDoc.costePorKg ?? 0);

    const payload = {
      name: btDoc.nombre || existing?.name || 'Producto',
      category: btDoc.categoria || existing?.category || 'otros',
      unit: btDoc.unidadVenta === 'unidad' ? 'ud' : 'kg',
      unitPrice,
      costPrice,
      stockQuantity: stock,
      minStock,
      autoReorder: true,
      reorderQuantity: Math.max(minStock * 2, 1),
      vertical: 'butcherShop',
      module: 'catalog',
      active: !btDoc.bloqueado,
      sku: btDoc.ref || existing?.sku || '',
      notes: existing?.notes || '',
      butcherOpsCatalogId: btDoc._id,
    };

    const doc = buildCatalogItemDocument(userId, payload, existing);
    const saved = await putDocument(req, catalogDb, doc._id, doc);

    // Guarda enlace en bt_catalog si faltaba
    if (!btDoc.catalogItemId || btDoc.catalogItemId !== doc._id) {
      const opsDb = getButcherOpsDbName();
      try {
        const fresh = await getDocument(req, opsDb, btDoc._id);
        if (fresh) {
          await putDocument(req, opsDb, fresh._id, {
            ...fresh,
            catalogItemId: doc._id,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch { /* non-blocking */ }
    }

    return { ...doc, _rev: saved?.rev };
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'syncButcherCatalogToCore falló');
    return null;
  }
}

/**
 * Tras guardar catalog_item de vertical butcherShop, espeja en bt_catalog.
 */
export async function syncCoreCatalogToButcher(req, userId, coreDoc) {
  try {
    if (!coreDoc || !userId) return null;
    if (String(coreDoc.vertical || '') !== 'butcherShop') return null;

    const opsDb = getButcherOpsDbName();
    await ensureDatabase(req, opsDb);

    let existing = null;
    if (coreDoc.butcherOpsCatalogId) {
      try {
        existing = await getDocument(req, opsDb, coreDoc.butcherOpsCatalogId);
        if (existing?.deletedAt || (existing?.type !== 'bt_catalog' && existing?.type !== 'bt_product')) {
          existing = null;
        }
      } catch { existing = null; }
    }

    if (!existing) {
      const all = await getAllDocuments(req, opsDb);
      const name = String(coreDoc.name || '').trim().toLowerCase();
      existing = all.find((d) =>
        d && (d.type === 'bt_catalog' || d.type === 'bt_product')
        && !d.deletedAt
        && d.user_id === userId
        && String(d.nombre || '').trim().toLowerCase() === name,
      ) || null;
    }

    const { v4: uuidv4 } = await import('uuid');
    const id = existing?._id || `btc-${uuidv4()}`;
    const now = new Date().toISOString();
    const doc = {
      ...(existing || {}),
      _id: id,
      _rev: existing?._rev,
      type: 'bt_catalog',
      user_id: userId,
      ref: coreDoc.sku || existing?.ref || '',
      nombre: coreDoc.name || existing?.nombre || '',
      categoria: coreDoc.category || existing?.categoria || 'otros',
      precioKg: Number(coreDoc.unitPrice ?? existing?.precioKg ?? 0),
      precioUnidad: existing?.precioUnidad ?? null,
      stock: Number(coreDoc.stockQuantity ?? existing?.stock ?? 0),
      stockMinimo: Number(coreDoc.minStock ?? existing?.stockMinimo ?? 0),
      unidadVenta: coreDoc.unit === 'ud' ? 'unidad' : 'peso',
      bloqueado: coreDoc.active === false,
      motivoBloqueo: null,
      fechaCaducidad: existing?.fechaCaducidad || null,
      lote: existing?.lote || null,
      precioActualizado: true,
      costePorKg: Number(coreDoc.costPrice ?? existing?.costePorKg ?? 0),
      catalogItemId: coreDoc._id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await putDocument(req, opsDb, doc._id, doc);

    if (!coreDoc.butcherOpsCatalogId) {
      const catalogDb = getCatalogDbName();
      try {
        await putDocument(req, catalogDb, coreDoc._id, {
          ...coreDoc,
          butcherOpsCatalogId: id,
          updatedAt: now,
        });
      } catch { /* non-blocking */ }
    }

    return doc;
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'syncCoreCatalogToButcher falló');
    return null;
  }
}
