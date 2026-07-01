import { v4 as uuidv4 } from 'uuid';
import * as cacheService from './cache.js';
import { broadcastToUser } from './sseService.js';
import {
  VEHICLES_DB,
  buildVehicleDocument,
  buildVehicleAcquisitionDocument,
  ensureDatabase,
  getDocument,
  putDocument,
  searchClientsByPhone,
  getClientDocumentsForUser,
  buildClientDocument,
  getClientsDbName,
  writeChangelog,
  logAccountActivity,
  sanitizeVehicle,
  sanitizeVehicleAcquisition,
} from './couchdb.js';

function appendHistory(existing = [], entry) {
  return [...(Array.isArray(existing) ? existing : []), entry];
}

async function findCrmClient(req, userId, { phone, email, businessId }) {
  const scope = businessId ? { businessId } : {};

  if (phone?.trim()) {
    const byPhone = await searchClientsByPhone(req, userId, phone.trim(), 5, scope);
    if (byPhone.length > 0) return byPhone[0];
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail) {
    const docs = await getClientDocumentsForUser(req, userId);
    const match = docs.find((d) => {
      if (d?.type !== 'client' || d?.deletedAt) return false;
      if (businessId && d.business_id && d.business_id !== businessId) return false;
      return String(d.email || '').trim().toLowerCase() === normalizedEmail;
    });
    if (match) return match;
  }

  return null;
}

async function linkClientVehicleSold(req, userId, clientDoc, vehicleLabel, vehicleId) {
  if (!clientDoc?._id) return null;
  const label = String(vehicleLabel || vehicleId || '').trim();
  if (!label) return null;

  const existingSold = Array.isArray(clientDoc.vehiclesSold) ? clientDoc.vehiclesSold : [];
  if (existingSold.includes(label) || existingSold.includes(vehicleId)) {
    return clientDoc._id;
  }

  const updated = buildClientDocument(userId, {
    ...clientDoc,
    vehiclesSold: [...existingSold, label],
  }, clientDoc);

  const clientsDb = getClientsDbName();
  await ensureDatabase(req, clientsDb);
  await putDocument(req, clientsDb, updated._id, updated);
  return updated._id;
}

export async function syncAcquisitionToVehicle(req, acquisition, vehicle) {
  if (!acquisition || !vehicle?._id) return vehicle;

  const acqId = acquisition._id;
  const existingCosts = Array.isArray(vehicle.associatedCosts) ? vehicle.associatedCosts : [];
  const otherCosts = existingCosts.filter((c) => !c.id?.startsWith(`acq:${acqId}:`));

  const newCosts = [];
  const costMap = [
    ['transporte', acquisition.costTransporte, 'Transporte'],
    ['gestoria', acquisition.costGestoria, 'Gestoría'],
    ['documentacion', acquisition.costDocumentacion, 'Documentación'],
    ['descontaminacion', acquisition.costDescontaminacion, 'Descontaminación'],
    ['otro', acquisition.costOtros, acquisition.costOtrosDetalle || 'Otros costes'],
  ];

  for (const [cat, amount, desc] of costMap) {
    if (amount > 0) {
      newCosts.push({
        id: `acq:${acqId}:${cat}`,
        category: cat,
        description: desc,
        amount,
        date: acquisition.acquisitionDate || new Date().toISOString().slice(0, 10),
      });
    }
  }

  const originMap = {
    compra_particular: 'particular',
    compra_empresa: 'empresa',
    subasta: 'subasta',
    retirada: 'otro',
    grua_externa: 'otro',
  };

  const purchaseCostEntry = acquisition.costCompra > 0 ? [{
    id: `acq:${acqId}:compra`,
    category: 'compra',
    description: 'Precio de compra',
    amount: acquisition.costCompra,
    date: acquisition.acquisitionDate || new Date().toISOString().slice(0, 10),
  }] : [];

  const mergedCosts = [
    ...otherCosts.filter((c) => c.id !== `acq:${acqId}:compra`),
    ...purchaseCostEntry,
    ...newCosts,
  ];

  const updatedVehicle = buildVehicleDocument(vehicle.user_id, {
    ...vehicle,
    registrationPlate: acquisition.registrationPlate || vehicle.registrationPlate,
    purchasePrice: acquisition.costCompra || vehicle.purchasePrice,
    purchaseDate: acquisition.acquisitionDate || vehicle.purchaseDate,
    origin: originMap[acquisition.acquisitionType] || vehicle.origin,
    supplierName: acquisition.sellerName || vehicle.supplierName,
    associatedCosts: mergedCosts,
    acquisitionId: acquisition._id,
    tradeInId: acquisition.tradeInId || vehicle.tradeInId,
  }, vehicle, vehicle.business_id);

  await putDocument(req, VEHICLES_DB, vehicle._id, updatedVehicle);
  return updatedVehicle;
}

export async function acceptTradeInFlow(req, {
  userId,
  tradeInId,
  businessId = null,
  note = '',
  acceptedValue,
}) {
  await ensureDatabase(req, VEHICLES_DB);
  const existing = await getDocument(req, VEHICLES_DB, tradeInId);
  if (!existing || existing.type !== 'tradein' || existing.user_id !== userId || existing.deletedAt) {
    const err = new Error('Tasación no encontrada');
    err.status = 404;
    throw err;
  }

  if (existing.status === 'accepted') {
    const err = new Error('La tasación ya fue aceptada');
    err.status = 409;
    throw err;
  }
  if (existing.status === 'rejected') {
    const err = new Error('No se puede aceptar una tasación rechazada');
    err.status = 400;
    throw err;
  }
  if (existing.linkedVehicleId && existing.linkedAcquisitionId) {
    const err = new Error('La tasación ya tiene compra y vehículo vinculados');
    err.status = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const finalAcceptedValue = Number.isFinite(Number(acceptedValue))
    ? Number(acceptedValue)
    : Number(existing.acceptedValue ?? existing.recommendedPrice ?? existing.estimatedValue ?? 0);

  if (finalAcceptedValue <= 0) {
    const err = new Error('Indica un precio de compra válido para aceptar la tasación');
    err.status = 400;
    throw err;
  }

  const scopeBusinessId = businessId || existing.business_id || null;
  const crmClient = await findCrmClient(req, userId, {
    phone: existing.ownerPhone,
    email: existing.ownerEmail,
    businessId: scopeBusinessId,
  });

  const vehicleLabel = `${existing.brand} ${existing.model}`.trim();
  const vehiclePayload = {
    brand: existing.brand,
    model: existing.model,
    version: existing.version,
    year: existing.year,
    mileage: existing.mileage,
    color: existing.color || '',
    fuelType: existing.fuelType,
    registrationPlate: existing.registrationPlate || '',
    vin: existing.vin,
    transmission: existing.transmission,
    purchasePrice: finalAcceptedValue,
    purchaseDate: today,
    origin: 'particular',
    supplierName: existing.ownerName || '',
    status: 'available',
    notes: existing.notes,
    tradeInId: existing._id,
    business_id: scopeBusinessId,
  };

  const vehicleDoc = buildVehicleDocument(userId, vehiclePayload, null, scopeBusinessId);
  const purchaseCost = {
    id: `cost:${uuidv4()}`,
    category: 'compra',
    description: 'Precio de compra (tasación aceptada)',
    amount: finalAcceptedValue,
    date: today,
  };
  vehicleDoc.associatedCosts = [purchaseCost];

  await putDocument(req, VEHICLES_DB, vehicleDoc._id, vehicleDoc);

  const acquisitionDoc = buildVehicleAcquisitionDocument(userId, {
    vehicleId: vehicleDoc._id,
    registrationPlate: vehicleDoc.registrationPlate,
    acquisitionType: 'compra_particular',
    sellerType: 'particular',
    sellerName: existing.ownerName || 'Particular',
    sellerPhone: existing.ownerPhone,
    sellerEmail: existing.ownerEmail,
    supplierId: crmClient?._id || existing.clientId || '',
    costCompra: finalAcceptedValue,
    acquisitionDate: today,
    status: 'aprobada',
    tradeInId: existing._id,
    notes: existing.notes,
    internalNotes: note || 'Generada automáticamente al aceptar tasación',
    statusHistory: [{
      status: 'aprobada',
      date: now,
      userId,
      note: note || 'Compra creada desde tasación aceptada',
    }],
    business_id: scopeBusinessId,
  }, null, scopeBusinessId);

  await putDocument(req, VEHICLES_DB, acquisitionDoc._id, acquisitionDoc);

  const syncedVehicle = await syncAcquisitionToVehicle(req, acquisitionDoc, vehicleDoc);

  const tradeInHistory = appendHistory(existing.statusHistory, {
    id: `hist:${uuidv4()}`,
    action: 'accepted',
    status: 'accepted',
    date: now,
    userId,
    note: note || 'Tasación aceptada — compra y vehículo generados',
    linkedVehicleId: vehicleDoc._id,
    linkedAcquisitionId: acquisitionDoc._id,
  });

  const updatedTradeIn = {
    ...existing,
    status: 'accepted',
    acceptedValue: finalAcceptedValue,
    linkedVehicleId: vehicleDoc._id,
    linkedAcquisitionId: acquisitionDoc._id,
    clientId: crmClient?._id || existing.clientId || undefined,
    statusHistory: tradeInHistory,
    updatedAt: now,
  };
  await putDocument(req, VEHICLES_DB, updatedTradeIn._id, updatedTradeIn);

  const vehicleWithLinks = buildVehicleDocument(userId, {
    ...syncedVehicle,
    tradeInId: existing._id,
    acquisitionId: acquisitionDoc._id,
  }, syncedVehicle, syncedVehicle.business_id);
  await putDocument(req, VEHICLES_DB, vehicleWithLinks._id, vehicleWithLinks);

  if (crmClient) {
    await linkClientVehicleSold(req, userId, crmClient, vehicleLabel, vehicleDoc._id).catch(() => {});
  }

  await writeChangelog(req, {
    entity: 'tradein',
    entityId: existing._id,
    entityLabel: vehicleLabel,
    action: 'accepted',
    actorUserId: userId,
    metadata: {
      linkedVehicleId: vehicleDoc._id,
      linkedAcquisitionId: acquisitionDoc._id,
      clientId: crmClient?._id || null,
    },
  }).catch(() => {});

  await writeChangelog(req, {
    entity: 'vehicle_acquisition',
    entityId: acquisitionDoc._id,
    entityLabel: vehicleLabel,
    action: 'created_from_tradein',
    actorUserId: userId,
    metadata: { tradeInId: existing._id, vehicleId: vehicleDoc._id },
  }).catch(() => {});

  await writeChangelog(req, {
    entity: 'car',
    entityId: vehicleDoc._id,
    entityLabel: vehicleLabel,
    action: 'created_from_tradein',
    actorUserId: userId,
    metadata: { tradeInId: existing._id, acquisitionId: acquisitionDoc._id },
  }).catch(() => {});

  await logAccountActivity(req, {
    type: 'tradein',
    action: 'Tasación aceptada',
    entityId: existing._id,
    entityLabel: vehicleLabel,
    actorUserId: userId,
    targetUserId: userId,
    metadata: {
      vehicleId: vehicleDoc._id,
      acquisitionId: acquisitionDoc._id,
      clientId: crmClient?._id || null,
    },
  }).catch(() => {});

  cacheService.invalidateByPrefix('compraventa');
  cacheService.invalidateDb(VEHICLES_DB);

  broadcastToUser(userId, 'vehicle_updated', { vehicleId: vehicleDoc._id, action: 'created_from_tradein' });
  broadcastToUser(userId, 'vehicle_update', { vehicleId: vehicleDoc._id });
  broadcastToUser(userId, 'tradein_accepted', {
    tradeInId: existing._id,
    vehicleId: vehicleDoc._id,
    acquisitionId: acquisitionDoc._id,
  });

  return {
    tradeIn: updatedTradeIn,
    vehicle: vehicleWithLinks,
    acquisition: acquisitionDoc,
    clientId: crmClient?._id || null,
  };
}
