/**
 * Notificaciones Eventos (campana + push fuera de la app).
 * El servidor resuelve el CEO/titular y aplica permisos; el front solo dispara.
 */
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import type { EventRecord } from './eventsTypes';
import { summarizeEventFinancials } from './eventsFinance';

async function postEventsNotify(
  userId: string,
  eventId: string,
  pathSuffix: 'notify-accepted' | 'notify-fully-paid',
  body?: Record<string, unknown>,
): Promise<void> {
  const uid = String(userId || '').trim();
  const eid = String(eventId || '').trim();
  if (!uid || !eid) return;

  const response = await authFetch(
    `${getApiBase()}/api/events-quotes/${encodeURIComponent(uid)}/${encodeURIComponent(eid)}/${pathSuffix}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  if (response.status === 401) {
    throw new Error('Sesión expirada');
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || 'Error al notificar evento');
  }
}

/** Aviso al CEO cuando el presupuesto pasa a aceptado (marca manual en SaaS). */
export async function notifyEventQuoteAccepted(
  userId: string,
  event: EventRecord,
): Promise<void> {
  if (!userId || !event?._id) return;
  try {
    await postEventsNotify(userId, event._id, 'notify-accepted');
  } catch {
    /* best-effort */
  }
}

/**
 * Si el evento acaba de quedar a 0 € pendiente, avisa al CEO (dedup en servidor).
 */
export async function maybeNotifyEventFullyPaid(
  userId: string,
  before: EventRecord,
  after: EventRecord,
): Promise<void> {
  const uid = String(userId || '').trim();
  if (!uid || !after?._id) return;
  const prev = summarizeEventFinancials(before);
  const next = summarizeEventFinancials(after);
  if (!(prev.pendiente > 0.01 && next.pendiente <= 0.01)) return;
  if (next.presupuesto <= 0) return;

  try {
    await postEventsNotify(uid, after._id, 'notify-fully-paid', {
      cobradoTotal: next.cobradoTotal,
    });
  } catch {
    /* best-effort */
  }
}
