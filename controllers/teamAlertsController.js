import { couchRequest } from '../services/couchdb.js';

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

function computeDocAlerts(payrollDocs, members) {
  const alerts = [];
  const now = new Date();
  const memberMap = new Map(members.map(m => [m.user_id, m]));

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
    const hasActive = assignments.some(a => a.status === 'active');
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

export async function getTeamAlerts(req, res) {
  try {
    const { businessId } = req.params;

    const authRes = await couchRequest('GET', `/auth-users/_all_docs?include_docs=true`);
    const allUsers = (authRes.rows || []).map(r => r.doc).filter(Boolean);
    const members = allUsers.filter(u =>
      u.linkedBusinessId === businessId ||
      u.onboardingData?.businessId === businessId
    );

    let payrollDocs = [];
    try {
      const payrollDbName = `${businessId}-payroll`;
      const payrollRes = await couchRequest('GET', `/${encodeURIComponent(payrollDbName)}/_all_docs?include_docs=true`);
      payrollDocs = (payrollRes.rows || []).map(r => r.doc).filter(d => d && d.type === 'payroll');
    } catch {
      // DB might not exist yet
    }

    const docAlerts = computeDocAlerts(payrollDocs, members);
    const assignmentAlerts = computeAssignmentAlerts(members);
    const costAlerts = computeCostReviewAlerts(members);
    const allAlerts = [...docAlerts, ...assignmentAlerts, ...costAlerts];

    allAlerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    });

    res.json({ alerts: allAlerts, total: allAlerts.length });
  } catch (err) {
    console.error('[teamAlerts] Error:', err.message);
    res.status(500).json({ error: 'Error al obtener alertas de equipo' });
  }
}

export async function getTeamAlertsSummary(req, res) {
  try {
    const result = await getTeamAlertsInternal(req.params.businessId);
    const { alerts } = result;
    res.json({
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
      byType: {
        document_expired: alerts.filter(a => a.type === 'document_expired').length,
        document_expiring: alerts.filter(a => a.type === 'document_expiring').length,
        no_assignment: alerts.filter(a => a.type === 'no_assignment').length,
        cost_review_pending: alerts.filter(a => a.type === 'cost_review_pending').length,
      },
    });
  } catch (err) {
    console.error('[teamAlertsSummary] Error:', err.message);
    res.status(500).json({ error: 'Error al obtener resumen de alertas' });
  }
}

async function getTeamAlertsInternal(businessId) {
  const authRes = await couchRequest('GET', `/auth-users/_all_docs?include_docs=true`);
  const allUsers = (authRes.rows || []).map(r => r.doc).filter(Boolean);
  const members = allUsers.filter(u =>
    u.linkedBusinessId === businessId ||
    u.onboardingData?.businessId === businessId
  );

  let payrollDocs = [];
  try {
    const payrollDbName = `${businessId}-payroll`;
    const payrollRes = await couchRequest('GET', `/${encodeURIComponent(payrollDbName)}/_all_docs?include_docs=true`);
    payrollDocs = (payrollRes.rows || []).map(r => r.doc).filter(d => d && d.type === 'payroll');
  } catch {
    // DB might not exist
  }

  const alerts = [
    ...computeDocAlerts(payrollDocs, members),
    ...computeAssignmentAlerts(members),
    ...computeCostReviewAlerts(members),
  ];

  return { alerts };
}
