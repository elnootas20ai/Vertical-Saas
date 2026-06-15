import type { TpvClockedInWorker } from './tpvClockedInWorkers';

export type TpvClockInBlockReason =
  | 'loading'
  | 'none_active'
  | 'worker_not_clocked'
  | 'taker_not_active'
  | 'ok';

export function evaluateTpvClockInGate(params: {
  loading: boolean;
  clockedInWorkers: TpvClockedInWorker[];
  selectedOrderTakerId: string | null;
  currentUserId: string;
  isWorkerUser: boolean;
}): { allowed: boolean; reason: TpvClockInBlockReason } {
  const { loading, clockedInWorkers, selectedOrderTakerId, currentUserId, isWorkerUser } = params;
  if (loading) return { allowed: false, reason: 'loading' };

  const activeWorkers = clockedInWorkers.filter((w) => w.status === 'active');
  if (activeWorkers.length === 0) {
    return { allowed: false, reason: 'none_active' };
  }

  if (isWorkerUser) {
    const selfActive = activeWorkers.some((w) => w.id === currentUserId);
    return selfActive
      ? { allowed: true, reason: 'ok' }
      : { allowed: false, reason: 'worker_not_clocked' };
  }

  const takerId = selectedOrderTakerId || activeWorkers[0]?.id || null;
  if (!takerId || !activeWorkers.some((w) => w.id === takerId)) {
    return { allowed: false, reason: 'taker_not_active' };
  }

  return { allowed: true, reason: 'ok' };
}

export function tpvClockInBlockMessage(reason: TpvClockInBlockReason, isWorkerUser: boolean): string {
  switch (reason) {
    case 'loading':
      return 'Comprobando fichajes…';
    case 'none_active':
      return 'Hay que fichar la entrada en esta tienda antes de usar el TPV.';
    case 'worker_not_clocked':
      return 'Debes fichar tu entrada en esta tienda para operar el TPV.';
    case 'taker_not_active':
      return 'Selecciona quién atiende: debe estar fichado y fuera de descanso.';
    default:
      return isWorkerUser
        ? 'Ficha tu entrada para continuar.'
        : 'Al menos una persona debe estar fichada en esta tienda.';
  }
}
