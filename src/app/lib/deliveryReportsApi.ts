import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const BASE = `${getApiBase()}/api/delivery-reports`;

export interface DeliveryReportFilters {
  from?: string;
  to?: string;
  salesPointId?: string;
  channel?: string;
  granularity?: 'day' | 'week' | 'month';
  limit?: number;
}

function qs(filters: DeliveryReportFilters): string {
  const p = new URLSearchParams();
  if (filters.from) p.set('from', filters.from);
  if (filters.to) p.set('to', filters.to);
  if (filters.salesPointId) p.set('salesPointId', filters.salesPointId);
  if (filters.channel) p.set('channel', filters.channel);
  if (filters.granularity) p.set('granularity', filters.granularity);
  if (filters.limit) p.set('limit', String(filters.limit));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await authFetch(path, { signal });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function fetchDeliveryReportKpis(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/kpis${qs(filters)}`, signal);
}

export async function fetchDeliveryEvolucion(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/evolucion${qs(filters)}`, signal);
}

export async function fetchDeliveryCanales(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/canales${qs(filters)}`, signal);
}

export async function fetchDeliveryRendimiento(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/rendimiento${qs(filters)}`, signal);
}

export async function fetchDeliveryIncidencias(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/incidencias${qs(filters)}`, signal);
}

export async function fetchDeliveryTopProductos(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/top-productos${qs(filters)}`, signal);
}

export async function fetchDeliveryTiendas(userId: string, filters: DeliveryReportFilters = {}, signal?: AbortSignal) {
  return get(`${BASE}/${encodeURIComponent(userId)}/tiendas${qs(filters)}`, signal);
}
