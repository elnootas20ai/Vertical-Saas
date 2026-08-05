import type { TpvClockedInWorker } from './tpvActiveStaff';
import { clockinIdsMatch } from './tpvActiveStaff';

export type TpvClockInBlockReason =
  | 'loading'
  | 'none_active'
  | 'worker_not_clocked'
  | 'taker_not_active'
  | 'vacation_blocked'
  | 'ok';

export function evaluateTpvClockInGate(params: {
  loading: boolean;
  clockedInWorkers: TpvClockedInWorker[];
  selectedOrderTakerId: string | null;
  currentUserId: string;
  isWorkerUser: boolean;
  /** IDs con vacaciones/baja aprobadas hoy (no pueden vender ni abrir caja). */
  vacationBlockedIds?: ReadonlySet<string> | string[];
}): { allowed: boolean; reason: TpvClockInBlockReason } {
  const {
    loading,
    clockedInWorkers,
    selectedOrderTakerId,
    currentUserId,
    isWorkerUser,
    vacationBlockedIds,
  } = params;
  const blockedSet = vacationBlockedIds instanceof Set
    ? vacationBlockedIds
    : new Set((vacationBlockedIds || []).map((id) => String(id).trim()).filter(Boolean));

  const isVacationBlocked = (id: string | null | undefined) => {
    const norm = String(id || '').trim();
    if (!norm) return false;
    if (blockedSet.has(norm)) return true;
    for (const bid of blockedSet) {
      if (clockinIdsMatch(bid, norm)) return true;
    }
    return false;
  };

  // Durante refresco silencioso, no bloquear si ya hay personal en pantalla.
  if (loading && clockedInWorkers.length === 0) return { allowed: false, reason: 'loading' };

  if (isWorkerUser && isVacationBlocked(currentUserId)) {
    return { allowed: false, reason: 'vacation_blocked' };
  }

  const presentWorkers = clockedInWorkers.filter(
    (w) => (w.status === 'active' || w.status === 'break') && !isVacationBlocked(w.id),
  );
  const activeWorkers = clockedInWorkers.filter(
    (w) => w.status === 'active' && !isVacationBlocked(w.id),
  );
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

  // Vacaciones del seleccionado: bloquear (el gerente debe elegir a otra persona).
  if (selectedOrderTakerId && isVacationBlocked(selectedOrderTakerId)) {
    return { allowed: false, reason: 'vacation_blocked' };
  }

  // Si el seleccionado no está activo (descanso / desfichado), caer al primer fichado activo.
  // Sin esto el CEO delivery queda bloqueado tras abrir caja con un taker obsoleto.
  let takerId = selectedOrderTakerId || null;
  if (!takerId || !activeWorkers.some((w) => clockinIdsMatch(w.id, takerId))) {
    takerId = activeWorkers[0]?.id || null;
  }
  if (!takerId) {
    return { allowed: false, reason: 'taker_not_active' };
  }

  return { allowed: true, reason: 'ok' };
}

export function tpvClockInBlockMessage(reason: TpvClockInBlockReason, isWorkerUser: boolean): string {
  switch (reason) {
    case 'loading':
      return 'Comprobando fichajes…';
    case 'vacation_blocked':
      return isWorkerUser
        ? 'Estás de vacaciones o de baja. No puedes usar el TPV hoy.'
        : 'Quien atiende está de vacaciones o de baja. Elige a otra persona fichada.';
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
