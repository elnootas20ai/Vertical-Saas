import {
  getLocationsDbName,
  buildLocationDocument,
  sanitizeLocation,
  listLocationsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureLocationOwner(req, userId, locationId) {
  const db = getLocationsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, locationId);
  if (!doc || doc.type !== 'location' || doc.user_id !== userId) {
    return null;
  }
  return doc;
}

export async function listLocations(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listLocationsByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeLocation), req.query);
    return res.json({ ok: true, locations: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar ubicaciones' });
  }
}

export async function createLocation(req, res) {
  try {
    const { userId } = req.params;
    const { location } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!location || typeof location !== 'object') {
      return badRequest(res, 'Falta el objeto location en el body');
    }
    if (!location.name || !location.name.trim()) {
      return badRequest(res, 'El nombre de la ubicacion es obligatorio');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLocationsDbName();
    await ensureDatabase(req, db);
    const doc = buildLocationDocument(userId, location);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'location',
      action: `Creo ubicacion "${doc.name}"`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { category: doc.category, capacity: doc.capacity },
    });

    return res.status(201).json({ ok: true, location: sanitizeLocation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear ubicacion' });
  }
}

export async function updateLocation(req, res) {
  try {
    const { userId, locationId } = req.params;
    const { location } = req.body || {};

    if (!location || typeof location !== 'object') {
      return badRequest(res, 'Faltan datos de la ubicacion');
    }

    const existing = await ensureLocationOwner(req, userId, locationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ubicacion no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLocationsDbName();
    const doc = buildLocationDocument(userId, { ...existing, ...location }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'location',
      action: `Actualizo ubicacion "${doc.name}"`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { vehiclesCount: Array.isArray(doc.vehicleIds) ? doc.vehicleIds.length : 0 },
    });

    return res.json({ ok: true, location: sanitizeLocation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar ubicacion' });
  }
}

export async function removeLocation(req, res) {
  try {
    const { userId, locationId } = req.params;

    const existing = await ensureLocationOwner(req, userId, locationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ubicacion no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLocationsDbName();
    await softDeleteDocument(req, db, locationId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'location',
      action: `Elimino ubicacion "${existing.name}"`,
      entityId: existing._id,
      entityLabel: existing.name,
      metadata: {},
    });

    return res.json({ ok: true, id: locationId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar ubicacion' });
  }
}
