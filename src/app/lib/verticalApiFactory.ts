/**
 * Generic CRUD API factory for vertical modules.
 *
 * Creates typed list / create / update / remove functions that talk to
 * the standard endpoints produced by verticalCrudFactory.js on the backend.
 */

import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
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
  [key: string]: unknown;
}

// ─── Dashboard types ────────────────────────────────────────────────────────

export interface VerticalDashboardData {
  counts: Record<string, number>;
  recentActivity: { id: string; type: string; updatedAt: string; createdAt: string; summary: string }[];
  total: number;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createVerticalApi<T extends VerticalEntity>(vertical: string, entity: string) {
  const base = `/api/${vertical}/${entity}`;

  return {
    list: async (userId: string): Promise<T[]> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; items: T[] }>(`${base}/${encodeURIComponent(id)}`);
      return res.items || [];
    },

    create: async (userId: string, data: Partial<T>): Promise<T> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; item: T }>(`${base}/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      return res.item;
    },

    update: async (userId: string, docId: string, data: Partial<T>): Promise<T> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean; item: T }>(
        `${base}/${encodeURIComponent(id)}/${encodeURIComponent(docId)}`,
        { method: 'PUT', body: JSON.stringify({ data }) },
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
    load: async (userId: string): Promise<VerticalDashboardData> => {
      const id = normalizeUserId(userId);
      const res = await request<{ ok: boolean } & VerticalDashboardData>(
        `/api/${vertical}/dashboard/${encodeURIComponent(id)}`,
      );
      return { counts: res.counts, recentActivity: res.recentActivity, total: res.total };
    },
  };
}
