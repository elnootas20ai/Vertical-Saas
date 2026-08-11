import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

function brandsApiErrorMessage(payload: { error?: unknown; message?: unknown }): string {
  const err = payload?.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const obj = err as { message?: unknown; code?: unknown };
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
    if (typeof obj.code === 'string' && obj.code.trim()) return obj.code.trim();
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  return 'Error inesperado en brands API';
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
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(brandsApiErrorMessage(payload));
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
  primaryColor?: string;
  secondaryColor?: string;
  shortCode?: string;
  salesPointIds?: string[];
  deliveryLineKind?: string;
  catalogCategories?: string[];
  isDefault?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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
