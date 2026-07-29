import { authFetch } from './authApi';
import { getApiBase } from './apiBase';
import {
  emptyBrandBillingConfig,
  normalizeBrandBillingConfig,
  type BrandBillingConfig,
} from './brandBillingConfig';

const API_BASE = getApiBase();

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
    throw new Error(payload?.error || 'Error en facturación de marcas');
  }
  return payload;
}

export async function getBrandBillingConfigRequest(businessId: string): Promise<BrandBillingConfig> {
  const id = String(businessId || '').trim();
  if (!id) return emptyBrandBillingConfig('');
  const payload = await request<{ ok: boolean; config: BrandBillingConfig }>(
    `/api/brands/${encodeURIComponent(id)}/billing-config`,
  );
  return normalizeBrandBillingConfig(payload.config, id);
}

export async function saveBrandBillingConfigRequest(
  businessId: string,
  config: BrandBillingConfig,
): Promise<BrandBillingConfig> {
  const id = String(businessId || '').trim();
  if (!id) throw new Error('Falta empresa');
  const payload = await request<{ ok: boolean; config: BrandBillingConfig }>(
    `/api/brands/${encodeURIComponent(id)}/billing-config`,
    {
      method: 'PUT',
      body: JSON.stringify({ config }),
    },
  );
  return normalizeBrandBillingConfig(payload.config, id);
}
