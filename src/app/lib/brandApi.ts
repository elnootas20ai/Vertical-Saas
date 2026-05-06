import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en brands API');
  }
  return payload;
}

export interface Brand {
  _id: string;
  _rev?: string;
  type: 'brand';
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  description: string;
  logo: string;
  website: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listBrandsRequest(businessId: string): Promise<Brand[]> {
  const payload = await request<{ ok: boolean; brands: Brand[] }>(
    `/api/brands/${encodeURIComponent(businessId)}`,
  );
  return payload.brands || [];
}

export async function createBrandRequest(businessId: string, data: Partial<Brand>): Promise<Brand> {
  const result = await request<{ ok: boolean; brand: Brand }>(
    `/api/brands/${encodeURIComponent(businessId)}`,
    { method: 'POST', body: JSON.stringify({ brand: data }) },
  );
  if (!result.brand) throw new Error('Respuesta inválida del servidor');
  return result.brand;
}

export async function updateBrandRequest(businessId: string, brand: Brand): Promise<Brand> {
  const result = await request<{ ok: boolean; brand: Brand }>(
    `/api/brands/${encodeURIComponent(businessId)}/${encodeURIComponent(brand._id)}`,
    { method: 'PUT', body: JSON.stringify({ brand }) },
  );
  if (!result.brand) throw new Error('Respuesta inválida del servidor');
  return result.brand;
}

export async function deleteBrandRequest(businessId: string, brandId: string): Promise<void> {
  await request(
    `/api/brands/${encodeURIComponent(businessId)}/${encodeURIComponent(brandId)}`,
    { method: 'DELETE' },
  );
}
