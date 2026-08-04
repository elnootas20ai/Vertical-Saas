/**
 * Reglas de cierre automático del fichaje:
 * - Se puede fichar antes/después del turno (la hora real queda en entries).
 * - Si hay fin de turno programado y no pulsan salida: cierre a scheduled_end + 10 min.
 * - Sin turno: tope de seguridad 4 h continuas trabajando (sin descanso).
 */

export const AUTO_OUT_GRACE_MS = 10 * 60 * 1000;
/** Seguridad si no hay horario asignado. */
export const SAFETY_CONTINUOUS_MS = 4 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseLocalDateTime(dateStr: string, hhmm: string): Date | null {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(`${dateStr}T${pad2(h)}:${pad2(m)}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type AutoOutClockinLike = {
  date?: string;
  status?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  entries?: { type: string; time: string }[];
};

/**
 * Momento (ms epoch) en que debe cerrarse solo el fichaje, o null si no aplica.
 */
export function getAutoClockOutAtMs(
  record: AutoOutClockinLike | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!record || record.status === 'completed') return null;

  const dateStr = String(record.date || '').slice(0, 10);
  const end = dateStr && record.scheduled_end
    ? parseLocalDateTime(dateStr, record.scheduled_end)
    : null;
  const start = dateStr && record.scheduled_start
    ? parseLocalDateTime(dateStr, record.scheduled_start)
    : null;

  if (end) {
    // Turno que cruza medianoche (fin <= inicio) → fin al día siguiente.
    if (start && end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    return end.getTime() + AUTO_OUT_GRACE_MS;
  }

  // Sin fin de turno: 4 h continuas desde la última reanudación (entrada / fin descanso).
  let lastResume: number | null = null;
  for (const e of record.entries || []) {
    if (e.type === 'clock_in' || e.type === 'break_end') {
      lastResume = new Date(e.time).getTime();
    }
    if (e.type === 'break_start' || e.type === 'clock_out') {
      lastResume = null;
    }
  }
  if (lastResume == null) return null;
  return lastResume + SAFETY_CONTINUOUS_MS;
}

export function getAutoClockOutRemainingMs(
  record: AutoOutClockinLike | null | undefined,
  nowMs: number = Date.now(),
): number {
  const at = getAutoClockOutAtMs(record, nowMs);
  if (at == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, at - nowMs);
}

export function shouldAutoClockOut(
  record: AutoOutClockinLike | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!record || record.status === 'completed' || record.status === 'break') return false;
  const at = getAutoClockOutAtMs(record, nowMs);
  if (at == null) return false;
  return nowMs >= at;
}
