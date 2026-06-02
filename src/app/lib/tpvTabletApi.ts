import { authFetch, cacheAccessToken, type ApiEnvelope, type AuthUser } from './authApi';
import { getApiBase } from './apiBase';
import type { PointOfSale } from './deliveryApi';

const API_BASE = getApiBase();

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T & ApiEnvelope<unknown>> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiEnvelope<unknown> & { error?: string };
  if (!response.ok || payload.ok === false) {
    const err = payload.error;
    throw new Error(typeof err === 'string' ? err : 'Error inesperado en la petición');
  }
  return payload;
}

export interface TpvTabletBindingPayload {
  terminalCode: string;
  pdvId: string;
  workCenterId: string;
  businessId: string;
  dataUserId: string;
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

export async function regenerateTerminalCodeRequest(
  userId: string,
  pdvId: string,
): Promise<PointOfSale> {
  const result = await apiRequest<{ pointOfSale: PointOfSale }>(
    `/api/delivery/points-of-sale/${encodeURIComponent(userId)}/${encodeURIComponent(pdvId)}/regenerate-terminal-code`,
    { method: 'POST' },
  );
  if (!result.pointOfSale) throw new Error('Respuesta inválida del servidor');
  return result.pointOfSale;
}
