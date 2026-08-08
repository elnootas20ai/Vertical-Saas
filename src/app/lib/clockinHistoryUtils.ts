import type { ClockinRecord } from './clockinsApi';
import { deriveEffectiveClockinStatus, isClockinPresent } from './clockinStatus';
import { localCalendarDayKey } from './tpvCajaScope';

export function todayDateStr(): string {
  return localCalendarDayKey();
}

export function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function filterRecordsSince(records: ClockinRecord[], sinceDate: string): ClockinRecord[] {
  return records.filter((r) => r.date >= sinceDate);
}

export function filterRecordsInMonth(records: ClockinRecord[], year: number, month: number): ClockinRecord[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return records.filter((r) => r.date.startsWith(prefix));
}

export function sumWorkedMinutes(records: ClockinRecord[]): number {
  return records.reduce((s, r) => s + (r.totalMinutes || 0), 0);
}

export function sumBreakMinutes(records: ClockinRecord[]): number {
  return records.reduce((s, r) => s + (r.breakMinutes || 0), 0);
}

export function formatHoursShort(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function groupRecordsByMember(records: ClockinRecord[]): Map<string, ClockinRecord[]> {
  const map = new Map<string, ClockinRecord[]>();
  for (const r of records) {
    const key = r.member_id || r.member_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

export function clockInTimeIso(record: Pick<ClockinRecord, 'entries' | 'createdAt'>): string {
  return record.entries?.find((e) => e.type === 'clock_in')?.time
    || record.createdAt
    || '';
}

/** Fichaje del día local (no mezclar UTC ni turnos anteriores). */
export function clockinBelongsToLocalDay(
  record: Pick<ClockinRecord, 'date' | 'entries' | 'createdAt'>,
  dayKey = localCalendarDayKey(),
): boolean {
  const recordDay = String(record.date || '').trim();
  if (recordDay && recordDay !== dayKey) return false;
  const clockInIso = clockInTimeIso(record);
  if (clockInIso) {
    const clockDay = localCalendarDayKey(new Date(clockInIso));
    if (clockDay !== dayKey) return false;
  }
  return recordDay === dayKey || Boolean(clockInIso);
}

/** Fichaje válido para el turno de caja: día local de hoy, o turno aún abierto (noche/UTC). */
export function clockinValidForRegisterSession(
  record: Pick<ClockinRecord, 'date' | 'entries' | 'createdAt' | 'status'>,
  _sessionOpenedAt?: string | null | undefined,
  dayKey = localCalendarDayKey(),
): boolean {
  if (isClockinPresent(deriveEffectiveClockinStatus(record))) return true;
  return clockinBelongsToLocalDay(record, dayKey);
}

/** Orden cronológico de turnos (entrada más temprana primero). */
export function sortClockinsByClockIn(records: ClockinRecord[]): ClockinRecord[] {
  return [...records].sort((a, b) => clockInTimeIso(a).localeCompare(clockInTimeIso(b)));
}

/** Fichaje activo o en descanso del día; null si solo hay jornadas cerradas. */
export function pickActiveClockinRecord(records: ClockinRecord[]): ClockinRecord | null {
  const active = records.find((r) => isClockinPresent(deriveEffectiveClockinStatus(r)));
  if (active) return active;
  return null;
}

/** Para TPV/modal: turno activo > último turno del día. */
export function pickPreferredMemberClockin(a: ClockinRecord, b: ClockinRecord): ClockinRecord {
  const aPresent = isClockinPresent(deriveEffectiveClockinStatus(a));
  const bPresent = isClockinPresent(deriveEffectiveClockinStatus(b));
  if (aPresent && !bPresent) return a;
  if (bPresent && !aPresent) return b;
  return clockInTimeIso(b).localeCompare(clockInTimeIso(a)) > 0 ? b : a;
}

export function sessionTurnLabel(record: ClockinRecord & { session_index?: number; same_day_sessions?: number }): string | null {
  const total = record.same_day_sessions || 0;
  const idx = record.session_index || 0;
  if (total <= 1 || idx <= 0) return null;
  return `${idx}.º turno`;
}
