import {
  getCleaningDbName,
  getCatalogDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  buildCatalogItemDocument,
  sanitizeCatalogItem,
  listCatalogItemsByUser,
  buildCleaningServiceDocument,
  sanitizeCleaningService,
} from '../services/couchdb.js';

import {
  buildMaterialDeliveryDocument, sanitizeMaterialDelivery,
  listMaterialDeliveriesByUser, listMaterialDeliveriesByWorker, listMaterialDeliveriesByService,
  buildMaterialReturnDocument, sanitizeMaterialReturn, listMaterialReturnsByUser,
  buildMaterialRequestDocument, sanitizeMaterialRequest, listMaterialRequestsByUser,
  buildMaterialInventoryCountDocument, sanitizeMaterialInventoryCount,
  listCleaningMaterials, getCleaningMaterialsSummary,
  MATERIAL_TYPES,
} from '../services/cleaningMaterials.js';
import {
  processDeliveryStockDeduction,
  processReturnStockAddition,
} from '../services/materialStockService.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureDocOwner(req, userId, docId, docType) {
  const db = docType === 'catalog_item' ? getCatalogDbName() : getCleaningDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, docId);
  if (!doc || doc.type !== docType || doc.user_id !== userId) return null;
  return doc;
}

// ─── CLEANING MATERIALS (Catalog items with subtype) ─────────────────────────

export async function listMaterials(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { materialType } = req.query;
    let items = await listCleaningMaterials(req, userId);
    if (materialType && MATERIAL_TYPES.includes(materialType)) {
      items = items.filter((i) => i.materialType === materialType);
    }
    return res.json({ ok: true, materials: items.map(sanitizeCatalogItem) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar materiales' });
  }
}

export async function createMaterial(req, res) {
  try {
    const { userId } = req.params;
    const { material } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!material || typeof material !== 'object') return badRequest(res, 'Falta el objeto material');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const data = {
      ...material,
      subtype: 'cleaning_material',
      vertical: 'cleaning',
      itemType: 'product',
      materialType: MATERIAL_TYPES.includes(material.materialType) ? material.materialType : 'other',
      dilutionRatio: String(material.dilutionRatio || ''),
      safetySheetUrl: String(material.safetySheetUrl || ''),
      usageInstructions: String(material.usageInstructions || ''),
      expirationMonths: Number(material.expirationMonths || 0),
      fragrance: String(material.fragrance || ''),
      concentration: String(material.concentration || ''),
      applicationSurface: Array.isArray(material.applicationSurface) ? material.applicationSurface.map(String) : [],
      deliveryUnit: String(material.deliveryUnit || ''),
      deliveryUnitQuantity: Number(material.deliveryUnitQuantity || 0),
      maxPerDelivery: Number(material.maxPerDelivery || 0),
      requiresReturn: Boolean(material.requiresReturn),
      averageConsumptionPerService: Number(material.averageConsumptionPerService || 0),
    };

    const doc = buildCatalogItemDocument(userId, data);
    doc.subtype = 'cleaning_material';
    doc.materialType = data.materialType;
    doc.dilutionRatio = data.dilutionRatio;
    doc.safetySheetUrl = data.safetySheetUrl;
    doc.usageInstructions = data.usageInstructions;
    doc.expirationMonths = data.expirationMonths;
    doc.fragrance = data.fragrance;
    doc.concentration = data.concentration;
    doc.applicationSurface = data.applicationSurface;
    doc.deliveryUnit = data.deliveryUnit;
    doc.deliveryUnitQuantity = data.deliveryUnitQuantity;
    doc.maxPerDelivery = data.maxPerDelivery;
    doc.requiresReturn = data.requiresReturn;
    doc.averageConsumptionPerService = data.averageConsumptionPerService;

    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_material', action: `Creó material ${doc.name}`,
      entityId: doc._id, entityLabel: doc.name,
      metadata: { materialType: doc.materialType, sku: doc.sku },
    });
    return res.status(201).json({ ok: true, material: { ...sanitizeCatalogItem({ ...doc, _rev: saved.rev }), subtype: 'cleaning_material', materialType: doc.materialType } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear material' });
  }
}

export async function updateMaterial(req, res) {
  try {
    const { userId, materialId } = req.params;
    const { material } = req.body || {};
    if (!material || typeof material !== 'object') return badRequest(res, 'Faltan datos del material');

    const existing = await ensureDocOwner(req, userId, materialId, 'catalog_item');
    if (!existing) return res.status(404).json({ ok: false, error: 'Material no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    const merged = { ...existing, ...material };
    const doc = buildCatalogItemDocument(userId, merged, existing);
    doc.subtype = 'cleaning_material';
    doc.materialType = MATERIAL_TYPES.includes(merged.materialType) ? merged.materialType : (existing.materialType || 'other');
    doc.dilutionRatio = String(merged.dilutionRatio ?? existing.dilutionRatio ?? '');
    doc.safetySheetUrl = String(merged.safetySheetUrl ?? existing.safetySheetUrl ?? '');
    doc.usageInstructions = String(merged.usageInstructions ?? existing.usageInstructions ?? '');
    doc.expirationMonths = Number(merged.expirationMonths ?? existing.expirationMonths ?? 0);
    doc.fragrance = String(merged.fragrance ?? existing.fragrance ?? '');
    doc.concentration = String(merged.concentration ?? existing.concentration ?? '');
    doc.applicationSurface = Array.isArray(merged.applicationSurface) ? merged.applicationSurface.map(String) : (existing.applicationSurface || []);
    doc.deliveryUnit = String(merged.deliveryUnit ?? existing.deliveryUnit ?? '');
    doc.deliveryUnitQuantity = Number(merged.deliveryUnitQuantity ?? existing.deliveryUnitQuantity ?? 0);
    doc.maxPerDelivery = Number(merged.maxPerDelivery ?? existing.maxPerDelivery ?? 0);
    doc.requiresReturn = Boolean(merged.requiresReturn ?? existing.requiresReturn);
    doc.averageConsumptionPerService = Number(merged.averageConsumptionPerService ?? existing.averageConsumptionPerService ?? 0);

    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_material', action: `Editó material ${doc.name}`,
      entityId: doc._id, entityLabel: doc.name, metadata: { materialType: doc.materialType },
    });
    return res.json({ ok: true, material: { ...sanitizeCatalogItem({ ...doc, _rev: saved.rev }), subtype: 'cleaning_material', materialType: doc.materialType } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar material' });
  }
}

export async function removeMaterial(req, res) {
  try {
    const { userId, materialId } = req.params;
    const existing = await ensureDocOwner(req, userId, materialId, 'catalog_item');
    if (!existing) return res.status(404).json({ ok: false, error: 'Material no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await softDeleteDocument(req, getCatalogDbName(), materialId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_material', action: `Eliminó material ${existing.name}`,
      entityId: existing._id, entityLabel: existing.name, metadata: {},
    });
    return res.json({ ok: true, id: materialId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar material' });
  }
}

export async function materialsSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const summary = await getCleaningMaterialsSummary(req, userId);
    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen' });
  }
}

// ─── DELIVERIES ──────────────────────────────────────────────────────────────

export async function listDeliveries(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const { workerId, serviceId } = req.query;

    let deliveries;
    if (workerId) {
      deliveries = await listMaterialDeliveriesByWorker(req, userId, workerId);
    } else if (serviceId) {
      deliveries = await listMaterialDeliveriesByService(req, userId, serviceId);
    } else {
      deliveries = await listMaterialDeliveriesByUser(req, userId);
    }
    return res.json({ ok: true, deliveries: deliveries.map(sanitizeMaterialDelivery) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar entregas' });
  }
}

export async function getDelivery(req, res) {
  try {
    const { userId, deliveryId } = req.params;
    const doc = await ensureDocOwner(req, userId, deliveryId, 'material_delivery');
    if (!doc) return res.status(404).json({ ok: false, error: 'Entrega no encontrada' });
    return res.json({ ok: true, delivery: sanitizeMaterialDelivery(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar entrega' });
  }
}

export async function createDelivery(req, res) {
  try {
    const { userId } = req.params;
    const { delivery } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!delivery || typeof delivery !== 'object') return badRequest(res, 'Falta el objeto delivery');
    if (!delivery.workerId) return badRequest(res, 'Falta workerId');
    if (!Array.isArray(delivery.lines) || delivery.lines.length === 0) return badRequest(res, 'La entrega debe tener al menos una línea');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildMaterialDeliveryDocument(userId, delivery);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_delivery', action: `Creó entrega ${doc.deliveryNumber} → ${doc.workerName}`,
      entityId: doc._id, entityLabel: `${doc.deliveryNumber} ${doc.workerName}`.trim(),
      metadata: { status: doc.status, workerName: doc.workerName, linesCount: doc.lines.length },
    });

    return res.status(201).json({ ok: true, delivery: sanitizeMaterialDelivery({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear entrega' });
  }
}

export async function updateDelivery(req, res) {
  try {
    const { userId, deliveryId } = req.params;
    const { delivery } = req.body || {};
    if (!delivery || typeof delivery !== 'object') return badRequest(res, 'Faltan datos de la entrega');

    const existing = await ensureDocOwner(req, userId, deliveryId, 'material_delivery');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrega no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    const doc = buildMaterialDeliveryDocument(userId, { ...existing, ...delivery }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    if (doc.status === 'delivered' && existing.status !== 'delivered') {
      await processDeliveryStockDeduction(req, userId, { ...doc, _rev: saved.rev }).catch(() => {});
    }

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_delivery', action: `Actualizó entrega ${doc.deliveryNumber} → ${doc.status}`,
      entityId: doc._id, entityLabel: `${doc.deliveryNumber} ${doc.workerName}`.trim(),
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, delivery: sanitizeMaterialDelivery({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar entrega' });
  }
}

export async function confirmDelivery(req, res) {
  try {
    const { userId, deliveryId } = req.params;
    const existing = await ensureDocOwner(req, userId, deliveryId, 'material_delivery');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrega no encontrada' });

    const db = getCleaningDbName();
    const now = new Date().toISOString();
    const doc = buildMaterialDeliveryDocument(userId, {
      ...existing,
      receivedConfirmation: true,
      receivedAt: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, delivery: sanitizeMaterialDelivery({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al confirmar entrega' });
  }
}

export async function removeDelivery(req, res) {
  try {
    const { userId, deliveryId } = req.params;
    const existing = await ensureDocOwner(req, userId, deliveryId, 'material_delivery');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrega no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await softDeleteDocument(req, getCleaningDbName(), deliveryId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_delivery', action: `Canceló entrega ${existing.deliveryNumber}`,
      entityId: existing._id, entityLabel: existing.deliveryNumber, metadata: {},
    });
    return res.json({ ok: true, id: deliveryId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar entrega' });
  }
}

// ─── RETURNS ─────────────────────────────────────────────────────────────────

export async function listReturns(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const returns = await listMaterialReturnsByUser(req, userId);
    return res.json({ ok: true, returns: returns.map(sanitizeMaterialReturn) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar devoluciones' });
  }
}

export async function createReturn(req, res) {
  try {
    const { userId } = req.params;
    const { materialReturn } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!materialReturn || typeof materialReturn !== 'object') return badRequest(res, 'Falta el objeto materialReturn');
    if (!materialReturn.workerId) return badRequest(res, 'Falta workerId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildMaterialReturnDocument(userId, materialReturn);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_return', action: `Registró devolución ${doc.returnNumber} de ${doc.workerName}`,
      entityId: doc._id, entityLabel: `${doc.returnNumber} ${doc.workerName}`.trim(),
      metadata: { status: doc.status, linesCount: doc.lines.length },
    });

    return res.status(201).json({ ok: true, materialReturn: sanitizeMaterialReturn({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear devolución' });
  }
}

export async function updateReturn(req, res) {
  try {
    const { userId, returnId } = req.params;
    const { materialReturn } = req.body || {};
    if (!materialReturn || typeof materialReturn !== 'object') return badRequest(res, 'Faltan datos');

    const existing = await ensureDocOwner(req, userId, returnId, 'material_return');
    if (!existing) return res.status(404).json({ ok: false, error: 'Devolución no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    const doc = buildMaterialReturnDocument(userId, { ...existing, ...materialReturn }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_return', action: `Actualizó devolución ${doc.returnNumber} → ${doc.status}`,
      entityId: doc._id, entityLabel: `${doc.returnNumber} ${doc.workerName}`.trim(),
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, materialReturn: sanitizeMaterialReturn({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar devolución' });
  }
}

export async function acceptReturn(req, res) {
  try {
    const { userId, returnId } = req.params;
    const existing = await ensureDocOwner(req, userId, returnId, 'material_return');
    if (!existing) return res.status(404).json({ ok: false, error: 'Devolución no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const db = getCleaningDbName();
    const doc = buildMaterialReturnDocument(userId, {
      ...existing,
      status: 'accepted',
      inspectedBy: userId,
      inspectedByName: account.fullName,
      inspectedAt: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await processReturnStockAddition(req, userId, { ...doc, _rev: saved.rev }).catch(() => {});

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_return', action: `Aceptó devolución ${doc.returnNumber}`,
      entityId: doc._id, entityLabel: doc.returnNumber, metadata: { status: 'accepted' },
    });

    return res.json({ ok: true, materialReturn: sanitizeMaterialReturn({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aceptar devolución' });
  }
}

// ─── REQUESTS (solicitudes del trabajador) ───────────────────────────────────

export async function listRequests(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const requests = await listMaterialRequestsByUser(req, userId);
    const { workerId, status } = req.query;
    let filtered = requests;
    if (workerId) filtered = filtered.filter((r) => r.workerId === workerId);
    if (status) filtered = filtered.filter((r) => r.status === status);
    return res.json({ ok: true, requests: filtered.map(sanitizeMaterialRequest) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar solicitudes' });
  }
}

export async function createRequest(req, res) {
  try {
    const { userId } = req.params;
    const { materialRequest } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!materialRequest || typeof materialRequest !== 'object') return badRequest(res, 'Falta materialRequest');
    if (!materialRequest.workerId) return badRequest(res, 'Falta workerId');
    if (!materialRequest.catalogItemId && !materialRequest.materialName) return badRequest(res, 'Falta material');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildMaterialRequestDocument(userId, materialRequest);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'material_request', action: `Solicitud ${doc.requestNumber} de ${doc.workerName}: ${doc.materialName}`,
      entityId: doc._id, entityLabel: `${doc.requestNumber} ${doc.materialName}`.trim(),
      metadata: { status: 'pending', quantity: doc.quantity },
    });

    return res.status(201).json({ ok: true, materialRequest: sanitizeMaterialRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear solicitud' });
  }
}

export async function approveRequest(req, res) {
  try {
    const { userId, requestId } = req.params;
    const existing = await ensureDocOwner(req, userId, requestId, 'material_request');
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    if (existing.status !== 'pending') return badRequest(res, 'La solicitud no está pendiente');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const db = getCleaningDbName();
    const doc = buildMaterialRequestDocument(userId, {
      ...existing,
      status: 'approved',
      reviewedBy: userId,
      reviewedByName: account.fullName,
      reviewedAt: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, materialRequest: sanitizeMaterialRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aprobar solicitud' });
  }
}

export async function rejectRequest(req, res) {
  try {
    const { userId, requestId } = req.params;
    const existing = await ensureDocOwner(req, userId, requestId, 'material_request');
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    if (existing.status !== 'pending') return badRequest(res, 'La solicitud no está pendiente');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const db = getCleaningDbName();
    const doc = buildMaterialRequestDocument(userId, {
      ...existing,
      status: 'rejected',
      reviewedBy: userId,
      reviewedByName: account.fullName,
      reviewedAt: now,
      notes: req.body?.reason ? `${existing.notes ? existing.notes + ' | ' : ''}Rechazado: ${req.body.reason}` : existing.notes,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, materialRequest: sanitizeMaterialRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al rechazar solicitud' });
  }
}

// ─── INVENTORY COUNT ─────────────────────────────────────────────────────────

export async function listInventoryCounts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const docs = await import('../services/couchdb.js').then((m) => m.getAllDocuments(req, db));
    const counts = docs
      .filter((d) => d?.type === 'material_inventory_count' && !d?.deletedAt && d?.user_id === userId)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return res.json({ ok: true, inventoryCounts: counts.map(sanitizeMaterialInventoryCount) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar inventarios' });
  }
}

export async function createInventoryCount(req, res) {
  try {
    const { userId } = req.params;
    const { inventoryCount } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const materials = await listCleaningMaterials(req, userId);
    const lines = materials.filter((m) => m.active !== false).map((m) => ({
      catalogItemId: m._id,
      materialName: m.name,
      sku: m.sku || '',
      expectedQuantity: Number(m.stockQuantity || 0),
      actualQuantity: 0,
      unitCost: Number(m.costPrice || 0),
    }));

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildMaterialInventoryCountDocument(userId, {
      ...inventoryCount,
      countedBy: userId,
      countedByName: account.fullName,
      lines,
    });
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, inventoryCount: sanitizeMaterialInventoryCount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear inventario' });
  }
}

export async function updateInventoryCount(req, res) {
  try {
    const { userId, countId } = req.params;
    const { inventoryCount } = req.body || {};
    if (!inventoryCount || typeof inventoryCount !== 'object') return badRequest(res, 'Faltan datos');

    const existing = await ensureDocOwner(req, userId, countId, 'material_inventory_count');
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });

    const db = getCleaningDbName();
    const doc = buildMaterialInventoryCountDocument(userId, { ...existing, ...inventoryCount }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, inventoryCount: sanitizeMaterialInventoryCount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar inventario' });
  }
}

export async function approveInventoryCount(req, res) {
  try {
    const { userId, countId } = req.params;
    const existing = await ensureDocOwner(req, userId, countId, 'material_inventory_count');
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });
    if (existing.status !== 'completed') return badRequest(res, 'El inventario debe estar completado para aprobarse');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const db = getCleaningDbName();
    const doc = buildMaterialInventoryCountDocument(userId, {
      ...existing,
      status: 'approved',
      approvedBy: userId,
      approvedAt: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, inventoryCount: sanitizeMaterialInventoryCount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aprobar inventario' });
  }
}

// ─── SERVICE MATERIAL CONSUMPTION (MAT-04) ──────────────────────────────────

export async function registerServiceConsumption(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { materialsUsed } = req.body || {};
    if (!Array.isArray(materialsUsed) || materialsUsed.length === 0) return badRequest(res, 'materialsUsed es requerido');

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const svc = await getDocument(req, db, serviceId);
    if (!svc || svc.type !== 'cleaning_service' || svc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }

    const existing = Array.isArray(svc.materialsUsed) ? svc.materialsUsed : [];
    const merged = [...existing, ...materialsUsed];
    const materialCost = merged.reduce((s, m) => s + Number(m.totalCost || (m.quantity * m.unitCost) || 0), 0);
    const laborCost = Number(svc.laborCost || 0);

    const doc = buildCleaningServiceDocument(userId, {
      ...svc,
      materialsUsed: merged,
      materialCost: Math.round(materialCost * 100) / 100,
      laborCost,
      totalCost: Math.round((materialCost + laborCost) * 100) / 100,
    }, svc);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar consumo' });
  }
}

export async function getServiceConsumption(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const svc = await getDocument(req, db, serviceId);
    if (!svc || svc.type !== 'cleaning_service' || svc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }
    return res.json({
      ok: true,
      materialsUsed: svc.materialsUsed || [],
      materialCost: Number(svc.materialCost || 0),
      laborCost: Number(svc.laborCost || 0),
      totalCost: Number(svc.totalCost || 0),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener consumo' });
  }
}
