import { v4 as uuidv4 } from 'uuid';
import * as cacheService from '../services/cache.js';
import {
  VEHICLES_DB,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  findAccountByUserId,
  softDeleteDocument,
  writeChangelog,
  logAccountActivity,
  sanitizeVehicle,
  sanitizeVehicleAcquisition,
} from '../services/couchdb.js';
import { acceptTradeInFlow } from '../services/compraventaAcceptFlow.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

const TRADE_IN_CONDITION = ['excelente', 'bueno', 'regular', 'malo'];
const TRADE_IN_STATUS = ['pending', 'negotiation', 'accepted', 'rejected'];

function buildTradeInDocument(userId, data = {}, existing = null, businessId = null) {
  const now = new Date().toISOString();
  const statusHistory = Array.isArray(data.statusHistory)
    ? data.statusHistory
    : existing?.statusHistory || [];

  return {
    _id: existing?._id || `tradein:${uuidv4()}`,
    _rev: existing?._rev,
    type: 'tradein',
    active: true,
    user_id: userId,
    business_id: businessId || data.business_id || existing?.business_id || undefined,
    linkedVehicleId: String(data.linkedVehicleId || existing?.linkedVehicleId || '').trim() || undefined,
    linkedAcquisitionId: String(data.linkedAcquisitionId || existing?.linkedAcquisitionId || '').trim() || undefined,
    clientId: String(data.clientId || existing?.clientId || '').trim() || undefined,
    brand: String(data.brand || existing?.brand || '').trim(),
    model: String(data.model || existing?.model || '').trim(),
    version: String(data.version || existing?.version || '').trim() || undefined,
    year: Number(data.year || existing?.year) || 0,
    mileage: Number.isFinite(Number(data.mileage)) ? Number(data.mileage) : undefined,
    color: String(data.color || existing?.color || '').trim(),
    fuelType: data.fuelType || existing?.fuelType || undefined,
    transmission: String(data.transmission || existing?.transmission || '').trim() || undefined,
    registrationPlate: String(data.registrationPlate || existing?.registrationPlate || '').trim().toUpperCase() || undefined,
    vin: String(data.vin || existing?.vin || '').trim().toUpperCase() || undefined,
    condition: TRADE_IN_CONDITION.includes(data.condition) ? data.condition : existing?.condition || 'bueno',
    estimatedValue: Number.isFinite(Number(data.estimatedValue)) ? Number(data.estimatedValue) : 0,
    recommendedPrice: Number.isFinite(Number(data.recommendedPrice)) ? Number(data.recommendedPrice) : undefined,
    acceptedValue: Number.isFinite(Number(data.acceptedValue)) ? Number(data.acceptedValue) : undefined,
    ownerName: String(data.ownerName || existing?.ownerName || '').trim() || undefined,
    ownerPhone: String(data.ownerPhone || existing?.ownerPhone || '').trim() || undefined,
    ownerEmail: String(data.ownerEmail || existing?.ownerEmail || '').trim() || undefined,
    notes: String(data.notes || existing?.notes || '').trim() || undefined,
    status: TRADE_IN_STATUS.includes(data.status) ? data.status : existing?.status || 'pending',
    statusHistory,
    appraiserUserId: data.appraiserUserId || existing?.appraiserUserId || userId,
    appraiserName: String(data.appraiserName || existing?.appraiserName || '').trim() || undefined,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeTradeIn(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    type: doc.type,
    active: doc.active !== false,
    user_id: doc.user_id,
    business_id: doc.business_id,
    linkedVehicleId: doc.linkedVehicleId,
    linkedAcquisitionId: doc.linkedAcquisitionId,
    clientId: doc.clientId,
    brand: doc.brand || '',
    model: doc.model || '',
    version: doc.version,
    year: doc.year || 0,
    mileage: doc.mileage,
    color: doc.color || '',
    fuelType: doc.fuelType,
    transmission: doc.transmission,
    registrationPlate: doc.registrationPlate,
    vin: doc.vin,
    condition: doc.condition || 'bueno',
    estimatedValue: doc.estimatedValue || 0,
    recommendedPrice: doc.recommendedPrice,
    acceptedValue: doc.acceptedValue,
    ownerName: doc.ownerName,
    ownerPhone: doc.ownerPhone,
    ownerEmail: doc.ownerEmail,
    notes: doc.notes,
    status: doc.status || 'pending',
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    appraiserUserId: doc.appraiserUserId,
    appraiserName: doc.appraiserName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt || null,
  };
}

export async function listTradeIns(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.query.businessId || '').trim() || null;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureDatabase(req, VEHICLES_DB);
    const docs = await getAllDocuments(req, VEHICLES_DB);
    const tradeIns = docs
      .filter((d) => {
        if (!d || d.type !== 'tradein' || d.active === false || d.deletedAt) return false;
        if (businessId) return d.business_id === businessId;
        return d.user_id === userId && !d.business_id;
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({ ok: true, tradeIns: tradeIns.map(sanitizeTradeIn) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error cargando tasaciones' });
  }
}

export async function createTradeIn(req, res) {
  try {
    const { userId } = req.params;
    const { tradeIn, businessId } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!tradeIn?.brand || !tradeIn?.model || !tradeIn?.year) {
      return badRequest(res, 'Faltan campos obligatorios: brand, model, year');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, VEHICLES_DB);
    const now = new Date().toISOString();
    const doc = buildTradeInDocument(userId, {
      ...tradeIn,
      appraiserName: tradeIn.appraiserName || account.fullName,
      statusHistory: [{
        id: `hist:${uuidv4()}`,
        action: 'created',
        status: tradeIn.status || 'pending',
        date: now,
        userId,
        note: 'Tasación registrada',
      }],
    }, null, businessId || null);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    cacheService.invalidateByPrefix('compraventa');

    return res.status(201).json({ ok: true, tradeIn: sanitizeTradeIn({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear tasación' });
  }
}

export async function updateTradeIn(req, res) {
  try {
    const { userId, tradeInId } = req.params;
    const { tradeIn } = req.body || {};
    if (!tradeIn) return badRequest(res, 'Faltan datos');

    await ensureDatabase(req, VEHICLES_DB);
    const existing = await getDocument(req, VEHICLES_DB, tradeInId);
    if (!existing || existing.type !== 'tradein' || existing.user_id !== userId || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Tasación no encontrada' });
    }

    const doc = buildTradeInDocument(userId, { ...existing, ...tradeIn }, existing);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    cacheService.invalidateByPrefix('compraventa');

    return res.json({ ok: true, tradeIn: sanitizeTradeIn({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar tasación' });
  }
}

export async function acceptTradeIn(req, res) {
  try {
    const { userId, tradeInId } = req.params;
    const { note, acceptedValue, businessId } = req.body || {};

    const result = await acceptTradeInFlow(req, {
      userId,
      tradeInId,
      businessId: businessId || null,
      note: note || '',
      acceptedValue,
    });

    return res.json({
      ok: true,
      tradeIn: sanitizeTradeIn(result.tradeIn),
      vehicle: sanitizeVehicle(result.vehicle),
      acquisition: sanitizeVehicleAcquisition(result.acquisition),
      clientId: result.clientId,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al aceptar tasación',
    });
  }
}

export async function rejectTradeIn(req, res) {
  try {
    const { userId, tradeInId } = req.params;
    const { note } = req.body || {};

    await ensureDatabase(req, VEHICLES_DB);
    const existing = await getDocument(req, VEHICLES_DB, tradeInId);
    if (!existing || existing.type !== 'tradein' || existing.user_id !== userId || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Tasación no encontrada' });
    }
    if (existing.status === 'accepted') {
      return badRequest(res, 'No se puede rechazar una tasación ya aceptada');
    }

    const now = new Date().toISOString();
    const statusHistory = [
      ...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []),
      {
        id: `hist:${uuidv4()}`,
        action: 'rejected',
        status: 'rejected',
        date: now,
        userId,
        note: note || 'Tasación rechazada',
      },
    ];

    const doc = buildTradeInDocument(userId, { ...existing, status: 'rejected', statusHistory }, existing);
    await putDocument(req, VEHICLES_DB, doc._id, doc);

    await writeChangelog(req, {
      entity: 'tradein',
      entityId: doc._id,
      entityLabel: `${doc.brand} ${doc.model}`.trim(),
      action: 'rejected',
      actorUserId: userId,
      metadata: { note: note || '' },
    }).catch(() => {});

    cacheService.invalidateByPrefix('compraventa');

    return res.json({ ok: true, tradeIn: sanitizeTradeIn(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al rechazar tasación' });
  }
}

export async function deleteTradeIn(req, res) {
  try {
    const { userId, tradeInId } = req.params;
    await ensureDatabase(req, VEHICLES_DB);
    const existing = await getDocument(req, VEHICLES_DB, tradeInId);
    if (!existing || existing.type !== 'tradein' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tasación no encontrada' });
    }
    if (existing.status === 'accepted') {
      return badRequest(res, 'No se puede eliminar una tasación aceptada con compra vinculada');
    }
    await softDeleteDocument(req, VEHICLES_DB, tradeInId);

    cacheService.invalidateByPrefix('compraventa');

    return res.json({ ok: true, id: tradeInId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar tasación' });
  }
}
