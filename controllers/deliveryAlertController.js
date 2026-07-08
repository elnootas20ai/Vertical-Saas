import {
  NOTIFICATIONS_DB,
  ensureDatabase,
  findAccountByUserId,
  getDocument,
  listAlertsByBusiness,
  putDocument,
  sanitizeNotification,
  saveAccount,
} from '../services/couchdb.js';
import { appendAlertHistory, mutateAlertStatus } from '../services/alertHistory.js';
import { broadcastToBusiness } from '../services/sseService.js';
import {
  getDeliveryAlertSummary,
  getDeliveryAlertConfig,
  runDeliveryAlerts,
} from '../services/deliveryAlertEngine.js';

const fakeReq = { headers: {} };
const ALERT_PUT_MAX_ATTEMPTS = 4;

function isRevisionConflict(error) {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /conflict|409|_rev|updated/i.test(msg);
}

async function updateDeliveryAlertDoc(req, alertId, mutateFn) {
  for (let attempt = 0; attempt < ALERT_PUT_MAX_ATTEMPTS; attempt += 1) {
    await ensureDatabase(req, NOTIFICATIONS_DB);
    const doc = await getDocument(req, NOTIFICATIONS_DB, alertId);
    if (!doc || doc.type !== 'notification' || doc.deletedAt) return null;

    const updated = mutateFn(doc);
    try {
      const result = await putDocument(req, NOTIFICATIONS_DB, alertId, updated);
      return { ...updated, _rev: result.rev };
    } catch (error) {
      if (attempt < ALERT_PUT_MAX_ATTEMPTS - 1 && isRevisionConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('Conflicto de concurrencia al guardar la alerta');
}

export async function getDeliveryAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const { priority, alertType, limit } = req.query;
    let result = await getDeliveryAlertSummary(userId);

    let alerts = result.alerts || [];
    if (priority) alerts = alerts.filter((a) => a.priority === priority);
    if (alertType) alerts = alerts.filter((a) => a.alertType === alertType);

    alerts.sort((a, b) => {
      const pOrder = { high: 0, medium: 1, low: 2 };
      return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
    });

    const maxItems = Math.min(Number(limit) || 100, 500);
    alerts = alerts.slice(0, maxItems);

    return res.json({ ok: true, alerts, summary: result.summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo alertas delivery' });
  }
}

export async function getActiveDeliveryAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const result = await getDeliveryAlertSummary(userId);
    const alerts = (result.alerts || [])
      .sort((a, b) => {
        const pOrder = { high: 0, medium: 1, low: 2 };
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      })
      .slice(0, 50);

    return res.json({
      ok: true,
      alerts,
      total: result.summary.total,
      byPriority: result.summary.byPriority,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo alertas activas' });
  }
}

export async function getDeliveryAlertSettings(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    return res.json({ ok: true, config: getDeliveryAlertConfig(account) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo config alertas delivery' });
  }
}

export async function updateDeliveryAlertSettings(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const body = req.body || {};
    const current = account.alertConfig || {};
    const currentDelivery = current.delivery || {};

    const allowedBooleans = [
      'enabled', 'delayedOrderEnabled', 'kitchenSaturationEnabled', 'productOutOfStockEnabled',
      'riderSaturationEnabled', 'cashPendingCloseEnabled', 'channelDownEnabled',
      'lowMarginEnabled', 'failedDeliveryEnabled', 'unpaidOrderEnabled', 'repeatIncidentEnabled',
    ];
    const allowedNumbers = [
      'kitchenCapacity', 'kitchenWarningPercent', 'kitchenCriticalPercent',
      'maxOrdersPerRider', 'riderWarningRatio', 'cashWarningMinutes',
      'channelSilenceMinutes', 'lowMarginThresholdPercent',
      'failedDeliveryThreshold', 'unpaidGraceMinutes',
      'repeatIncidentThreshold', 'repeatIncidentWindowDays', 'engineIntervalSeconds',
      'cashMaxOpenHours',
    ];
    const allowedStrings = ['cashCloseDeadline'];

    const updated = { ...currentDelivery };
    for (const key of allowedBooleans) {
      if (body[key] !== undefined) updated[key] = Boolean(body[key]);
    }
    for (const key of allowedNumbers) {
      if (body[key] !== undefined) {
        const val = Number(body[key]);
        if (!Number.isNaN(val) && val >= 0) updated[key] = val;
      }
    }
    for (const key of allowedStrings) {
      if (body[key] !== undefined) updated[key] = String(body[key]);
    }
    if (body.delayThresholds && typeof body.delayThresholds === 'object') {
      updated.delayThresholds = { ...(currentDelivery.delayThresholds || {}) };
      for (const phase of ['pending', 'preparing', 'kitchen', 'assembly', 'delivery']) {
        if (body.delayThresholds[phase] !== undefined) {
          const val = Number(body.delayThresholds[phase]);
          if (!Number.isNaN(val) && val > 0) updated.delayThresholds[phase] = val;
        }
      }
    }
    if (Array.isArray(body.monitoredChannels)) {
      updated.monitoredChannels = body.monitoredChannels.filter((c) => typeof c === 'string');
    }

    const updatedConfig = { ...current, delivery: updated };
    const updatedAccount = { ...account, alertConfig: updatedConfig, updatedAt: new Date().toISOString() };
    await saveAccount(req, updatedAccount);

    return res.json({ ok: true, config: getDeliveryAlertConfig(updatedAccount) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error actualizando config alertas delivery' });
  }
}

export async function triggerDeliveryAlertCheck(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    await runDeliveryAlerts();
    const result = await getDeliveryAlertSummary(userId);

    return res.json({ ok: true, message: 'Chequeo ejecutado', summary: result.summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error ejecutando chequeo' });
  }
}

export async function acknowledgeDeliveryAlert(req, res) {
  try {
    const { alertId } = req.params;
    if (!alertId) return res.status(400).json({ ok: false, error: 'Falta alertId' });

    const userId = req.authUser?.userId || req.body?.userId || null;
    const now = new Date().toISOString();
    const updated = await updateDeliveryAlertDoc(req, alertId, (doc) => {
      const next = doc.status === 'new' || !doc.status
        ? mutateAlertStatus(doc, { status: 'seen', userId, now })
        : { ...doc, updatedAt: now };
      next.acknowledgedAt = now;
      next.acknowledgedBy = userId;
      next.statusHistory = appendAlertHistory(next, { action: 'acknowledged', by: userId, at: now });
      return next;
    });

    if (!updated) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });

    if (updated.businessId) {
      broadcastToBusiness(updated.businessId, 'delivery:alert_acknowledged', {
        alertId, acknowledgedBy: userId, acknowledgedAt: now,
      });
    }
    return res.json({ ok: true, alert: sanitizeNotification(updated) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error reconociendo alerta' });
  }
}

export async function dismissDeliveryAlert(req, res) {
  try {
    const { alertId } = req.params;
    if (!alertId) return res.status(400).json({ ok: false, error: 'Falta alertId' });

    const userId = req.authUser?.userId || req.body?.userId || null;
    const now = new Date().toISOString();
    const updated = await updateDeliveryAlertDoc(req, alertId, (doc) => {
      const next = mutateAlertStatus(doc, { status: 'resolved', userId, now });
      next.dismissedAt = now;
      next.dismissedBy = userId;
      next.statusHistory = appendAlertHistory(next, { action: 'dismissed', by: userId, at: now });
      return next;
    });

    if (!updated) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });

    if (updated.businessId) {
      broadcastToBusiness(updated.businessId, 'delivery:alert_resolved', {
        alertId, alertType: updated.metadata?.alertType || updated.category, resolvedAt: now,
      });
    }
    return res.json({ ok: true, alert: sanitizeNotification(updated) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error descartando alerta' });
  }
}

export async function getDeliveryAlertHistory(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const scopeId = account.businessId || userId;

    const result = await listAlertsByBusiness(req, scopeId, {
      historyOnly: true,
      source: 'delivery',
      from,
      sort: 'resolvedAt',
      order: 'desc',
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.json({
      ok: true,
      alerts: result.items.map(sanitizeNotification),
      pagination: { total: result.total, page: result.page, limit: result.limit, pages: result.pages },
      windowDays: days,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo historial de alertas' });
  }
}

export async function getDeliveryAlertStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const result = await getDeliveryAlertSummary(userId);
    return res.json({ ok: true, stats: result.summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo estadisticas' });
  }
}
