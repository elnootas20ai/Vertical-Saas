import { setAuthTokens, type ApiEnvelope, type AuthUser } from './authApi';
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

function extractApiErrorCode(payload: Record<string, unknown>): string {
  const code = payload.code;
  if (typeof code === 'string' && code.trim()) return code.trim();
  return '';
}

/**
 * Login/activación tablet: fetch directo (sin authFetch).
 * Un código malo suele ser 401; authFetch lo trataría como sesión muerta y echaría del TPV.
 */
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T & ApiEnvelope<unknown>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiEnvelope<unknown> & {
    error?: string | { message?: string };
    message?: string;
    code?: string;
    accessToken?: string;
    refreshToken?: string;
  };
  if (!response.ok || payload.ok === false) {
    const err = new Error(extractApiError(payload as Record<string, unknown>)) as Error & {
      code?: string;
    };
    err.code = extractApiErrorCode(payload as Record<string, unknown>);
    throw err;
  }
  return payload;
}

export interface TpvTabletBindingPayload {
  terminalCode: string;
  pdvId: string;
  workCenterId: string;
  businessId: string;
  dataUserId: string;
  /** Terminal TPV de sala cuando el login usa código SALA-* */
  salaTerminalId?: string;
  /** Vertical del TPV fijado por el código (no depende del businessType). */
  tpvVertical?: 'delivery';
}

export interface TpvTabletLoginResult extends ApiEnvelope<AuthUser> {
  accessToken?: string;
  refreshToken?: string;
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
  deviceId: string,
  deviceLabel?: string,
): Promise<TpvTabletLoginResult> {
  const result = await apiRequest<TpvTabletLoginResult>('/api/auth/tpv-tablet/activate', {
    method: 'POST',
    body: JSON.stringify({
      terminalCode,
      deviceId,
      ...(deviceLabel ? { deviceLabel } : {}),
    }),
  });
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}

export async function tpvTabletSwitchRequest(
  terminalCode: string,
  deviceId: string,
  deviceLabel?: string,
): Promise<TpvTabletLoginResult> {
  const result = await apiRequest<TpvTabletLoginResult>('/api/auth/tpv-tablet/switch', {
    method: 'POST',
    body: JSON.stringify({
      terminalCode,
      deviceId,
      ...(deviceLabel ? { deviceLabel } : {}),
    }),
  });
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}
