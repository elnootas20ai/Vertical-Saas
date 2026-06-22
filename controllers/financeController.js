import {
  getFinanceDbName,
  getInvoicesDbName,
  getCatalogDbName,
  getSalesDbName,
  buildFinanceDocument,
  sanitizeFinance,
  listFinanceByUser,
  listCatalogItemsByUser,
  ensureDatabase,
  getDocument,
  getAllDocuments,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  resolveDataOwnerUserId,
  logAccountActivity,
  listBusinessesByUser,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

async function filterFinanceForBusinessScope(req, dataUserId, businessId, movements) {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return movements;

  let businessCount = 1;
  try {
    const businesses = await listBusinessesByUser(req, dataUserId);
    businessCount = Math.max(1, (businesses || []).length);
  } catch {
    businessCount = 1;
  }

  return movements.filter((doc) => {
    const docBid = normalizeBusinessScopeId(doc.businessId || doc.business_id);
    if (docBid === bid) return true;
    // Legacy: movimientos sin empresa solo visibles si la cuenta tiene una sola empresa.
    if (!docBid && businessCount <= 1) return true;
    return false;
  });
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function normalizeUserIdParam(userId) {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

async function resolveFinanceDataUserId(req, rawUserId) {
  const normalized = normalizeUserIdParam(rawUserId);
  if (!normalized) return '';
  const { ownerUserId } = await resolveDataOwnerUserId(req, normalized);
  return ownerUserId || normalized;
}

async function assertFinanceAccess(req, dataUserId) {
  const authUserId = normalizeUserIdParam(req.authUser?.userId || req.authUser?.user_id);
  if (!authUserId) return false;
  if (authUserId === dataUserId) return true;

  const authRes = await resolveDataOwnerUserId(req, authUserId);
  const authOwner = authRes.ownerUserId || authUserId;
  if (authOwner === dataUserId) return true;

  const authAccount = authRes.account || (await findAccountByUserId(req, authUserId));
  if (authAccount && normalizeUserIdParam(authAccount.invitedBy) === dataUserId) return true;

  return false;
}

function financeScopeFromEntity(entity = {}) {
  return {
    businessId: String(entity.businessId || entity.business_id || '').trim(),
    businessName: String(entity.businessName || entity.business_name || '').trim(),
    workCenterId: String(entity.workCenterId || entity.costCenterId || '').trim(),
    workCenterName: String(entity.workCenterName || entity.costCenterName || '').trim(),
    pointOfSaleId: String(entity.pointOfSaleId || '').trim(),
    pointOfSaleName: String(entity.pointOfSaleName || '').trim(),
  };
}

async function ensureFinanceOwner(req, userId, movementId) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, movementId);
  if (!doc || (doc.type !== 'cobro' && doc.type !== 'pago') || doc.user_id !== userId) {
    return null;
  }
  return doc;
}

export async function listFinanceMovements(req, res) {
  try {
    const dataUserId = await resolveFinanceDataUserId(req, req.params.userId);
    if (!dataUserId) return badRequest(res, 'Falta userId');

    if (!(await assertFinanceAccess(req, dataUserId))) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    const raw = await listFinanceByUser(req, dataUserId);
    const scoped = await filterFinanceForBusinessScope(
      req,
      dataUserId,
      req.query.businessId,
      raw,
    );
    const { items, meta } = applyQueryOptions(scoped.map(sanitizeFinance), req.query);
    return res.json({ ok: true, movements: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar movimientos' });
  }
}

export async function createFinanceMovement(req, res) {
  try {
    const { userId } = req.params;
    const { movement } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!movement || typeof movement !== 'object') return badRequest(res, 'Falta el objeto movement en el body');
    if (!movement.type || !['cobro', 'pago'].includes(movement.type)) {
      return badRequest(res, 'El tipo debe ser "cobro" o "pago"');
    }
    if (!movement.concept?.trim()) return badRequest(res, 'El concepto es obligatorio');
    if (!movement.category?.trim()) return badRequest(res, 'La categoría es obligatoria');
    if (movement.amountBase === undefined || movement.amountBase === null) {
      return badRequest(res, 'El importe base es obligatorio');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getFinanceDbName();
    await ensureDatabase(req, db);
    const doc = buildFinanceDocument(userId, movement);
    const saved = await putDocument(req, db, doc._id, doc);

    const typeLabel = doc.type === 'cobro' ? 'Cobro' : 'Pago';
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Registró ${typeLabel}: ${doc.concept} (${doc.totalAmount}€)`,
      entityId: doc._id,
      entityLabel: doc.concept,
      metadata: { type: doc.type, totalAmount: doc.totalAmount, category: doc.category },
    });

    return res.status(201).json({ ok: true, movement: sanitizeFinance({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear movimiento' });
  }
}

export async function updateFinanceMovement(req, res) {
  try {
    const { userId, movementId } = req.params;
    const { movement } = req.body || {};

    if (!movement || typeof movement !== 'object') return badRequest(res, 'Faltan datos del movimiento');

    const existing = await ensureFinanceOwner(req, userId, movementId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getFinanceDbName();
    const doc = buildFinanceDocument(userId, { ...existing, ...movement }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Actualizó movimiento: ${doc.concept}`,
      entityId: doc._id,
      entityLabel: doc.concept,
      metadata: { type: doc.type, totalAmount: doc.totalAmount },
    });

    return res.json({ ok: true, movement: sanitizeFinance({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar movimiento' });
  }
}

export async function removeFinanceMovement(req, res) {
  try {
    const { userId, movementId } = req.params;

    const existing = await ensureFinanceOwner(req, userId, movementId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getFinanceDbName();
    await softDeleteDocument(req, db, movementId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Eliminó movimiento: ${existing.concept}`,
      entityId: existing._id,
      entityLabel: existing.concept,
      metadata: { type: existing.type },
    });

    return res.json({ ok: true, id: movementId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar movimiento' });
  }
}

export async function markFinanceMovementPaid(req, res) {
  try {
    const { userId, movementId } = req.params;
    const existing = await ensureFinanceOwner(req, userId, movementId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getFinanceDbName();
    const doc = buildFinanceDocument(userId, {
      ...existing,
      status: 'paid',
      paidAt: new Date().toISOString(),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Marcó como pagado: ${doc.concept} (${doc.totalAmount}€)`,
      entityId: doc._id,
      entityLabel: doc.concept,
      metadata: { type: doc.type, totalAmount: doc.totalAmount },
    });

    return res.json({ ok: true, movement: sanitizeFinance({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al marcar como pagado' });
  }
}

export async function createMovementFromInvoice(req, res) {
  try {
    const { userId } = req.params;
    const { invoiceId, invoiceType } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!invoiceId) return badRequest(res, 'Falta invoiceId');
    if (!['client_invoice', 'purchase_invoice'].includes(invoiceType)) {
      return badRequest(res, 'invoiceType debe ser "client_invoice" o "purchase_invoice"');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const invoiceDb = invoiceType === 'client_invoice' ? getInvoicesDbName() : getCatalogDbName();
    await ensureDatabase(req, invoiceDb);
    const invoice = await getDocument(req, invoiceDb, invoiceId);
    if (!invoice || invoice.type !== invoiceType) {
      return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    }

    const financeDb = getFinanceDbName();
    await ensureDatabase(req, financeDb);
    const allMvs = await getAllDocuments(req, financeDb);
    const alreadyLinked = allMvs.find(
      (m) => !m.deletedAt && m.sourceRef === invoiceId && (m.type === 'cobro' || m.type === 'pago'),
    );
    if (alreadyLinked) {
      return res.status(409).json({ ok: false, error: 'Ya existe un movimiento vinculado a esta factura', movementId: alreadyLinked._id });
    }

    const isCobro = invoiceType === 'client_invoice';
    const invStatus = invoice.status || 'pending';
    const movementData = {
      type: isCobro ? 'cobro' : 'pago',
      concept: `Factura ${invoice.invoiceNumber || invoice.number || invoiceId} — ${isCobro ? (invoice.clientName || '') : (invoice.supplierName || '')}`.trim(),
      reference: invoice.invoiceNumber || invoice.number || '',
      category: isCobro ? 'ventas' : 'compras_stock',
      amountBase: Number(invoice.subtotal || invoice.amountBase || 0),
      taxRate: Number(invoice.taxRate || 21),
      date: invoice.date || new Date().toISOString().slice(0, 10),
      payMethod: invoice.payMethod || '',
      companyName: isCobro ? (invoice.clientName || '') : (invoice.supplierName || ''),
      notes: '',
      status: invStatus === 'paid' ? 'paid' : 'pending',
      dueDate: invoice.dueDate || '',
      paidAt: invStatus === 'paid' ? (invoice.paidAt || new Date().toISOString()) : '',
      source: 'invoice',
      sourceRef: invoiceId,
      linkedDocuments: [{ id: invoiceId, type: invoiceType, name: invoice.invoiceNumber || invoice.number || invoiceId, url: '' }],
      ...financeScopeFromEntity(invoice),
    };

    const doc = buildFinanceDocument(userId, movementData);
    const saved = await putDocument(req, financeDb, doc._id, doc);

    const typeLabel = doc.type === 'cobro' ? 'Cobro' : 'Pago';
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Registró ${typeLabel} desde factura: ${doc.concept} (${doc.totalAmount}€)`,
      entityId: doc._id,
      entityLabel: doc.concept,
      metadata: { type: doc.type, totalAmount: doc.totalAmount, invoiceId, invoiceType },
    });

    return res.status(201).json({ ok: true, movement: sanitizeFinance({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear movimiento desde factura' });
  }
}

export async function createMovementFromSale(req, res) {
  try {
    const { userId } = req.params;
    const { saleId } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!saleId) return badRequest(res, 'Falta saleId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const salesDb = getSalesDbName();
    await ensureDatabase(req, salesDb);
    const sale = await getDocument(req, salesDb, saleId);
    if (!sale || sale.type !== 'sale') {
      return res.status(404).json({ ok: false, error: 'Venta no encontrada' });
    }

    const financeDb = getFinanceDbName();
    await ensureDatabase(req, financeDb);
    const allMvs = await getAllDocuments(req, financeDb);
    const alreadyLinked = allMvs.find(
      (m) => !m.deletedAt && m.sourceRef === saleId && m.type === 'cobro',
    );
    if (alreadyLinked) {
      return res.status(409).json({ ok: false, error: 'Ya existe un movimiento vinculado a esta venta', movementId: alreadyLinked._id });
    }

    const completedStages = ['delivered', 'completed', 'paid'];
    const isPaid = completedStages.includes(sale.stage);

    const movementData = {
      type: 'cobro',
      concept: `Venta ${sale.vehicleName || ''} ${sale.vehiclePlate || ''}`.trim() || `Venta #${saleId}`,
      reference: saleId,
      category: 'venta_vehiculo',
      amountBase: Number(sale.totalPrice || 0),
      taxRate: 0,
      date: sale.deliveredAt?.slice(0, 10) || sale.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      payMethod: sale.paymentMethod || '',
      companyName: sale.clientName || '',
      notes: '',
      status: isPaid ? 'paid' : 'pending',
      paidAt: isPaid ? (sale.deliveredAt || new Date().toISOString()) : '',
      source: 'sale',
      sourceRef: saleId,
      linkedDocuments: [{ id: saleId, type: 'file', name: `Venta ${sale.vehicleName || saleId}`, url: '' }],
      ...financeScopeFromEntity(sale),
    };

    const doc = buildFinanceDocument(userId, movementData);
    const saved = await putDocument(req, financeDb, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Registró cobro desde venta: ${doc.concept} (${doc.totalAmount}€)`,
      entityId: doc._id,
      entityLabel: doc.concept,
      metadata: { type: 'cobro', totalAmount: doc.totalAmount, saleId },
    });

    return res.status(201).json({ ok: true, movement: sanitizeFinance({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear movimiento desde venta' });
  }
}

export async function suggestCategory(req, res) {
  try {
    const { userId } = req.params;
    const { concept, companyName, type } = req.query;

    if (!userId) return badRequest(res, 'Falta userId');

    const raw = await listFinanceByUser(req, userId);
    const search = String(companyName || concept || '').toLowerCase().trim();
    if (!search) return res.json({ ok: true, category: null });

    const freqMap = {};
    for (const m of raw) {
      if (!m.category) continue;
      const matchCompany = m.companyName && m.companyName.toLowerCase().includes(search);
      const matchConcept = m.concept && m.concept.toLowerCase().includes(search);
      if (type && m.type !== type) continue;
      if (matchCompany || matchConcept) {
        freqMap[m.category] = (freqMap[m.category] || 0) + 1;
      }
    }

    const best = Object.entries(freqMap).sort((a, b) => b[1] - a[1])[0];
    return res.json({ ok: true, category: best ? best[0] : null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al sugerir categoría' });
  }
}

export async function reconciliationSuggestions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const movements = await listFinanceByUser(req, userId);
    const unreconciled = movements.filter((m) => !m.reconciled);
    if (unreconciled.length === 0) return res.json({ ok: true, suggestions: [] });

    const bankDbName = `${(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial')}-bank-transactions`;
    let bankTxs = [];
    try {
      await ensureDatabase(req, bankDbName);
      bankTxs = (await getAllDocuments(req, bankDbName)).filter(
        (d) => d && !d.deletedAt && d.type === 'bank_transaction' && d.user_id === userId,
      );
    } catch { /* DB may not exist yet */ }

    if (bankTxs.length === 0) return res.json({ ok: true, suggestions: [] });

    const AMOUNT_TOLERANCE = 0.5;
    const DATE_TOLERANCE_MS = 5 * 86_400_000;
    const suggestions = [];

    for (const mv of unreconciled) {
      const mvDate = new Date(mv.date).getTime();
      if (Number.isNaN(mvDate)) continue;

      for (const tx of bankTxs) {
        if (tx.matchedMovementId) continue;
        const txAmount = Math.abs(Number(tx.amount || 0));
        const txDate = new Date(tx.date || tx.valueDate || '').getTime();
        if (Number.isNaN(txDate)) continue;

        const amountDiff = Math.abs(mv.totalAmount - txAmount);
        const dateDiff = Math.abs(mvDate - txDate);

        if (amountDiff <= AMOUNT_TOLERANCE && dateDiff <= DATE_TOLERANCE_MS) {
          let confidence = 0.5;
          if (amountDiff < 0.01) confidence += 0.3;
          if (dateDiff < 86_400_000) confidence += 0.2;

          suggestions.push({
            movementId: mv._id,
            bankTransactionId: tx._id,
            confidence: Math.min(confidence, 1),
            matchReason: `Importe ${amountDiff < 0.01 ? 'exacto' : 'similar'}, fecha ${dateDiff < 86_400_000 ? 'mismo día' : 'cercana'}`,
            movementConcept: mv.concept,
            txDescription: tx.description || tx.concept || '',
            amount: mv.totalAmount,
          });
        }
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return res.json({ ok: true, suggestions: suggestions.slice(0, 50) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener sugerencias de conciliación' });
  }
}

export async function getStockValuation(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const catalogItems = await listCatalogItemsByUser(req, userId);
    const products = catalogItems.filter((i) => i.active && !i.deletedAt && i.itemType === 'product');

    const totalValue = products.reduce((s, i) => s + (Number(i.stockQuantity || 0) * Number(i.costPrice || 0)), 0);

    const byCategory = {};
    for (const item of products) {
      const cat = item.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = { category: cat, items: 0, quantity: 0, value: 0 };
      byCategory[cat].items += 1;
      byCategory[cat].quantity += Number(item.stockQuantity || 0);
      byCategory[cat].value += Number(item.stockQuantity || 0) * Number(item.costPrice || 0);
    }

    const bySupplier = {};
    for (const item of products) {
      const key = item.supplierId || '__none__';
      if (!bySupplier[key]) bySupplier[key] = { supplierId: item.supplierId || '', supplierName: item.supplierName || 'Sin proveedor', items: 0, value: 0 };
      bySupplier[key].items += 1;
      bySupplier[key].value += Number(item.stockQuantity || 0) * Number(item.costPrice || 0);
    }

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const allDocs = await getAllDocuments(req, db);
    const purchaseOrders = allDocs.filter((d) => d?.type === 'purchase_order' && d?.user_id === userId && !d?.deletedAt);
    const monthStr = new Date().toISOString().slice(0, 7);
    const purchasesThisMonth = purchaseOrders
      .filter((o) => o.status === 'received' && String(o.receivedAt || '').startsWith(monthStr))
      .reduce((s, o) => s + Number(o.total || 0), 0);
    const pendingOrdersValue = purchaseOrders
      .filter((o) => ['draft', 'pending', 'sent', 'partial'].includes(o.status))
      .reduce((s, o) => s + Number(o.total || 0), 0);

    return res.json({
      ok: true,
      valuation: {
        totalProducts: products.length,
        totalValue: Math.round(totalValue * 100) / 100,
        purchasesThisMonth: Math.round(purchasesThisMonth * 100) / 100,
        pendingOrdersValue: Math.round(pendingOrdersValue * 100) / 100,
        byCategory: Object.values(byCategory).sort((a, b) => b.value - a.value),
        bySupplier: Object.values(bySupplier).sort((a, b) => b.value - a.value),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error calculando valoración de stock' });
  }
}
