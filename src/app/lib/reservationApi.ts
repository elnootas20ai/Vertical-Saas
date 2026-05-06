import {
  normalizeReservationRecord,
  type ReservationRecord,
  type CreateReservationPayload,
} from './reservationTypes';
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getStoredSessionUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('vertial_session_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user_id?: string };
    return parsed?.user_id || null;
  } catch {
    return null;
  }
}

function resolveUserId(userId?: string): string {
  const resolved = (userId || '').trim() || getStoredSessionUserId() || '';
  if (!resolved) throw new Error('No se pudo resolver el usuario de la sesión');
  return resolved;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en reservas');
  }
  return payload;
}

export async function listReservations(userId?: string): Promise<ReservationRecord[]> {
  const resolvedUserId = resolveUserId(userId);
  const payload = await request<{ ok: boolean; reservations: unknown[] }>(
    `/api/reservations/${encodeURIComponent(resolvedUserId)}`,
  );
  return (payload.reservations || [])
    .map(normalizeReservationRecord)
    .filter((r): r is ReservationRecord => Boolean(r))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getReservationById(userId: string, id: string): Promise<ReservationRecord | null> {
  const resolvedUserId = resolveUserId(userId);
  const payload = await request<{ ok: boolean; reservation: unknown }>(
    `/api/reservations/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(id)}`,
  );
  return normalizeReservationRecord(payload.reservation);
}

export async function createReservation(
  userIdOrPayload: string | CreateReservationPayload,
  payload?: CreateReservationPayload,
): Promise<ReservationRecord> {
  const resolvedUserId = resolveUserId(typeof userIdOrPayload === 'string' ? userIdOrPayload : undefined);
  const resolvedPayload = typeof userIdOrPayload === 'string' ? payload : userIdOrPayload;
  if (!resolvedPayload) throw new Error('Faltan datos de la reserva');

  const result = await request<{ ok: boolean; reservation: unknown }>(
    `/api/reservations/${encodeURIComponent(resolvedUserId)}`,
    { method: 'POST', body: JSON.stringify({ reservation: resolvedPayload }) },
  );

  const normalized = normalizeReservationRecord(result.reservation);
  if (!normalized) throw new Error('La respuesta del servidor no contiene una reserva válida');
  return normalized;
}

export async function updateReservation(
  userIdOrDocument: string | ReservationRecord,
  document?: ReservationRecord,
): Promise<ReservationRecord> {
  const resolvedUserId = resolveUserId(typeof userIdOrDocument === 'string' ? userIdOrDocument : undefined);
  const resolvedDocument = typeof userIdOrDocument === 'string' ? document : userIdOrDocument;
  if (!resolvedDocument?._id) throw new Error('Faltan datos de la reserva para actualizar');

  const result = await request<{ ok: boolean; reservation: unknown }>(
    `/api/reservations/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(resolvedDocument._id)}`,
    { method: 'PUT', body: JSON.stringify({ reservation: resolvedDocument }) },
  );

  const normalized = normalizeReservationRecord(result.reservation);
  if (!normalized) throw new Error('La respuesta del servidor no contiene una reserva válida');
  return normalized;
}

export async function cancelReservation(userId: string, reservationId: string, reason?: string): Promise<ReservationRecord> {
  const resolvedUserId = resolveUserId(userId);
  const result = await request<{ ok: boolean; reservation: unknown }>(
    `/api/reservations/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(reservationId)}/cancel`,
    { method: 'PUT', body: JSON.stringify({ reason: reason || '' }) },
  );
  const normalized = normalizeReservationRecord(result.reservation);
  if (!normalized) throw new Error('Error al cancelar la reserva');
  return normalized;
}

export async function convertReservationToSale(
  userId: string,
  reservationId: string,
  saleOverrides?: Record<string, unknown>,
): Promise<{ reservation: ReservationRecord; sale: unknown }> {
  const resolvedUserId = resolveUserId(userId);
  const result = await request<{ ok: boolean; reservation: unknown; sale: unknown }>(
    `/api/reservations/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(reservationId)}/convert`,
    { method: 'PUT', body: JSON.stringify({ saleOverrides: saleOverrides || {} }) },
  );
  const normalized = normalizeReservationRecord(result.reservation);
  if (!normalized) throw new Error('Error al convertir la reserva');
  return { reservation: normalized, sale: result.sale };
}

export async function deleteReservation(userId: string, reservationId: string): Promise<void> {
  const resolvedUserId = resolveUserId(userId);
  await request(`/api/reservations/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(reservationId)}`, {
    method: 'DELETE',
  });
}
