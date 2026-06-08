/**
 * Alert Center Controller — Centro unificado de alertas globales.
 *
 * Provee endpoints para listado paginado con filtros, resumen/contadores,
 * cambio de estado (seen/resolved), acciones masivas, asignación e historial.
 */

import {
  NOTIFICATIONS_DB,
  ensureDatabase,
  getDocument,
  putDocument,
  listAlertsByBusiness,
  getAlertsSummary,
  sanitizeNotification,
} from '../services/couchdb.js';
import {
  mutateAlertStatus,
  mutateAlertAssignment,
  mutateAlertDeletion,
} from '../services/alertHistory.js';
import { ALERT_STATUSES, ALERT_PRIORITIES, ALERT_SOURCES } from '../services/alertConstants.js';

function buildListFilters(query, defaults = {}) {
  return {
    status: query.status ?? defaults.status ?? null,
    priority: query.priority ?? defaults.priority ?? null,
    source: query.source ?? defaults.source ?? null,
    assignedTo: query.assignedTo ?? defaults.assignedTo ?? null,
    search: query.search ?? defaults.search ?? null,
    sort: query.sort ?? defaults.sort ?? 'createdAt',
    order: query.order ?? defaults.order ?? 'desc',
    page: query.page,
    limit: query.limit,
    from: query.from ?? defaults.from ?? null,
    to: query.to ?? defaults.to ?? null,
    includeDeleted: query.includeDeleted ?? defaults.includeDeleted ?? null,
    historyOnly: query.historyOnly ?? defaults.historyOnly ?? null,
  };
}

// ─── GET /api/alerts/:businessId/center ──────────────────────────────────────

export async function listAlerts(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const result = await listAlertsByBusiness(req, businessId, buildListFilters(req.query));

    return res.json({
      ok: true,
      alerts: result.items.map(sanitizeNotification),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error listando alertas',
    });
  }
}

// ─── GET /api/alerts/:businessId/history ─────────────────────────────────────

export async function listAlertHistory(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const result = await listAlertsByBusiness(req, businessId, buildListFilters(req.query, {
      historyOnly: true,
      sort: 'resolvedAt',
      order: 'desc',
    }));

    return res.json({
      ok: true,
      alerts: result.items.map(sanitizeNotification),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error listando historial de alertas',
    });
  }
}

// ─── GET /api/alerts/:businessId/:alertId/timeline ───────────────────────────

export async function getAlertTimeline(req, res) {
  try {
    const { businessId, alertId } = req.params;
    if (!businessId || !alertId) {
      return res.status(400).json({ ok: false, error: 'Faltan businessId o alertId' });
    }

    await ensureDatabase(req, NOTIFICATIONS_DB);
    const doc = await getDocument(req, NOTIFICATIONS_DB, alertId);

    if (!doc || doc.type !== 'notification') {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }

    const alert = sanitizeNotification(doc);
    return res.json({
      ok: true,
      alert,
      timeline: alert.statusHistory || [],
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error obteniendo historial de alerta',
    });
  }
}

// ─── GET /api/alerts/:businessId/summary ─────────────────────────────────────

export async function getAlertSummary(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const summary = await getAlertsSummary(req, businessId);

    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error obteniendo resumen de alertas',
    });
  }
}

// ─── PUT /api/alerts/:businessId/:alertId/status ─────────────────────────────

export async function updateAlertStatus(req, res) {
  try {
    const { businessId, alertId } = req.params;
    const { status } = req.body || {};

    if (!businessId || !alertId) {
      return res.status(400).json({ ok: false, error: 'Faltan businessId o alertId' });
    }
    if (!status || !ALERT_STATUSES.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `Estado inválido. Valores permitidos: ${ALERT_STATUSES.join(', ')}`,
      });
    }

    await ensureDatabase(req, NOTIFICATIONS_DB);
    const doc = await getDocument(req, NOTIFICATIONS_DB, alertId);

    if (!doc || doc.type !== 'notification' || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }

    const now = new Date().toISOString();
    const userId = req.authUser?.userId || null;
    const updated = mutateAlertStatus(doc, { status, userId, now });

    const result = await putDocument(req, NOTIFICATIONS_DB, alertId, updated);

    return res.json({
      ok: true,
      alert: sanitizeNotification({ ...updated, _rev: result.rev }),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error actualizando estado de alerta',
    });
  }
}

// ─── PUT /api/alerts/:businessId/bulk-status ─────────────────────────────────

export async function bulkUpdateAlertStatus(req, res) {
  try {
    const { businessId } = req.params;
    const { alertIds, status } = req.body || {};

    if (!businessId) {
      return res.status(400).json({ ok: false, error: 'Falta businessId' });
    }
    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'alertIds debe ser un array no vacío' });
    }
    if (!status || !ALERT_STATUSES.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `Estado inválido. Valores permitidos: ${ALERT_STATUSES.join(', ')}`,
      });
    }

    const maxBulk = 100;
    const ids = alertIds.slice(0, maxBulk);
    await ensureDatabase(req, NOTIFICATIONS_DB);

    const now = new Date().toISOString();
    const userId = req.authUser?.userId || null;
    const results = { updated: 0, errors: 0 };

    for (const id of ids) {
      try {
        const doc = await getDocument(req, NOTIFICATIONS_DB, id);
        if (!doc || doc.type !== 'notification' || doc.deletedAt) {
          results.errors++;
          continue;
        }

        const updated = mutateAlertStatus(doc, { status, userId, now });
        await putDocument(req, NOTIFICATIONS_DB, id, updated);
        results.updated++;
      } catch {
        results.errors++;
      }
    }

    return res.json({ ok: true, ...results });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error en actualización masiva',
    });
  }
}

// ─── PUT /api/alerts/:businessId/:alertId/assign ─────────────────────────────

export async function assignAlert(req, res) {
  try {
    const { businessId, alertId } = req.params;
    const { userIds, roles } = req.body || {};

    if (!businessId || !alertId) {
      return res.status(400).json({ ok: false, error: 'Faltan businessId o alertId' });
    }

    await ensureDatabase(req, NOTIFICATIONS_DB);
    const doc = await getDocument(req, NOTIFICATIONS_DB, alertId);

    if (!doc || doc.type !== 'notification' || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }

    const now = new Date().toISOString();
    const userId = req.authUser?.userId || null;
    const updated = mutateAlertAssignment(doc, { userIds, roles, userId, now });

    const result = await putDocument(req, NOTIFICATIONS_DB, alertId, updated);

    return res.json({
      ok: true,
      alert: sanitizeNotification({ ...updated, _rev: result.rev }),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error asignando alerta',
    });
  }
}

// ─── DELETE /api/alerts/:businessId/:alertId ─────────────────────────────────

export async function deleteAlert(req, res) {
  try {
    const { businessId, alertId } = req.params;

    if (!businessId || !alertId) {
      return res.status(400).json({ ok: false, error: 'Faltan businessId o alertId' });
    }

    await ensureDatabase(req, NOTIFICATIONS_DB);
    const doc = await getDocument(req, NOTIFICATIONS_DB, alertId);

    if (!doc || doc.type !== 'notification') {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }
    if (doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }

    const now = new Date().toISOString();
    const userId = req.authUser?.userId || null;
    const updated = mutateAlertDeletion(doc, { userId, now });

    await putDocument(req, NOTIFICATIONS_DB, alertId, updated);

    return res.json({ ok: true, message: 'Alerta eliminada' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error eliminando alerta',
    });
  }
}
