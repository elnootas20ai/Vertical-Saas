import { authFetch, cacheAccessToken, type ApiEnvelope, type AuthUser } from './authApi';
import { getApiBase } from './apiBase';
import type { PointOfSale } from './deliveryApi';

const API_BASE = getApiBase();

function extractApiError(payload: Record<string, unknown>): string {
  const err = payload.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
  }
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  return 'Error inesperado en la petición';
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T & ApiEnvelope<unknown>> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiEnvelope<unknown> & {
    error?: string | { message?: string };
    message?: string;
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(extractApiError(payload as Record<string, unknown>));
  }
  return payload;
}

export interface TpvTabletBindingPayload {
  terminalCode: string;
  pdvId: string;
  workCenterId: string;
  businessId: string;
  dataUserId: string;
  /** Vertical del TPV fijado por el código (no depende del businessType). */
  tpvVertical?: 'delivery';
}

export interface TpvTabletLoginResult extends ApiEnvelope<AuthUser> {
  business?: {
    business_id: string;
    name: string;
    logo: string;
    owner_user_id?: string;
  };
  pointOfSale?: PointOfSale;
  terminalBinding?: TpvTabletBindingPayload;
  redirectTo?: string;
  needsClockIn?: boolean;
}

export async function tpvTabletActivateRequest(
  terminalCode: string,
): Promise<TpvTabletLoginResult> {
  const result = await apiRequest<TpvTabletLoginResult>('/api/auth/tpv-tablet/activate', {
    method: 'POST',
    body: JSON.stringify({ terminalCode }),
  });
  if (result.accessToken) cacheAccessToken(result.accessToken);
  return result;
}

export async function tpvTabletSwitchRequest(
  terminalCode: string,
): Promise<TpvTabletLoginResult> {
  const result = await apiRequest<TpvTabletLoginResult>('/api/auth/tpv-tablet/switch', {
    method: 'POST',
    body: JSON.stringify({ terminalCode }),
  });
  if (result.accessToken) cacheAccessToken(result.accessToken);
  return result;
}
