import { getClockinsDbName, findBusinessById, ensureDatabase, getDocument } from '../services/couchdb.js';
import {
  getAuthUserId,
  resolveVisibleMemberIds,
  loadOrgChartForAccess,
  canMutateClockinForMember,
} from '../services/clockinsAccess.js';

export function isClockinsDb(dbName) {
  const normalized = String(dbName || '').toLowerCase().trim();
  if (!normalized) return false;
  const clockinsDb = getClockinsDbName().toLowerCase();
  return normalized === clockinsDb || normalized.endsWith('-clockins');
}

export async function filterClockinsDocsForRequester(req, docs) {
  const requesterId = getAuthUserId(req);
  if (!requesterId) return [];

  const rows = (docs || []).filter((d) => d?.type === 'clockin' && !d.deletedAt);
  const byBusiness = new Map();
  for (const row of rows) {
    const bid = String(row.business_id || '').trim();
    if (!bid) continue;
    if (!byBusiness.has(bid)) byBusiness.set(bid, []);
    byBusiness.get(bid).push(row);
  }

  const filtered = [];
  for (const [businessId, records] of byBusiness) {
    const business = await findBusinessById(req, businessId);
    if (!business) continue;
    const orgchart = await loadOrgChartForAccess(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);
    filtered.push(...records.filter((r) => visibleIds.includes(r.member_id)));
  }
  return filtered;
}

export async function assertClockinDocReadAccess(req, doc) {
  if (!doc || doc.type !== 'clockin' || doc.deletedAt) return false;
  const requesterId = getAuthUserId(req);
  if (!requesterId) return false;
  const businessId = String(doc.business_id || '').trim();
  if (!businessId) return false;
  const business = await findBusinessById(req, businessId);
  if (!business) return false;
  const orgchart = await loadOrgChartForAccess(req, businessId);
  const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);
  return visibleIds.includes(doc.member_id);
}

export async function validateClockinDocWrite(req, body, docId) {
  const requesterId = getAuthUserId(req);
  if (!requesterId) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }

  const doc = body || {};
  const businessId = String(doc.business_id || '').trim();
  const memberId = String(doc.member_id || '').trim();
  if (!businessId || !memberId) {
    return { ok: false, status: 400, error: 'Faltan business_id o member_id' };
  }

  const business = await findBusinessById(req, businessId);
  if (!business) {
    return { ok: false, status: 404, error: 'Empresa no encontrada' };
  }

  if (!canMutateClockinForMember(business, requesterId, memberId)) {
    return { ok: false, status: 403, error: 'No puedes modificar fichajes de otro trabajador' };
  }

  if (docId) {
    const clockinsDb = getClockinsDbName();
    await ensureDatabase(req, clockinsDb);
    let existing = null;
    try {
      existing = await getDocument(req, clockinsDb, docId);
    } catch {
      existing = null;
    }
    if (existing) {
      if (String(existing.business_id || '') !== businessId) {
        return { ok: false, status: 403, error: 'Empresa del fichaje no coincide' };
      }
      if (String(existing.member_id || '') !== memberId) {
        return { ok: false, status: 403, error: 'No puedes cambiar el trabajador del fichaje' };
      }
    }
  }

  if (doc.type && doc.type !== 'clockin') {
    return { ok: false, status: 400, error: 'Tipo de documento inválido' };
  }

  return { ok: true };
}
