import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

export type NotificationLevel = 'success' | 'warning' | 'info' | 'alert';

export interface NotificationRecord {
  id: string;
  _rev?: string;
  user_id: string;
  level: NotificationLevel;
  category: string;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
  route?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface NotificationEnvelope {
  ok: boolean;
  error?: string;
  notification?: NotificationRecord;
  notifications?: NotificationRecord[];
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders() {
  const headers: Record<string, string> = {};

  if (env.VITE_COUCHDB_URL) {
    headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  }
  if (env.VITE_COUCHDB_USER) {
    headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  }
  if (env.VITE_COUCHDB_PASSWORD) {
    headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  }

  return headers;
}

const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit) {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as NotificationEnvelope;

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado con las notificaciones');
  }

  return payload;
}

export async function listNotificationsRequest(userId: string) {
  return request(`/api/notifications/${encodeURIComponent(userId)}`);
}

export async function createNotificationRequest(
  userId: string,
  data: Omit<Partial<NotificationRecord>, 'id' | '_rev' | 'user_id' | 'updatedAt'> & {
    title: string;
    message: string;
  },
) {
  return request(`/api/notifications/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function markNotificationReadRequest(
  userId: string,
  notificationId: string,
  read = true,
) {
  return request(
    `/api/notifications/${encodeURIComponent(userId)}/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PUT',
      body: JSON.stringify({ read }),
    },
  );
}

export async function markAllNotificationsReadRequest(userId: string) {
  return request(`/api/notifications/${encodeURIComponent(userId)}/read-all`, {
    method: 'PUT',
  });
}
