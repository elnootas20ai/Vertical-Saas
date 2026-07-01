import { v4 as uuidv4 } from 'uuid';
import {
  buildVehicleDocument,
  buildVehicleSubPermissions,
  ensureDatabase,
  findAccountByUserId,
  getAllVehicleDocuments,
  getVehiclesDbName,
  resolveVehicleDbForDoc,
  saveVehicleDocument,
  logAccountActivity,
  listVehiclesByUser,
  sanitizeVehicle,
  writeChangelog,
  normalizeVehicleDocType,
  getCouchConfig,
  buildCouchAuthHeader,
  listSalesByUser,
  listVehicleAcquisitionsByUser,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

// ─── Alerta: creación de vehículo ─────────────────────────────────────────────
// ruleId: rule:1775250778163:2k6v6a
// Guarda un documento de alerta en activity-logs cada vez que se crea un vehículo.
const ACTIVITY_LOGS_DB = 'activity-logs';

async function saveVehicleCreationAlert({ user, vehicleLabel, vehicleId, count }) {
  try {
    const cfg = getCouchConfig(null);
    if (!cfg.baseUrl) return;
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const auth = buildCouchAuthHeader(null);
    const headers = { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) };
    const now = new Date();
    const isBulk = count > 1;

    const doc = {
      _id: `alert:${now.getTime()}:${uuidv4()}`,
      type: 'activity-log',
      timestamp: now.toISOString(),
      user: user || 'system',
      action: isBulk ? 'bulk_create_vehicle' : 'create_vehicle',
      category: 'crud',
      details: isBulk
        ? `Se importaron ${count} vehículos al inventario`
        : `Se creó el vehículo ${vehicleLabel} en el inventario`,
      level: 'info',
      resource: 'vehículo',
      entityId: vehicleId || '',
      ruleId: 'rule:1775250778163:2k6v6a',
    };

    await fetch(`${base}/${ACTIVITY_LOGS_DB}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(doc),
    });
  } catch {
    // Nunca propagar errores del logger de alerta
  }
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function appendVehicleHistory(existingHistory, entry) {
  const history = Array.isArray(existingHistory) ? [...existingHistory] : [];
  history.push({
    id: `vh:${uuidv4()}`,
    action: entry.action,
    label: entry.label,
    note: String(entry.note || '').trim(),
    date: entry.date || new Date().toISOString(),
    userId: entry.userId || '',
    userName: entry.userName || '',
    metadata: entry.metadata || undefined,
  });
  return history;
}

const UI_STATUS_TO_INVENTORY = {
  listo: 'available',
  disponible: 'available',
  available: 'available',
  reservado: 'reserved',
  reserved: 'reserved',
  vendido: 'sold',
  sold: 'sold',
  entregado: 'delivered',
  delivered: 'delivered',
  preparacion: 'workshop',
  workshop: 'workshop',
  entrada: 'received',
  received: 'received',
};

function normalizeIncomingStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  return UI_STATUS_TO_INVENTORY[key] || undefined;
}

async function findVehicleRelations(req, userId, vehicleId, existingVehicle) {
  const [sales, acquisitions] = await Promise.all([
    listSalesByUser(req, userId),
    listVehicleAcquisitionsByUser(req, userId),
  ]);

  const relatedSales = sales.filter((s) => s.vehicleId === vehicleId);
  const relatedAcquisitions = acquisitions.filter((a) => a.vehicleId === vehicleId);
  if (existingVehicle?.acquisitionId) {
    const linked = acquisitions.find((a) => a._id === existingVehicle.acquisitionId);
    if (linked && !relatedAcquisitions.some((a) => a._id === linked._id)) {
      relatedAcquisitions.push(linked);
    }
  }

  const relatedDeliveries = relatedSales.filter((s) => {
    const status = String(s.status || '').toLowerCase();
    return Boolean(s.deliveryDate) || status === 'delivered' || status === 'delivery' || status === 'entregado';
  });

  return {
    compras: relatedAcquisitions.length,
    ventas: relatedSales.length,
    entregas: relatedDeliveries.length,
    hasRelations: relatedAcquisitions.length > 0 || relatedSales.length > 0 || relatedDeliveries.length > 0,
    details: {
      acquisitions: relatedAcquisitions.map((a) => ({ id: a._id, registrationPlate: a.registrationPlate })),
      sales: relatedSales.map((s) => ({ id: s._id || s.id, status: s.status })),
      deliveries: relatedDeliveries.map((s) => ({ id: s._id || s.id, status: s.status })),
    },
  };
}

const ALLOWED_VEHICLE_IMAGE_DATA_PREFIXES = [
  'data:image/jpeg;',
  'data:image/jpg;',
  'data:image/png;',
  'data:image/webp;',
];

function isAllowedVehicleImageValue(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return !normalized.endsWith('.svg');
  }
  return ALLOWED_VEHICLE_IMAGE_DATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function validateVehicleImages(images) {
  if (images === undefined) return null;
  if (!Array.isArray(images)) return { ok: false, error: 'El campo images debe ser un array' };
  const allAllowed = images.every(isAllowedVehicleImageValue);
  if (!allAllowed) {
    return { ok: false, error: 'Formato de imagen no permitido. Solo se aceptan JPG, PNG o WEBP.' };
  }
  return { ok: true };
}

function vehicleChangeDiff(before, after) {
  const TRACKED = [
    'status', 'salePrice', 'purchasePrice', 'registrationPlate', 'mileage', 'location',
    'brand', 'model', 'version', 'year', 'color', 'vin', 'fuelType', 'transmission', 'power', 'notes',
    'assignedTo', 'assignedToName',
    'commercialStatus', 'published', 'featured', 'minimumSalePrice',
    'assignedCommercialId', 'commercialDescription',
  ];
  const diff = {};
  for (const key of TRACKED) {
    const bVal = before?.[key];
    const aVal = after?.[key];
    if (bVal !== aVal) diff[key] = { before: bVal ?? null, after: aVal ?? null };
  }
  return diff;
}

const VEHICLE_FIELD_LABELS = {
  brand: 'Marca',
  model: 'Modelo',
  version: 'Versión',
  year: 'Año',
  registrationPlate: 'Matrícula',
  vin: 'VIN',
  mileage: 'Kilómetros',
  color: 'Color',
  fuelType: 'Combustible',
  transmission: 'Cambio',
  power: 'Potencia',
  purchasePrice: 'Precio compra',
  salePrice: 'Precio venta',
  notes: 'Observaciones',
  location: 'Ubicación',
  status: 'Estado',
};

const STATUS_HISTORY_LABELS = {
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
  delivered: 'Entregado',
  workshop: 'En preparación',
  received: 'Entrada',
  listo: 'Disponible',
  reservado: 'Reservado',
  vendido: 'Vendido',
  entregado: 'Entregado',
  preparacion: 'En preparación',
  entrada: 'Entrada',
};

function formatStatusForHistory(value) {
  const key = String(value || '').trim().toLowerCase();
  return STATUS_HISTORY_LABELS[key] || value || '—';
}

function formatVehicleEditNote(fields) {
  return fields.map((key) => VEHICLE_FIELD_LABELS[key] || key).join(', ');
}

// ─── Margin calculation ──────────────────────────────────────────────────────

function calculateVehicleMargin(vehicle) {
  const purchasePrice = Number(vehicle.purchasePrice || 0);
  const salePrice = Number(vehicle.salePrice || 0);

  const workshopCosts = (Array.isArray(vehicle.workshopRepairs) ? vehicle.workshopRepairs : [])
    .reduce((sum, r) => sum + Number(r.cost || r.amount || 0), 0);
  const associatedCostsTotal = (Array.isArray(vehicle.associatedCosts) ? vehicle.associatedCosts : [])
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const totalPreparationCost = Number((workshopCosts + associatedCostsTotal).toFixed(2));
  const totalInvestment = purchasePrice + totalPreparationCost;
  const estimatedMargin = salePrice > 0 ? Number((salePrice - totalInvestment).toFixed(2)) : null;
  const marginPercentage = totalInvestment > 0 && salePrice > 0
    ? Number(((estimatedMargin / totalInvestment) * 100).toFixed(1))
    : null;

  return { totalPreparationCost, estimatedMargin, marginPercentage };
}

// ─── Commercial status transitions ──────────────────────────────────────────

const VALID_COMMERCIAL_TRANSITIONS = {
  preparation: ['ready'],
  ready: ['published', 'preparation'],
  published: ['reserved', 'ready'],
  reserved: ['sold', 'published'],
  sold: [],
};

const COMMERCIAL_TO_INVENTORY_STATUS = {
  ready: 'available',
  published: 'available',
  reserved: 'reserved',
  sold: 'sold',
};

function validateCommercialTransition(from, to, vehicle) {
  const allowed = VALID_COMMERCIAL_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { ok: false, error: `No se puede pasar de "${from}" a "${to}".` };
  }

  if (to === 'ready') {
    const errors = [];
    if (!vehicle.salePrice || vehicle.salePrice <= 0) errors.push('El vehículo debe tener un precio de venta.');
    if (!vehicle.images?.length) errors.push('El vehículo debe tener al menos una foto.');
    if (!vehicle.commercialDescription?.trim()) errors.push('El vehículo debe tener una descripción comercial.');
    if (vehicle.minimumSalePrice && vehicle.salePrice < vehicle.minimumSalePrice) {
      errors.push(`El precio (${vehicle.salePrice} €) está por debajo del mínimo (${vehicle.minimumSalePrice} €).`);
    }
    if (errors.length) return { ok: false, error: 'No se puede marcar como listo para vender.', details: errors };
  }

  if (to === 'published') {
    const activeChannels = (vehicle.publicationChannels || []).filter((ch) => ch.active);
    if (!activeChannels.length) {
      return { ok: false, error: 'Debe haber al menos un canal de publicación activo para publicar.' };
    }
  }

  return { ok: true };
}

async function ensureVehicleOwner(req, userId, vehicleId) {
  const { doc: vehicle } = await resolveVehicleDbForDoc(req, vehicleId);

  if (!vehicle || vehicle.type !== 'car' || vehicle.active === false || vehicle.user_id !== userId) {
    return null;
  }

  return vehicle;
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

async function findDuplicateByPlate(req, userId, registrationPlate, excludeVehicleId) {
  if (!registrationPlate) return null;
  const plate = registrationPlate.toUpperCase();
  const docs = await getAllVehicleDocuments(req);
  const match = docs.find(
    (doc) =>
      doc?.type === 'car'
      && doc.active !== false
      && !doc.deletedAt
      && doc.user_id === userId
      && String(doc.registrationPlate || '').toUpperCase() === plate
      && doc._id !== excludeVehicleId,
  );
  return match
    ? { vehicleId: match._id, brand: match.brand, model: match.model, status: match.status }
    : null;
}

async function findDuplicateByVin(req, userId, vin, excludeVehicleId) {
  if (!vin) return null;
  const normalizedVin = vin.toUpperCase();
  const docs = await getAllVehicleDocuments(req);
  const match = docs.find(
    (doc) =>
      doc?.type === 'car'
      && doc.active !== false
      && !doc.deletedAt
      && doc.user_id === userId
      && String(doc.vin || '').toUpperCase() === normalizedVin
      && doc._id !== excludeVehicleId,
  );
  return match
    ? {
      vehicleId: match._id,
      brand: match.brand,
      model: match.model,
      registrationPlate: match.registrationPlate,
      status: match.status,
    }
    : null;
}

export async function checkDuplicates(req, res) {
  try {
    const { userId } = req.params;
    const { registrationPlate, vin, excludeVehicleId } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureDatabase(req, getVehiclesDbName());
    const excludeId = String(excludeVehicleId || '').trim() || undefined;
    const [plate, vinResult] = await Promise.all([
      findDuplicateByPlate(req, userId, registrationPlate, excludeId),
      findDuplicateByVin(req, userId, vin, excludeId),
    ]);

    return res.json({ ok: true, plate, vin: vinResult });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al comprobar duplicados' });
  }
}

function stripFinancials(vehicle) {
  const { purchasePrice, totalCosts, margin, marginPercent, associatedCosts, priceHistory, ...rest } = vehicle;
  return rest;
}

export async function listVehicles(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.query.businessId || '').trim() || null;
    const requestingUserId = req.auth?.userId || userId;

    if (!userId) {
      return badRequest(res, 'Falta userId');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const role = req.auth?.role || account.role || 'Usuario';
    const vehiclePerms = buildVehicleSubPermissions(role, account.vehicleSubPermissions);

    const includeArchived = String(req.query.includeArchived || '').trim() === 'true';
    const raw = await listVehiclesByUser(req, userId, businessId, { includeArchived });
    let sanitized = raw.map(sanitizeVehicle);

    if (!vehiclePerms.canViewAllStock && requestingUserId !== userId) {
      sanitized = sanitized.filter((v) => v.assignedTo === requestingUserId || !v.assignedTo);
    }

    if (!vehiclePerms.canViewFinancials && !vehiclePerms.canSeeMargins) {
      sanitized = sanitized.map(stripFinancials);
    }

    const { items, meta } = applyQueryOptions(sanitized, req.query);
    return res.json({ ok: true, vehicles: items, meta });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar vehículos',
    });
  }
}

export async function createVehicle(req, res) {
  try {
    const { userId } = req.params;
    const { businessId } = req.body || {};
    let { vehicle } = req.body || {};

    if (!userId) {
      return badRequest(res, 'Falta userId');
    }

    if (!vehicle?.brand || !vehicle?.model || !vehicle?.year) {
      return badRequest(res, 'Faltan campos obligatorios del vehículo (marca, modelo, año)');
    }
    if (vehicle.purchasePrice !== undefined && vehicle.purchasePrice !== null && typeof vehicle.purchasePrice !== 'number') {
      return badRequest(res, 'El precio de compra debe ser un número');
    }

    const imageValidation = validateVehicleImages(vehicle.images);
    if (imageValidation && !imageValidation.ok) {
      return badRequest(res, imageValidation.error);
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    await ensureDatabase(req, getVehiclesDbName());

    const duplicates = {};
    const [plateDup, vinDup] = await Promise.all([
      findDuplicateByPlate(req, userId, vehicle.registrationPlate),
      findDuplicateByVin(req, userId, vehicle.vin),
    ]);
    if (plateDup) duplicates.plate = plateDup;
    if (vinDup) duplicates.vin = vinDup;
    if (Object.keys(duplicates).length > 0 && !req.body.forceDuplicate) {
      return res.status(409).json({ ok: false, error: 'Vehículo duplicado detectado', duplicates });
    }

    // Enrich with entry metadata
    const entryChannel = vehicle.entryChannel || 'entry_page';
    const hasPhotos = Array.isArray(vehicle.images) && vehicle.images.length > 0;
    const hasDocs = Array.isArray(vehicle.documents) && vehicle.documents.length > 0;
    const hasFichaTecnica = hasDocs && vehicle.documents.some((d) => d.documentType === 'ficha_tecnica');
    const hasPermiso = hasDocs && vehicle.documents.some((d) => d.documentType === 'permiso_circulacion');
    const entryStatus = (hasPhotos && (hasFichaTecnica || hasPermiso)) ? 'complete' : 'partial';

    vehicle.entryDate = vehicle.entryDate || vehicle.purchaseDate || new Date().toISOString().slice(0, 10);
    vehicle.entryStatus = entryStatus;
    vehicle.enteredBy = userId;
    vehicle.entryValidated = null;

    // Auto-create initial purchase cost
    if (vehicle.purchasePrice && Number(vehicle.purchasePrice) > 0) {
      const initialCost = {
        id: `cost:${uuidv4()}`,
        category: 'compra',
        description: 'Precio de compra',
        amount: Number(vehicle.purchasePrice),
        date: vehicle.purchaseDate || new Date().toISOString().slice(0, 10),
      };
      vehicle.associatedCosts = [initialCost, ...(Array.isArray(vehicle.associatedCosts) ? vehicle.associatedCosts : [])];
    }

    const mappedStatus = normalizeIncomingStatus(vehicle.status) || 'available';
    vehicle.status = mappedStatus;
    vehicle.createdByUserId = userId;
    vehicle.createdByName = account.fullName || userId;
    vehicle.vehicleHistory = appendVehicleHistory([], {
      action: 'created',
      label: 'Vehículo creado',
      note: `${vehicle.brand} ${vehicle.model}${vehicle.registrationPlate ? ` · ${vehicle.registrationPlate}` : ''}`,
      userId,
      userName: account.fullName || userId,
    });

    const nextVehicle = buildVehicleDocument(userId, vehicle, null, businessId || null);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'vehicle',
      action: `Añadió vehículo ${nextVehicle.brand} ${nextVehicle.model} ${nextVehicle.year}`,
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: {
        registrationPlate: nextVehicle.registrationPlate,
        entryChannel,
        entryStatus,
        duplicateWarnings: Object.keys(duplicates).length > 0 ? duplicates : undefined,
      },
    });
    await writeChangelog(req, {
      entity: 'vehicle',
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      action: 'create',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { after: { brand: nextVehicle.brand, model: nextVehicle.model, year: nextVehicle.year, status: nextVehicle.status, purchasePrice: nextVehicle.purchasePrice } },
      metadata: { registrationPlate: nextVehicle.registrationPlate, entryChannel },
    });

    // Fire creation alert (was dead code, now active)
    saveVehicleCreationAlert({
      user: account.fullName || userId,
      vehicleLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      vehicleId: nextVehicle._id,
      count: 1,
    }).catch(() => {});

    return res.status(201).json({
      ok: true,
      vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear el vehículo',
    });
  }
}

export async function bulkCreateVehicles(req, res) {
  try {
    const { userId } = req.params;
    const { vehicles, businessId } = req.body || {};

    if (!userId) {
      return badRequest(res, 'Falta userId');
    }

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return badRequest(res, 'Debes enviar una lista de vehículos');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    await ensureDatabase(req, getVehiclesDbName());
    const createdVehicles = [];

    for (const vehicle of vehicles) {
      const nextVehicle = buildVehicleDocument(userId, vehicle, null, businessId || null);
      const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
      createdVehicles.push(sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }));
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'vehicle',
      action: `Importó ${createdVehicles.length} vehículo${createdVehicles.length === 1 ? '' : 's'}`,
      entityId: '',
      entityLabel: 'Importación de stock',
      metadata: {
        count: createdVehicles.length,
      },
    });

    return res.status(201).json({
      ok: true,
      vehicles: createdVehicles,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al importar vehículos',
    });
  }
}

export async function updateVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    let { vehicle } = req.body || {};
    const { priceChangeReason, priceChangeReasonCategory } = req.body || {};

    if (!vehicle || typeof vehicle !== 'object') {
      return badRequest(res, 'Faltan datos del vehículo');
    }

    const imageValidation = validateVehicleImages(vehicle.images);
    if (imageValidation && !imageValidation.ok) {
      return badRequest(res, imageValidation.error);
    }

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    // Duplicate check on plate/vin change
    const plateChanged = vehicle.registrationPlate && vehicle.registrationPlate.toUpperCase() !== (existingVehicle.registrationPlate || '').toUpperCase();
    const vinChanged = vehicle.vin && vehicle.vin.toUpperCase() !== (existingVehicle.vin || '').toUpperCase();
    if (plateChanged || vinChanged) {
      const [plateDup, vinDup] = await Promise.all([
        plateChanged ? findDuplicateByPlate(req, userId, vehicle.registrationPlate, vehicleId) : null,
        vinChanged ? findDuplicateByVin(req, userId, vehicle.vin, vehicleId) : null,
      ]);
      const duplicates = {};
      if (plateDup) duplicates.plate = plateDup;
      if (vinDup) duplicates.vin = vinDup;
      if (Object.keys(duplicates).length > 0) {
        return res.status(409).json({ ok: false, error: 'Vehículo duplicado detectado', duplicates });
      }
    }

    // Detect salePrice change and append to priceHistory
    const oldPrice = existingVehicle.salePrice ?? null;
    const newPrice = vehicle.salePrice !== undefined ? (Number(vehicle.salePrice) || null) : oldPrice;
    let updatedPriceHistory = Array.isArray(existingVehicle.priceHistory) ? [...existingVehicle.priceHistory] : [];
    if (newPrice !== oldPrice) {
      const reasonText = String(priceChangeReason || '').trim() || 'Sin motivo especificado';
      const variation = oldPrice ? Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(1)) : null;
      updatedPriceHistory = [
        ...updatedPriceHistory,
        {
          id: `ph:${uuidv4()}`,
          date: new Date().toISOString(),
          userId,
          userName: account.fullName || userId,
          oldPrice,
          newPrice,
          reason: reasonText,
          reasonCategory: String(priceChangeReasonCategory || 'other').trim(),
          priceVariation: variation,
        },
      ];
    }

    // Commercial status transition
    const oldCommercialStatus = existingVehicle.commercialStatus || 'preparation';
    const newCommercialStatus = vehicle.commercialStatus || oldCommercialStatus;
    let updatedCommercialHistory = Array.isArray(existingVehicle.commercialStatusHistory)
      ? [...existingVehicle.commercialStatusHistory]
      : [];

    if (newCommercialStatus !== oldCommercialStatus) {
      const mergedForValidation = { ...existingVehicle, ...vehicle };
      const transition = validateCommercialTransition(oldCommercialStatus, newCommercialStatus, mergedForValidation);
      if (!transition.ok) {
        return res.status(400).json({
          ok: false,
          error: transition.error,
          details: transition.details || [],
          code: 'INVALID_COMMERCIAL_TRANSITION',
        });
      }

      updatedCommercialHistory.push({
        id: `csh:${uuidv4()}`,
        date: new Date().toISOString(),
        userId,
        userName: account.fullName || userId,
        fromStatus: oldCommercialStatus,
        toStatus: newCommercialStatus,
        reason: String(vehicle.commercialStatusReason || '').trim() || '',
      });

      // Sync inventory status
      const inventoryStatus = COMMERCIAL_TO_INVENTORY_STATUS[newCommercialStatus];
      if (inventoryStatus) {
        vehicle.status = inventoryStatus;
      }

      // Auto-set published flag
      if (newCommercialStatus === 'published') {
        vehicle.published = true;
      } else if (newCommercialStatus === 'ready' && oldCommercialStatus === 'published') {
        vehicle.published = false;
      }
    }

    // Calculate margin
    const mergedForMargin = { ...existingVehicle, ...vehicle };
    const { totalPreparationCost, estimatedMargin, marginPercentage } = calculateVehicleMargin(mergedForMargin);
    vehicle.totalPreparationCost = totalPreparationCost;
    vehicle.estimatedMargin = estimatedMargin;
    vehicle.marginPercentage = marginPercentage;

    // Detect price below minimum
    const effectiveSalePrice = Number(vehicle.salePrice ?? existingVehicle.salePrice ?? 0);
    const effectiveMinimum = Number(vehicle.minimumSalePrice ?? existingVehicle.minimumSalePrice ?? 0);
    if (effectiveMinimum > 0 && effectiveSalePrice > 0 && effectiveSalePrice < effectiveMinimum) {
      const vehicleConfig = account.vehicleConfig || {};
      if (vehicleConfig.blockPriceBelowMinimum) {
        return res.status(400).json({
          ok: false,
          error: `El precio de venta (${effectiveSalePrice} €) está por debajo del mínimo configurado (${effectiveMinimum} €).`,
          code: 'PRICE_BELOW_MINIMUM',
        });
      }
    }

    let updatedVehicleHistory = Array.isArray(existingVehicle.vehicleHistory) ? [...existingVehicle.vehicleHistory] : [];

    if (vehicle.status !== undefined) {
      const mapped = normalizeIncomingStatus(vehicle.status);
      if (mapped) vehicle.status = mapped;
    }

    const oldStatus = existingVehicle.status;
    const effectiveNewStatus = vehicle.status !== undefined ? vehicle.status : oldStatus;
    if (effectiveNewStatus !== oldStatus) {
      updatedVehicleHistory = appendVehicleHistory(updatedVehicleHistory, {
        action: 'status_changed',
        label: 'Cambio de estado',
        note: `${formatStatusForHistory(oldStatus)} → ${formatStatusForHistory(effectiveNewStatus)}`,
        userId,
        userName: account.fullName || userId,
        metadata: { from: oldStatus, to: effectiveNewStatus },
      });
    }

    const oldImages = Array.isArray(existingVehicle.images) ? existingVehicle.images : [];
    const newImages = vehicle.images !== undefined
      ? (Array.isArray(vehicle.images) ? vehicle.images : oldImages)
      : oldImages;
    if (vehicle.images !== undefined && newImages.length !== oldImages.length) {
      const delta = newImages.length - oldImages.length;
      updatedVehicleHistory = appendVehicleHistory(updatedVehicleHistory, {
        action: delta > 0 ? 'photo_added' : 'photo_removed',
        label: delta > 0 ? 'Fotografías añadidas' : 'Fotografías eliminadas',
        note: `${Math.abs(delta)} foto(s)`,
        userId,
        userName: account.fullName || userId,
      });
    } else if (
      vehicle.images !== undefined
      && newImages.length === oldImages.length
      && JSON.stringify(newImages) !== JSON.stringify(oldImages)
    ) {
      updatedVehicleHistory = appendVehicleHistory(updatedVehicleHistory, {
        action: 'photo_reordered',
        label: 'Galería actualizada',
        note: 'Reordenación o cambio de fotografía principal',
        userId,
        userName: account.fullName || userId,
      });
    }

    const patchDiff = vehicleChangeDiff(existingVehicle, { ...existingVehicle, ...vehicle, status: effectiveNewStatus });
    const editFields = Object.keys(patchDiff).filter((k) => k !== 'status');
    if (editFields.length > 0 && vehicle.images === undefined) {
      updatedVehicleHistory = appendVehicleHistory(updatedVehicleHistory, {
        action: 'updated',
        label: 'Datos actualizados',
        note: formatVehicleEditNote(editFields),
        userId,
        userName: account.fullName || userId,
      });
    } else if (editFields.length > 0 && vehicle.images !== undefined && newImages.length === oldImages.length) {
      updatedVehicleHistory = appendVehicleHistory(updatedVehicleHistory, {
        action: 'updated',
        label: 'Datos actualizados',
        note: formatVehicleEditNote(editFields),
        userId,
        userName: account.fullName || userId,
      });
    }

    const mergedData = {
      ...existingVehicle,
      ...vehicle,
      priceHistory: updatedPriceHistory,
      commercialStatusHistory: updatedCommercialHistory,
      vehicleHistory: updatedVehicleHistory,
    };
    const nextVehicle = buildVehicleDocument(userId, mergedData, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    const diff = vehicleChangeDiff(existingVehicle, nextVehicle);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'vehicle',
      action: `Actualizó vehículo ${nextVehicle.brand} ${nextVehicle.model}`,
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: { registrationPlate: nextVehicle.registrationPlate, status: nextVehicle.status, commercialStatus: nextVehicle.commercialStatus },
    });
    await writeChangelog(req, {
      entity: 'vehicle',
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      action: 'update',
      actorUserId: userId,
      actorName: account.fullName,
      changes: diff,
      metadata: { registrationPlate: nextVehicle.registrationPlate },
    });

    return res.json({
      ok: true,
      vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar el vehículo',
    });
  }
}

// ─── Dedicated commercial status endpoint ────────────────────────────────────

export async function updateCommercialStatus(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { newStatus, reason } = req.body || {};

    if (!newStatus) return badRequest(res, 'Falta el nuevo estado comercial');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const oldStatus = existingVehicle.commercialStatus || 'preparation';
    const transition = validateCommercialTransition(oldStatus, newStatus, existingVehicle);
    if (!transition.ok) {
      return res.status(400).json({ ok: false, error: transition.error, details: transition.details || [], code: 'INVALID_COMMERCIAL_TRANSITION' });
    }

    const historyEntry = {
      id: `csh:${uuidv4()}`,
      date: new Date().toISOString(),
      userId,
      userName: account.fullName || userId,
      fromStatus: oldStatus,
      toStatus: newStatus,
      reason: String(reason || '').trim(),
    };

    const updates = {
      commercialStatus: newStatus,
      commercialStatusHistory: [...(existingVehicle.commercialStatusHistory || []), historyEntry],
    };

    const inventoryStatus = COMMERCIAL_TO_INVENTORY_STATUS[newStatus];
    if (inventoryStatus) updates.status = inventoryStatus;

    if (newStatus === 'published') updates.published = true;
    else if (newStatus === 'ready' && oldStatus === 'published') updates.published = false;
    if (newStatus === 'sold') updates.soldAt = new Date().toISOString();

    const mergedData = { ...existingVehicle, ...updates };
    const nextVehicle = buildVehicleDocument(userId, mergedData, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId, type: 'vehicle',
      action: `Cambió estado comercial de ${existingVehicle.brand} ${existingVehicle.model} a "${newStatus}"`,
      entityId: nextVehicle._id, entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: { from: oldStatus, to: newStatus, registrationPlate: nextVehicle.registrationPlate },
    });

    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cambiar estado comercial' });
  }
}

// ─── Warranty CRUD ────────────────────────────────────────────────────────────

export async function addWarranty(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { warranty } = req.body || {};
    if (!warranty || typeof warranty !== 'object') return badRequest(res, 'Faltan datos de garantía');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const newWarranty = {
      id: `w:${uuidv4()}`,
      type: ['factory', 'own'].includes(warranty.type) ? warranty.type : 'own',
      provider: String(warranty.provider || '').trim(),
      startDate: String(warranty.startDate || '').trim() || undefined,
      endDate: String(warranty.endDate || '').trim() || undefined,
      coverage: String(warranty.coverage || '').trim(),
      claims: [],
    };
    const warranties = [...(existingVehicle.warranties || []), newWarranty];
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, warranties }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.status(201).json({ ok: true, warranty: newWarranty, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir garantía' });
  }
}

export async function updateWarranty(req, res) {
  try {
    const { userId, vehicleId, warrantyId } = req.params;
    const { warranty } = req.body || {};
    if (!warranty) return badRequest(res, 'Faltan datos de garantía');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const warranties = (existingVehicle.warranties || []).map((w) =>
      w.id === warrantyId ? { ...w, ...warranty, id: warrantyId } : w,
    );
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, warranties }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar garantía' });
  }
}

export async function deleteWarranty(req, res) {
  try {
    const { userId, vehicleId, warrantyId } = req.params;
    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const warranties = (existingVehicle.warranties || []).filter((w) => w.id !== warrantyId);
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, warranties }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar garantía' });
  }
}

export async function addWarrantyClaim(req, res) {
  try {
    const { userId, vehicleId, warrantyId } = req.params;
    const { claim } = req.body || {};
    if (!claim) return badRequest(res, 'Faltan datos de reclamación');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const newClaim = { id: `cl:${uuidv4()}`, date: claim.date || new Date().toISOString().slice(0, 10), description: String(claim.description || '').trim(), resolved: false };
    const warranties = (existingVehicle.warranties || []).map((w) =>
      w.id === warrantyId ? { ...w, claims: [...(w.claims || []), newClaim] } : w,
    );
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, warranties }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.status(201).json({ ok: true, claim: newClaim, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir reclamación' });
  }
}

// ─── Associated Costs CRUD ────────────────────────────────────────────────────

export async function addAssociatedCost(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { cost } = req.body || {};
    if (!cost || typeof cost !== 'object') return badRequest(res, 'Faltan datos del coste');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const COST_CATEGORIES = ['preparacion', 'itv', 'limpieza', 'fotos', 'publicidad', 'otro'];
    const newCost = {
      id: `cost:${uuidv4()}`,
      category: COST_CATEGORIES.includes(cost.category) ? cost.category : 'otro',
      description: String(cost.description || '').trim(),
      amount: Number.isFinite(Number(cost.amount)) ? Number(cost.amount) : 0,
      date: String(cost.date || new Date().toISOString().slice(0, 10)),
    };
    const associatedCosts = [...(existingVehicle.associatedCosts || []), newCost];
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, associatedCosts }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.status(201).json({ ok: true, cost: newCost, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir coste' });
  }
}

export async function deleteAssociatedCost(req, res) {
  try {
    const { userId, vehicleId, costId } = req.params;
    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const associatedCosts = (existingVehicle.associatedCosts || []).filter((c) => c.id !== costId);
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, associatedCosts }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar coste' });
  }
}

// ─── Vehicle Documents CRUD ──────────────────────────────────────────────────

export async function addVehicleDocument(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const { document: docData } = req.body || {};
    if (!docData || typeof docData !== 'object') return badRequest(res, 'Faltan datos del documento');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const account = await findAccountByUserId(req, userId);

    const newDoc = {
      id: `vdoc:${uuidv4()}`,
      name: String(docData.name || '').trim(),
      documentType: normalizeVehicleDocType(docData.documentType),
      fileUrl: String(docData.fileUrl || '').trim(),
      fileName: String(docData.fileName || '').trim(),
      mimeType: String(docData.mimeType || '').trim(),
      fileSize: typeof docData.fileSize === 'number' ? docData.fileSize : 0,
      attachmentName: String(docData.attachmentName || '').trim(),
      notes: String(docData.notes || '').trim(),
      expiresAt: docData.expiresAt || null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: String(docData.uploadedBy || userId).trim(),
    };
    const documents = [...(existingVehicle.documents || []), newDoc];
    const vehicleHistory = appendVehicleHistory(existingVehicle.vehicleHistory, {
      action: 'document_added',
      label: 'Documento añadido',
      note: newDoc.name || newDoc.fileName || newDoc.documentType,
      userId,
      userName: account?.fullName || userId,
    });
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, documents, vehicleHistory }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.status(201).json({ ok: true, document: newDoc, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al añadir documento' });
  }
}

export async function updateVehicleDocument(req, res) {
  try {
    const { userId, vehicleId, documentId } = req.params;
    const { document: docData } = req.body || {};
    if (!docData) return badRequest(res, 'Faltan datos del documento');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const documents = (existingVehicle.documents || []).map((d) =>
      d.id === documentId
        ? {
            ...d,
            name: docData.name !== undefined ? String(docData.name).trim() : d.name,
            documentType: docData.documentType ? normalizeVehicleDocType(docData.documentType) : d.documentType,
            notes: docData.notes !== undefined ? String(docData.notes).trim() : d.notes,
            expiresAt: docData.expiresAt !== undefined ? docData.expiresAt : d.expiresAt,
          }
        : d,
    );
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, documents }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar documento' });
  }
}

export async function removeVehicleDocument(req, res) {
  try {
    const { userId, vehicleId, documentId } = req.params;
    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });

    const account = await findAccountByUserId(req, userId);
    const removed = (existingVehicle.documents || []).find((d) => d.id === documentId);
    const documents = (existingVehicle.documents || []).filter((d) => d.id !== documentId);
    const vehicleHistory = appendVehicleHistory(existingVehicle.vehicleHistory, {
      action: 'document_removed',
      label: 'Documento eliminado',
      note: removed?.name || removed?.fileName || documentId,
      userId,
      userName: account?.fullName || userId,
    });
    const nextVehicle = buildVehicleDocument(userId, { ...existingVehicle, documents, vehicleHistory }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar documento' });
  }
}

export async function getVehicleRelations(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    if (!userId || !vehicleId) return badRequest(res, 'Faltan parámetros');

    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    if (!existingVehicle) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    const relations = await findVehicleRelations(req, userId, vehicleId, existingVehicle);
    return res.json({ ok: true, ...relations });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al comprobar relaciones del vehículo',
    });
  }
}

export async function archiveVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    const account = await findAccountByUserId(req, userId);

    if (!existingVehicle || !account) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    if (existingVehicle.archived) {
      return res.json({ ok: true, vehicle: sanitizeVehicle(existingVehicle) });
    }

    const now = new Date().toISOString();
    const vehicleHistory = appendVehicleHistory(existingVehicle.vehicleHistory, {
      action: 'archived',
      label: 'Vehículo archivado',
      note: 'Retirado del listado principal',
      userId,
      userName: account.fullName || userId,
      metadata: { archivedAt: now, previousStatus: existingVehicle.status || null },
    });

    const nextVehicle = buildVehicleDocument(userId, {
      ...existingVehicle,
      archived: true,
      archivedAt: now,
      statusBeforeArchive: existingVehicle.status || null,
      vehicleHistory,
    }, existingVehicle);
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'vehicle',
      action: `Archivó vehículo ${nextVehicle.brand} ${nextVehicle.model}`,
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: { registrationPlate: nextVehicle.registrationPlate, archivedAt: now },
    });
    await writeChangelog(req, {
      entity: 'vehicle',
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      action: 'archive',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { before: { archived: false }, after: { archived: true, archivedAt: now } },
    });

    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al archivar el vehículo',
    });
  }
}

export async function restoreVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    const account = await findAccountByUserId(req, userId);

    if (!existingVehicle || !account) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    if (!existingVehicle.archived) {
      return res.json({ ok: true, vehicle: sanitizeVehicle(existingVehicle) });
    }

    const now = new Date().toISOString();
    const vehicleHistory = appendVehicleHistory(existingVehicle.vehicleHistory, {
      action: 'restored',
      label: 'Vehículo restaurado',
      note: 'Vuelve al listado principal como Disponible',
      userId,
      userName: account.fullName || userId,
      metadata: { restoredAt: now },
    });

    const nextVehicle = buildVehicleDocument(userId, {
      ...existingVehicle,
      archived: false,
      statusBeforeArchive: null,
      status: 'available',
      vehicleHistory,
    }, existingVehicle);
    nextVehicle.archivedAt = null;
    const saved = await saveVehicleDocument(req, nextVehicle._id, nextVehicle);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'vehicle',
      action: `Restauró vehículo ${nextVehicle.brand} ${nextVehicle.model}`,
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model}`.trim(),
      metadata: { registrationPlate: nextVehicle.registrationPlate, restoredAt: now },
    });
    await writeChangelog(req, {
      entity: 'vehicle',
      entityId: nextVehicle._id,
      entityLabel: `${nextVehicle.brand} ${nextVehicle.model} (${nextVehicle.registrationPlate})`,
      action: 'restore',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { before: { archived: true, status: existingVehicle.status }, after: { archived: false, status: 'available' } },
    });

    return res.json({ ok: true, vehicle: sanitizeVehicle({ ...nextVehicle, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al restaurar el vehículo',
    });
  }
}

export async function removeVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    const existingVehicle = await ensureVehicleOwner(req, userId, vehicleId);
    const account = await findAccountByUserId(req, userId);

    if (!existingVehicle || !account) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    const relations = await findVehicleRelations(req, userId, vehicleId, existingVehicle);
    if (relations.hasRelations) {
      return res.status(409).json({
        ok: false,
        error: 'Este vehículo tiene operaciones asociadas y no puede eliminarse.',
        relations,
      });
    }

    const now = new Date().toISOString();
    const vehicleHistory = appendVehicleHistory(existingVehicle.vehicleHistory, {
      action: 'deleted',
      label: 'Vehículo eliminado',
      note: 'Eliminado del inventario',
      userId,
      userName: account.fullName || userId,
      metadata: { deletedAt: now },
    });

    const nextVehicle = buildVehicleDocument(userId, {
      ...existingVehicle,
      vehicleHistory,
    }, existingVehicle);
    nextVehicle.deletedAt = now;
    await saveVehicleDocument(req, nextVehicle._id, nextVehicle);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'vehicle',
      action: `Eliminó vehículo ${existingVehicle.brand} ${existingVehicle.model}`,
      entityId: existingVehicle._id,
      entityLabel: `${existingVehicle.brand} ${existingVehicle.model}`.trim(),
      metadata: { registrationPlate: existingVehicle.registrationPlate },
    });
    await writeChangelog(req, {
      entity: 'vehicle',
      entityId: existingVehicle._id,
      entityLabel: `${existingVehicle.brand} ${existingVehicle.model} (${existingVehicle.registrationPlate})`,
      action: 'delete',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { before: { brand: existingVehicle.brand, model: existingVehicle.model, status: existingVehicle.status, registrationPlate: existingVehicle.registrationPlate } },
      metadata: { registrationPlate: existingVehicle.registrationPlate },
    });

    return res.json({ ok: true, id: vehicleId });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar el vehículo',
    });
  }
}
