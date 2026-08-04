import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  findBusinessById,
} from '../services/couchdb.js';
import { normalizeNif, sanitizeVerifactuSettings, sanitizeVerifactuRecord } from '../services/verifactuEngine.js';
import {
  getVerifactuDbName,
  loadVerifactuSettingsDoc,
  issueVerifactuRecordDoc,
} from '../services/verifactuIssueService.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function getSettings(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    const doc = await loadVerifactuSettingsDoc(req, businessId, business);
    return res.json({ ok: true, settings: sanitizeVerifactuSettings(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar ajustes Verifactu' });
  }
}

export async function saveSettings(req, res) {
  try {
    const { businessId } = req.params;
    const patch = req.body?.settings || req.body || {};
    if (!businessId) return badRequest(res, 'Falta businessId');
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const current = await loadVerifactuSettingsDoc(req, businessId, business);
    const next = {
      ...current,
      enabled: patch.enabled != null ? Boolean(patch.enabled) : current.enabled,
      mode: patch.mode === 'no_verifactu' ? 'no_verifactu' : (patch.mode === 'verifactu' ? 'verifactu' : current.mode),
      environment: patch.environment === 'production' ? 'production' : (patch.environment === 'sandbox' ? 'sandbox' : current.environment),
      series: patch.series != null ? String(patch.series).trim().toUpperCase().slice(0, 8) || 'A' : current.series,
      autoIssueOnSale: patch.autoIssueOnSale != null ? Boolean(patch.autoIssueOnSale) : current.autoIssueOnSale !== false,
      pricesIncludeTax: patch.pricesIncludeTax != null ? Boolean(patch.pricesIncludeTax) : current.pricesIncludeTax !== false,
      defaultTaxRate: patch.defaultTaxRate != null
        ? Math.min(30, Math.max(0, Number(patch.defaultTaxRate) || 0))
        : (Number.isFinite(Number(current.defaultTaxRate)) ? Number(current.defaultTaxRate) : 10),
      issuerNif: patch.issuerNif != null ? normalizeNif(patch.issuerNif) : current.issuerNif,
      issuerName: patch.issuerName != null ? String(patch.issuerName).trim() : current.issuerName,
      issuerAddress: patch.issuerAddress != null ? String(patch.issuerAddress).trim() : current.issuerAddress,
      issuerCity: patch.issuerCity != null ? String(patch.issuerCity).trim() : current.issuerCity,
      issuerPostalCode: patch.issuerPostalCode != null ? String(patch.issuerPostalCode).trim() : current.issuerPostalCode,
      notes: patch.notes != null ? String(patch.notes) : current.notes,
      updatedAt: new Date().toISOString(),
    };
    const db = getVerifactuDbName();
    const saved = await putDocument(req, db, next._id, next);
    return res.json({ ok: true, settings: sanitizeVerifactuSettings({ ...next, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al guardar ajustes Verifactu' });
  }
}

export async function listRecords(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const db = getVerifactuDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    let records = docs
      .filter((d) => d?.type === 'verifactu_record' && d.business_id === businessId && !d.deletedAt)
      .map(sanitizeVerifactuRecord)
      .filter(Boolean)
      .sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || String(b.fullNumber).localeCompare(String(a.fullNumber)));

    const year = req.query.year ? Number(req.query.year) : null;
    if (year) records = records.filter((r) => String(r.issueDate).startsWith(String(year)));

    return res.json({ ok: true, records });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar registros Verifactu' });
  }
}

export async function getRecord(req, res) {
  try {
    const { businessId, recordId } = req.params;
    if (!businessId || !recordId) return badRequest(res, 'Faltan parámetros');
    const db = getVerifactuDbName();
    await ensureDatabase(req, db);
    const doc = await getDocument(req, db, decodeURIComponent(recordId));
    if (!doc || doc.type !== 'verifactu_record' || doc.business_id !== businessId) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    }
    return res.json({ ok: true, record: sanitizeVerifactuRecord(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar registro' });
  }
}

/**
 * Emite un registro fiscal inmutable.
 * No hay update de campos fiscales después.
 */
export async function issueRecord(req, res) {
  try {
    const { businessId } = req.params;
    const body = req.body || {};
    if (!businessId) return badRequest(res, 'Falta businessId');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const actorId = req.authUser?.userId || req.authUser?.user_id || '';
    const result = await issueVerifactuRecordDoc(req, {
      businessId,
      business,
      body,
      actorId,
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    const msg = error.message || 'Error al emitir registro Verifactu';
    if (/obligatorio|Activa|modo sin|Ya existe|inválida|línea/i.test(msg)) {
      return badRequest(res, msg);
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}
