/**
 * Persiste alias proveedor↔inventario al vincular líneas de factura/OCR.
 */

import {
  getCatalogDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  buildCatalogItemDocument,
} from './couchdb.js';
import {
  mergeSupplierProductAlias,
  normalizeSupplierProductKey,
} from '../shared/purchases/supplierProductAlias.js';
import logger from './logger.js';

/**
 * @param {object} req
 * @param {string} userId
 * @param {string} supplierId
 * @param {Array<{ description?: string, itemName?: string, sku?: string, catalogItemId?: string }>} lines
 */
export async function rememberSupplierProductAliasesFromLines(req, userId, supplierId, lines) {
  const uid = String(userId || '').trim();
  const sid = String(supplierId || '').trim();
  if (!uid || !sid || !Array.isArray(lines) || lines.length === 0) {
    return { saved: 0 };
  }

  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const byItem = new Map();
  for (const line of lines) {
    const catalogItemId = String(line?.catalogItemId || '').trim();
    const label = String(line?.description || line?.itemName || '').trim();
    const sku = String(line?.sku || '').trim();
    if (!catalogItemId || (!label && !sku)) continue;
    if (!byItem.has(catalogItemId)) byItem.set(catalogItemId, []);
    byItem.get(catalogItemId).push({ label, sku });
  }

  let saved = 0;
  for (const [catalogItemId, entries] of byItem) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const existing = await getDocument(req, db, catalogItemId);
        if (!existing || existing.type !== 'catalog_item' || existing.user_id !== uid) break;

        let aliases = existing.supplierProductAliases;
        let changed = false;
        for (const entry of entries) {
          const before = JSON.stringify(aliases || []);
          aliases = mergeSupplierProductAlias(aliases, {
            supplierId: sid,
            label: entry.label,
            key: normalizeSupplierProductKey(entry.label),
            sku: entry.sku,
          });
          if (JSON.stringify(aliases) !== before) changed = true;
        }
        if (!changed) break;

        const doc = buildCatalogItemDocument(
          uid,
          { ...existing, supplierProductAliases: aliases },
          existing,
        );
        await putDocument(req, db, doc._id, doc);
        saved += 1;
        break;
      } catch (err) {
        const status = err?.status || err?.statusCode;
        if (status === 409 && attempt < 2) continue;
        logger.warn(
          { tag: 'SUPPLIER_ALIAS', err: err?.message, catalogItemId },
          'No se pudo guardar alias proveedor',
        );
        break;
      }
    }
  }

  return { saved };
}
