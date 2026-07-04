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

/** Sesiones de caja TPV (mismo backend operativo, sin pedidos delivery). */
export async function listRestaurantRegisterSessions(userId: string): Promise<TpvRegisterSession[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; sessions: TpvRegisterSession[] }>(
    `/api/delivery/caja-bootstrap/${encodeURIComponent(id)}`,
  );
  return payload.sessions || [];
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
