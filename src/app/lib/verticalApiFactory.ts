/**
 * Generic CRUD API factory for vertical modules.
 *
 * Creates typed list / create / update / remove functions that talk to
 * the standard endpoints produced by verticalCrudFactory.js on the backend.
 */

import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function normalizeBusinessId(raw?: string | null): string {
  return String(raw || '').replace(/^business:/, '').trim();
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

function extractApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const err = obj.error;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err === 'object') {
      const nested = err as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim();
    }
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
  }
  if (status === 401) return 'Sesión expirada. Vuelve a iniciar sesión.';
  if (status === 403) return 'No tienes permiso para esta acción.';
  if (status === 404) return 'No encontrado.';
  if (status === 304) return 'Respuesta en caché sin datos. Recarga la página (Ctrl+Shift+R).';
  if (status >= 500) return 'No se pudieron cargar los datos. Prueba a recargar la página.';
  return '';
}

function withCacheBust(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}_=${Date.now()}`;
}

async function parseJsonSafe<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  // GET autenticado: evitar 304 sin cuerpo (navegador/ETag/SW).
  const urlPath = isGet ? withCacheBust(path) : path;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...getCouchHeaders(),
    ...(isGet ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const fetchInit: RequestInit = {
    ...init,
    headers,
    ...(isGet ? { cache: 'no-store' as RequestCache } : {}),
  };

  let response = await authFetch(`${API_BASE}${urlPath}`, fetchInit);
  // 304 vacío: reintentos forzados (no tratar como lista vacía ni tumbar la pantalla).
  for (let attempt = 0; response.status === 304 && isGet && attempt < 2; attempt += 1) {
    response = await authFetch(`${API_BASE}${withCacheBust(path)}&retry=${attempt + 1}`, {
      ...fetchInit,
      headers: {
        ...headers,
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'If-None-Match': 'undefined',
      },
      cache: 'reload',
    });
  }

  const payload = await parseJsonSafe<T & {
    error?: string | { message?: string };
    message?: string;
    items?: unknown[];
  }>(response);

  if (response.status === 304 && isGet) {
    // Lista vacía aquí hace parecer que se han borrado fichas (eventos, etc.).
    console.warn('[verticalApi] 304 sin cuerpo en', path);
    throw new Error('No se pudieron cargar los datos. Recarga la página (Ctrl+Shift+R).');
  }
  if (!response.ok) {
    const msg = extractApiErrorMessage(payload, response.status) || 'No se pudo completar la petición';
    throw new Error(msg);
  }
  return payload;
}

// ─── Base entity type ───────────────────────────────────────────────────────

export interface VerticalEntity {
  _id: string;
  _rev?: string;
  type: string;
  user_id: string;
  createdAt: string;
  updatedAt: string;
  businessId?: string;
  business_id?: string;
  salesPointId?: string;
  [key: string]: unknown;
}

export type VerticalListOptions = {
  businessId?: string | null;
  salesPointId?: string | null;
};

// ─── Dashboard types ────────────────────────────────────────────────────────

export interface VerticalDashboardData {
  counts: Record<string, number>;
  recentActivity: { id: string; type: string; updatedAt: string; createdAt: string; summary: string }[];
  total: number;
}

function scopeQuery(options?: VerticalListOptions): string {
  const params = new URLSearchParams();
  const bid = normalizeBusinessId(options?.businessId);
  const pdv = String(options?.salesPointId || '').trim();
  if (bid) params.set('businessId', bid);
  if (pdv) params.set('salesPointId', pdv);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function withScopeFields<T extends VerticalEntity>(
  data: Partial<T>,
  options?: VerticalListOptions,
): Partial<T> {
  const bid = normalizeBusinessId(options?.businessId || (data as { businessId?: string }).businessId);
  const pdv = String(
    options?.salesPointId
    || (data as { salesPointId?: string }).salesPointId
    || '',
  ).trim();
  return {
    ...data,
    ...(bid ? { businessId: bid, business_id: bid } : {}),
    ...(pdv ? { salesPointId: pdv } : {}),
  };
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createVerticalApi<T extends VerticalEntity>(vertical: string, entity: string) {
  const base = `/api/${vertical}/${entity}`;

  return {
    list: async (userId: string, options?: VerticalListOptions): Promise<T[]> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; items: T[] }>(
        `${base}/${encodeURIComponent(id)}${scopeQuery(options)}`,
      );
      return res.items || [];
    },

    create: async (userId: string, data: Partial<T>, options?: VerticalListOptions): Promise<T> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; item: T }>(`${base}/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ data: withScopeFields(data, options) }),
      });
      return res.item;
    },

    update: async (
      userId: string,
      docId: string,
      data: Partial<T>,
      options?: VerticalListOptions,
    ): Promise<T> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; item: T }>(
        `${base}/${encodeURIComponent(id)}/${encodeURIComponent(docId)}`,
        { method: 'PUT', body: JSON.stringify({ data: withScopeFields(data, options) }) },
      );
      return res.item;
    },

    /** Sube una foto (data URL) como adjunto Couch — una por request. */
    uploadFoto: async (userId: string, docId: string, dataUrl: string): Promise<T> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; item: T }>(
        `${base}/${encodeURIComponent(id)}/${encodeURIComponent(docId)}/foto`,
        { method: 'POST', body: JSON.stringify({ dataUrl }) },
      );
      return res.item;
    },

    remove: async (userId: string, docId: string): Promise<void> => {
      const id = normalizeUserId(userId);
      await request<{ ok: boolean }>(
        `${base}/${encodeURIComponent(id)}/${encodeURIComponent(docId)}`,
        { method: 'DELETE' },
      );
    },
  };
}

export function createVerticalDashboardApi(vertical: string) {
  return {
    load: async (userId: string, options?: VerticalListOptions): Promise<VerticalDashboardData> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean } & VerticalDashboardData>(
        `/api/${vertical}/dashboard/${encodeURIComponent(id)}${scopeQuery(options)}`,
      );
      return { counts: res.counts, recentActivity: res.recentActivity, total: res.total };
    },
  };
}
