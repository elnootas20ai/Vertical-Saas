import { Router } from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { couchRequest, ensureDatabase } from '../services/couchdb.js';
import { WEBHOOKS_DB, WEBHOOK_EVENTS, testWebhook } from '../services/webhookService.js';

const webhooksRouter = Router();

function generateSecret() {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

function sanitizeWebhook(doc, includeSecret = false) {
  return {
    id: doc._id,
    userId: doc.userId,
    name: doc.name || '',
    url: doc.url || '',
    events: doc.events || [],
    active: doc.active !== false,
    createdAt: doc.createdAt || '',
    lastTriggeredAt: doc.lastTriggeredAt || null,
    lastStatus: doc.lastStatus || null,
    lastError: doc.lastError || null,
    ...(includeSecret ? { secret: doc.secret } : {}),
  };
}

// GET /api/webhooks?userId=xxx — Listar webhooks del usuario
webhooksRouter.get('/', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Falta userId en query params' });
    }

    await ensureDatabase(req, WEBHOOKS_DB).catch(() => {});

    const resp = await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/_all_docs?include_docs=true`);
    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: 'Error cargando webhooks' });
    }

    const body = await resp.json().catch(() => ({ rows: [] }));
    const webhooks = (body.rows || [])
      .map((r) => r.doc)
      .filter(
        (d) =>
          d &&
          d.type === 'webhook' &&
          d.userId === userId &&
          !d.deletedAt &&
          !String(d._id || '').startsWith('_design/'),
      )
      .map((d) => sanitizeWebhook(d))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return res.json({ ok: true, webhooks, availableEvents: WEBHOOK_EVENTS });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/webhooks — Crear webhook
webhooksRouter.post('/', async (req, res) => {
  try {
    const { name, url, userId, events, active } = req.body || {};

    if (!name || !url || !userId) {
      return res.status(400).json({ ok: false, error: 'Faltan campos requeridos: name, url, userId' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ ok: false, error: 'La URL del webhook no es válida' });
    }

    const invalidEvents = (events || []).filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Eventos inválidos: ${invalidEvents.join(', ')}`,
        validEvents: WEBHOOK_EVENTS,
      });
    }

    await ensureDatabase(req, WEBHOOKS_DB).catch(() => {});

    const secret = generateSecret();
    const now = new Date().toISOString();
    const doc = {
      _id: `wh_${uuidv4()}`,
      type: 'webhook',
      name: String(name).trim(),
      url: String(url).trim(),
      userId: String(userId),
      events: Array.isArray(events) ? events : [],
      secret,
      active: active !== false,
      createdAt: now,
      updatedAt: now,
      lastTriggeredAt: null,
      lastStatus: null,
      lastError: null,
    };

    const resp = await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}`, {
      method: 'POST',
      body: JSON.stringify(doc),
    });

    const payload = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: 'Error guardando webhook', details: payload });
    }

    return res.status(201).json({
      ok: true,
      webhook: sanitizeWebhook({ ...doc, _id: payload.id || doc._id }, true),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/webhooks/:id — Actualizar webhook
webhooksRouter.put('/:id', async (req, res) => {
  try {
    const webhookId = String(req.params.id || '').trim();
    if (!webhookId) {
      return res.status(400).json({ ok: false, error: 'Falta webhookId' });
    }

    const getResp = await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhookId)}`);
    if (!getResp.ok) {
      return res.status(404).json({ ok: false, error: 'Webhook no encontrado' });
    }

    const existing = await getResp.json().catch(() => ({}));

    const { name, url, events, active } = req.body || {};

    if (url) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ ok: false, error: 'La URL del webhook no es válida' });
      }
    }

    const invalidEvents = (events || []).filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Eventos inválidos: ${invalidEvents.join(', ')}`,
        validEvents: WEBHOOK_EVENTS,
      });
    }

    const updated = {
      ...existing,
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(url !== undefined ? { url: String(url).trim() } : {}),
      ...(events !== undefined ? { events: Array.isArray(events) ? events : [] } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
      updatedAt: new Date().toISOString(),
    };

    const putResp = await couchRequest(
      req,
      `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhookId)}`,
      { method: 'PUT', body: JSON.stringify(updated) },
    );

    if (!putResp.ok) {
      const payload = await putResp.json().catch(() => ({}));
      return res.status(putResp.status).json({ ok: false, error: 'Error actualizando webhook', details: payload });
    }

    return res.json({ ok: true, webhook: sanitizeWebhook(updated) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/webhooks/:id — Eliminar webhook
webhooksRouter.delete('/:id', async (req, res) => {
  try {
    const webhookId = String(req.params.id || '').trim();
    if (!webhookId) {
      return res.status(400).json({ ok: false, error: 'Falta webhookId' });
    }

    const getResp = await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhookId)}`);
    if (!getResp.ok) {
      return res.status(404).json({ ok: false, error: 'Webhook no encontrado' });
    }

    const doc = await getResp.json().catch(() => ({}));
    const deleted = { ...doc, deletedAt: new Date().toISOString(), active: false };

    const putResp = await couchRequest(
      req,
      `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhookId)}`,
      { method: 'PUT', body: JSON.stringify(deleted) },
    );

    if (!putResp.ok) {
      const payload = await putResp.json().catch(() => ({}));
      return res.status(putResp.status).json({ ok: false, error: 'Error eliminando webhook', details: payload });
    }

    return res.json({ ok: true, id: webhookId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/webhooks/:id/test — Enviar ping de prueba
webhooksRouter.post('/:id/test', async (req, res) => {
  try {
    const webhookId = String(req.params.id || '').trim();
    if (!webhookId) {
      return res.status(400).json({ ok: false, error: 'Falta webhookId' });
    }

    const getResp = await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhookId)}`);
    if (!getResp.ok) {
      return res.status(404).json({ ok: false, error: 'Webhook no encontrado' });
    }

    const doc = await getResp.json().catch(() => ({}));
    if (doc.deletedAt || doc.active === false) {
      return res.status(400).json({ ok: false, error: 'El webhook está desactivado' });
    }

    const result = await testWebhook(doc, doc.userId);

    const updated = { ...doc, lastTriggeredAt: new Date().toISOString(), lastStatus: result.status };
    couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhookId)}`, {
      method: 'PUT',
      body: JSON.stringify(updated),
    }).catch(() => {});

    return res.json({
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export { webhooksRouter };
