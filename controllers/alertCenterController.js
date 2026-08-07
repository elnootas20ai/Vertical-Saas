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
  notificationMatchesScope,
  invalidateAlertScopeDocsCache,
} from '../services/couchdb.js';
import {
  mutateAlertStatus,
  mutateAlertAssignment,
  mutateAlertDeletion,
} from '../services/alertHistory.js';
import { ALERT_STATUSES, ALERT_PRIORITIES, ALERT_SOURCES } from '../services/alertConstants.js';

const ALERT_PUT_MAX_ATTEMPTS = 4;

function isRevisionConflict(error) {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /conflict|409|_rev|updated/i.test(msg);
}

async function updateAlertDocWithRetry(req, alertId, mutateFn, scopeId = null) {
  for (let attempt = 0; attempt < ALERT_PUT_MAX_ATTEMPTS; attempt += 1) {
    await ensureDatabase(req, NOTIFICATIONS_DB);
    const doc = await getDocument(req, NOTIFICATIONS_DB, alertId);
    if (!doc || doc.type !== 'notification' || doc.deletedAt) {
      return null;
    }
    // La alerta debe pertenecer al scope (businessId/userId) de la URL.
    if (scopeId && !notificationMatchesScope(doc, scopeId)) {
      return null;
    }

    const updated = mutateFn(doc);
    try {
      const result = await putDocument(req, NOTIFICATIONS_DB, alertId, updated);
      if (scopeId) invalidateAlertScopeDocsCache(scopeId);
      else if (updated?.businessId) invalidateAlertScopeDocsCache(updated.businessId);
      return { ...updated, _rev: result.rev };
    } catch (error) {
      if (attempt < ALERT_PUT_MAX_ATTEMPTS - 1 && isRevisionConflict(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Conflicto de concurrencia al guardar la alerta');
}

async function mapPool(items, concurrency, iterator) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await iterator(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

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

    if (!doc || doc.type !== 'notification' || !notificationMatchesScope(doc, businessId, { includeDeleted: true })) {
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

    const now = new Date().toISOString();
    const userId = req.authUser?.userId || null;
    const updated = await updateAlertDocWithRetry(req, alertId, (doc) =>
      mutateAlertStatus(doc, { status, userId, now }),
    businessId);

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }

    return res.json({
      ok: true,
      alert: sanitizeNotification(updated),
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

    const outcomes = await mapPool(ids, 10, async (id) => {
      try {
        const updated = await updateAlertDocWithRetry(req, id, (doc) =>
          mutateAlertStatus(doc, { status, userId, now }),
        businessId);
        return updated ? 'updated' : 'error';
      } catch {
        return 'error';
      }
    });

    const results = {
      updated: outcomes.filter((o) => o === 'updated').length,
      errors: outcomes.filter((o) => o !== 'updated').length,
    };

    return res.json({ ok: true, ...results });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error en actualización masiva',
    });
  }
}

/**
 * Resuelve todas las alertas pendientes del negocio (bandeja limpia).
 * No toca notificaciones RRHH personales ni reglas de settings.
 */
export async function resolveAllUnresolvedAlerts(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return res.status(400).json({ ok: false, error: 'Falta businessId' });
    }

    const listed = await listAlertsByBusiness(req, businessId, {
      status: 'new,seen',
      limit: 100,
      page: 1,
    });

    // Paginación: hasta 500 pendientes por clic (5 páginas).
    const ids = [...listed.items.map((d) => d._id || d.id).filter(Boolean)];
    let page = 2;
    while (page <= listed.pages && page <= 5 && ids.length < 500) {
      const more = await listAlertsByBusiness(req, businessId, {
        status: 'new,seen',
        limit: 100,
        page,
      });
      for (const d of more.items) {
        const id = d._id || d.id;
        if (id) ids.push(id);
      }
      page += 1;
    }

    if (ids.length === 0) {
      return res.json({ ok: true, updated: 0, errors: 0, message: 'No había alertas pendientes' });
    }

    const now = new Date().toISOString();
    const userId = req.authUser?.userId || null;

    const outcomes = await mapPool(ids, 10, async (id) => {
      try {
        const updated = await updateAlertDocWithRetry(
          req,
          id,
          (doc) => mutateAlertStatus(doc, { status: 'resolved', userId, now }),
          businessId,
        );
        return updated ? 'updated' : 'error';
      } catch {
        return 'error';
      }
    });

    return res.json({
      ok: true,
      updated: outcomes.filter((o) => o === 'updated').length,
      errors: outcomes.filter((o) => o !== 'updated').length,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error limpiando pendientes',
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

    if (!doc || doc.type !== 'notification' || doc.deletedAt || !notificationMatchesScope(doc, businessId)) {
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

    if (!doc || doc.type !== 'notification' || !notificationMatchesScope(doc, businessId)) {
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
