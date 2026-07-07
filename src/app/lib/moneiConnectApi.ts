import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

export type MoneiConnectStatus =
  | 'not_started'
  | 'pending'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'suspended';

export interface MoneiConnectState {
  promo: string;
  status: MoneiConnectStatus;
  externalId: string;
  testAccountId: string | null;
  liveAccountId: string | null;
  adminEmail: string;
  lastEventType: string;
  lastEventAt: string;
  validated: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error MONEI Connect');
  }
  return payload;
}

export async function fetchMoneiConnectStatus() {
  return request<{ ok: boolean } & MoneiConnectState>('/api/monei-connect/status');
}

export async function fetchMoneiConnectSignupUrl() {
  return request<{
    ok: boolean;
    signupUrl: string;
    promo: string;
    status: MoneiConnectStatus;
    moneiAccountId: string | null;
  }>('/api/monei-connect/signup-url');
}
