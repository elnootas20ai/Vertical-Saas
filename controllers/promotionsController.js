import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getCatalogDbName,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function sanitizeWeekdays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))];
}

function sanitizeProductMatch(value) {
  if (!value || typeof value !== 'object') {
    return { productIds: [], nameIncludes: [], excludeNameIncludes: [] };
  }
  const productIds = Array.isArray(value.productIds)
    ? value.productIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const nameIncludes = Array.isArray(value.nameIncludes)
    ? value.nameIncludes.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  const excludeNameIncludes = Array.isArray(value.excludeNameIncludes)
    ? value.excludeNameIncludes.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  return { productIds, nameIncludes, excludeNameIncludes };
}

function sanitizePromotion(doc) {
  if (!doc || doc.type !== 'promotion') return null;
  const productMatch = sanitizeProductMatch(doc.productMatch);
  const weekdays = sanitizeWeekdays(doc.weekdays);
  return {
    id: doc._id,
    name: String(doc.name || ''),
    description: String(doc.description || ''),
    type: String(doc.promoType || doc.typeKey || 'percentage'),
    status: String(doc.status || 'draft'),
    discountValue: Number(doc.discountValue || 0),
    code: doc.code ? String(doc.code) : undefined,
    startDate: doc.startDate || '',
    endDate: doc.endDate || '',
    maxUses: doc.maxUses ?? null,
    currentUses: Number(doc.currentUses || 0),
    targetAudience: doc.targetAudience || 'all',
    clientIds: Array.isArray(doc.clientIds) ? doc.clientIds : [],
    createdAt: doc.createdAt || '',
    revenue: Number(doc.revenue || 0),
    ordersUsed: Number(doc.ordersUsed || 0),
    active: doc.active === true || doc.status === 'active',
    weekdays,
    productMatch,
    fixedUnitPrice: doc.fixedUnitPrice != null ? Number(doc.fixedUnitPrice) : undefined,
    applyMode: doc.applyMode === 'manual_code' ? 'manual_code' : (doc.applyMode === 'auto' ? 'auto' : undefined),
    salesPointIds: Array.isArray(doc.salesPointIds)
      ? [...new Set(doc.salesPointIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
  };
}

function buildPromotionDocument(userId, data, existing = null) {
  const id = existing?._id || data.id || `promo-${uuidv4()}`;
  const status = String(data.status || existing?.status || 'draft');
  const promoType = String(data.type || data.promoType || existing?.promoType || 'percentage');
  const productMatch = data.productMatch !== undefined
    ? sanitizeProductMatch(data.productMatch)
    : sanitizeProductMatch(existing?.productMatch);
  const weekdays = data.weekdays !== undefined
    ? sanitizeWeekdays(data.weekdays)
    : sanitizeWeekdays(existing?.weekdays);
  const salesPointIds = data.salesPointIds !== undefined
    ? [...new Set((Array.isArray(data.salesPointIds) ? data.salesPointIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))]
    : (Array.isArray(existing?.salesPointIds)
      ? [...new Set(existing.salesPointIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : []);
  const fixedUnitPriceRaw = data.fixedUnitPrice !== undefined
    ? data.fixedUnitPrice
    : existing?.fixedUnitPrice;
  const applyModeRaw = data.applyMode !== undefined
    ? data.applyMode
    : existing?.applyMode;
  let applyMode;
  if (applyModeRaw === 'manual_code' || applyModeRaw === 'auto') {
    applyMode = applyModeRaw;
  } else if (promoType === 'fixed_unit_price') {
    applyMode = 'auto';
  }
  return {
    ...(existing || {}),
    _id: id,
    type: 'promotion',
    user_id: userId,
    name: String(data.name || existing?.name || '').trim(),
    description: String(data.description ?? existing?.description ?? ''),
    promoType,
    status,
    active: status === 'active',
    discountValue: Number(data.discountValue ?? existing?.discountValue ?? 0),
    code: data.code !== undefined ? String(data.code || '').trim() : (existing?.code || ''),
    startDate: data.startDate || existing?.startDate || '',
    endDate: data.endDate || existing?.endDate || '',
    maxUses: data.maxUses !== undefined ? data.maxUses : (existing?.maxUses ?? null),
    currentUses: Number(data.currentUses ?? existing?.currentUses ?? 0),
    targetAudience: data.targetAudience || existing?.targetAudience || 'all',
    clientIds: Array.isArray(data.clientIds) ? data.clientIds : (existing?.clientIds || []),
    revenue: Number(data.revenue ?? existing?.revenue ?? 0),
    ordersUsed: Number(data.ordersUsed ?? existing?.ordersUsed ?? 0),
    weekdays,
    productMatch,
    salesPointIds,
    fixedUnitPrice: fixedUnitPriceRaw != null && fixedUnitPriceRaw !== ''
      ? Number(fixedUnitPriceRaw)
      : (promoType === 'fixed_unit_price' ? Number(data.discountValue ?? existing?.discountValue ?? 0) : undefined),
    applyMode,
    createdAt: existing?.createdAt || data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: existing?.deletedAt || null,
  };
}

export async function listPromotions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const all = await getAllDocuments(req, db);
    const items = all
      .filter((d) => d?.type === 'promotion' && d?.user_id === userId && !d?.deletedAt)
      .map(sanitizePromotion)
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return res.json({ ok: true, promotions: items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar promociones' });
  }
}

export async function createPromotion(req, res) {
  try {
    const { userId } = req.params;
    const { promotion } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!promotion?.name?.trim()) return badRequest(res, 'El nombre es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const doc = buildPromotionDocument(userId, promotion);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, promotion: sanitizePromotion({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear promoción' });
  }
}

export async function updatePromotion(req, res) {
  try {
    const { userId, promotionId } = req.params;
    const { promotion } = req.body || {};
    if (!userId || !promotionId) return badRequest(res, 'Faltan parámetros');
    if (!promotion || typeof promotion !== 'object') return badRequest(res, 'Faltan datos');

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, promotionId);
    if (!existing || existing.type !== 'promotion' || existing.user_id !== userId || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Promoción no encontrada' });
    }

    const doc = buildPromotionDocument(userId, promotion, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, promotion: sanitizePromotion({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar promoción' });
  }
}

export async function removePromotion(req, res) {
  try {
    const { userId, promotionId } = req.params;
    if (!userId || !promotionId) return badRequest(res, 'Faltan parámetros');

    const db = getCatalogDbName();
    const existing = await getDocument(req, db, promotionId);
    if (!existing || existing.type !== 'promotion' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Promoción no encontrada' });
    }

    await softDeleteDocument(req, db, promotionId);
    return res.json({ ok: true, id: promotionId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar promoción' });
  }
}

export async function syncPromotions(req, res) {
  try {
    const { userId } = req.params;
    const { promotions } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(promotions)) return badRequest(res, 'Falta array promotions');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const existing = (await getAllDocuments(req, db)).filter(
      (d) => d?.type === 'promotion' && d?.user_id === userId && !d?.deletedAt,
    );
    const incomingIds = new Set(promotions.map((p) => p.id).filter(Boolean));

    for (const old of existing) {
      if (!incomingIds.has(old._id)) {
        await softDeleteDocument(req, db, old._id);
      }
    }

    const saved = [];
    for (const p of promotions) {
      const prev = p.id ? existing.find((e) => e._id === p.id) : null;
      const doc = buildPromotionDocument(userId, p, prev || undefined);
      const result = await putDocument(req, db, doc._id, doc);
      saved.push(sanitizePromotion({ ...doc, _rev: result.rev }));
    }

    return res.json({ ok: true, promotions: saved });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al sincronizar promociones' });
  }
}
