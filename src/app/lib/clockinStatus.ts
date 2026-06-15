import type { ClockEntry, ClockinRecord } from './clockinsApi';

export type EffectiveClockinStatus = 'active' | 'break' | 'completed' | 'pending';

export function deriveEffectiveClockinStatus(
  record: Pick<ClockinRecord, 'status' | 'entries'> | null | undefined,
): EffectiveClockinStatus | null {
  if (!record) return null;

  const entries = Array.isArray(record.entries) ? record.entries : [];
  const types = entries.map((e) => e.type);

  if (types.includes('clock_out')) return 'completed';

  const breakStarts = types.filter((t) => t === 'break_start').length;
  const breakEnds = types.filter((t) => t === 'break_end').length;
  if (breakStarts > breakEnds) return 'break';

  if (record.status === 'break') return 'break';
  if (record.status === 'completed') return 'completed';

  if (types.includes('clock_in') || record.status === 'active' || record.status === 'offline') {
    return 'active';
  }

  return 'pending';
}

export function isClockinPresent(status: EffectiveClockinStatus | null): boolean {
  return status === 'active' || status === 'break';
}
