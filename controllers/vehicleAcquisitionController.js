import { v4 as uuidv4 } from 'uuid';
import * as cacheService from '../services/cache.js';
import { broadcastToUser } from '../services/sseService.js';
import {
  VEHICLES_DB,
  buildVehicleAcquisitionDocument,
  sanitizeVehicleAcquisition,
  listVehicleAcquisitionsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  logAccountActivity,
  writeChangelog,
  isValidAcquisitionTransition,
  recalcAcquisitionTotalCost,
  sanitizeVehicle,
  getAllDocuments,
} from '../services/couchdb.js';
import { syncAcquisitionToVehicle } from '../services/compraventaAcceptFlow.js';

function badRequest(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

// ── List ────────────────────────────────────────────────────────────────────────

export async function listAcquisitions(req, res) {
  try {
    const { userId } = req.params;
    const docs = await listVehicleAcquisitionsByUser(req, userId);
    const items = docs.map(sanitizeVehicleAcquisition).filter(Boolean);

    const { status, acquisitionType, paymentStatus, dateFrom, dateTo, search } = req.query;

    const filtered = items.filter((a) => {
      if (status && a.status !== status) return false;
      if (acquisitionType && a.acquisitionType !== acquisitionType) return false;
      if (paymentStatus && a.paymentStatus !== paymentStatus) return false;
      if (dateFrom && a.acquisitionDate < dateFrom) return false;
      if (dateTo && a.acquisitionDate > dateTo) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${a.registrationPlate} ${a.sellerName} ${a.sellerNif}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return res.json({ ok: true, items: filtered });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Get ─────────────────────────────────────────────────────────────────────────

export async function getAcquisition(req, res) {
  try {
    const { userId, id } = req.params;
    await ensureDatabase(req, VEHICLES_DB);
    const doc = await getDocument(req, VEHICLES_DB, id);
    if (!doc || doc.type !== 'vehicle_acquisition' || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Adquisición no encontrada' });
    }
    return res.json({ ok: true, item: sanitizeVehicleAcquisition(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Create ──────────────────────────────────────────────────────────────────────

export async function createAcquisition(req, res) {
  try {
    const { userId } = req.params;
    const data = req.body || {};

    if (!data.vehicleId) return badRequest(res, 'vehicleId es obligatorio');
    if (!data.sellerName?.trim()) return badRequest(res, 'sellerName es obligatorio');

    await ensureDatabase(req, VEHICLES_DB);

    const vehicle = await getDocument(req, VEHICLES_DB, data.vehicleId);
    if (!vehicle || vehicle.deletedAt) {
      return badRequest(res, 'El vehículo indicado no existe');
    }

    const doc = buildVehicleAcquisitionDocument(userId, {
      ...data,
      registrationPlate: data.registrationPlate || vehicle.registrationPlate || '',
      status: 'borrador',
    }, null, data.business_id);

    await putDocument(req, VEHICLES_DB, doc._id, doc);

    await syncAcquisitionToVehicle(req, doc, vehicle);

    cacheService.invalidateByPrefix('compraventa');

    await logAccountActivity(req, userId, {
      action: 'create_acquisition',
      resource: 'vehicle_acquisition',
      resourceId: doc._id,
      details: `Compra/retirada registrada: ${doc.registrationPlate} — ${doc.acquisitionType}`,
    }).catch(() => {});

    return res.status(201).json({ ok: true, item: sanitizeVehicleAcquisition(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────

export async function updateAcquisition(req, res) {
  try {
    const { userId, id } = req.params;
    const data = req.body || {};

    await ensureDatabase(req, VEHICLES_DB);
    const existing = await getDocument(req, VEHICLES_DB, id);
    if (!existing || existing.type !== 'vehicle_acquisition' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Adquisición no encontrada' });
    }

    const doc = buildVehicleAcquisitionDocument(userId, data, existing);
    await putDocument(req, VEHICLES_DB, doc._id, doc);

    const vehicle = await getDocument(req, VEHICLES_DB, doc.vehicleId);
    if (vehicle && !vehicle.deletedAt) {
      await syncAcquisitionToVehicle(req, doc, vehicle);
    }

    cacheService.invalidateByPrefix('compraventa');

    broadcastToUser(userId, 'vehicle_updated', { vehicleId: doc.vehicleId, action: 'acquisition_updated' });
    broadcastToUser(userId, 'vehicle_update', { vehicleId: doc.vehicleId });

    return res.json({ ok: true, item: sanitizeVehicleAcquisition(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Change Status ───────────────────────────────────────────────────────────────

export async function changeStatus(req, res) {
  try {
    const { userId, id } = req.params;
    const { newStatus, note } = req.body || {};

    if (!newStatus) return badRequest(res, 'newStatus es obligatorio');

    await ensureDatabase(req, VEHICLES_DB);
    const existing = await getDocument(req, VEHICLES_DB, id);
    if (!existing || existing.type !== 'vehicle_acquisition' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Adquisición no encontrada' });
    }

    if (!isValidAcquisitionTransition(existing.status, newStatus)) {
      return badRequest(res, `Transición no permitida: ${existing.status} → ${newStatus}`);
    }

    const now = new Date().toISOString();
    const statusHistory = [...(existing.statusHistory || []), { status: newStatus, date: now, userId, note: note || '' }];

    const updates = { status: newStatus, statusHistory };
    if (newStatus === 'aprobada') {
      updates.approvedBy = userId;
      updates.approvedAt = now;
    }
    if (newStatus === 'recibida') {
      updates.receptionDate = updates.receptionDate || now.slice(0, 10);
    }
    if (newStatus === 'cerrada') {
      updates.closedAt = now;
    }

    const doc = buildVehicleAcquisitionDocument(userId, { ...existing, ...updates }, existing);
    await putDocument(req, VEHICLES_DB, doc._id, doc);

    await logAccountActivity(req, userId, {
      action: `acquisition_${newStatus}`,
      resource: 'vehicle_acquisition',
      resourceId: doc._id,
      details: `Estado → ${newStatus}: ${doc.registrationPlate}`,
    }).catch(() => {});

    return res.json({ ok: true, item: sanitizeVehicleAcquisition(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Approve / Reject ────────────────────────────────────────────────────────────

export async function approveAcquisition(req, res) {
  req.body = { newStatus: 'aprobada', note: req.body?.note || 'Aprobada por gerente' };
  return changeStatus(req, res);
}

export async function rejectAcquisition(req, res) {
  if (!req.body?.note?.trim()) return badRequest(res, 'El motivo de rechazo es obligatorio');
  req.body = { newStatus: 'rechazada', note: req.body.note };
  return changeStatus(req, res);
}

// ── Delete ──────────────────────────────────────────────────────────────────────

export async function deleteAcquisition(req, res) {
  try {
    const { userId, id } = req.params;
    await ensureDatabase(req, VEHICLES_DB);
    const doc = await getDocument(req, VEHICLES_DB, id);
    if (!doc || doc.type !== 'vehicle_acquisition' || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Adquisición no encontrada' });
    }
    if (!['borrador', 'cancelada'].includes(doc.status)) {
      return badRequest(res, 'Solo se pueden eliminar adquisiciones en borrador o canceladas');
    }
    await softDeleteDocument(req, VEHICLES_DB, id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── By Vehicle / By Seller ──────────────────────────────────────────────────────

export async function getAcquisitionsByVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const docs = await listVehicleAcquisitionsByUser(req, userId);
    const items = docs
      .filter((d) => d.vehicleId === vehicleId)
      .map(sanitizeVehicleAcquisition)
      .filter(Boolean);
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function getAcquisitionsBySeller(req, res) {
  try {
    const { userId, sellerId } = req.params;
    const docs = await listVehicleAcquisitionsByUser(req, userId);
    const items = docs
      .filter((d) => d.supplierId === sellerId || d.sellerNif === sellerId)
      .map(sanitizeVehicleAcquisition)
      .filter(Boolean);
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Stats ───────────────────────────────────────────────────────────────────────

export async function getAcquisitionStats(req, res) {
  try {
    const { userId } = req.params;
    const docs = await listVehicleAcquisitionsByUser(req, userId);
    const items = docs.map(sanitizeVehicleAcquisition).filter(Boolean);

    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7);
    const thisMonth = items.filter((a) => (a.acquisitionDate || a.createdAt || '').startsWith(monthStr));
    const pending = items.filter((a) => !['cerrada', 'cancelada'].includes(a.status));

    const totalCostMonth = thisMonth.reduce((s, a) => s + a.costTotal, 0);
    const avgCost = thisMonth.length > 0 ? Math.round(totalCostMonth / thisMonth.length) : 0;

    const byType = {};
    for (const a of thisMonth) {
      byType[a.acquisitionType] = (byType[a.acquisitionType] || 0) + 1;
    }

    return res.json({
      ok: true,
      stats: {
        totalMonth: thisMonth.length,
        totalCostMonth,
        avgCost,
        pendingCount: pending.length,
        byType,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ── Economic History ────────────────────────────────────────────────────────────

export async function getEconomicHistory(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    await ensureDatabase(req, VEHICLES_DB);

    const vehicle = await getDocument(req, VEHICLES_DB, vehicleId);
    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    const allDocs = await getAllDocuments(req, VEHICLES_DB);
    const acquisitions = allDocs
      .filter((d) => d?.type === 'vehicle_acquisition' && d?.vehicleId === vehicleId && !d?.deletedAt);

    const entries = [];

    for (const acq of acquisitions) {
      if (acq.costCompra > 0) {
        entries.push({
          id: `${acq._id}:compra`,
          date: acq.acquisitionDate || acq.createdAt,
          type: 'acquisition',
          category: 'compra',
          concept: `Compra — ${acq.sellerName}`,
          amount: -(acq.costCompra || 0),
          sourceType: 'vehicle_acquisition',
          sourceId: acq._id,
        });
      }
      for (const [key, label] of [['costTransporte', 'Transporte'], ['costGestoria', 'Gestoría'], ['costDocumentacion', 'Documentación'], ['costDescontaminacion', 'Descontaminación'], ['costOtros', 'Otros']]) {
        if (acq[key] > 0) {
          entries.push({
            id: `${acq._id}:${key}`,
            date: acq.acquisitionDate || acq.createdAt,
            type: 'acquisition_cost',
            category: key.replace('cost', '').toLowerCase(),
            concept: label,
            amount: -(acq[key] || 0),
            sourceType: 'vehicle_acquisition',
            sourceId: acq._id,
          });
        }
      }
    }

    const costs = vehicle.associatedCosts || [];
    for (const c of costs) {
      if (c.id?.startsWith('acq:')) continue;
      entries.push({
        id: c.id,
        date: c.date,
        type: 'cost',
        category: c.category,
        concept: c.description || c.category,
        amount: -(c.amount || 0),
        sourceType: 'associated_cost',
        sourceId: c.id,
      });
    }

    entries.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    let balance = 0;
    for (const e of entries) {
      balance += e.amount;
      e.balance = Math.round(balance * 100) / 100;
    }

    const totalInvested = entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalRevenue = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);

    return res.json({
      ok: true,
      entries,
      summary: {
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        roi: totalInvested > 0 ? Math.round(((totalRevenue - totalInvested) / totalInvested) * 10000) / 100 : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
