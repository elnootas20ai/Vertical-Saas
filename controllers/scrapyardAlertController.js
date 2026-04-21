/**
 * Scrapyard Alert Controller — Endpoints para alertas de la vertical desguaces.
 */

import {
  NOTIFICATIONS_DB,
  ensureDatabase,
  getAllDocuments,
  couchRequest,
  VEHICLES_DB,
  getScrapyardDbName,
  getScrapyardSalesDbName,
  getDocumentsDbName,
  findAccountByUserId,
} from '../services/couchdb.js';
import { getScrapyardAlertConfig, computeScrapyardAlertSummary } from '../services/scrapyardAlertEngine.js';
import { broadcastToUser } from '../services/sseService.js';
import logger from '../services/logger.js';

const TAG = 'SCRAPYARD_ALERT_CTRL';
const fakeReq = { headers: {} };

async function fetchAllDocsOfType(dbName, type) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d?.type === type && !d?.deletedAt);
  } catch { return []; }
}

async function fetchAllDocs(dbName) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
  } catch { return []; }
}

export async function getScrapyardAlerts(req, res) {
  try {
    const userId = req.params.userId || req.userId;
    if (!userId) return res.status(400).json({ ok: false, error: 'userId requerido' });

    const { classification, priority, status, from, to, limit: lim, offset: off } = req.query;
    const limitN = Math.min(Number(lim) || 50, 200);
    const offsetN = Number(off) || 0;

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const allNotifs = await getAllDocuments(fakeReq, NOTIFICATIONS_DB);

    let alerts = allNotifs.filter((n) => {
      if (!n || n.deletedAt) return false;
      if (n.source !== 'desguaces') return false;
      const assigned = n.assignedTo?.userIds || [];
      if (n.userId !== userId && !assigned.includes(userId)) return false;
      return true;
    });

    if (classification) alerts = alerts.filter((n) => n.metadata?.classification === classification);
    if (priority) alerts = alerts.filter((n) => n.priority === priority);
    if (status) {
      if (status === 'active') alerts = alerts.filter((n) => n.status === 'new' || n.status === 'seen');
      else if (status === 'resolved') alerts = alerts.filter((n) => n.status === 'resolved');
      else alerts = alerts.filter((n) => n.status === status);
    }
    if (from) alerts = alerts.filter((n) => n.createdAt >= from);
    if (to) alerts = alerts.filter((n) => n.createdAt <= to);

    alerts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const total = alerts.length;

    const byPriority = { high: 0, medium: 0, low: 0 };
    const byClassification = {};
    const byType = {};
    let active = 0;
    let resolved = 0;
    for (const a of alerts) {
      if (a.priority) byPriority[a.priority] = (byPriority[a.priority] || 0) + 1;
      const cls = a.metadata?.classification || 'other';
      byClassification[cls] = (byClassification[cls] || 0) + 1;
      if (a.category) byType[a.category] = (byType[a.category] || 0) + 1;
      if (a.status === 'resolved') resolved++;
      else active++;
    }

    const paged = alerts.slice(offsetN, offsetN + limitN);

    return res.json({
      ok: true,
      alerts: paged,
      total,
      summary: { active, resolved, byPriority, byClassification, byType },
    });
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error listando alertas desguace');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

export async function getScrapyardAlertSummary(req, res) {
  try {
    const userId = req.params.userId || req.userId;
    if (!userId) return res.status(400).json({ ok: false, error: 'userId requerido' });

    const account = await findAccountByUserId(fakeReq, userId);
    const config = getScrapyardAlertConfig(account);

    const [vehicles, parts, sessions, sales, documents] = await Promise.all([
      fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'car' && i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getScrapyardDbName(), 'scrapyard_part').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getScrapyardDbName(), 'dismantling_session').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocs(getScrapyardSalesDbName()).then((d) => d.filter((i) => i.type === 'scrapyard_sale' && i.user_id === userId && !i.deletedAt)).catch(() => []),
      fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)).catch(() => []),
    ]);

    const summary = computeScrapyardAlertSummary(vehicles, parts, sessions, sales, config);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error generando summary alertas desguace');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

export async function acknowledgeAlert(req, res) {
  try {
    const { alertId } = req.params;
    if (!alertId) return res.status(400).json({ ok: false, error: 'alertId requerido' });

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const doc = await couchRequest(fakeReq, `/${encodeURIComponent(NOTIFICATIONS_DB)}/${encodeURIComponent(alertId)}`);
    if (!doc?._id) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });

    doc.status = 'seen';
    doc.acknowledgedAt = new Date().toISOString();
    doc.acknowledgedBy = req.userId || '';
    await couchRequest(fakeReq, `/${encodeURIComponent(NOTIFICATIONS_DB)}/${encodeURIComponent(alertId)}`, { method: 'PUT', body: JSON.stringify(doc) });

    if (doc.userId) {
      broadcastToUser(doc.userId, 'scrapyard:alert_acknowledged', { alertId, acknowledgedBy: doc.acknowledgedBy });
    }

    return res.json({ ok: true, alertId, status: 'seen' });
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error reconociendo alerta');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

export async function dismissAlert(req, res) {
  try {
    const { alertId } = req.params;
    if (!alertId) return res.status(400).json({ ok: false, error: 'alertId requerido' });

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const doc = await couchRequest(fakeReq, `/${encodeURIComponent(NOTIFICATIONS_DB)}/${encodeURIComponent(alertId)}`);
    if (!doc?._id) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });

    doc.status = 'resolved';
    doc.resolvedAt = new Date().toISOString();
    doc.dismissedBy = req.userId || '';
    await couchRequest(fakeReq, `/${encodeURIComponent(NOTIFICATIONS_DB)}/${encodeURIComponent(alertId)}`, { method: 'PUT', body: JSON.stringify(doc) });

    if (doc.userId) {
      broadcastToUser(doc.userId, 'scrapyard:alert_resolved', { alertId, resolvedAt: doc.resolvedAt });
    }

    return res.json({ ok: true, alertId, status: 'resolved' });
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error descartando alerta');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

export async function getScrapyardAlertHistory(req, res) {
  try {
    const userId = req.params.userId || req.userId;
    if (!userId) return res.status(400).json({ ok: false, error: 'userId requerido' });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const allNotifs = await getAllDocuments(fakeReq, NOTIFICATIONS_DB);

    const alerts = allNotifs
      .filter((n) => {
        if (!n || n.deletedAt) return false;
        if (n.source !== 'desguaces') return false;
        if (n.createdAt < thirtyDaysAgo) return false;
        const assigned = n.assignedTo?.userIds || [];
        return n.userId === userId || assigned.includes(userId);
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({ ok: true, alerts, total: alerts.length });
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error obteniendo historial de alertas');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}
