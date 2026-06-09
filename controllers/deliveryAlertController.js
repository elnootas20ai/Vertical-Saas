import { findAccountByUserId, saveAccount } from '../services/couchdb.js';
import {
  getDeliveryAlertSummary,
  getDeliveryAlertConfig,
  runDeliveryAlerts,
} from '../services/deliveryAlertEngine.js';

const fakeReq = { headers: {} };

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
