import {
  getDocumentsDbName,
  buildDocumentRecord,
  sanitizeDocumentRecord,
  listDocumentsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  VEHICLES_DB,
  getAllDocuments,
  getScrapyardRequiredDocs,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';
import { createHash } from 'crypto';

const OCR_TYPE_TO_SUB_CATEGORY = {
  permiso_circulacion: 'permiso_circulacion',
  ficha_tecnica: 'ficha_tecnica',
  contrato_compra: 'contrato_compra',
  contrato_venta: 'contrato_venta',
  factura_compra: 'factura_compra',
  factura_venta: 'factura_venta',
  itv: 'itv',
  seguro: 'seguro',
  reparacion: 'reparacion',
  doc_cliente: 'doc_cliente',
  informe_trafico: 'informe_trafico',
  factura_proveedor: 'factura_compra',
  factura_cliente: 'factura_venta',
  baja_temporal: 'baja_temporal',
  baja_definitiva: 'baja_definitiva',
  certificado_destruccion: 'certificado_destruccion',
  certificado_descontaminacion: 'certificado_descontaminacion',
  acta_retirada: 'acta_retirada',
  albaran_grua: 'albaran_grua',
  doc_tasacion: 'doc_tasacion',
  acta_adjudicacion: 'acta_adjudicacion',
};

async function autoLinkByPlateOrVin(req, userId, docData) {
  const plate = docData.registrationPlate || docData.ocrData?.registrationPlate;
  const vin = docData.vin || docData.ocrData?.vin;
  if (!plate && !vin) return {};
  const result = {};
  try {
    const vDb = VEHICLES_DB;
    await ensureDatabase(req, vDb);
    const vehicles = await getAllDocuments(req, vDb);
    const match = vehicles.find(v => {
      if (v.type !== 'car' || v.deletedAt || v.user_id !== userId) return false;
      if (plate && v.registrationPlate && v.registrationPlate.replace(/\s/g, '').toUpperCase() === plate.replace(/\s/g, '').toUpperCase()) return true;
      if (vin && v.vin && v.vin.toUpperCase() === vin.toUpperCase()) return true;
      return false;
    });
    if (match) {
      result.vehicleId = match._id || match.id;
      result.vehicleName = `${match.brand || ''} ${match.model || ''}`.trim();
      result.registrationPlate = match.registrationPlate || plate || '';
      result.vin = match.vin || vin || '';

      if (docData.isScrapyard) {
        try {
          const acqDocs = await getAllDocuments(req, vDb);
          const acq = acqDocs.find(a =>
            a.type === 'vehicle_acquisition' && !a.deletedAt &&
            a.user_id === userId && a.vehicleId === result.vehicleId
          );
          if (acq) {
            result.acquisitionId = acq._id || acq.id;
            result.supplierName = acq.supplierName || '';
            result.supplierId = acq.supplierId || '';
          }
        } catch {}
      }
    }
  } catch {}
  if (!result.vehicleId) {
    if (plate) result.registrationPlate = plate;
    if (vin) result.vin = vin;
  }
  return result;
}

function computeDocumentHash(docData) {
  const raw = `${docData.name || ''}|${docData.fileSize || 0}|${docData.mimeType || ''}|${docData.docSubCategory || ''}|${docData.vehicleId || ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function checkDuplicateDocument(req, userId, hash) {
  if (!hash) return null;
  try {
    const docs = await listDocumentsByUser(req, userId);
    return docs.find(d => d.documentHash === hash && !d.deletedAt) || null;
  } catch { return null; }
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

const MANAGER_ROLES = new Set(['Admin', 'Gerente', 'admin', 'gerente', 'owner']);

export function docPermission(action) {
  return (req, res, next) => {
    const role = req.authUser?.role || '';
    const isManager = MANAGER_ROLES.has(role);
    const permissions = req.authUser?.permissions || {};
    const scrapyardPerms = permissions.scrapyard_docs || {};

    if (action === 'delete' && !isManager && !scrapyardPerms.edit) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes pueden eliminar documentos' });
    }
    if (action === 'validate' && !isManager && !scrapyardPerms.edit) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes pueden validar documentos' });
    }

    req.docRole = isManager ? 'manager' : 'worker';
    req.scrapyardDocsView = isManager || scrapyardPerms.view || false;
    req.scrapyardDocsEdit = isManager || scrapyardPerms.edit || false;
    next();
  };
}

async function ensureDocOwner(req, userId, docId) {
  const db = getDocumentsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, docId);
  if (!doc || doc.type !== 'document' || doc.user_id !== userId) {
    return null;
  }
  return doc;
}

export async function listDocuments(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { clientId, saleId, vehicleId, status, docSubCategory, q, partId, acquisitionId, isScrapyard, archived } = req.query;
    let docs = await listDocumentsByUser(req, userId);

    if (clientId)       docs = docs.filter((d) => d.clientId === clientId);
    if (saleId)         docs = docs.filter((d) => d.saleId === saleId);
    if (vehicleId)      docs = docs.filter((d) => d.vehicleId === vehicleId);
    if (status)         docs = docs.filter((d) => d.status === status);
    if (docSubCategory) docs = docs.filter((d) => d.docSubCategory === docSubCategory);
    if (partId)         docs = docs.filter((d) => d.partId === partId);
    if (acquisitionId)  docs = docs.filter((d) => d.acquisitionId === acquisitionId);
    if (isScrapyard === 'true')  docs = docs.filter((d) => d.isScrapyard === true);
    if (isScrapyard === 'false') docs = docs.filter((d) => !d.isScrapyard);
    if (archived === 'true')     docs = docs.filter((d) => d.archived === true);
    if (archived === 'false')    docs = docs.filter((d) => !d.archived);

    if (q) {
      const term = String(q).toLowerCase().trim();
      docs = docs.filter((d) =>
        (d.name || '').toLowerCase().includes(term) ||
        (d.registrationPlate || '').toLowerCase().includes(term) ||
        (d.vin || '').toLowerCase().includes(term) ||
        (d.clientName || '').toLowerCase().includes(term) ||
        (d.supplierName || '').toLowerCase().includes(term) ||
        (d.vehicleName || '').toLowerCase().includes(term) ||
        (d.docSubCategory || '').toLowerCase().includes(term) ||
        (d.partName || '').toLowerCase().includes(term) ||
        (d.partCode || '').toLowerCase().includes(term)
      );
    }

    const { items, meta } = applyQueryOptions(docs.map(sanitizeDocumentRecord), req.query);
    return res.json({ ok: true, documents: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar documentos' });
  }
}

export async function createDocument(req, res) {
  try {
    const { userId } = req.params;
    const { document: docData } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!docData || typeof docData !== 'object') return badRequest(res, 'Falta el objeto document en el body');
    if (!docData.name?.trim()) return badRequest(res, 'El nombre del documento es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (docData.ocrData?.documentType && !docData.docSubCategory) {
      const mapped = OCR_TYPE_TO_SUB_CATEGORY[docData.ocrData.documentType];
      if (mapped) docData.docSubCategory = mapped;
    }

    if (docData.ocrData?.expiryDate && docData.docSubCategory === 'itv' && !docData.itvExpiryDate) {
      docData.itvExpiryDate = docData.ocrData.expiryDate;
    }

    if (docData.ocrData?.deregistrationDate && ['baja_temporal', 'baja_definitiva'].includes(docData.docSubCategory)) {
      docData.deregistrationDate = docData.ocrData.deregistrationDate;
      docData.deregistrationType = docData.docSubCategory === 'baja_definitiva' ? 'definitiva' : 'temporal';
    }

    if (!docData.vehicleId) {
      const linked = await autoLinkByPlateOrVin(req, userId, docData);
      Object.assign(docData, linked);
    }

    const hash = computeDocumentHash(docData);
    if (hash) docData.documentHash = hash;
    const duplicate = await checkDuplicateDocument(req, userId, hash);
    if (duplicate) {
      return res.status(409).json({
        ok: false,
        error: 'Documento duplicado detectado',
        duplicateId: duplicate._id || duplicate.id,
        duplicateName: duplicate.name,
      });
    }

    const db = getDocumentsDbName();
    await ensureDatabase(req, db);
    const doc = buildDocumentRecord(userId, docData);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'document',
      action: `Creó documento "${doc.name}"`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { category: doc.category, docSubCategory: doc.docSubCategory, status: doc.status, clientName: doc.clientName, vehicleId: doc.vehicleId, registrationPlate: doc.registrationPlate },
    });

    return res.status(201).json({ ok: true, document: sanitizeDocumentRecord({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear documento' });
  }
}

export async function updateDocument(req, res) {
  try {
    const { userId, documentId } = req.params;
    const { document: docData } = req.body || {};

    if (!docData || typeof docData !== 'object') return badRequest(res, 'Faltan datos del documento');

    const existing = await ensureDocOwner(req, userId, documentId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getDocumentsDbName();
    const doc = buildDocumentRecord(userId, { ...existing, ...docData }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'document',
      action: `Actualizó documento "${doc.name}" — estado: ${doc.status}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { status: doc.status, version: doc.version },
    });

    return res.json({ ok: true, document: sanitizeDocumentRecord({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar documento' });
  }
}

const REQUIRED_DOCS = {
  licenses: ['Licencia de Apertura', 'Licencia de Actividad'],
  society: ['Estatutos', 'CIF', 'IAE'],
  contracts: [],
};

const REQUIRED_VEHICLE_DOCS = [
  'permiso_circulacion', 'ficha_tecnica', 'contrato_compra',
  'factura_compra', 'itv',
];

const DOC_SUB_CATEGORY_LABELS = {
  permiso_circulacion: 'Permiso de circulación',
  ficha_tecnica: 'Ficha técnica',
  contrato_compra: 'Contrato de compra',
  contrato_venta: 'Contrato de venta',
  factura_compra: 'Factura de compra',
  factura_venta: 'Factura de venta',
  itv: 'ITV',
  reparacion: 'Reparación',
  justificante: 'Justificante',
  doc_cliente: 'Doc. cliente',
  anexo: 'Anexo',
  seguro: 'Seguro',
  informe_trafico: 'Informe tráfico',
  otro: 'Otro',
  baja_temporal: 'Baja temporal',
  baja_definitiva: 'Baja definitiva',
  certificado_destruccion: 'Certificado de destrucción',
  certificado_descontaminacion: 'Certificado de descontaminación',
  acta_retirada: 'Acta de retirada',
  albaran_grua: 'Albarán de grúa',
  justificante_deposito: 'Justificante de depósito',
  informe_medioambiental: 'Informe medioambiental',
  licencia_actividad: 'Licencia de actividad',
  registro_productor_residuos: 'Registro productor de residuos',
  garantia_pieza: 'Garantía de pieza',
  informe_pieza: 'Informe de pieza',
  albaran_venta_pieza: 'Albarán venta pieza',
  acta_adjudicacion: 'Acta de adjudicación',
  doc_tasacion: 'Documento de tasación',
};

const PENDING_STALE_DAYS = 15;

export async function getDocumentAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const docs = await listDocumentsByUser(req, userId);
    const now = new Date();
    const alerts = [];

    for (const doc of docs) {
      if (doc.expiresAt) {
        const exp = new Date(doc.expiresAt);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);

        if (daysLeft < 0) {
          alerts.push({
            type: 'expired',
            severity: 'critical',
            message: `"${doc.name}" ha caducado hace ${Math.abs(daysLeft)} días`,
            documentId: doc._id,
            documentName: doc.name,
            category: doc.category,
            actionUrl: `/saas/documents/${doc._id}`,
          });
        } else if (daysLeft <= 30) {
          alerts.push({
            type: 'expiring_soon',
            severity: 'warning',
            message: `"${doc.name}" vence en ${daysLeft} días`,
            documentId: doc._id,
            documentName: doc.name,
            category: doc.category,
            actionUrl: `/saas/documents/${doc._id}`,
          });
        }
      }

      if (doc.itvExpiryDate) {
        const exp = new Date(doc.itvExpiryDate);
        if (!Number.isNaN(exp.getTime())) {
          const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
          if (daysLeft < 0) {
            alerts.push({
              type: 'itv_expired',
              severity: 'critical',
              message: `ITV caducada hace ${Math.abs(daysLeft)} días — ${doc.registrationPlate || doc.vehicleName || doc.name}`,
              documentId: doc._id,
              documentName: doc.name,
              vehicleId: doc.vehicleId,
              registrationPlate: doc.registrationPlate,
              actionUrl: doc.vehicleId ? `/saas/vehicles/${doc.vehicleId}` : `/saas/documents/${doc._id}`,
            });
          } else if (daysLeft <= 30) {
            alerts.push({
              type: 'itv_expiring',
              severity: 'warning',
              message: `ITV caduca en ${daysLeft} días — ${doc.registrationPlate || doc.vehicleName || doc.name}`,
              documentId: doc._id,
              documentName: doc.name,
              vehicleId: doc.vehicleId,
              registrationPlate: doc.registrationPlate,
              actionUrl: doc.vehicleId ? `/saas/vehicles/${doc.vehicleId}` : `/saas/documents/${doc._id}`,
            });
          }
        }
      }

      if (doc.status === 'draft' && doc.createdAt && ['contrato_compra', 'contrato_venta'].includes(doc.docSubCategory)) {
        const created = new Date(doc.createdAt);
        const hoursOld = (now.getTime() - created.getTime()) / 3600000;
        if (hoursOld > 48) {
          alerts.push({
            type: 'contract_pending_sign',
            severity: 'warning',
            message: `Contrato pendiente de firmar: "${doc.name}" (${Math.floor(hoursOld / 24)} días)`,
            documentId: doc._id,
            documentName: doc.name,
            actionUrl: `/saas/documents/${doc._id}`,
          });
        }
      }

      if (doc.ocrData && doc.ocrConfidence > 0 && doc.ocrConfidence < 60) {
        const created = new Date(doc.createdAt);
        const daysOld = Math.ceil((now.getTime() - created.getTime()) / 86400000);
        if (daysOld <= 7) {
          alerts.push({
            type: 'ocr_incomplete',
            severity: 'info',
            message: `OCR con baja confianza (${doc.ocrConfidence}%): "${doc.name}"`,
            documentId: doc._id,
            documentName: doc.name,
            actionUrl: `/saas/documents/${doc._id}`,
          });
        }
      }

      if (doc.status === 'pending' && doc.createdAt) {
        const created = new Date(doc.createdAt);
        const daysPending = Math.ceil((now.getTime() - created.getTime()) / 86400000);
        if (daysPending > PENDING_STALE_DAYS && (doc.category === 'contracts' || doc.category === 'licenses')) {
          alerts.push({
            type: 'stale_pending',
            severity: 'warning',
            message: `"${doc.name}" lleva pendiente ${daysPending} días`,
            documentId: doc._id,
            documentName: doc.name,
            category: doc.category,
            actionUrl: `/saas/documents/${doc._id}`,
          });
        }
      }
    }

    const vehicleIds = [...new Set(docs.filter((d) => d.vehicleId).map((d) => d.vehicleId))];
    const scrapyardDocs = docs.filter(d => d.isScrapyard);
    const scrapyardVehicleIds = [...new Set(scrapyardDocs.filter(d => d.vehicleId).map(d => d.vehicleId))];

    let scrapyardVehiclesMap = {};
    if (scrapyardVehicleIds.length > 0) {
      try {
        const vDb = VEHICLES_DB;
        await ensureDatabase(req, vDb);
        const allVehicles = await getAllDocuments(req, vDb);
        for (const v of allVehicles) {
          if (v.type === 'car' && !v.deletedAt && scrapyardVehicleIds.includes(v._id)) {
            scrapyardVehiclesMap[v._id] = v;
          }
        }
      } catch {}
    }

    for (const vid of scrapyardVehicleIds) {
      const vehicleDocs = scrapyardDocs.filter(d => d.vehicleId === vid);
      const vehicle = scrapyardVehiclesMap[vid];
      const vehicleStatus = vehicle?.status || vehicle?.dismantlingStatus || 'received';
      const requiredSubs = getScrapyardRequiredDocs(vehicleStatus);
      const presentSubs = new Set(vehicleDocs.map(d => d.docSubCategory));
      const missing = requiredSubs.filter(cat => !presentSubs.has(cat));
      const plate = vehicleDocs[0]?.registrationPlate || vehicleDocs[0]?.vehicleName || vid;

      if (missing.length > 0) {
        alerts.push({
          type: 'scrapyard_missing_docs',
          severity: 'warning',
          message: `${plate}: faltan ${missing.length} docs obligatorios para fase "${vehicleStatus}" (${missing.map(m => DOC_SUB_CATEGORY_LABELS[m] || m).join(', ')})`,
          vehicleId: vid,
          missingDocs: missing,
          isScrapyard: true,
          actionUrl: `/saas/vertical/desguaces/documentacion?vehicleId=${vid}`,
        });
      }

      if (vehicle && !['compacted', 'deregistered'].includes(vehicleStatus)) {
        const hasBaja = vehicleDocs.some(d => ['baja_temporal', 'baja_definitiva'].includes(d.docSubCategory));
        const createdDate = vehicle.createdAt ? new Date(vehicle.createdAt) : null;
        if (!hasBaja && createdDate) {
          const daysSinceEntry = Math.ceil((now.getTime() - createdDate.getTime()) / 86400000);
          if (daysSinceEntry > 30) {
            alerts.push({
              type: 'scrapyard_pending_deregistration',
              severity: 'critical',
              message: `${plate}: sin baja tramitada después de ${daysSinceEntry} días`,
              vehicleId: vid,
              isScrapyard: true,
              actionUrl: `/saas/scrapyard-deregistrations`,
            });
          }
        }
      }
    }

    for (const vid of vehicleIds) {
      if (scrapyardVehicleIds.includes(vid)) continue;
      const vehicleDocs = docs.filter((d) => d.vehicleId === vid);
      const presentSubs = new Set(vehicleDocs.map((d) => d.docSubCategory));
      const missing = REQUIRED_VEHICLE_DOCS.filter((cat) => !presentSubs.has(cat));
      if (missing.length > 0) {
        const plate = vehicleDocs[0]?.registrationPlate || vehicleDocs[0]?.vehicleName || vid;
        alerts.push({
          type: 'missing_vehicle_docs',
          severity: 'warning',
          message: `${plate}: faltan ${missing.length} docs obligatorios (${missing.map((m) => DOC_SUB_CATEGORY_LABELS[m] || m).join(', ')})`,
          vehicleId: vid,
          missingDocs: missing,
          actionUrl: `/saas/documents?vehicleId=${vid}`,
        });
      }
    }

    const existingNames = docs.map((d) => (d.name || '').toLowerCase().trim());
    for (const [category, required] of Object.entries(REQUIRED_DOCS)) {
      for (const reqName of required) {
        if (!existingNames.includes(reqName.toLowerCase())) {
          alerts.push({
            type: 'missing_required',
            severity: 'info',
            message: `Falta documento obligatorio: "${reqName}" en ${category}`,
            documentName: reqName,
            category,
            actionUrl: `/saas/documents?tab=${category}`,
          });
        }
      }
    }

    alerts.sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return (sev[a.severity] || 9) - (sev[b.severity] || 9);
    });

    return res.json({ ok: true, alerts, count: alerts.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener alertas' });
  }
}

export async function getDocumentHistory(req, res) {
  try {
    const { userId, documentId } = req.params;
    if (!userId || !documentId) return badRequest(res, 'Falta userId o documentId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const activitiesDb = `${account.accountName || 'vertial'}-activity`;
    try {
      await ensureDatabase(req, activitiesDb);
      const allActivities = await getAllDocuments(req, activitiesDb);
      const history = allActivities
        .filter(a => a.entityId === documentId && a.type === 'document')
        .sort((a, b) => String(b.timestamp || b.createdAt || '').localeCompare(String(a.timestamp || a.createdAt || '')))
        .slice(0, 50)
        .map(a => ({
          id: a._id,
          action: a.action,
          actorName: a.actorName || 'Sistema',
          timestamp: a.timestamp || a.createdAt,
          metadata: a.metadata || {},
        }));

      return res.json({ ok: true, history });
    } catch {
      return res.json({ ok: true, history: [] });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener historial' });
  }
}

export async function removeDocument(req, res) {
  try {
    const { userId, documentId } = req.params;

    const existing = await ensureDocOwner(req, userId, documentId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getDocumentsDbName();
    await softDeleteDocument(req, db, documentId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'document',
      action: `Eliminó documento "${existing.name}"`,
      entityId: existing._id,
      entityLabel: existing.name,
      metadata: { category: existing.category },
    });

    return res.json({ ok: true, id: documentId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar documento' });
  }
}
