import { v4 as uuidv4 } from 'uuid';
import {
  VEHICLES_DB,
  buildScrapyardPartDocument,
  buildScrapyardWorkerDocument,
  buildScrapyardTaskDocument,
  buildDismantlingSession,
  buildVehicleDocument,
  DEFAULT_DISMANTLING_TEMPLATE,
  ensureDatabase,
  findAccountByUserId,
  getAllDocuments,
  getDocument,
  getScrapyardDbName,
  logAccountActivity,
  putDocument,
  sanitizeVehicle,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

const SCRAPYARD_DB = getScrapyardDbName();

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function sanitizePart(part) {
  if (!part) return null;
  return { id: part._id, _rev: part._rev, ...part, _id: undefined };
}

// ─── Parts CRUD ──────────────────────────────────────────────────────────────

export async function listParts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, SCRAPYARD_DB);
    const docs = await getAllDocuments(req, SCRAPYARD_DB);

    let parts = docs.filter(
      (d) => d && d.type === 'scrapyard_part' && d.user_id === userId && !d.deletedAt,
    );

    const { categoria, estado, vehiculoId, search } = req.query;
    if (categoria) parts = parts.filter((p) => p.categoria === categoria);
    if (estado) parts = parts.filter((p) => p.estado === estado);
    if (vehiculoId) parts = parts.filter((p) => p.vehiculoOrigenId === vehiculoId);
    if (search) {
      const q = String(search).toLowerCase();
      parts = parts.filter(
        (p) =>
          (p.nombre || '').toLowerCase().includes(q) ||
          (p.referencia || '').toLowerCase().includes(q) ||
          (p.codigoInterno || '').toLowerCase().includes(q) ||
          (p.vehiculoOrigenLabel || '').toLowerCase().includes(q) ||
          (p.vehiculoOrigenMatricula || '').toLowerCase().includes(q),
      );
    }

    parts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const { items, meta } = applyQueryOptions(parts.map(sanitizePart), req.query);
    return res.json({ ok: true, parts: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al listar piezas' });
  }
}

export async function getPart(req, res) {
  try {
    const { userId, partId } = req.params;
    if (!userId || !partId) return badRequest(res, 'Falta userId o partId');

    await ensureDatabase(req, SCRAPYARD_DB);
    const part = await getDocument(req, SCRAPYARD_DB, partId);
    if (!part || part.type !== 'scrapyard_part' || part.user_id !== userId || part.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Pieza no encontrada' });
    }

    return res.json({ ok: true, part: sanitizePart(part) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener pieza' });
  }
}

export async function createPart(req, res) {
  try {
    const { userId } = req.params;
    const data = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!data.nombre) return badRequest(res, 'El campo nombre es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, SCRAPYARD_DB);
    const doc = buildScrapyardPartDocument(userId, data, null);
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'scrapyard_part',
      action: `Creó pieza ${doc.nombre} (${doc.codigoInterno})`,
      entityId: doc._id,
      entityLabel: doc.nombre,
    });

    return res.status(201).json({ ok: true, part: sanitizePart({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear pieza' });
  }
}

export async function updatePart(req, res) {
  try {
    const { userId, partId } = req.params;
    const data = req.body || {};
    if (!userId || !partId) return badRequest(res, 'Falta userId o partId');

    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, partId);
    if (!existing || existing.type !== 'scrapyard_part' || existing.user_id !== userId || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Pieza no encontrada' });
    }

    const doc = buildScrapyardPartDocument(userId, { ...existing, ...data }, existing);
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);

    return res.json({ ok: true, part: sanitizePart({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar pieza' });
  }
}

export async function deletePart(req, res) {
  try {
    const { userId, partId } = req.params;
    if (!userId || !partId) return badRequest(res, 'Falta userId o partId');

    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, partId);
    if (!existing || existing.type !== 'scrapyard_part' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pieza no encontrada' });
    }

    const now = new Date().toISOString();
    await putDocument(req, SCRAPYARD_DB, partId, { ...existing, deletedAt: now, updatedAt: now });

    return res.json({ ok: true, deleted: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar pieza' });
  }
}

export async function bulkCreateParts(req, res) {
  try {
    const { userId } = req.params;
    const { parts } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(parts) || parts.length === 0) return badRequest(res, 'Debes enviar una lista de piezas');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, SCRAPYARD_DB);
    const created = [];
    for (const p of parts) {
      if (!p.nombre) continue;
      const doc = buildScrapyardPartDocument(userId, p, null);
      const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
      created.push(sanitizePart({ ...doc, _rev: saved.rev }));
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'scrapyard_part',
      action: `Importó ${created.length} pieza${created.length === 1 ? '' : 's'} al desguace`,
      entityId: '',
      entityLabel: 'Importación de piezas',
      metadata: { count: created.length },
    });

    return res.status(201).json({ ok: true, parts: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al importar piezas' });
  }
}

// ─── Dismantling ─────────────────────────────────────────────────────────────

async function getVehicle(req, userId, vehicleId) {
  await ensureDatabase(req, VEHICLES_DB);
  const vehicle = await getDocument(req, VEHICLES_DB, vehicleId);
  if (!vehicle || vehicle.type !== 'car' || vehicle.user_id !== userId) return null;
  return vehicle;
}

async function findDismantlingSession(req, userId, vehicleId) {
  await ensureDatabase(req, SCRAPYARD_DB);
  const docs = await getAllDocuments(req, SCRAPYARD_DB);
  return docs.find(
    (d) => d && d.type === 'dismantling_session' && d.user_id === userId && d.vehicleId === vehicleId && !d.deletedAt,
  ) || null;
}

export async function startDismantling(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const data = req.body || {};
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');

    const vehicle = await getVehicle(req, userId, vehicleId);
    if (!vehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const validStartStatuses = ['received', 'available', 'scrapped'];
    if (!validStartStatuses.includes(vehicle.status)) {
      return badRequest(res, `El vehículo no puede desmontarse en estado "${vehicle.status}"`);
    }

    const existingSession = await findDismantlingSession(req, userId, vehicleId);
    if (existingSession && existingSession.status !== 'completed') {
      return badRequest(res, 'Ya existe una sesión de despiece activa para este vehículo');
    }

    const template = Array.isArray(data.template) && data.template.length > 0
      ? data.template
      : DEFAULT_DISMANTLING_TEMPLATE;

    const piezasPrevistas = template.map((t) => ({
      categoria: t.categoria,
      nombre: t.nombre,
      extraida: false,
      partId: '',
      noAplica: false,
      motivoNoAplica: '',
    }));

    const vehicleLabel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
    const session = buildDismantlingSession(userId, {
      vehicleId,
      vehicleLabel,
      vehicleMatricula: vehicle.registrationPlate || '',
      piezasPrevistas,
      trabajadores: data.trabajadores || [],
      observaciones: data.observaciones || '',
    }, null);

    await ensureDatabase(req, SCRAPYARD_DB);
    const savedSession = await putDocument(req, SCRAPYARD_DB, session._id, session);

    const now = new Date().toISOString();
    const updatedVehicle = buildVehicleDocument(userId, {
      ...vehicle,
      status: 'dismantling',
      dismantlingStartedAt: now,
      totalPartsExpected: piezasPrevistas.length,
      totalPartsExtracted: 0,
      dismantlingProgress: 0,
    }, vehicle);
    await putDocument(req, VEHICLES_DB, updatedVehicle._id, updatedVehicle);

    return res.status(201).json({
      ok: true,
      session: { ...session, _rev: savedSession.rev },
      vehicle: sanitizeVehicle({ ...updatedVehicle }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al iniciar despiece' });
  }
}

export async function getDismantlingSession(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session) return res.status(404).json({ ok: false, error: 'Sesión de despiece no encontrada' });

    return res.json({ ok: true, session });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener sesión' });
  }
}

export async function extractPart(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const data = req.body || {};
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');
    if (data.index === undefined && !data.nombre) return badRequest(res, 'Falta index o nombre de la pieza');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session || session.status === 'completed') {
      return res.status(404).json({ ok: false, error: 'Sesión de despiece no encontrada o ya completada' });
    }

    const vehicle = await getVehicle(req, userId, vehicleId);
    if (!vehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const idx = data.index !== undefined
      ? Number(data.index)
      : session.piezasPrevistas.findIndex((p) => p.nombre === data.nombre && !p.extraida && !p.noAplica);
    if (idx < 0 || idx >= session.piezasPrevistas.length) {
      return badRequest(res, 'Índice de pieza no válido');
    }

    const checklist = session.piezasPrevistas[idx];
    if (checklist.extraida) return badRequest(res, 'Esta pieza ya fue extraída');
    if (checklist.noAplica) return badRequest(res, 'Esta pieza fue marcada como no aplicable');

    const vehicleLabel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
    const partData = {
      nombre: data.nombre || checklist.nombre,
      categoria: data.categoria || checklist.categoria,
      vehiculoOrigenId: vehicleId,
      vehiculoOrigenLabel: vehicleLabel,
      vehiculoOrigenMatricula: vehicle.registrationPlate || '',
      estado: data.estado || 'disponible',
      precioVenta: data.precioVenta || 0,
      precioMinimo: data.precioMinimo || 0,
      ubicacion: data.ubicacion || '',
      zona: data.zona || '',
      estanteria: data.estanteria || '',
      referencia: data.referencia || '',
      subcategoria: data.subcategoria || '',
      compatibilidades: data.compatibilidades || [],
      fotos: data.fotos || [],
      observaciones: data.observaciones || '',
      peso: data.peso,
      garantiaMeses: data.garantiaMeses,
      despieceId: session._id,
      desmontadoPor: data.desmontadoPor || '',
      fechaDesmontaje: new Date().toISOString(),
      ordenDesmontaje: idx,
    };

    await ensureDatabase(req, SCRAPYARD_DB);
    const partDoc = buildScrapyardPartDocument(userId, partData, null);
    const savedPart = await putDocument(req, SCRAPYARD_DB, partDoc._id, partDoc);

    const updatedPiezas = [...session.piezasPrevistas];
    updatedPiezas[idx] = { ...updatedPiezas[idx], extraida: true, partId: partDoc._id };

    const historial = [...(session.historial || []), {
      action: 'extract',
      index: idx,
      nombre: checklist.nombre,
      partId: partDoc._id,
      timestamp: new Date().toISOString(),
      actor: data.desmontadoPor || '',
    }];

    const updatedSession = buildDismantlingSession(userId, {
      ...session,
      piezasPrevistas: updatedPiezas,
      historial,
    }, session);
    await putDocument(req, SCRAPYARD_DB, updatedSession._id, updatedSession);

    const extracted = updatedPiezas.filter((p) => p.extraida).length;
    const resolved = updatedPiezas.filter((p) => p.extraida || p.noAplica).length;
    const progress = updatedPiezas.length > 0 ? Math.round((resolved / updatedPiezas.length) * 100) : 0;

    const updatedVehicle = buildVehicleDocument(userId, {
      ...vehicle,
      totalPartsExtracted: extracted,
      dismantlingProgress: progress,
    }, vehicle);
    await putDocument(req, VEHICLES_DB, updatedVehicle._id, updatedVehicle);

    return res.status(201).json({
      ok: true,
      part: sanitizePart({ ...partDoc, _rev: savedPart.rev }),
      session: updatedSession,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al extraer pieza' });
  }
}

export async function markNotApplicable(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { index, motivo } = req.body || {};
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');
    if (index === undefined) return badRequest(res, 'Falta index');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session || session.status === 'completed') {
      return res.status(404).json({ ok: false, error: 'Sesión de despiece no encontrada o ya completada' });
    }

    const idx = Number(index);
    if (idx < 0 || idx >= session.piezasPrevistas.length) return badRequest(res, 'Índice no válido');
    if (session.piezasPrevistas[idx].extraida) return badRequest(res, 'La pieza ya fue extraída');

    const updatedPiezas = [...session.piezasPrevistas];
    updatedPiezas[idx] = { ...updatedPiezas[idx], noAplica: true, motivoNoAplica: motivo || '' };

    const historial = [...(session.historial || []), {
      action: 'not_applicable',
      index: idx,
      nombre: updatedPiezas[idx].nombre,
      motivo: motivo || '',
      timestamp: new Date().toISOString(),
    }];

    const updatedSession = buildDismantlingSession(userId, {
      ...session,
      piezasPrevistas: updatedPiezas,
      historial,
    }, session);
    await putDocument(req, SCRAPYARD_DB, updatedSession._id, updatedSession);

    const vehicle = await getVehicle(req, userId, vehicleId);
    if (vehicle) {
      const resolved = updatedPiezas.filter((p) => p.extraida || p.noAplica).length;
      const progress = updatedPiezas.length > 0 ? Math.round((resolved / updatedPiezas.length) * 100) : 0;
      const updatedVehicle = buildVehicleDocument(userId, { ...vehicle, dismantlingProgress: progress }, vehicle);
      await putDocument(req, VEHICLES_DB, updatedVehicle._id, updatedVehicle);
    }

    return res.json({ ok: true, session: updatedSession });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al marcar pieza' });
  }
}

export async function addCustomPart(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const data = req.body || {};
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');
    if (!data.nombre) return badRequest(res, 'El campo nombre es obligatorio');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session || session.status === 'completed') {
      return res.status(404).json({ ok: false, error: 'Sesión de despiece no encontrada o ya completada' });
    }

    const newEntry = {
      categoria: data.categoria || 'otra',
      nombre: data.nombre,
      extraida: false,
      partId: '',
      noAplica: false,
      motivoNoAplica: '',
    };

    const updatedPiezas = [...session.piezasPrevistas, newEntry];
    const historial = [...(session.historial || []), {
      action: 'add_custom',
      nombre: data.nombre,
      index: updatedPiezas.length - 1,
      timestamp: new Date().toISOString(),
    }];

    const updatedSession = buildDismantlingSession(userId, {
      ...session,
      piezasPrevistas: updatedPiezas,
      historial,
    }, session);
    await putDocument(req, SCRAPYARD_DB, updatedSession._id, updatedSession);

    const vehicle = await getVehicle(req, userId, vehicleId);
    if (vehicle) {
      const updatedVehicle = buildVehicleDocument(userId, {
        ...vehicle,
        totalPartsExpected: updatedPiezas.length,
      }, vehicle);
      await putDocument(req, VEHICLES_DB, updatedVehicle._id, updatedVehicle);
    }

    return res.status(201).json({ ok: true, session: updatedSession });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir pieza' });
  }
}

export async function pauseDismantling(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session || session.status !== 'in_progress') {
      return res.status(404).json({ ok: false, error: 'No hay sesión activa para pausar' });
    }

    const historial = [...(session.historial || []), {
      action: 'pause',
      timestamp: new Date().toISOString(),
    }];

    const updatedSession = buildDismantlingSession(userId, {
      ...session,
      status: 'paused',
      historial,
    }, session);
    await putDocument(req, SCRAPYARD_DB, updatedSession._id, updatedSession);

    return res.json({ ok: true, session: updatedSession });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al pausar despiece' });
  }
}

export async function resumeDismantling(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session || session.status !== 'paused') {
      return res.status(404).json({ ok: false, error: 'No hay sesión pausada para reanudar' });
    }

    const historial = [...(session.historial || []), {
      action: 'resume',
      timestamp: new Date().toISOString(),
    }];

    const updatedSession = buildDismantlingSession(userId, {
      ...session,
      status: 'in_progress',
      historial,
    }, session);
    await putDocument(req, SCRAPYARD_DB, updatedSession._id, updatedSession);

    return res.json({ ok: true, session: updatedSession });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al reanudar despiece' });
  }
}

export async function completeDismantling(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');

    const session = await findDismantlingSession(req, userId, vehicleId);
    if (!session || session.status === 'completed') {
      return res.status(404).json({ ok: false, error: 'Sesión de despiece no encontrada o ya completada' });
    }

    const pending = session.piezasPrevistas.filter((p) => !p.extraida && !p.noAplica);
    if (pending.length > 0) {
      return badRequest(res, `Quedan ${pending.length} pieza(s) sin resolver. Extrae o marca como no aplicable antes de completar.`);
    }

    const now = new Date().toISOString();
    const historial = [...(session.historial || []), {
      action: 'complete',
      timestamp: now,
    }];

    const updatedSession = buildDismantlingSession(userId, {
      ...session,
      status: 'completed',
      completedAt: now,
      historial,
    }, session);
    await putDocument(req, SCRAPYARD_DB, updatedSession._id, updatedSession);

    const vehicle = await getVehicle(req, userId, vehicleId);
    if (vehicle) {
      const updatedVehicle = buildVehicleDocument(userId, {
        ...vehicle,
        status: 'fully_dismantled',
        dismantlingCompletedAt: now,
        dismantlingProgress: 100,
      }, vehicle);
      await putDocument(req, VEHICLES_DB, updatedVehicle._id, updatedVehicle);
    }

    return res.json({ ok: true, session: updatedSession });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al completar despiece' });
  }
}

export async function updateDismantlingStatus(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { status } = req.body || {};
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');
    if (!status) return badRequest(res, 'Falta status');

    const vehicle = await getVehicle(req, userId, vehicleId);
    if (!vehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const updatedVehicle = buildVehicleDocument(userId, { ...vehicle, status }, vehicle);
    const saved = await putDocument(req, VEHICLES_DB, updatedVehicle._id, updatedVehicle);

    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...updatedVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar estado' });
  }
}

// ─── Workers CRUD ─────────────────────────────────────────────────────────────

function sanitizeWorker(doc) {
  if (!doc) return null;
  return { id: doc._id, _rev: doc._rev, ...doc, _id: undefined };
}

function sanitizeTask(doc) {
  if (!doc) return null;
  return { id: doc._id, _rev: doc._rev, ...doc, _id: undefined };
}

export async function listWorkers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const docs = await getAllDocuments(req, SCRAPYARD_DB);
    let workers = docs.filter(d => d && d.type === 'scrapyard_worker' && d.user_id === userId && !d.deletedAt);
    if (req.query.status) workers = workers.filter(w => w.status === req.query.status);
    if (req.query.zone) workers = workers.filter(w => (w.zone || '').toLowerCase().includes(req.query.zone.toLowerCase()));
    if (req.query.shift) workers = workers.filter(w => w.shift === req.query.shift);
    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      workers = workers.filter(w => (w.name || '').toLowerCase().includes(q) || (w.role || '').toLowerCase().includes(q));
    }
    const { items, meta } = applyQueryOptions(workers.map(sanitizeWorker), req.query);
    return res.json({ ok: true, workers: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al listar trabajadores' });
  }
}

export async function getWorker(req, res) {
  try {
    const { userId, workerId } = req.params;
    if (!userId || !workerId) return badRequest(res, 'Falta userId o workerId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const doc = await getDocument(req, SCRAPYARD_DB, workerId);
    if (!doc || doc.type !== 'scrapyard_worker' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    }
    return res.json({ ok: true, worker: sanitizeWorker(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener trabajador' });
  }
}

export async function createWorker(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const data = req.body?.worker || req.body;
    if (!data.name) return badRequest(res, 'Falta nombre del trabajador');
    await ensureDatabase(req, SCRAPYARD_DB);
    const doc = buildScrapyardWorkerDocument(userId, data);
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.status(201).json({ ok: true, worker: sanitizeWorker({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear trabajador' });
  }
}

export async function updateWorker(req, res) {
  try {
    const { userId, workerId } = req.params;
    if (!userId || !workerId) return badRequest(res, 'Falta userId o workerId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, workerId);
    if (!existing || existing.type !== 'scrapyard_worker' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    }
    const data = req.body?.worker || req.body;
    const doc = buildScrapyardWorkerDocument(userId, data, existing);
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true, worker: sanitizeWorker({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar trabajador' });
  }
}

export async function deleteWorker(req, res) {
  try {
    const { userId, workerId } = req.params;
    if (!userId || !workerId) return badRequest(res, 'Falta userId o workerId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, workerId);
    if (!existing || existing.type !== 'scrapyard_worker' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    }
    const doc = { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar trabajador' });
  }
}

// ─── Tasks CRUD ──────────────────────────────────────────────────────────────

export async function listTasks(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const docs = await getAllDocuments(req, SCRAPYARD_DB);
    let tasks = docs.filter(d => d && d.type === 'scrapyard_task' && d.user_id === userId && !d.deletedAt);
    if (req.query.taskType) tasks = tasks.filter(t => t.taskType === req.query.taskType);
    if (req.query.status) tasks = tasks.filter(t => t.status === req.query.status);
    if (req.query.assignedWorkerId) tasks = tasks.filter(t => t.assignedWorkerId === req.query.assignedWorkerId);
    if (req.query.scheduledDate) tasks = tasks.filter(t => t.scheduledDate === req.query.scheduledDate);
    const { items, meta } = applyQueryOptions(tasks.map(sanitizeTask), req.query);
    return res.json({ ok: true, tasks: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al listar tareas' });
  }
}

export async function getTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const doc = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!doc || doc.type !== 'scrapyard_task' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    return res.json({ ok: true, task: sanitizeTask(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener tarea' });
  }
}

export async function createTask(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const data = req.body?.task || req.body;
    if (!data.title) return badRequest(res, 'Falta título de la tarea');
    await ensureDatabase(req, SCRAPYARD_DB);
    const doc = buildScrapyardTaskDocument(userId, data);
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.status(201).json({ ok: true, task: sanitizeTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear tarea' });
  }
}

export async function updateTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!existing || existing.type !== 'scrapyard_task' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    const data = req.body?.task || req.body;
    const doc = buildScrapyardTaskDocument(userId, data, existing);
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true, task: sanitizeTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar tarea' });
  }
}

export async function deleteTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!existing || existing.type !== 'scrapyard_task' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    const doc = { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar tarea' });
  }
}

function computeTaskTotalMinutes(timeEntries) {
  let total = 0;
  let lastStart = null;
  for (const entry of timeEntries) {
    if (entry.action === 'start' || entry.action === 'resume') {
      lastStart = new Date(entry.timestamp).getTime();
    } else if ((entry.action === 'pause' || entry.action === 'complete') && lastStart) {
      total += (new Date(entry.timestamp).getTime() - lastStart) / 60000;
      lastStart = null;
    }
  }
  if (lastStart) {
    total += (Date.now() - lastStart) / 60000;
  }
  return Math.round(total);
}

export async function startTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!existing || existing.type !== 'scrapyard_task' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    const now = new Date().toISOString();
    const entries = [...(existing.timeEntries || []), { action: 'start', timestamp: now, notes: req.body?.notes || '' }];
    const doc = { ...existing, status: 'in_progress', timeEntries: entries, totalMinutes: computeTaskTotalMinutes(entries), updatedAt: now };
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true, task: sanitizeTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al iniciar tarea' });
  }
}

export async function pauseTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!existing || existing.type !== 'scrapyard_task' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    const now = new Date().toISOString();
    const entries = [...(existing.timeEntries || []), { action: 'pause', timestamp: now, notes: req.body?.notes || '' }];
    const doc = { ...existing, status: 'paused', timeEntries: entries, totalMinutes: computeTaskTotalMinutes(entries), updatedAt: now };
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true, task: sanitizeTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al pausar tarea' });
  }
}

export async function resumeTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!existing || existing.type !== 'scrapyard_task' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    const now = new Date().toISOString();
    const entries = [...(existing.timeEntries || []), { action: 'resume', timestamp: now, notes: req.body?.notes || '' }];
    const doc = { ...existing, status: 'in_progress', timeEntries: entries, totalMinutes: computeTaskTotalMinutes(entries), updatedAt: now };
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true, task: sanitizeTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al reanudar tarea' });
  }
}

export async function completeTask(req, res) {
  try {
    const { userId, taskId } = req.params;
    if (!userId || !taskId) return badRequest(res, 'Falta userId o taskId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const existing = await getDocument(req, SCRAPYARD_DB, taskId);
    if (!existing || existing.type !== 'scrapyard_task' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    }
    const now = new Date().toISOString();
    const entries = [...(existing.timeEntries || []), { action: 'complete', timestamp: now, notes: req.body?.notes || '' }];
    const result = req.body?.result || existing.result || null;
    const doc = { ...existing, status: 'completed', completedAt: now, timeEntries: entries, totalMinutes: computeTaskTotalMinutes(entries), result, updatedAt: now };
    const saved = await putDocument(req, SCRAPYARD_DB, doc._id, doc);
    return res.json({ ok: true, task: sanitizeTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al completar tarea' });
  }
}

export async function getWorkerProductivity(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    await ensureDatabase(req, SCRAPYARD_DB);
    const docs = await getAllDocuments(req, SCRAPYARD_DB);
    const workers = docs.filter(d => d && d.type === 'scrapyard_worker' && d.user_id === userId && !d.deletedAt);
    const tasks = docs.filter(d => d && d.type === 'scrapyard_task' && d.user_id === userId && !d.deletedAt);
    const today = new Date().toISOString().slice(0, 10);

    const report = workers.map(w => {
      const workerTasks = tasks.filter(t => t.assignedWorkerId === w._id);
      const todayTasks = workerTasks.filter(t => t.scheduledDate === today);
      const completedToday = todayTasks.filter(t => t.status === 'completed');
      const totalMinutes = todayTasks.reduce((a, t) => a + (t.totalMinutes || 0), 0);
      const hours = totalMinutes / 60;
      const partsExtracted = completedToday.reduce((a, t) => a + (t.result?.partsExtracted || 0), 0);
      const partsCataloged = completedToday.reduce((a, t) => a + (t.result?.partsCataloged || 0), 0);
      const totalPieces = partsExtracted + partsCataloged;
      const salesAmount = completedToday.reduce((a, t) => a + (t.result?.saleAmount || 0), 0);
      return {
        workerId: w._id,
        workerName: w.name,
        role: w.role,
        zone: w.zone,
        hoursWorked: Math.round(hours * 10) / 10,
        tasksCompleted: completedToday.length,
        tasksPending: todayTasks.filter(t => t.status === 'pending' || t.status === 'assigned').length,
        tasksInProgress: todayTasks.filter(t => t.status === 'in_progress').length,
        partsExtracted,
        partsCataloged,
        totalPieces,
        salesAmount,
        productivityPerHour: hours > 0 ? Math.round((totalPieces / hours) * 100) / 100 : 0,
        laborCost: Math.round(w.hourlyCost * hours * 100) / 100,
      };
    });

    return res.json({ ok: true, report });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al generar reporte de productividad' });
  }
}

// ─── Búsqueda de compatibilidad ──────────────────────────────────────────────

export async function searchCompatibleParts(req, res) {
  try {
    const { userId } = req.params;
    const { marca, modelo, anio, categoria } = req.query;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!marca && !modelo) return badRequest(res, 'Falta marca o modelo para buscar compatibilidades');

    await ensureDatabase(req, SCRAPYARD_DB);
    const docs = await getAllDocuments(req, SCRAPYARD_DB);

    let parts = docs.filter(
      (d) => d && d.type === 'scrapyard_part' && d.user_id === userId && !d.deletedAt && d.estado === 'disponible',
    );

    if (categoria) parts = parts.filter((p) => p.categoria === categoria);

    const marcaLower = (marca || '').toLowerCase();
    const modeloLower = (modelo || '').toLowerCase();
    const anioNum = anio ? Number(anio) : null;

    parts = parts.filter((p) => {
      if (!Array.isArray(p.compatibilidades) || p.compatibilidades.length === 0) return false;
      return p.compatibilidades.some((c) => {
        const marcaMatch = !marcaLower || (c.marca || '').toLowerCase().includes(marcaLower);
        const modeloMatch = !modeloLower || (c.modelo || '').toLowerCase().includes(modeloLower);
        const anioMatch = !anioNum || (
          (!c.anioDesde || c.anioDesde <= anioNum) && (!c.anioHasta || c.anioHasta >= anioNum)
        );
        return marcaMatch && modeloMatch && anioMatch;
      });
    });

    const { items, meta } = applyQueryOptions(parts.map(sanitizePart), req.query);
    return res.json({ ok: true, parts: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al buscar piezas compatibles' });
  }
}
