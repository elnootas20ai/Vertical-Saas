import type { ClockinRecord } from './clockinsApi';

export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
