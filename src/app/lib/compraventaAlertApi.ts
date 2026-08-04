import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || 'Error en alertas de compraventa');
  }
  return json as T;
}

export type CompraventaAlertSummary = {
  total: number;
  bySeverity?: Record<string, number>;
  unread?: number;
};

/** Resumen del API dedicado (el hub ya trae alertas embebidas; esto alimenta Acciones / centro). */
export async function getCompraventaAlertsSummaryRequest(userId: string) {
  return request<{ ok: true; summary: CompraventaAlertSummary }>(
    `/api/compraventa/alerts/${encodeURIComponent(userId)}/summary`,
  );
}

export async function triggerCompraventaAlertCheckRequest(userId: string) {
  return request<{ ok: true }>(
    `/api/compraventa/alerts/${encodeURIComponent(userId)}/check`,
    { method: 'POST', body: '{}' },
  );
}

export async function acknowledgeCompraventaAlertRequest(userId: string, alertId: string) {
  return request<{ ok: true }>(
    `/api/compraventa/alerts/${encodeURIComponent(userId)}/${encodeURIComponent(alertId)}/acknowledge`,
    { method: 'POST', body: '{}' },
  );
}
