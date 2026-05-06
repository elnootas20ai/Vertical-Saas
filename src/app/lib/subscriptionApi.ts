import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload?.error || `Error ${response.status}`);
  }

  return payload;
}

export interface CreateSubscriptionResponse {
  ok: boolean;
  redirectUrl: string;
  subscriptionId: string;
  paymentId: string;
}

export interface SubscriptionStatusResponse {
  ok: boolean;
  subscription: {
    status: string;
    planName: string;
    selectedPlanId: string;
    billingMode: string;
    moneiSubscriptionId?: string;
    moneiSubscriptionStatus?: string;
    lastPaymentAt?: string;
    [key: string]: unknown;
  } | null;
  moneiSubscription: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    interval: string;
    trialPeriodDays?: number;
    nextPaymentAt?: string;
    [key: string]: unknown;
  } | null;
}

export interface ConfirmSubscriptionResponse {
  ok: boolean;
  subscription: Record<string, unknown>;
  moneiSubscription: Record<string, unknown>;
}

/**
 * Crea y activa una suscripción MONEI. Devuelve la URL de redirección
 * a la página de pago de MONEI donde el usuario introduce su tarjeta.
 */
export async function createMoneiSubscription(planId: string, billingMode: 'monthly' | 'annual') {
  return request<CreateSubscriptionResponse>('/api/subscriptions/create', {
    method: 'POST',
    body: JSON.stringify({ planId, billingMode }),
  });
}

/**
 * Obtiene el estado actual de la suscripción del usuario.
 */
export async function getSubscriptionStatus() {
  return request<SubscriptionStatusResponse>('/api/subscriptions/status');
}

/**
 * Confirma la suscripción tras el redirect de MONEI.
 */
export async function confirmMoneiSubscription(subscriptionId: string, paymentId?: string) {
  return request<ConfirmSubscriptionResponse>('/api/subscriptions/confirm', {
    method: 'POST',
    body: JSON.stringify({ subscriptionId, paymentId }),
  });
}

/**
 * Cancela la suscripción activa del usuario.
 */
export async function cancelMoneiSubscription() {
  return request<{ ok: boolean; subscription: Record<string, unknown> }>('/api/subscriptions/cancel', {
    method: 'POST',
  });
}
