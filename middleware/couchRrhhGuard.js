import {
  findBusinessById,
  getPayrollDbName,
  listBusinessesByUser,
} from '../services/couchdb.js';
import { getAuthUserId } from '../services/clockinsAccess.js';

function normalizeDbName(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

function dbPrefix() {
  return normalizeDbName(process.env.VITE_COUCHDB_DB || 'vertial');
}

export function isPayrollDb(dbName) {
  const n = normalizeDbName(dbName);
  return n === normalizeDbName(getPayrollDbName()) || n.endsWith('-payroll');
}

export function isVacationsDb(dbName) {
  const n = normalizeDbName(dbName);
  const prefix = dbPrefix();
  return n === `${prefix}-vacations` || n.endsWith('-vacations');
}

export function isSchedulesDb(dbName) {
  const n = normalizeDbName(dbName);
  const prefix = dbPrefix();
  return n === `${prefix}-schedules` || n.endsWith('-schedules');
}

export function isRrhhScopedDb(dbName) {
  return isPayrollDb(dbName) || isVacationsDb(dbName) || isSchedulesDb(dbName);
}

function normalizeBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function docBusinessId(doc) {
  return normalizeBusinessId(doc?.business_id);
}

function businessIdFromDocId(docId) {
  const parts = String(docId || '').split(':');
  if (parts.length >= 2) return normalizeBusinessId(parts[1]);
  return '';
}

async function getAccessibleBusinessIds(req) {
  const userId = getAuthUserId(req);
  if (!userId) return new Set();
  const businesses = await listBusinessesByUser(req, userId);
  return new Set(
    businesses
      .map((b) => normalizeBusinessId(b.business_id || b._id))
      .filter(Boolean),
  );
}

export async function filterRrhhDocsForRequester(req, docs) {
  const accessible = await getAccessibleBusinessIds(req);
  if (accessible.size === 0) return [];

  const singleBusinessLegacy = accessible.size === 1 ? [...accessible][0] : null;

  return (docs || []).filter((doc) => {
    if (doc?.deletedAt) return false;
    const bid = docBusinessId(doc);
    if (bid) return accessible.has(bid);
    // Documentos legacy sin business_id: solo cuenta con una empresa.
    if (singleBusinessLegacy && doc?.type === 'payroll') return true;
    return false;
  });
}

export async function assertRrhhDocReadAccess(req, doc) {
  const filtered = await filterRrhhDocsForRequester(req, [doc]);
  return filtered.length > 0;
}

export async function validateRrhhDocWrite(req, body, docId, dbName) {
  const requesterId = getAuthUserId(req);
  if (!requesterId) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }

  const doc = body || {};
  let businessId = docBusinessId(doc);
  if (!businessId && docId) {
    businessId = businessIdFromDocId(docId);
  }

  if (!businessId) {
    return { ok: false, status: 400, error: 'Falta business_id en el documento RRHH' };
  }

  const accessible = await getAccessibleBusinessIds(req);
  if (!accessible.has(businessId)) {
    return { ok: false, status: 403, error: 'No autorizado para esta empresa' };
  }

  const business = await findBusinessById(req, businessId);
  if (!business) {
    return { ok: false, status: 404, error: 'Empresa no encontrada' };
  }

  if (doc.type && doc.type !== 'payroll' && doc.type !== 'vacation_request' && doc.type !== 'vacation_settings' && doc.type !== 'schedule' && doc.type !== 'availability_block') {
    // Otros tipos en la misma DB (p. ej. plantillas): exigen business_id coherente.
    if (docBusinessId(doc) && docBusinessId(doc) !== businessId) {
      return { ok: false, status: 403, error: 'Empresa del documento no coincide' };
    }
  }

  return { ok: true, businessId };
}
