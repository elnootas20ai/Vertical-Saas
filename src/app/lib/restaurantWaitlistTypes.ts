import type { VerticalEntity } from './verticalApiFactory';

export type WaitlistStatus = 'waiting' | 'notified' | 'seated' | 'cancelled';

export interface RestaurantWaitlistEntry extends VerticalEntity {
  guestName: string;
  partySize: string;
  phone: string;
  estimatedWait: string;
  status: WaitlistStatus;
  notes: string;
  zone: string;
  clientId: string;
  businessId: string;
}

export type WaitlistFormData = {
  guestName: string;
  partySize: string;
  phone: string;
  estimatedWait: string;
  notes: string;
  zone: string;
};

export const EMPTY_WAITLIST_FORM: WaitlistFormData = {
  guestName: '',
  partySize: '2',
  phone: '',
  estimatedWait: '',
  notes: '',
  zone: '',
};

/** Siguen en cola (cuentan en el contador). */
export const ACTIVE_WAITLIST_STATUSES: WaitlistStatus[] = ['waiting', 'notified'];

export const WAITLIST_STATUS_CFG: Record<
  WaitlistStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  waiting: {
    label: 'Esperando',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-800 dark:text-amber-300',
  },
  notified: {
    label: 'Avisado',
    dot: 'bg-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    text: 'text-sky-800 dark:text-sky-300',
  },
  seated: {
    label: 'Sentado',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-800 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelado',
    dot: 'bg-stone-400',
    bg: 'bg-stone-50 dark:bg-stone-800/50',
    text: 'text-stone-600 dark:text-stone-400',
  },
};

export function isActiveWaitlistStatus(status: string | undefined): boolean {
  return ACTIVE_WAITLIST_STATUSES.includes(String(status || '') as WaitlistStatus);
}

export function formatWaitMinutes(createdAt: string, now = Date.now()): string {
  const start = new Date(createdAt).getTime();
  if (!Number.isFinite(start) || start <= 0) return '—';
  const mins = Math.max(0, Math.floor((now - start) / 60_000));
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function partySizeNumber(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
