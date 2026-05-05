import crypto from 'node:crypto';
import { couchRequest, ensureDatabase } from './couchdb.js';

export const WEBHOOKS_DB = 'webhooks';

export const WEBHOOK_EVENTS = [
  'lead.created',
  'lead.updated',
  'sale.created',
  'vehicle.created',
  'vehicle.updated',
  'client.created',
  'ping',
];

function signPayload(secret, body) {
  const ts = Date.now();
  const toSign = `${ts}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  return { signature: `t=${ts},v1=${sig}`, ts };
}

async function fetchWebhooksForUser(req, userId) {
  try {
    await ensureDatabase(req, WEBHOOKS_DB).catch(() => {});
    const resp = await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/_all_docs?include_docs=true`);
    if (!resp.ok) return [];
    const body = await resp.json().catch(() => ({ rows: [] }));
    return (body.rows || [])
      .map((r) => r.doc)
      .filter(
        (d) =>
          d &&
          d.type === 'webhook' &&
          d.userId === userId &&
          d.active !== false &&
          !d.deletedAt &&
          !String(d._id || '').startsWith('_design/'),
      );
  } catch {
    return [];
  }
}

async function sendWebhookRequest(webhook, event, data, retries = 2) {
  const payload = JSON.stringify({
    event,
    data,
    webhookId: webhook._id,
    deliveredAt: new Date().toISOString(),
  });

  const { signature } = signPayload(webhook.secret || '', payload);
  const start = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'UdarEdge-Webhooks/1.0',
          'X-Udar-Event': event,
          'X-Udar-Signature': signature,
          'X-Udar-Webhook-Id': webhook._id || '',
        },
        body: payload,
        signal: AbortSignal.timeout(8000),
      });

      return { ok: resp.ok, status: resp.status, durationMs: Date.now() - start };
    } catch (err) {
      if (attempt === retries) {
        return { ok: false, status: 0, error: err.message, durationMs: Date.now() - start };
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function updateWebhookStatus(req, webhook, result) {
  try {
    const updated = {
      ...webhook,
      lastTriggeredAt: new Date().toISOString(),
      lastStatus: result.status,
      lastError: result.error || null,
    };
    await couchRequest(req, `/${encodeURIComponent(WEBHOOKS_DB)}/${encodeURIComponent(webhook._id)}`, {
      method: 'PUT',
      body: JSON.stringify(updated),
    });
  } catch {
    // fire-and-forget
  }
}

/**
 * Dispara webhooks salientes de forma asíncrona (no bloquea la respuesta HTTP).
 * @param {import('express').Request} req
 * @param {string} userId
 * @param {string} event  e.g. 'lead.created'
 * @param {object} data   payload del evento
 */
export async function dispatchWebhooks(req, userId, event, data) {
  // Ejecutar de forma no bloqueante
  setImmediate(async () => {
    try {
      const webhooks = await fetchWebhooksForUser(req, userId);
      const targets = webhooks.filter(
        (wh) => !Array.isArray(wh.events) || wh.events.length === 0 || wh.events.includes(event),
      );

      await Promise.allSettled(
        targets.map(async (wh) => {
          const result = await sendWebhookRequest(wh, event, data);
          await updateWebhookStatus(req, wh, result);
        }),
      );
    } catch {
      // silently ignore
    }
  });
}

/**
 * Envía un ping de prueba a un webhook específico (síncrono, devuelve resultado).
 */
export async function testWebhook(webhook, userId) {
  return sendWebhookRequest(webhook, 'ping', {
    message: 'Este es un evento de prueba desde Vertial',
    userId,
    sentAt: new Date().toISOString(),
  }, 0);
}
