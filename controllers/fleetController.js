import { v4 as uuidv4 } from 'uuid';
import {
  FLEET_DB,
  buildFleetVehicleDocument,
  ensureDatabase,
  findAccountByUserId,
  getDocument,
  logAccountActivity,
  listFleetVehiclesByUser,
  putDocument,
  sanitizeFleetVehicle,
  softDeleteDocument,
  writeChangelog,
  computeFleetAlerts,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

const FLEET_COST_CATEGORIES = ['fuel', 'maintenance', 'repair', 'insurance', 'tax', 'parking', 'toll', 'fine', 'other'];
const FLEET_DOC_TYPES = ['circulation_permit', 'insurance_policy', 'technical_sheet', 'incident_report', 'contract', 'other'];

async function ensureFleetOwner(req, userId, vehicleId) {
  await ensureDatabase(req, FLEET_DB);
  const vehicle = await getDocument(req, FLEET_DB, vehicleId);
  if (!vehicle || vehicle.type !== 'fleet_vehicle' || vehicle.active === false || vehicle.user_id !== userId) {
    return null;
  }
  return vehicle;
}

// ─── CRUD Vehículos de Flota ──────────────────────────────────────────────────

export async function listFleetVehicles(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.query.businessId || '').trim() || null;

    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listFleetVehiclesByUser(req, userId, businessId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeFleetVehicle), req.query);
    return res.json({ ok: true, vehicles: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar vehículos de flota' });
  }
}

export async function createFleetVehicle(req, res) {
  try {
    const { userId } = req.params;
    const { businessId } = req.body || {};
    const { vehicle } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!vehicle?.brand || !vehicle?.model) return badRequest(res, 'Faltan campos obligatorios (marca, modelo)');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, FLEET_DB);
    const nextVehicle = buildFleetVehicleDocument(userId, vehicle, null, businessId || null);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'fleet',
      action: `Añadió vehículo de flota ${nextVehicle.brand} ${nextVehicle.model}`,
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: { registrationPlate: nextVehicle.registrationPlate, ownershipType: nextVehicle.ownershipType },
    });
    await writeChangelog(req, {
      entity: 'fleet_vehicle',
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      action: 'create',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { after: { brand: nextVehicle.brand, model: nextVehicle.model, ownershipType: nextVehicle.ownershipType, status: nextVehicle.status } },
      metadata: { registrationPlate: nextVehicle.registrationPlate },
    });

    return res.status(201).json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear vehículo de flota' });
  }
}

export async function getFleetVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });
    return res.json({ ok: true, vehicle: sanitizeFleetVehicle(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar vehículo de flota' });
  }
}

export async function updateFleetVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { vehicle } = req.body || {};
    if (!vehicle || typeof vehicle !== 'object') return badRequest(res, 'Faltan datos del vehículo');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const mergedData = { ...existing, ...vehicle };
    const nextVehicle = buildFleetVehicleDocument(userId, mergedData, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'fleet',
      action: `Actualizó vehículo de flota ${nextVehicle.brand} ${nextVehicle.model}`,
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: { registrationPlate: nextVehicle.registrationPlate },
    });
    await writeChangelog(req, {
      entity: 'fleet_vehicle',
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      action: 'update',
      actorUserId: userId,
      actorName: account.fullName,
      changes: {},
      metadata: { registrationPlate: nextVehicle.registrationPlate },
    });

    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar vehículo de flota' });
  }
}

export async function removeFleetVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const existing = await ensureFleetOwner(req, userId, vehicleId);
    const account = await findAccountByUserId(req, userId);
    if (!existing || !account) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    await softDeleteDocument(req, FLEET_DB, vehicleId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'fleet',
      action: `Eliminó vehículo de flota ${existing.brand} ${existing.model}`,
      entityId: existing._id,
      entityLabel: `${existing.brand} ${existing.model}`.trim(),
      metadata: { registrationPlate: existing.registrationPlate },
    });
    await writeChangelog(req, {
      entity: 'fleet_vehicle',
      entityId: existing._id,
      entityLabel: `${existing.brand} ${existing.model} (${existing.registrationPlate})`,
      action: 'delete',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { before: { brand: existing.brand, model: existing.model, registrationPlate: existing.registrationPlate } },
      metadata: {},
    });

    return res.json({ ok: true, id: vehicleId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar vehículo de flota' });
  }
}

// ─── Asignación ───────────────────────────────────────────────────────────────

export async function assignFleetVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { memberId, memberName } = req.body || {};
    if (!memberId) return badRequest(res, 'Falta memberId');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const assignedTo = {
      memberId: String(memberId).trim(),
      memberName: String(memberName || '').trim(),
      assignedDate: new Date().toISOString(),
    };

    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, assignedTo }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'fleet',
      action: `Asignó ${existing.brand} ${existing.model} a ${memberName || memberId}`,
      entityId: existing._id,
      entityLabel: `${existing.brand} ${existing.model}`.trim(),
      metadata: { memberId, memberName },
    });

    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al asignar vehículo' });
  }
}

export async function unassignFleetVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const previousMember = existing.assignedTo?.memberName || existing.assignedTo?.memberId || '';
    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, assignedTo: null }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'fleet',
      action: `Desasignó ${existing.brand} ${existing.model}${previousMember ? ` de ${previousMember}` : ''}`,
      entityId: existing._id,
      entityLabel: `${existing.brand} ${existing.model}`.trim(),
      metadata: {},
    });

    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al desasignar vehículo' });
  }
}

// ─── Costes ───────────────────────────────────────────────────────────────────

export async function addFleetCost(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { cost } = req.body || {};
    if (!cost || typeof cost !== 'object') return badRequest(res, 'Faltan datos del coste');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const newCost = {
      id: `fc:${uuidv4()}`,
      category: FLEET_COST_CATEGORIES.includes(cost.category) ? cost.category : 'other',
      description: String(cost.description || '').trim(),
      amount: Number.isFinite(Number(cost.amount)) ? Number(cost.amount) : 0,
      date: String(cost.date || new Date().toISOString().slice(0, 10)),
      mileage: Number.isFinite(Number(cost.mileage)) ? Number(cost.mileage) : undefined,
      receipt: String(cost.receipt || '').trim() || undefined,
    };

    const costs = [...(existing.costs || []), newCost];
    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, costs }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);

    return res.status(201).json({ ok: true, cost: newCost, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir coste' });
  }
}

export async function updateFleetCost(req, res) {
  try {
    const { userId, vehicleId, costId } = req.params;
    const { cost } = req.body || {};
    if (!cost) return badRequest(res, 'Faltan datos del coste');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const found = (existing.costs || []).find((c) => c.id === costId);
    if (!found) return res.status(404).json({ ok: false, error: 'Coste no encontrado' });

    const costs = (existing.costs || []).map((c) =>
      c.id === costId
        ? {
            ...c,
            category: FLEET_COST_CATEGORIES.includes(cost.category) ? cost.category : c.category,
            description: cost.description !== undefined ? String(cost.description).trim() : c.description,
            amount: cost.amount !== undefined && Number.isFinite(Number(cost.amount)) ? Number(cost.amount) : c.amount,
            date: cost.date || c.date,
            mileage: cost.mileage !== undefined && Number.isFinite(Number(cost.mileage)) ? Number(cost.mileage) : c.mileage,
            receipt: cost.receipt !== undefined ? String(cost.receipt).trim() || undefined : c.receipt,
          }
        : c,
    );

    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, costs }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar coste' });
  }
}

export async function deleteFleetCost(req, res) {
  try {
    const { userId, vehicleId, costId } = req.params;
    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const costs = (existing.costs || []).filter((c) => c.id !== costId);
    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, costs }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar coste' });
  }
}

// ─── Documentos ───────────────────────────────────────────────────────────────

export async function addFleetDocument(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { document: doc } = req.body || {};
    if (!doc || typeof doc !== 'object') return badRequest(res, 'Faltan datos del documento');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const newDoc = {
      id: `fd:${uuidv4()}`,
      docType: FLEET_DOC_TYPES.includes(doc.docType) ? doc.docType : 'other',
      name: String(doc.name || '').trim(),
      fileUrl: String(doc.fileUrl || '').trim() || undefined,
      expiryDate: String(doc.expiryDate || '').trim() || undefined,
      notes: String(doc.notes || '').trim() || undefined,
      uploadedAt: new Date().toISOString(),
    };

    const documents = [...(existing.documents || []), newDoc];
    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, documents }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);

    return res.status(201).json({ ok: true, document: newDoc, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir documento' });
  }
}

export async function updateFleetDocument(req, res) {
  try {
    const { userId, vehicleId, documentId } = req.params;
    const { document: doc } = req.body || {};
    if (!doc) return badRequest(res, 'Faltan datos del documento');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const found = (existing.documents || []).find((d) => d.id === documentId);
    if (!found) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

    const documents = (existing.documents || []).map((d) =>
      d.id === documentId ? { ...d, ...doc, id: documentId } : d,
    );

    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, documents }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar documento' });
  }
}

export async function deleteFleetDocument(req, res) {
  try {
    const { userId, vehicleId, documentId } = req.params;
    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const documents = (existing.documents || []).filter((d) => d.id !== documentId);
    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, documents }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar documento' });
  }
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

export async function getFleetAlerts(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.query.businessId || '').trim() || null;

    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const vehicles = await listFleetVehiclesByUser(req, userId, businessId);
    const allAlerts = [];

    for (const vehicle of vehicles) {
      const pending = computeFleetAlerts(vehicle);
      if (pending.length > 0) {
        allAlerts.push({
          vehicleId: vehicle._id,
          vehicleLabel: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate})`.trim(),
          alerts: pending,
        });
      }
    }

    return res.json({ ok: true, alerts: allAlerts, total: allAlerts.reduce((sum, v) => sum + v.alerts.length, 0) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar alertas de flota' });
  }
}

export async function updateFleetAlertSettings(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { alerts } = req.body || {};
    if (!alerts || typeof alerts !== 'object') return badRequest(res, 'Faltan configuración de alertas');

    const existing = await ensureFleetOwner(req, userId, vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Vehículo de flota no encontrado' });

    const nextVehicle = buildFleetVehicleDocument(userId, { ...existing, alerts }, existing);
    const saved = await putDocument(req, FLEET_DB, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeFleetVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar alertas' });
  }
}

// ─── Resumen / KPIs ──────────────────────────────────────────────────────────

export async function getFleetSummary(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.query.businessId || '').trim() || null;

    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const vehicles = await listFleetVehiclesByUser(req, userId, businessId);

    const byOwnership = {};
    const byStatus = {};
    let totalCosts = 0;
    let totalAlerts = 0;
    let assignedCount = 0;

    for (const v of vehicles) {
      byOwnership[v.ownershipType || 'owned'] = (byOwnership[v.ownershipType || 'owned'] || 0) + 1;
      byStatus[v.status || 'active'] = (byStatus[v.status || 'active'] || 0) + 1;

      if (v.assignedTo?.memberId) assignedCount++;

      const costs = Array.isArray(v.costs) ? v.costs : [];
      for (const c of costs) totalCosts += c.amount || 0;

      totalAlerts += computeFleetAlerts(v).length;
    }

    return res.json({
      ok: true,
      summary: {
        totalVehicles: vehicles.length,
        assignedCount,
        unassignedCount: vehicles.length - assignedCount,
        byOwnership,
        byStatus,
        totalCosts,
        totalAlerts,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar resumen de flota' });
  }
}
