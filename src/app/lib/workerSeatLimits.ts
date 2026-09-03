/**
 * Cupo de trabajadores (frontend). Alineado con shared/billing/entitlements.js.
 */
import type { BillingSubscription } from './authApi';
import { getApiBase } from './apiBase';
import { formatAddonPriceShort } from './planAddonCatalog';
import { resolvePlanTier, type SubscriptionPlanTier } from './pointOfSaleLimits';

export const WORKER_SEAT_LIMITS: Record<SubscriptionPlanTier, number> = {
  basic: 2,
  normal: 4,
  pro: 12,
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'subscription_active',
  'trial_active',
  'trial_expiring',
]);

export function clampExtraWorkerSlots(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(999, n));
}

export function getBaseWorkerSeatLimit(planTier: SubscriptionPlanTier): number {
  return WORKER_SEAT_LIMITS[planTier];
}

export function getEffectiveWorkerSeatLimit(
  subscription: Pick<
    BillingSubscription,
    'status' | 'selectedPlanId' | 'planName' | 'extraWorkerSlots' | 'billingExempt'
  > | null | undefined,
): number {
  if (subscription?.billingExempt) return 999;
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return WORKER_SEAT_LIMITS.basic;
  }
  const tier = resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '');
  return getBaseWorkerSeatLimit(tier) + clampExtraWorkerSlots(subscription.extraWorkerSlots);
}

/**
 * Ajusta el cupo UI al plan efectivo (p. ej. Mi plan → Mediano).
 * En Pro no toca el resultado del API (incluye billingExempt / Ilimitado).
 */
export function applyEffectivePlanToWorkerSeats(
  seats: WorkerSeatStatus | null | undefined,
  planTier: SubscriptionPlanTier,
  extraWorkerSlots: unknown = 0,
): WorkerSeatStatus | null {
  if (!seats) return null;
  if (planTier === 'pro') return seats;
  const limit = getBaseWorkerSeatLimit(planTier) + clampExtraWorkerSlots(extraWorkerSlots);
  const used = Math.max(0, Number(seats.used) || 0);
  const remaining = Math.max(0, limit - used);
  return {
    ...seats,
    limit,
    remaining,
    canInvite: remaining > 0,
    planTier,
  };
}

export type WorkerSeatStatus = {
  used: number;
  limit: number;
  remaining: number;
  membersUsed: number;
  pendingInvites: number;
  canInvite: boolean;
  planTier: string;
};

/** Texto de aviso comercial cuando el cupo se llena o se va a pasar. */
export function workerSeatBillingWarning(seats: Pick<WorkerSeatStatus, 'used' | 'limit' | 'remaining'> | null | undefined): {
  tone: 'info' | 'warn' | 'block';
  title: string;
  body: string;
} | null {
  if (!seats || !Number.isFinite(seats.limit) || seats.limit <= 0) return null;
  const price = formatAddonPriceShort('extra_worker');
  if (seats.remaining <= 0 || seats.used >= seats.limit) {
    return {
      tone: 'block',
      title: 'Cupo de trabajadores completo',
      body:
        `Llevas ${seats.used} de ${seats.limit} plazas. `
        + `El siguiente (el ${seats.limit + 1}º) requiere ampliación de pago (${price}/mes) en Mi plan.`,
    };
  }
  if (seats.remaining === 1) {
    return {
      tone: 'warn',
      title: 'Última plaza incluida',
      body:
        `Te queda 1 plaza de ${seats.limit}. `
        + `El ${seats.limit + 1}º trabajador se cobra aparte (${price}/mes).`,
    };
  }
  if (seats.remaining <= 3) {
    return {
      tone: 'info',
      title: 'Cupo casi lleno',
      body:
        `Plazas libres: ${seats.remaining} de ${seats.limit}. `
        + `Pasarte del cupo sube la facturación (${price} por trabajador extra).`,
    };
  }
  return null;
}

export async function getWorkerSeatStatusRequest(businessId: string): Promise<WorkerSeatStatus | null> {
  const id = String(businessId || '').trim();
  if (!id) return null;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const res = await fetch(
    `${getApiBase()}/api/auth/businesses/${encodeURIComponent(id)}/worker-seats`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/json',
      },
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return (data as { workerSeats?: WorkerSeatStatus }).workerSeats || null;
}
