import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import type { StoredPromotion } from './promoCodes';

const API_BASE = getApiBase();

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (res.status === 401) throw new Error('Sesión expirada');
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data;
}

export async function listPromotionsRequest(userId: string): Promise<StoredPromotion[]> {
  const data = await apiRequest<{ ok: boolean; promotions: StoredPromotion[] }>(
    `/api/promotions/${encodeURIComponent(userId)}`,
  );
  return data.promotions || [];
}

export async function syncPromotionsRequest(userId: string, promotions: StoredPromotion[]): Promise<StoredPromotion[]> {
  const data = await apiRequest<{ ok: boolean; promotions: StoredPromotion[] }>(
    `/api/promotions/${encodeURIComponent(userId)}/sync`,
    { method: 'POST', body: JSON.stringify({ promotions }) },
  );
  return data.promotions || [];
}
