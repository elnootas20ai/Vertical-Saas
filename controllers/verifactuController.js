import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  findBusinessById,
} from '../services/couchdb.js';
import {
  calcLineTotals,
  computeHuella,
  buildQrUrl,
  formatInvoiceNumber,
  buildFullNumber,
  defaultVerifactuSettings,
  sanitizeVerifactuSettings,
  sanitizeVerifactuRecord,
  normalizeNif,
} from '../services/verifactuEngine.js';

function getVerifactuDbName() {
  const prefix = String(process.env.COUCHDB_DB || 'vertial')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-verifactu`;
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function loadSettings(req, businessId, business) {
  const db = getVerifactuDbName();
  await ensureDatabase(req, db);
  const id = `verifactu-settings:${businessId}`;
  const existing = await getDocument(req, db, id);
  if (existing && existing.type === 'verifactu_settings') return existing;
  const doc = defaultVerifactuSettings(businessId, business || {});
  const saved = await putDocument(req, db, doc._id, doc);
  return { ...doc, _rev: saved.rev };
}

export async function getSettings(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    const doc = await loadSettings(req, businessId, business);
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

    const current = await loadSettings(req, businessId, business);
    const next = {
      ...current,
      enabled: patch.enabled != null ? Boolean(patch.enabled) : current.enabled,
      mode: patch.mode === 'no_verifactu' ? 'no_verifactu' : (patch.mode === 'verifactu' ? 'verifactu' : current.mode),
      environment: patch.environment === 'production' ? 'production' : (patch.environment === 'sandbox' ? 'sandbox' : current.environment),
      series: patch.series != null ? String(patch.series).trim().toUpperCase().slice(0, 8) || 'A' : current.series,
      issuerNif: patch.issuerNif != null ? normalizeNif(patch.issuerNif) : current.issuerNif,
      issuerName: patch.issuerName != null ? String(patch.issuerName).trim() : current.issuerName,
      issuerAddress: patch.issuerAddress != null ? String(patch.issuerAddress).trim() : current.issuerAddress,
      issuerCity: patch.issuerCity != null ? String(patch.issuerCity).trim() : current.issuerCity,
      issuerPostalCode: patch.issuerPostalCode != null ? String(patch.issuerPostalCode).trim() : current.issuerPostalCode,
      notes: patch.notes != null ? String(patch.notes) : current.notes,
      updatedAt: new Date().toISOString(),
    };
    // nextNumber / lastHuella solo el motor al emitir
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

    const settings = await loadSettings(req, businessId, business);
    if (!settings.enabled) {
      return badRequest(res, 'Activa Verifactu en los ajustes de la empresa antes de emitir.');
    }

    const issuerNif = normalizeNif(body.issuerNif || settings.issuerNif || business.taxId);
    const issuerName = String(body.issuerName || settings.issuerName || business.name || '').trim();
    if (!issuerNif || issuerNif.length < 8) return badRequest(res, 'NIF/CIF del emisor obligatorio');
    if (!issuerName) return badRequest(res, 'Nombre del emisor obligatorio');

    const recipientNif = normalizeNif(body.recipientNif);
    const recipientName = String(body.recipientName || '').trim();
    if (!recipientName) return badRequest(res, 'Nombre del destinatario obligatorio');

    const linesInput = Array.isArray(body.lines) ? body.lines : [];
    if (!linesInput.length) return badRequest(res, 'Añade al menos una línea');
    if (linesInput.some((l) => !String(l?.description || '').trim())) {
      return badRequest(res, 'Todas las líneas necesitan descripción');
    }

    const { lines, base, tax, total } = calcLineTotals(linesInput);
    const series = String(body.series || settings.series || 'A').trim().toUpperCase().slice(0, 8) || 'A';
    const sequenceNumber = Number(settings.nextNumber) || 1;
    const number = formatInvoiceNumber(series, sequenceNumber);
    const fullNumber = buildFullNumber(series, number);
    const issueDate = String(body.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return badRequest(res, 'Fecha de emisión inválida');

    const huellaAnterior = settings.lastHuella || null;
    const huella = computeHuella({
      issuerNif,
      series,
      number,
      issueDate,
      total,
      huellaAnterior,
    });
    const environment = settings.environment === 'production' ? 'production' : 'sandbox';
    const qrUrl = buildQrUrl({
      issuerNif,
      series,
      number,
      issueDate,
      total,
      environment,
    });

    const now = new Date().toISOString();
    const id = `verifactu-record:${businessId}:${series}:${number}`;
    const db = getVerifactuDbName();
    await ensureDatabase(req, db);

    const existing = await getDocument(req, db, id);
    if (existing && existing.type === 'verifactu_record') {
      return badRequest(res, `Ya existe el registro ${fullNumber}. No se puede reutilizar el número.`);
    }

    const actorId = req.authUser?.userId || req.authUser?.user_id || '';
    const record = {
      _id: id,
      type: 'verifactu_record',
      business_id: businessId,
      mode: settings.mode || 'verifactu',
      status: 'issued',
      aeatStatus: 'pending_local',
      series,
      number,
      fullNumber,
      issueDate,
      issuer: {
        nif: issuerNif,
        name: issuerName,
        address: String(body.issuerAddress || settings.issuerAddress || '').trim(),
        city: String(body.issuerCity || settings.issuerCity || '').trim(),
        postalCode: String(body.issuerPostalCode || settings.issuerPostalCode || '').trim(),
      },
      recipient: {
        nif: recipientNif || null,
        name: recipientName,
        address: String(body.recipientAddress || '').trim(),
        city: String(body.recipientCity || '').trim(),
        postalCode: String(body.recipientPostalCode || '').trim(),
      },
      lines,
      base,
      tax,
      total,
      huella,
      huellaAnterior,
      qrUrl,
      rectifiesId: body.rectifiesId || null,
      source: body.source || { kind: 'manual' },
      notes: String(body.notes || '').trim(),
      createdAt: now,
      createdBy: actorId || null,
      // Campos fiscales cerrados: no hay update API
      immutable: true,
    };

    const saved = await putDocument(req, db, record._id, record);

    const nextSettings = {
      ...settings,
      nextNumber: sequenceNumber + 1,
      lastHuella: huella,
      lastRecordId: record._id,
      updatedAt: now,
    };
    const settingsSaved = await putDocument(req, db, nextSettings._id, nextSettings);

    return res.status(201).json({
      ok: true,
      record: sanitizeVerifactuRecord({ ...record, _rev: saved.rev }),
      settings: sanitizeVerifactuSettings({ ...nextSettings, _rev: settingsSaved.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al emitir registro Verifactu' });
  }
}
