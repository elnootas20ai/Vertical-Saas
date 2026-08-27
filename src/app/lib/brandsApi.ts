import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

const BRANDS_CACHE_TTL_MS = 60_000;
const brandsListCache = new Map<string, { at: number; data: Brand[] }>();
const brandsListInflight = new Map<string, Promise<Brand[]>>();

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

function normalizeBusinessId(businessId: string): string {
  return String(businessId || '').replace(/^business:/, '').trim();
}

export function invalidateBrandsListCache(businessId?: string): void {
  const id = normalizeBusinessId(businessId || '');
  if (!id) {
    brandsListCache.clear();
    brandsListInflight.clear();
    return;
  }
  brandsListCache.delete(id);
  brandsListInflight.delete(id);
}

export async function listBrandsRequest(businessId: string): Promise<Brand[]> {
  const id = normalizeBusinessId(businessId);
  if (!id) return [];

  const cached = brandsListCache.get(id);
  if (cached && Date.now() - cached.at < BRANDS_CACHE_TTL_MS) {
    return cached.data;
  }

  const inflight = brandsListInflight.get(id);
  if (inflight) return inflight;

  const promise = (async () => {
    const payload = await request<{ ok: boolean; brands: Brand[] }>(
      `/api/brands/${encodeURIComponent(id)}`,
    );
    const brands = payload.brands || [];
    brandsListCache.set(id, { at: Date.now(), data: brands });
    return brands;
  })().finally(() => {
    brandsListInflight.delete(id);
  });

  brandsListInflight.set(id, promise);
  return promise;
}

export async function createBrandRequest(businessId: string, data: Partial<Brand>): Promise<Brand> {
  const id = normalizeBusinessId(businessId);
  const result = await request<{ ok: boolean; brand: Brand }>(
    `/api/brands/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ brand: data }) },
  );
  if (!result.brand) throw new Error('Respuesta inválida del servidor');
  invalidateBrandsListCache(id);
  return result.brand;
}

export async function updateBrandRequest(businessId: string, brand: Brand): Promise<Brand> {
  const id = normalizeBusinessId(businessId);
  const result = await request<{ ok: boolean; brand: Brand }>(
    `/api/brands/${encodeURIComponent(id)}/${encodeURIComponent(brand._id)}`,
    { method: 'PUT', body: JSON.stringify({ brand }) },
  );
  if (!result.brand) throw new Error('Respuesta inválida del servidor');
  invalidateBrandsListCache(id);
  return result.brand;
}

export async function deleteBrandRequest(businessId: string, brandId: string): Promise<void> {
  const id = normalizeBusinessId(businessId);
  await request(
    `/api/brands/${encodeURIComponent(id)}/${encodeURIComponent(brandId)}`,
    { method: 'DELETE' },
  );
  invalidateBrandsListCache(id);
}
