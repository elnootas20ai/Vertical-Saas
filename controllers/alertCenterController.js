/**
 * Alert Center Controller — Centro unificado de alertas globales.
 *
 * Provee endpoints para listado paginado con filtros, resumen/contadores,
 * cambio de estado (seen/resolved), acciones masivas y asignación.
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
import { ALERT_STATUSES, ALERT_PRIORITIES, ALERT_SOURCES } from '../services/alertConstants.js';

// ─── GET /api/alerts/:businessId/center ──────────────────────────────────────

export async function listAlerts(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const filters = {
      status: req.query.status || null,
      priority: req.query.priority || null,
      source: req.query.source || null,
      assignedTo: req.query.assignedTo || null,
      search: req.query.search || null,
      sort: req.query.sort || 'createdAt',
      order: req.query.order || 'desc',
      page: req.query.page,
      limit: req.query.limit,
      from: req.query.from || null,
      to: req.query.to || null,
    };

    const result = await listAlertsByBusiness(req, businessId, filters);

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
    const updated = {
      ...doc,
      status,
      read: status !== 'new',
      updatedAt: now,
    };

    if (status === 'resolved') {
      updated.resolvedAt = now;
      updated.resolvedBy = userId;
    }

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

        const updated = {
          ...doc,
          status,
          read: status !== 'new',
          updatedAt: now,
        };

        if (status === 'resolved') {
          updated.resolvedAt = now;
          updated.resolvedBy = userId;
        }

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

    const assignedTo = {
      userIds: Array.isArray(userIds) ? userIds.map(String).slice(0, 50) : (doc.assignedTo?.userIds || []),
      roles: Array.isArray(roles) ? roles.map(String).slice(0, 20) : (doc.assignedTo?.roles || []),
    };

    const updated = {
      ...doc,
      assignedTo,
      updatedAt: new Date().toISOString(),
    };

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

    const updated = {
      ...doc,
      deletedAt: new Date().toISOString(),
      deletedBy: req.authUser?.userId || null,
      updatedAt: new Date().toISOString(),
    };

    await putDocument(req, NOTIFICATIONS_DB, alertId, updated);

    return res.json({ ok: true, message: 'Alerta eliminada' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error eliminando alerta',
    });
  }
}
