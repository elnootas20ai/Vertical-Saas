/**
 * Pipeline único de stock carnicería: bt_catalog (+ lotes bt_lote FEFO).
 * Usado por ventas, anulaciones y compras.
 */

import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
} from './couchdb.js';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';

const TAG = 'BUTCHER_STOCK';

function dbPrefix() {
  return (process.env.VITE_COUCHDB_DB || 'vertial').toLowerCase().replace(/[^a-z0-9_$()+\-/]/g, '_');
}

export function getButcherOpsDbName() {
  const raw = process.env.VITE_BUTCHER_OPS_DB || `${dbPrefix()}-butcher-ops`;
  return String(raw).toLowerCase().replace(/[^a-z0-9_$()+\-/]/g, '_');
}

function qtyOfItem(item) {
  return Math.max(0, Number(item.quantity ?? item.cantidad ?? item.pesoKg ?? 0));
}

function productIdOfItem(item) {
  return String(item.productId || item.productoId || item.catalogId || '').trim();
}

async function saveDoc(req, db, doc) {
  const result = await putDocument(req, db, doc._id, doc);
  return { ...doc, _rev: result?.rev || doc._rev };
}

/**
 * Descuenta stock de catálogo y consume lotes FEFO.
 */
export async function applySaleStockDeduction(req, userId, items = []) {
  const db = getButcherOpsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const allocations = [];

  for (const item of items) {
    const productId = productIdOfItem(item);
    const qty = qtyOfItem(item);
    if (!productId || qty <= 0) continue;

    let product;
    try {
      product = await getDocument(req, db, productId);
    } catch {
      product = null;
    }
    if (!product || (product.type !== 'bt_catalog' && product.type !== 'bt_product')) {
      logger.warn({ tag: TAG, productId }, 'Producto no encontrado para descuento');
      continue;
    }
    if (product.user_id && userId && product.user_id !== userId) continue;

    const prevStock = Number(product.stock ?? product.stockKg ?? 0);
    const nextStock = Math.max(0, Math.round((prevStock - qty) * 1000) / 1000);
    await saveDoc(req, db, { ...product, stock: nextStock, updatedAt: now });

    const lotAlloc = [];
    let remaining = qty;
    const lots = docs
      .filter((d) =>
        d
        && d.type === 'bt_lote'
        && !d.deletedAt
        && (!userId || d.user_id === userId)
        && (d.estado || 'activo') !== 'bloqueado'
        && Number(d.kgDisponibles || 0) > 0
        && (
          !d.productoId
          || d.productoId === productId
          || String(d.producto || '').toLowerCase() === String(product.nombre || '').toLowerCase()
        ),
      )
      .sort((a, b) => String(a.fechaCaducidad || '9999').localeCompare(String(b.fechaCaducidad || '9999')));

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = Number(lot.kgDisponibles || 0);
      if (available <= 0) continue;
      const cad = String(lot.fechaCaducidad || '').slice(0, 10);
      if (cad && cad < today) continue;
      const take = Math.min(available, remaining);
      const newKg = Math.round((available - take) * 1000) / 1000;
      const freshLot = await getDocument(req, db, lot._id).catch(() => lot);
      await saveDoc(req, db, {
        ...freshLot,
        kgDisponibles: newKg,
        estado: newKg <= 0 ? 'agotado' : (freshLot.estado || 'activo'),
        updatedAt: now,
      });
      lotAlloc.push({ lotId: lot._id, codigoLote: lot.codigoLote || '', kg: take });
      remaining = Math.round((remaining - take) * 1000) / 1000;
    }

    allocations.push({
      productId,
      productName: product.nombre || item.productName || '',
      qty,
      prevStock,
      nextStock,
      lots: lotAlloc,
    });
  }

  return { ok: true, allocations };
}

export async function restoreSaleStock(req, userId, items = [], priorAllocations = null) {
  const db = getButcherOpsDbName();
  await ensureDatabase(req, db);
  const now = new Date().toISOString();

  if (Array.isArray(priorAllocations) && priorAllocations.length > 0) {
    for (const alloc of priorAllocations) {
      if (!alloc.productId) continue;
      try {
        const product = await getDocument(req, db, alloc.productId);
        if (product && (product.type === 'bt_catalog' || product.type === 'bt_product')) {
          const next = Math.round((Number(product.stock || 0) + Number(alloc.qty || 0)) * 1000) / 1000;
          await saveDoc(req, db, { ...product, stock: next, updatedAt: now });
        }
      } catch { /* skip */ }
      for (const la of alloc.lots || []) {
        if (!la.lotId) continue;
        try {
          const lot = await getDocument(req, db, la.lotId);
          if (lot && lot.type === 'bt_lote') {
            const next = Math.round((Number(lot.kgDisponibles || 0) + Number(la.kg || 0)) * 1000) / 1000;
            await saveDoc(req, db, {
              ...lot,
              kgDisponibles: next,
              estado: next > 0 && lot.estado === 'agotado' ? 'activo' : lot.estado,
              updatedAt: now,
            });
          }
        } catch { /* skip */ }
      }
    }
    return { ok: true };
  }

  for (const item of items) {
    const productId = productIdOfItem(item);
    const qty = qtyOfItem(item);
    if (!productId || qty <= 0) continue;
    try {
      const product = await getDocument(req, db, productId);
      if (product && (product.type === 'bt_catalog' || product.type === 'bt_product')) {
        const next = Math.round((Number(product.stock || 0) + qty) * 1000) / 1000;
        await saveDoc(req, db, { ...product, stock: next, updatedAt: now });
      }
    } catch { /* skip */ }
  }
  return { ok: true };
}

export async function applyPurchaseStockIncrease(req, userId, {
  productId, productName, qtyKg, costPerKg, loteCode, expirationDate, supplierName, legacyBatchId,
}) {
  const db = getButcherOpsDbName();
  await ensureDatabase(req, db);
  const now = new Date().toISOString();
  const qty = Math.max(0, Number(qtyKg || 0));
  if (qty <= 0) return { ok: false, error: 'Cantidad inválida' };

  let product = null;
  if (productId) {
    try { product = await getDocument(req, db, productId); } catch { product = null; }
  }
  if (!product || (product.type !== 'bt_catalog' && product.type !== 'bt_product')) {
    const all = await getAllDocuments(req, db);
    const name = String(productName || '').toLowerCase();
    product = all.find((d) =>
      d && (d.type === 'bt_catalog' || d.type === 'bt_product')
      && (!userId || d.user_id === userId)
      && String(d.nombre || '').toLowerCase() === name,
    ) || null;
  }
  if (!product) return { ok: false, error: 'Producto de catálogo no encontrado' };

  const prev = Number(product.stock || 0);
  const next = Math.round((prev + qty) * 1000) / 1000;
  const prevCost = Number(product.costePorKg || product.costPerKg || 0);
  let newCost = Number(costPerKg || 0);
  if (prev > 0 && prevCost > 0 && newCost > 0) {
    newCost = Math.round(((prev * prevCost + qty * newCost) / (prev + qty)) * 1000) / 1000;
  } else if (!(newCost > 0)) {
    newCost = prevCost;
  }

  await saveDoc(req, db, {
    ...product,
    stock: next,
    costePorKg: newCost,
    precioActualizado: true,
    updatedAt: now,
  });

  let lotId = null;
  if (loteCode || expirationDate) {
    const id = `btl-${uuidv4()}`;
    const lotDoc = {
      _id: id,
      type: 'bt_lote',
      id,
      user_id: userId,
      codigoLote: loteCode || `LOT-${Date.now().toString(36).toUpperCase()}`,
      proveedorNombre: supplierName || '',
      productoId: product._id,
      producto: product.nombre || productName || '',
      fechaEntrada: now.slice(0, 10),
      fechaCaducidad: expirationDate || '',
      kgRecibidos: qty,
      kgDisponibles: qty,
      costePorKg: Number(costPerKg || newCost || 0),
      estado: 'activo',
      legacyBatchId: legacyBatchId || null,
      createdAt: now,
      updatedAt: now,
    };
    await saveDoc(req, db, lotDoc);
    lotId = id;
  }

  return { ok: true, productId: product._id, stock: next, lotId };
}

/**
 * Merma / caducidad sobre lote FEFO (`bt_lote`) + baja stock catálogo.
 * Canónico para Hub y Trazabilidad (no butcher_batch).
 */
export async function applyLotWaste(req, userId, {
  lotId, wasteKg, markExpired = false,
}) {
  const db = getButcherOpsDbName();
  await ensureDatabase(req, db);
  const now = new Date().toISOString();
  const qty = Math.max(0, Number(wasteKg || 0));
  if (!lotId || !(qty > 0)) return { ok: false, error: 'lotId y wasteKg son obligatorios' };

  let lot;
  try {
    lot = await getDocument(req, db, lotId);
  } catch {
    lot = null;
  }
  if (!lot || lot.type !== 'bt_lote' || (userId && lot.user_id && lot.user_id !== userId)) {
    return { ok: false, error: 'Lote FEFO no encontrado' };
  }

  const available = Number(lot.kgDisponibles || 0);
  const take = Math.min(available, qty);
  const nextKg = Math.round((available - take) * 1000) / 1000;
  const estado = (markExpired || nextKg <= 0)
    ? (markExpired ? 'caducado' : 'agotado')
    : (lot.estado || 'activo');

  await saveDoc(req, db, {
    ...lot,
    kgDisponibles: nextKg,
    estado,
    updatedAt: now,
  });

  const productId = String(lot.productoId || '').trim();
  if (productId && take > 0) {
    try {
      const product = await getDocument(req, db, productId);
      if (product && (product.type === 'bt_catalog' || product.type === 'bt_product')) {
        const prev = Number(product.stock || 0);
        await saveDoc(req, db, {
          ...product,
          stock: Math.max(0, Math.round((prev - take) * 1000) / 1000),
          updatedAt: now,
        });
      }
    } catch { /* skip catalog sync */ }
  }

  // Espejo legacy butcher_batch si existe enlace
  if (lot.legacyBatchId) {
    try {
      const { getButcherDbName } = await import('./butcherShop.js');
      const bDb = getButcherDbName();
      const batch = await getDocument(req, bDb, lot.legacyBatchId);
      if (batch && batch.type === 'butcher_batch') {
        await putDocument(req, bDb, batch._id, {
          ...batch,
          currentWeightKg: Math.max(0, Number(batch.currentWeightKg || 0) - take),
          status: markExpired || nextKg <= 0 ? 'expired' : batch.status,
          updatedAt: now,
        });
      }
    } catch { /* optional mirror */ }
  }

  return {
    ok: true,
    lotId,
    wastedKg: take,
    kgDisponibles: nextKg,
    productId,
    productName: lot.producto || '',
  };
}

/**
 * Despiece: baja origen, sube destinos por % rendimiento, registra merma implícita en kg.
 */
export async function applyCuttingBreakdown(req, userId, {
  origenProductId, kg, cortes = [], mermaPct = 0,
}) {
  const db = getButcherOpsDbName();
  await ensureDatabase(req, db);
  const now = new Date().toISOString();
  const totalKg = Math.max(0, Number(kg || 0));
  if (!origenProductId || !(totalKg > 0)) {
    return { ok: false, error: 'origenProductId y kg son obligatorios' };
  }

  let origen;
  try {
    origen = await getDocument(req, db, origenProductId);
  } catch {
    origen = null;
  }
  if (!origen || (origen.type !== 'bt_catalog' && origen.type !== 'bt_product')) {
    return { ok: false, error: 'Producto origen no encontrado' };
  }
  const stockOrigen = Number(origen.stock || 0);
  if (stockOrigen < totalKg) {
    return { ok: false, error: `Stock insuficiente en origen (${stockOrigen} kg)` };
  }

  await saveDoc(req, db, {
    ...origen,
    stock: Math.round((stockOrigen - totalKg) * 1000) / 1000,
    updatedAt: now,
  });

  const applied = [];
  let allocated = 0;
  for (const cut of cortes) {
    const pct = Number(cut.yieldPct || 0);
    if (!(pct > 0) || !cut.productId) continue;
    const cutKg = Math.round((totalKg * pct / 100) * 1000) / 1000;
    allocated += cutKg;
    try {
      const dest = await getDocument(req, db, cut.productId);
      if (dest && (dest.type === 'bt_catalog' || dest.type === 'bt_product')) {
        const next = Math.round((Number(dest.stock || 0) + cutKg) * 1000) / 1000;
        await saveDoc(req, db, { ...dest, stock: next, updatedAt: now });
        applied.push({ productId: cut.productId, productName: dest.nombre || cut.productName, kg: cutKg });
      }
    } catch { /* skip */ }
  }

  const mermaFromPct = Math.round((totalKg * Number(mermaPct || 0) / 100) * 1000) / 1000;
  const mermaKg = Math.max(mermaFromPct, Math.round((totalKg - allocated) * 1000) / 1000);

  return { ok: true, applied, mermaKg, origenStock: Math.round((stockOrigen - totalKg) * 1000) / 1000 };
}
