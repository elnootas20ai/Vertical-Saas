import type { TpvClockedInWorker } from './tpvActiveStaff';
import { clockinIdsMatch } from './tpvActiveStaff';

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
  // Durante refresco silencioso, no bloquear si ya hay personal en pantalla.
  if (loading && clockedInWorkers.length === 0) return { allowed: false, reason: 'loading' };

  const presentWorkers = clockedInWorkers.filter((w) => w.status === 'active' || w.status === 'break');
  const activeWorkers = clockedInWorkers.filter((w) => w.status === 'active');
  if (presentWorkers.length === 0) {
    return { allowed: false, reason: 'none_active' };
  }

  if (isWorkerUser) {
    const selfPresent = presentWorkers.some((w) => clockinIdsMatch(w.id, currentUserId));
    const selfActive = activeWorkers.some((w) => clockinIdsMatch(w.id, currentUserId));
    if (!selfPresent) {
      return { allowed: false, reason: 'worker_not_clocked' };
    }
    if (!selfActive) {
      return { allowed: false, reason: 'taker_not_active' };
    }
    return { allowed: true, reason: 'ok' };
  }

  const takerId = selectedOrderTakerId || activeWorkers[0]?.id || null;
  if (!takerId || !activeWorkers.some((w) => clockinIdsMatch(w.id, takerId))) {
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
      return isWorkerUser
        ? 'Estás en descanso. Finaliza el descanso para operar el TPV.'
        : 'Selecciona quién atiende: debe estar fichado y fuera de descanso.';
    default:
      return isWorkerUser
        ? 'Ficha tu entrada para continuar.'
        : 'Al menos una persona debe estar fichada en esta tienda.';
  }
}
