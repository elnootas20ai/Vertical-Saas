import type { TradeIn } from '../context/AppContext';
import { getAuthHeaders } from './authApi';

interface TradeInEnvelope {
  ok: boolean;
  error?: string;
  tradeIn?: TradeIn;
  tradeIns?: TradeIn[];
  id?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol = env.VITE_API_PROTOCOL || (typeof window !== 'undefined' && window.location.protocol ? window.location.protocol.replace(':', '') : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit): Promise<TradeInEnvelope> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as TradeInEnvelope;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de tasaciones');
  }
  return payload;
}

export async function listTradeInsRequest(userId: string, businessId?: string | null) {
  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
  return request(`/api/tradeins/${encodeURIComponent(userId)}${qs}`);
}

export async function createTradeInRequest(userId: string, tradeIn: Partial<TradeIn>, businessId?: string | null) {
  return request(`/api/tradeins/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ tradeIn, businessId: businessId || undefined }),
  });
}

export async function updateTradeInRequest(userId: string, tradeInId: string, tradeIn: Partial<TradeIn>) {
  return request(`/api/tradeins/${encodeURIComponent(userId)}/${encodeURIComponent(tradeInId)}`, {
    method: 'PUT',
    body: JSON.stringify({ tradeIn }),
  });
}

export async function deleteTradeInRequest(userId: string, tradeInId: string) {
  return request(`/api/tradeins/${encodeURIComponent(userId)}/${encodeURIComponent(tradeInId)}`, {
    method: 'DELETE',
  });
}
