import {
  getButcherDbName, ensureDatabase, getAllDocuments, putDocument,
  buildButcherProductDocument, sanitizeButcherProduct, listButcherProductsByUser,
  buildButcherBatchDocument, sanitizeButcherBatch, listButcherBatchesByUser,
  sanitizeButcherWaste, listButcherWasteByUser,
  buildButcherScaleStatusDocument, sanitizeButcherScaleStatus, listButcherScalesByBusiness,
  buildButcherInventoryCountDocument, sanitizeButcherInventoryCount, listButcherInventoryCountsByUser,
} from '../services/couchdb.js';
import { getButcherAlertSummary } from '../services/butcherAlertEngine.js';
import {
  registerWaste as registerWasteService,
  reviewWaste as reviewWasteService,
  getWasteSummary as getWasteSummaryService,
  getWasteRate,
  getWasteReporting,
  VALID_WASTE_TYPES,
} from '../services/butcherWasteService.js';

function bad(res, error) {
  return res.status(400).json({ ok: false, error });
}

// --- Products ---------------------------------------------------------------

export async function listProducts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const products = await listButcherProductsByUser(req, userId);
    return res.json({ ok: true, products: products.map(sanitizeButcherProduct) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando productos' });
  }
}

export async function createProduct(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const body = req.body || {};
    if (!body.name) return bad(res, 'name es obligatorio');

    const doc = buildButcherProductDocument(userId, body);
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const saved = await putDocument(req, db, doc);
    return res.status(201).json({ ok: true, product: sanitizeButcherProduct(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error creando producto' });
  }
}

export async function updateProduct(req, res) {
  try {
    const { userId, productId } = req.params;
    if (!userId || !productId) return bad(res, 'Faltan userId o productId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find((d) => d._id === productId && d.type === 'butcher_product' && !d.deletedAt);
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    const body = req.body || {};
    if (body.pricePerKg !== undefined && body.pricePerKg !== existing.pricePerKg) {
      body.priceUpdatedAt = new Date().toISOString();
    }
    const doc = buildButcherProductDocument(userId, body, existing);
    const saved = await putDocument(req, db, doc);
    return res.json({ ok: true, product: sanitizeButcherProduct(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error actualizando producto' });
  }
}

export async function deleteProduct(req, res) {
  try {
    const { userId, productId } = req.params;
    if (!userId || !productId) return bad(res, 'Faltan userId o productId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find((d) => d._id === productId && d.type === 'butcher_product' && !d.deletedAt);
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    await putDocument(req, db, { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return res.json({ ok: true, message: 'Producto eliminado' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error eliminando producto' });
  }
}

// --- Batches ----------------------------------------------------------------

export async function listBatches(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const batches = await listButcherBatchesByUser(req, userId);
    return res.json({ ok: true, batches: batches.map(sanitizeButcherBatch) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando lotes' });
  }
}

export async function createBatch(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const body = req.body || {};
    if (!body.productId) return bad(res, 'productId es obligatorio');

    const doc = buildButcherBatchDocument(userId, body);
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const saved = await putDocument(req, db, doc);
    return res.status(201).json({ ok: true, batch: sanitizeButcherBatch(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error creando lote' });
  }
}

export async function updateBatch(req, res) {
  try {
    const { userId, batchId } = req.params;
    if (!userId || !batchId) return bad(res, 'Faltan userId o batchId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find((d) => d._id === batchId && d.type === 'butcher_batch' && !d.deletedAt);
    if (!existing) return res.status(404).json({ ok: false, error: 'Lote no encontrado' });

    const doc = buildButcherBatchDocument(userId, req.body || {}, existing);
    const saved = await putDocument(req, db, doc);
    return res.json({ ok: true, batch: sanitizeButcherBatch(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error actualizando lote' });
  }
}

export async function deleteBatch(req, res) {
  try {
    const { userId, batchId } = req.params;
    if (!userId || !batchId) return bad(res, 'Faltan userId o batchId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find((d) => d._id === batchId && d.type === 'butcher_batch' && !d.deletedAt);
    if (!existing) return res.status(404).json({ ok: false, error: 'Lote no encontrado' });

    await putDocument(req, db, { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return res.json({ ok: true, message: 'Lote eliminado' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error eliminando lote' });
  }
}

// --- Waste ------------------------------------------------------------------

function isManager(req) {
  const role = req.authUser?.role || '';
  return role === 'Admin' || role === 'Gerente';
}

function stripCostsForWorker(record) {
  if (!record) return record;
  return { ...record, estimatedCost: undefined, costPriceAtTime: undefined, financeMovementId: undefined };
}

export async function listWaste(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to, wasteType, reviewStatus, registeredBy } = req.query || {};
    const filters = {};
    if (wasteType && VALID_WASTE_TYPES.includes(wasteType)) filters.wasteType = wasteType;
    if (reviewStatus) filters.reviewStatus = reviewStatus;
    if (registeredBy) filters.registeredBy = registeredBy;

    if (!isManager(req)) {
      filters.registeredBy = req.authUser?.user_id || userId;
    }

    let records = await listButcherWasteByUser(req, userId, from, to, filters);
    let waste = records.map(sanitizeButcherWaste);
    if (!isManager(req)) waste = waste.map(stripCostsForWorker);
    return res.json({ ok: true, waste, role: isManager(req) ? 'manager' : 'worker' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando merma' });
  }
}

export async function createWaste(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const body = req.body || {};
    body.registeredBy = body.registeredBy || req.authUser?.user_id || userId;
    body.registeredByName = body.registeredByName || req.authUser?.name || '';
    const waste = await registerWasteService(req, userId, body);
    return res.status(201).json({ ok: true, waste: isManager(req) ? waste : stripCostsForWorker(waste) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error registrando merma';
    if (msg.includes('obligatorio') || msg.includes('debe ser')) return bad(res, msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}

export async function getWasteSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to } = req.query || {};
    const summary = await getWasteSummaryService(req, userId, from, to);
    if (!isManager(req)) {
      delete summary.totalCost;
      delete summary.byWorker;
    }
    return res.json({ ok: true, summary, role: isManager(req) ? 'manager' : 'worker' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error calculando resumen de merma' });
  }
}

export async function reviewButcherWaste(req, res) {
  try {
    if (!isManager(req)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes pueden revisar mermas' });
    }
    const { userId, wasteId } = req.params;
    if (!userId || !wasteId) return bad(res, 'Faltan userId o wasteId');
    const body = req.body || {};
    if (!body.reviewStatus) return bad(res, 'reviewStatus es obligatorio');
    body.reviewedBy = body.reviewedBy || req.authUser?.user_id || userId;
    body.reviewedByName = body.reviewedByName || req.authUser?.name || '';
    const waste = await reviewWasteService(req, userId, wasteId, body);
    return res.json({ ok: true, waste });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error revisando merma';
    if (msg.includes('no encontrado') || msg.includes('permisos')) return res.status(404).json({ ok: false, error: msg });
    return res.status(500).json({ ok: false, error: msg });
  }
}

export async function getButcherWasteRate(req, res) {
  try {
    if (!isManager(req)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes pueden ver tasas de merma' });
    }
    const { userId, catalogItemId } = req.params;
    if (!userId || !catalogItemId) return bad(res, 'Faltan userId o catalogItemId');
    const { from, to } = req.query || {};
    const rate = await getWasteRate(req, userId, catalogItemId, from, to);
    return res.json({ ok: true, rate });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error calculando tasa de merma' });
  }
}

export async function getButcherWasteReporting(req, res) {
  try {
    if (!isManager(req)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes pueden acceder a reporting de merma' });
    }
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const period = req.query.period || 'month';
    const reporting = await getWasteReporting(req, userId, period);
    return res.json({ ok: true, reporting });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error generando reporte de merma' });
  }
}

// --- Scales -----------------------------------------------------------------

export async function listScales(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return bad(res, 'Falta businessId');
    const scales = await listButcherScalesByBusiness(req, businessId);
    return res.json({ ok: true, scales: scales.map(sanitizeButcherScaleStatus) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando basculas' });
  }
}

export async function createScale(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return bad(res, 'Falta businessId');
    const body = req.body || {};
    if (!body.name) return bad(res, 'name es obligatorio');

    const doc = buildButcherScaleStatusDocument({ ...body, business_id: businessId });
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const saved = await putDocument(req, db, doc);
    return res.status(201).json({ ok: true, scale: sanitizeButcherScaleStatus(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error registrando bascula' });
  }
}

export async function updateScale(req, res) {
  try {
    const { businessId, scaleId } = req.params;
    if (!businessId || !scaleId) return bad(res, 'Faltan businessId o scaleId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find((d) => d.type === 'butcher_scale_status' && !d.deletedAt && (d._id === scaleId || d.scaleId === scaleId) && d.business_id === businessId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Bascula no encontrada' });

    const doc = buildButcherScaleStatusDocument({ ...(req.body || {}), business_id: businessId }, existing);
    const saved = await putDocument(req, db, doc);
    return res.json({ ok: true, scale: sanitizeButcherScaleStatus(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error actualizando bascula' });
  }
}

export async function pingScale(req, res) {
  try {
    const { businessId, scaleId } = req.params;
    if (!businessId || !scaleId) return bad(res, 'Faltan businessId o scaleId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const existing = docs.find((d) => d.type === 'butcher_scale_status' && !d.deletedAt && (d._id === scaleId || d.scaleId === scaleId) && d.business_id === businessId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Bascula no encontrada' });

    const now = new Date().toISOString();
    const body = req.body || {};
    const updated = { ...existing, connected: true, lastPingAt: now, updatedAt: now };
    if (body.weight !== undefined) updated.lastWeight = Number(body.weight);
    if (body.status) updated.lastStatus = String(body.status);
    await putDocument(req, db, updated);
    return res.json({ ok: true, pingAt: now });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error en ping de bascula' });
  }
}

// --- Inventory Counts -------------------------------------------------------

export async function listInventoryCounts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const counts = await listButcherInventoryCountsByUser(req, userId);
    return res.json({ ok: true, counts: counts.map(sanitizeButcherInventoryCount) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando conteos' });
  }
}

export async function createInventoryCount(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0) return bad(res, 'items es obligatorio y debe tener al menos un elemento');

    const doc = buildButcherInventoryCountDocument(userId, body);
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const saved = await putDocument(req, db, doc);
    return res.status(201).json({ ok: true, count: sanitizeButcherInventoryCount(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error registrando conteo' });
  }
}

export async function getDiscrepancies(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const threshold = Number(req.query.threshold || 3);
    const counts = await listButcherInventoryCountsByUser(req, userId);
    if (counts.length === 0) return res.json({ ok: true, discrepancies: [], lastCountDate: null });

    const latest = counts[0];
    const discrepancies = (latest.items || [])
      .filter((item) => Math.abs(item.differencePct || 0) >= threshold)
      .sort((a, b) => Math.abs(b.differencePct || 0) - Math.abs(a.differencePct || 0));

    return res.json({ ok: true, countId: latest._id, lastCountDate: latest.date, threshold, discrepancies });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo discrepancias' });
  }
}

// --- Alerts summary ---------------------------------------------------------

export async function getButcherAlertsSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const summary = await getButcherAlertSummary(userId);
    return res.json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo resumen de alertas' });
  }
}
