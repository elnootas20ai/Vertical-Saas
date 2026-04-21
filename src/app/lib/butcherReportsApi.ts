const BASE = '/api/butcher-reports';

export interface ButcherFilters {
  from?: string;
  to?: string;
  storeId?: string;
  workerId?: string;
  category?: string;
  granularity?: 'day' | 'week' | 'month';
  limit?: number;
}

function qs(filters: ButcherFilters): string {
  const p = new URLSearchParams();
  if (filters.from) p.set('from', filters.from);
  if (filters.to) p.set('to', filters.to);
  if (filters.storeId) p.set('storeId', filters.storeId);
  if (filters.workerId) p.set('workerId', filters.workerId);
  if (filters.category) p.set('category', filters.category);
  if (filters.granularity) p.set('granularity', filters.granularity);
  if (filters.limit) p.set('limit', String(filters.limit));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function get(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchButcherKpis(userId: string, filters: ButcherFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${userId}/kpis${qs(filters)}`, signal);
}

export async function fetchButcherVentasTrabajador(userId: string, filters: ButcherFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${userId}/ventas-trabajador${qs(filters)}`, signal);
}

export async function fetchButcherTopProductos(userId: string, filters: ButcherFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${userId}/top-productos${qs(filters)}`, signal);
}

export async function fetchButcherEvolucion(userId: string, filters: ButcherFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${userId}/evolucion${qs(filters)}`, signal);
}

export async function fetchButcherCategorias(userId: string, filters: ButcherFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${userId}/categorias${qs(filters)}`, signal);
}

export async function fetchButcherTiendas(userId: string, filters: ButcherFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${userId}/tiendas${qs(filters)}`, signal);
}
