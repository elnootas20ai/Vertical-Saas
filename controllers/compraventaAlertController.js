import {
  findAccountByUserId,
  saveAccount,
  NOTIFICATIONS_DB,
  VEHICLES_DB,
  getSalesDbName,
  getLeadsDbName,
  getDocumentsDbName,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
} from '../services/couchdb.js';
import {
  getCompraventaAlertConfig,
  getCompraventaAlertSummary,
  runCompraventaAlerts,
} from '../services/compraventaAlertEngine.js';
import {
  fetchAllDocsOfType,
  fetchAllDocs,
} from '../services/alertEmitter.js';
import logger from '../services/logger.js';

const fakeReq = { headers: {} };

// ─── GET /compraventa/alerts/:userId ─────────────────────────────────────────

export async function getCompraventaAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const { priority, classification, category, status, limit, offset } = req.query;

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const allNotifs = await getAllDocuments(fakeReq, NOTIFICATIONS_DB);

    let alerts = allNotifs.filter((n) =>
      n?.type === 'notification' &&
      n?.source === 'compraventa' &&
      !n?.deletedAt &&
      (n?.user_id === userId || (n?.assignedTo?.userIds || []).includes(userId)),
    );

    if (priority) alerts = alerts.filter((a) => a.priority === priority);
    if (classification) alerts = alerts.filter((a) => a.metadata?.classification === classification);
    if (category) alerts = alerts.filter((a) => a.category === category);
    if (status) alerts = alerts.filter((a) => a.status === status);

    alerts.sort((a, b) => {
      const pOrder = { high: 0, medium: 1, low: 2 };
      const pDiff = (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      if (pDiff !== 0) return pDiff;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    const total = alerts.length;
    const startIdx = Number(offset) || 0;
    const maxItems = Math.min(Number(limit) || 100, 500);
    alerts = alerts.slice(startIdx, startIdx + maxItems);

    const byClassification = { comercial: 0, economica: 0, documental: 0 };
    const byPriority = { high: 0, medium: 0, low: 0 };
    allNotifs.filter((n) =>
      n?.type === 'notification' && n?.source === 'compraventa' && !n?.deletedAt &&
      n?.status === 'new' &&
      (n?.user_id === userId || (n?.assignedTo?.userIds || []).includes(userId)),
    ).forEach((a) => {
      const cls = a.metadata?.classification;
      if (cls && byClassification[cls] !== undefined) byClassification[cls]++;
      if (a.priority && byPriority[a.priority] !== undefined) byPriority[a.priority]++;
    });

    return res.json({
      ok: true,
      alerts,
      total,
      summary: { byClassification, byPriority },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo alertas compraventa' });
  }
}

// ─── GET /compraventa/alerts/:userId/summary ─────────────────────────────────

export async function getCompraventaAlertsSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const config = getCompraventaAlertConfig(account);

    const [vehicles, sales, leads, documents] = await Promise.all([
      fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'car' && i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getSalesDbName(), 'sale').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getLeadsDbName(), 'lead').then((d) => d.filter((i) => i.user_id === userId || i.responsible === userId)).catch(() => []),
      fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)).catch(() => []),
    ]);

    const summary = await getCompraventaAlertSummary(userId, vehicles, sales, leads, documents, config);
    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo resumen compraventa' });
  }
}

// ─── POST /compraventa/alerts/:userId/:alertId/acknowledge ───────────────────

export async function acknowledgeCompraventaAlert(req, res) {
  try {
    const { userId, alertId } = req.params;
    if (!userId || !alertId) return res.status(400).json({ ok: false, error: 'Faltan parámetros' });

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const doc = await getDocument(fakeReq, NOTIFICATIONS_DB, alertId);
    if (!doc?._id) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    if (doc.source !== 'compraventa') return res.status(400).json({ ok: false, error: 'La alerta no es de compraventa' });

    const updated = {
      ...doc,
      status: 'seen',
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: userId,
    };
    await putDocument(fakeReq, NOTIFICATIONS_DB, updated._id, updated);

    return res.json({ ok: true, alert: { id: updated._id, status: updated.status, acknowledgedAt: updated.acknowledgedAt } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error reconociendo alerta' });
  }
}

// ─── POST /compraventa/alerts/:userId/:alertId/dismiss ───────────────────────

export async function dismissCompraventaAlert(req, res) {
  try {
    const { userId, alertId } = req.params;
    if (!userId || !alertId) return res.status(400).json({ ok: false, error: 'Faltan parámetros' });

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const doc = await getDocument(fakeReq, NOTIFICATIONS_DB, alertId);
    if (!doc?._id) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    if (doc.source !== 'compraventa') return res.status(400).json({ ok: false, error: 'La alerta no es de compraventa' });

    const updated = {
      ...doc,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: userId,
      metadata: { ...(doc.metadata || {}), dismissReason: req.body?.reason || 'manual' },
    };
    await putDocument(fakeReq, NOTIFICATIONS_DB, updated._id, updated);

    return res.json({ ok: true, alert: { id: updated._id, status: updated.status, resolvedAt: updated.resolvedAt } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error descartando alerta' });
  }
}

// ─── GET /compraventa/alerts/:userId/history ─────────────────────────────────

export async function getCompraventaAlertHistory(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const { from, to, category, limit } = req.query;

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const allNotifs = await getAllDocuments(fakeReq, NOTIFICATIONS_DB);

    let alerts = allNotifs.filter((n) =>
      n?.type === 'notification' &&
      n?.source === 'compraventa' &&
      (n?.status === 'seen' || n?.status === 'resolved') &&
      (n?.user_id === userId || (n?.assignedTo?.userIds || []).includes(userId)),
    );

    if (from) alerts = alerts.filter((a) => (a.createdAt || '') >= from);
    if (to) alerts = alerts.filter((a) => (a.createdAt || '') <= to);
    if (category) alerts = alerts.filter((a) => a.category === category);

    alerts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const maxItems = Math.min(Number(limit) || 100, 500);
    alerts = alerts.slice(0, maxItems);

    return res.json({ ok: true, alerts, total: alerts.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo historial' });
  }
}

// ─── GET /compraventa/alerts/:userId/config ──────────────────────────────────

export async function getCompraventaAlertSettings(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    return res.json({ ok: true, config: getCompraventaAlertConfig(account) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo config compraventa' });
  }
}

// ─── PUT /compraventa/alerts/:userId/config ──────────────────────────────────

export async function updateCompraventaAlertSettings(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const body = req.body || {};
    const current = account.alertConfig || {};
    const currentCv = current.compraventa || {};

    const allowedBooleans = [
      'enabled', 'missingDocsEnabled', 'reservationNoContractEnabled',
      'saleUnpaidEnabled', 'vehicleStagnantEnabled', 'expenseNoInvoiceEnabled',
      'priceBelowMinEnabled', 'leadNoFollowUpEnabled', 'pendingDeliveryEnabled',
      'reservationExpiredEnabled', 'stockItvEnabled', 'lowAvgMarginEnabled',
    ];

    const allowedNumbers = [
      'missingDocsGraceDays', 'reservationNoContractDays',
      'saleUnpaidDays', 'saleUnpaidCriticalDays',
      'vehicleStagnantWarningDays', 'vehicleStagnantHighDays', 'vehicleStagnantCriticalDays',
      'expenseNoInvoiceGraceDays',
      'leadNoFollowUpDays', 'leadNoFollowUpCriticalDays',
      'pendingDeliveryDays', 'pendingDeliveryCriticalDays',
      'reservationExpiredDays', 'stockItvWarningDays',
      'lowAvgMarginThresholdPercent',
    ];

    const updated = { ...currentCv };
    for (const key of allowedBooleans) {
      if (body[key] !== undefined) updated[key] = Boolean(body[key]);
    }
    for (const key of allowedNumbers) {
      if (body[key] !== undefined) {
        const val = Number(body[key]);
        if (!Number.isNaN(val) && val >= 0) updated[key] = val;
      }
    }
    if (Array.isArray(body.requiredDocs)) {
      updated.requiredDocs = body.requiredDocs.filter((d) => typeof d === 'string');
    }

    const updatedConfig = { ...current, compraventa: updated };
    const updatedAccount = { ...account, alertConfig: updatedConfig, updatedAt: new Date().toISOString() };
    await saveAccount(req, updatedAccount);

    return res.json({ ok: true, config: getCompraventaAlertConfig(updatedAccount) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error actualizando config compraventa' });
  }
}

// ─── POST /compraventa/alerts/:userId/check ──────────────────────────────────

export async function triggerCompraventaAlertCheck(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const config = getCompraventaAlertConfig(account);
    const ctx = { businessId: account.businessId || '', userId };

    const [vehicles, sales, leads, documents] = await Promise.all([
      fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'car' && i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getSalesDbName(), 'sale').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getLeadsDbName(), 'lead').then((d) => d.filter((i) => i.user_id === userId || i.responsible === userId)).catch(() => []),
      fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)).catch(() => []),
    ]);

    const results = await runCompraventaAlerts(ctx, config, vehicles, sales, leads, documents);

    return res.json({
      ok: true,
      message: 'Chequeo compraventa ejecutado',
      alertsGenerated: results.length,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error ejecutando chequeo compraventa' });
  }
}
