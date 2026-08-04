/**
 * API de caja para bar/restaurante — sesiones TPV + pedidos de sala.
 * No importa deliveryApi ni pedidos delivery.
 */
import { authFetch } from './authApi';
import { getApiBase } from './apiBase';
import type { TpvRegisterSession } from './deliveryApi';
import { listDiningOrdersRequest, type DiningOrder } from './salaApi';

const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en caja restaurante');
  }
  return payload;
}

export type ListRestaurantRegisterSessionsOptions = {
  /** Filtra turnos al negocio actual (p. ej. Bodegeta) y sus PDV. */
  businessId?: string | null;
  salesPointId?: string | null;
};

function sessionBusinessId(session: TpvRegisterSession): string {
  const row = session as TpvRegisterSession & { businessId?: string };
  return String(row.business_id || row.businessId || '').trim();
}

/** Filtra sesiones al negocio/PDV restaurant (evita turnos delivery de otras empresas). */
export function filterRestaurantRegisterSessions(
  sessions: TpvRegisterSession[],
  options?: { businessId?: string | null; pointOfSaleIds?: Iterable<string> | null },
): TpvRegisterSession[] {
  const bid = String(options?.businessId || '').trim();
  const pdvIds = new Set(
    Array.from(options?.pointOfSaleIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  return (sessions || []).filter((session) => {
    const sessionBid = sessionBusinessId(session);
    if (bid && sessionBid && sessionBid !== bid) return false;
    const pdvId = String(session.pointOfSaleId || '').trim();
    if (!pdvId) return false;
    // Con PDVs del local (Bodegeta, etc.): solo turnos de esos PDV.
    if (pdvIds.size > 0) return pdvIds.has(pdvId);
    // PDVs aún no cargados: mantener lo que vino del API (ya filtrado por businessId).
    return true;
  });
}

/** Sesiones de caja TPV del negocio restaurant (mismo motor de sesiones, scope por businessId). */
export async function listRestaurantRegisterSessions(
  userId: string,
  options?: ListRestaurantRegisterSessionsOptions,
): Promise<TpvRegisterSession[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  const businessId = String(options?.businessId || '').trim();
  const salesPointId = String(options?.salesPointId || '').trim();
  if (businessId) params.set('businessId', businessId);
  if (salesPointId) params.set('salesPointId', salesPointId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; sessions: TpvRegisterSession[] }>(
    `/api/delivery/caja-bootstrap/${encodeURIComponent(id)}${qs}`,
  );
  const sessions = payload.sessions || [];
  if (!businessId) return sessions;
  return filterRestaurantRegisterSessions(sessions, { businessId });
}

export async function updateRestaurantRegisterSession(
  userId: string,
  session: TpvRegisterSession,
): Promise<TpvRegisterSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: TpvRegisterSession }>(
    `/api/delivery/tpv-sessions/${encodeURIComponent(id)}/${encodeURIComponent(session._id)}`,
    { method: 'PUT', body: JSON.stringify({ session }) },
  );
  return result.session;
}

export async function listSalaOrdersForDay(
  userId: string,
  dateFrom: string,
  dateTo: string,
): Promise<DiningOrder[]> {
  return listDiningOrdersRequest(userId, { dateFrom, dateTo });
}

export type { TpvRegisterSession, DiningOrder };
