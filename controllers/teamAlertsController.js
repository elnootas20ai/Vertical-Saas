import { couchRequest, findBusinessById, getPayrollDbName } from '../services/couchdb.js';
import { computeProfileCompletionAlerts } from '../services/workerProfileCompletion.js';
import { assertBusinessTeamAccess, businessMemberUserIds } from '../services/businessAccess.js';

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

function computeDocAlerts(payrollDocs, members) {
  const alerts = [];
  const now = new Date();
  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  for (const doc of payrollDocs) {
    if (!doc.expiryDate) continue;
    const expiry = new Date(doc.expiryDate);
    const diff = expiry.getTime() - now.getTime();
    const member = memberMap.get(doc.worker_id);
    if (!member || member.status === 'inactive') continue;

    if (diff < 0) {
      alerts.push({
        id: `doc-expired-${doc._id}`,
        type: 'document_expired',
        severity: 'critical',
        workerId: doc.worker_id,
        workerName: doc.worker_name || member.fullName || '',
        message: `Documento "${doc.name}" caducado desde ${expiry.toLocaleDateString('es-ES')}`,
        metadata: { documentId: doc._id, documentName: doc.name, expiryDate: doc.expiryDate },
        createdAt: now.toISOString(),
      });
    } else if (diff < DAYS_30) {
      const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
      alerts.push({
        id: `doc-expiring-${doc._id}`,
        type: 'document_expiring',
        severity: 'warning',
        workerId: doc.worker_id,
        workerName: doc.worker_name || member.fullName || '',
        message: `Documento "${doc.name}" caduca en ${daysLeft} días`,
        metadata: { documentId: doc._id, documentName: doc.name, expiryDate: doc.expiryDate, daysLeft },
        createdAt: now.toISOString(),
      });
    }
  }
  return alerts;
}

function computeAssignmentAlerts(members) {
  const alerts = [];
  const now = new Date();

  for (const member of members) {
    if (member.status === 'inactive') continue;
    const assignments = member.employment?.assignments || [];
    const hasActive = assignments.some((a) => a.status === 'active');
    if (!hasActive) {
      alerts.push({
        id: `no-assignment-${member.user_id}`,
        type: 'no_assignment',
        severity: 'warning',
        workerId: member.user_id,
        workerName: member.fullName || '',
        message: `${member.fullName || 'Trabajador'} sin asignación activa`,
        metadata: {},
        createdAt: now.toISOString(),
      });
    }
  }
  return alerts;
}

function computeCostReviewAlerts(members) {
  const alerts = [];
  const now = new Date();

  for (const member of members) {
    if (member.status === 'inactive') continue;
    const nextReview = member.employment?.nextCostReview;
    if (!nextReview) continue;
    if (new Date(nextReview) < now) {
      alerts.push({
        id: `cost-review-${member.user_id}`,
        type: 'cost_review_pending',
        severity: 'info',
        workerId: member.user_id,
        workerName: member.fullName || '',
        message: `Revisión de coste pendiente para ${member.fullName || 'trabajador'}`,
        metadata: { nextCostReview: nextReview },
        createdAt: now.toISOString(),
      });
    }
  }
  return alerts;
}

function normalizeBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

async function loadBusinessMembers(req, businessId) {
  const business = await findBusinessById(req, businessId);
  if (!business) return { business: null, members: [] };

  const memberIds = businessMemberUserIds(business);
  if (memberIds.size === 0) {
    return { business, members: [] };
  }

  const authRes = await couchRequest('GET', `/auth-users/_all_docs?include_docs=true`);
  const allUsers = (authRes.rows || []).map((r) => r.doc).filter(Boolean);
  const members = allUsers.filter((u) => memberIds.has(u.user_id));
  return { business, members };
}

async function loadPayrollDocsForBusiness(businessId) {
  const bid = normalizeBusinessId(businessId);
  if (!bid) return [];
  try {
    const payrollDbName = getPayrollDbName();
    const payrollRes = await couchRequest(
      'GET',
      `/${encodeURIComponent(payrollDbName)}/_all_docs?include_docs=true`,
    );
    return (payrollRes.rows || [])
      .map((r) => r.doc)
      .filter(
        (d) =>
          d &&
          d.type === 'payroll' &&
          normalizeBusinessId(d.business_id) === bid,
      );
  } catch {
    return [];
  }
}

async function getTeamAlertsInternal(req, businessId) {
  const access = await assertBusinessTeamAccess(req, businessId);
  if (!access.ok) {
    const err = new Error(access.error);
    err.status = access.status;
    throw err;
  }

  const { members } = await loadBusinessMembers(req, businessId);
  const payrollDocs = await loadPayrollDocsForBusiness(businessId);

  const alerts = [
    ...computeDocAlerts(payrollDocs, members),
    ...computeAssignmentAlerts(members),
    ...computeCostReviewAlerts(members),
    ...computeProfileCompletionAlerts(members),
  ];

  return { alerts };
}

export async function getTeamAlerts(req, res) {
  try {
    const { businessId } = req.params;
    const { alerts } = await getTeamAlertsInternal(req, businessId);

    alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    });

    res.json({ alerts, total: alerts.length });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[teamAlerts] Error:', err.message);
    res.status(status).json({ error: err.message || 'Error al obtener alertas de equipo' });
  }
}

export async function getTeamAlertsSummary(req, res) {
  try {
    const result = await getTeamAlertsInternal(req, req.params.businessId);
    const { alerts } = result;
    res.json({
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
      byType: {
        document_expired: alerts.filter((a) => a.type === 'document_expired').length,
        document_expiring: alerts.filter((a) => a.type === 'document_expiring').length,
        no_assignment: alerts.filter((a) => a.type === 'no_assignment').length,
        cost_review_pending: alerts.filter((a) => a.type === 'cost_review_pending').length,
        profile_incomplete: alerts.filter((a) => a.type === 'profile_incomplete').length,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[teamAlertsSummary] Error:', err.message);
    res.status(status).json({ error: err.message || 'Error al obtener resumen de alertas' });
  }
}
