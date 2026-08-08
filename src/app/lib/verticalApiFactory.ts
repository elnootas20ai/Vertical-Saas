/**
 * Generic CRUD API factory for vertical modules.
 *
 * Creates typed list / create / update / remove functions that talk to
 * the standard endpoints produced by verticalCrudFactory.js on the backend.
 */

import { getAuthHeaders } from './authApi';
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado');
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
