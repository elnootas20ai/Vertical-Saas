import {
  getReservationsDbName,
  buildReservationDocument,
  sanitizeReservation,
  listReservationsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  buildFinanceDocument,
  getFinanceDbName,
  buildSaleDocument,
  getSalesDbName,
  sanitizeSale,
  VEHICLES_DB,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureReservationOwner(req, userId, reservationId) {
  const db = getReservationsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, reservationId);
  if (!doc || doc.type !== 'reservation' || doc.user_id !== userId) {
    return null;
  }
  return doc;
}

async function setVehicleStatus(req, userId, vehicleId, status) {
  if (!vehicleId) return;
  const db = VEHICLES_DB;
  await ensureDatabase(req, db);
  const vehicle = await getDocument(req, db, vehicleId);
  if (!vehicle || vehicle.user_id !== userId) return;
  vehicle.status = status;
  vehicle.updatedAt = new Date().toISOString();
  await putDocument(req, db, vehicle._id, vehicle);
}

export async function listReservations(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listReservationsByUser(req, userId);

    const now = new Date();
    const autoExpired = [];
    for (const doc of raw) {
      if (doc.status === 'active' && doc.expirationDate && new Date(doc.expirationDate) < now) {
        doc.status = 'expired';
        doc.updatedAt = now.toISOString();
        const db = getReservationsDbName();
        try {
          await putDocument(req, db, doc._id, doc);
          autoExpired.push(doc._id);
        } catch { /* ignore conflict */ }
      }
    }

    const { items, meta } = applyQueryOptions(raw.map(sanitizeReservation), req.query);
    return res.json({ ok: true, reservations: items, meta, autoExpired });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar reservas' });
  }
}

export async function getReservation(req, res) {
  try {
    const { userId, reservationId } = req.params;
    const doc = await ensureReservationOwner(req, userId, reservationId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    return res.json({ ok: true, reservation: sanitizeReservation(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar reserva' });
  }
}

export async function createReservation(req, res) {
  try {
    const { userId } = req.params;
    const { reservation } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!reservation || typeof reservation !== 'object') return badRequest(res, 'Falta el objeto reservation en el body');
    if (!reservation.vehicleId) return badRequest(res, 'Falta vehicleId');
    if (!reservation.clientId) return badRequest(res, 'Falta clientId');
    if (!reservation.depositAmount && reservation.depositAmount !== 0) return badRequest(res, 'Falta depositAmount');
    if (!reservation.expirationDate) return badRequest(res, 'Falta expirationDate');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getReservationsDbName();
    await ensureDatabase(req, db);
    const doc = buildReservationDocument(userId, reservation);

    await setVehicleStatus(req, userId, doc.vehicleId, 'reserved');

    let financeMovementId = '';
    if (reservation.depositPaid && doc.depositAmount > 0) {
      const finDb = getFinanceDbName();
      await ensureDatabase(req, finDb);
      const finDoc = buildFinanceDocument(userId, {
        type: 'cobro',
        concept: `Señal reserva — ${doc.vehicleName || doc.vehiclePlate}`,
        category: 'Señal/Reserva',
        amountBase: doc.depositAmount,
        taxRate: 0,
        payMethod: doc.paymentMethod,
        date: doc.reservationDate,
        notes: `Reserva ${doc._id} — Cliente: ${doc.clientName}`,
      });
      const savedFin = await putDocument(req, finDb, finDoc._id, finDoc);
      financeMovementId = finDoc._id;
    }

    if (financeMovementId) {
      doc.financeMovementId = financeMovementId;
    }

    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'reservation',
      action: `Registró reserva para ${doc.clientName} — ${doc.vehicleName}`,
      entityId: doc._id,
      entityLabel: `${doc.vehicleName} → ${doc.clientName}`.trim(),
      metadata: { depositAmount: doc.depositAmount, depositPaid: doc.depositPaid, expirationDate: doc.expirationDate },
    });

    return res.status(201).json({ ok: true, reservation: sanitizeReservation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear reserva' });
  }
}

export async function updateReservation(req, res) {
  try {
    const { userId, reservationId } = req.params;
    const { reservation } = req.body || {};

    if (!reservation || typeof reservation !== 'object') return badRequest(res, 'Faltan datos de la reserva');

    const existing = await ensureReservationOwner(req, userId, reservationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getReservationsDbName();
    const doc = buildReservationDocument(userId, { ...existing, ...reservation }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'reservation',
      action: `Actualizó reserva ${doc.vehicleName} → ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: `${doc.vehicleName} → ${doc.clientName}`.trim(),
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, reservation: sanitizeReservation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar reserva' });
  }
}

export async function cancelReservation(req, res) {
  try {
    const { userId, reservationId } = req.params;
    const { reason } = req.body || {};

    const existing = await ensureReservationOwner(req, userId, reservationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    if (existing.status === 'cancelled') return badRequest(res, 'La reserva ya está cancelada');
    if (existing.status === 'converted') return badRequest(res, 'No se puede cancelar una reserva ya convertida en venta');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const db = getReservationsDbName();
    const doc = buildReservationDocument(userId, {
      ...existing,
      status: 'cancelled',
      cancelledAt: now,
      cancelReason: String(reason || ''),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await setVehicleStatus(req, userId, existing.vehicleId, 'available');

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'reservation',
      action: `Canceló reserva ${existing.vehicleName} → ${existing.clientName}`,
      entityId: existing._id,
      entityLabel: `${existing.vehicleName} → ${existing.clientName}`.trim(),
      metadata: { reason: reason || '' },
    });

    return res.json({ ok: true, reservation: sanitizeReservation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar reserva' });
  }
}

export async function convertReservation(req, res) {
  try {
    const { userId, reservationId } = req.params;
    const { saleOverrides } = req.body || {};

    const existing = await ensureReservationOwner(req, userId, reservationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    if (existing.status === 'converted') return badRequest(res, 'La reserva ya fue convertida en venta');
    if (existing.status === 'cancelled') return badRequest(res, 'No se puede convertir una reserva cancelada');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const salesDb = getSalesDbName();
    await ensureDatabase(req, salesDb);
    const saleData = {
      vehicleId: existing.vehicleId,
      vehicleName: existing.vehicleName,
      vehiclePlate: existing.vehiclePlate,
      vehicleYear: existing.vehicleYear,
      clientId: existing.clientId,
      clientName: existing.clientName,
      clientPhone: existing.clientPhone,
      clientEmail: existing.clientEmail,
      clientDni: existing.clientDni,
      stage: 'reserved',
      depositPaid: existing.depositAmount,
      responsible: existing.commercial,
      notes: existing.observations,
      paymentMethod: existing.paymentMethod,
      workCenterId: existing.workCenterId,
      workCenterName: existing.workCenterName,
      ...saleOverrides,
    };
    const saleDoc = buildSaleDocument(userId, saleData);
    const savedSale = await putDocument(req, salesDb, saleDoc._id, saleDoc);

    const now = new Date().toISOString();
    const db = getReservationsDbName();
    const doc = buildReservationDocument(userId, {
      ...existing,
      status: 'converted',
      convertedAt: now,
      saleId: saleDoc._id,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'reservation',
      action: `Convirtió reserva en venta: ${existing.vehicleName} → ${existing.clientName}`,
      entityId: existing._id,
      entityLabel: `${existing.vehicleName} → ${existing.clientName}`.trim(),
      metadata: { saleId: saleDoc._id },
    });

    return res.json({
      ok: true,
      reservation: sanitizeReservation({ ...doc, _rev: saved.rev }),
      sale: sanitizeSale({ ...saleDoc, _rev: savedSale.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al convertir reserva' });
  }
}

export async function removeReservation(req, res) {
  try {
    const { userId, reservationId } = req.params;

    const existing = await ensureReservationOwner(req, userId, reservationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (existing.status === 'active') {
      await setVehicleStatus(req, userId, existing.vehicleId, 'available');
    }

    const db = getReservationsDbName();
    await softDeleteDocument(req, db, reservationId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'reservation',
      action: `Eliminó reserva ${existing.vehicleName} → ${existing.clientName}`,
      entityId: existing._id,
      entityLabel: `${existing.vehicleName} → ${existing.clientName}`.trim(),
      metadata: {},
    });

    return res.json({ ok: true, id: reservationId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar reserva' });
  }
}
