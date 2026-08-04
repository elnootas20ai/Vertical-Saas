import { describe, expect, it } from 'vitest';

/**
 * Copia de la lógica de contador en vivo (sin importar el hook: evita localStorage de authApi).
 */
function computeClockinLiveSeconds(record, nowMs = Date.now()) {
  if (!record) return { worked: 0, breakSec: 0 };
  const entries = record.entries || [];
  const clockInEntry = entries.find((e) => e.type === 'clock_in');
  if (!clockInEntry) return { worked: 0, breakSec: 0 };
  const startMs = new Date(clockInEntry.time).getTime();
  if (!Number.isFinite(startMs)) return { worked: 0, breakSec: 0 };
  const clockOutEntry = entries.find((e) => e.type === 'clock_out');
  const endMs = clockOutEntry ? new Date(clockOutEntry.time).getTime() : nowMs;
  const totalMs = Math.max(0, endMs - startMs);
  let breakMs = 0;
  let breakStart = null;
  for (const e of entries) {
    if (e.type === 'break_start') breakStart = new Date(e.time).getTime();
    if (e.type === 'break_end' && breakStart !== null) {
      const bStart = Math.max(breakStart, startMs);
      const bEnd = Math.min(new Date(e.time).getTime(), endMs);
      if (bEnd > bStart) breakMs += bEnd - bStart;
      breakStart = null;
    }
  }
  if (breakStart !== null) {
    const bStart = Math.max(breakStart, startMs);
    const bEnd = Math.min(clockOutEntry ? new Date(clockOutEntry.time).getTime() : nowMs, endMs);
    if (bEnd > bStart) breakMs += bEnd - bStart;
  }
  const workedMs = Math.max(0, totalMs - breakMs);
  return { worked: Math.floor(workedMs / 1000), breakSec: Math.floor(breakMs / 1000) };
}

describe('computeClockinLiveSeconds', () => {
  it('arranca cerca de 0 justo al fichar (ignora plantilla)', () => {
    const now = Date.parse('2026-08-02T15:40:05.000Z');
    const record = {
      date: '2026-08-02',
      status: 'active',
      scheduled_start: '09:00',
      scheduled_end: '17:00',
      entries: [{ type: 'clock_in', time: '2026-08-02T15:40:00.000Z' }],
    };
    expect(computeClockinLiveSeconds(record, now).worked).toBe(5);
  });

  it('no cuenta desde scheduled_start del pasado', () => {
    const now = Date.parse('2026-08-02T15:40:00.000Z');
    const record = {
      date: '2026-08-02',
      status: 'active',
      scheduled_start: '08:00',
      entries: [{ type: 'clock_in', time: '2026-08-02T15:40:00.000Z' }],
    };
    expect(computeClockinLiveSeconds(record, now).worked).toBe(0);
  });

  it('resta descansos', () => {
    const now = Date.parse('2026-08-02T16:00:00.000Z');
    const record = {
      date: '2026-08-02',
      status: 'active',
      entries: [
        { type: 'clock_in', time: '2026-08-02T15:00:00.000Z' },
        { type: 'break_start', time: '2026-08-02T15:30:00.000Z' },
        { type: 'break_end', time: '2026-08-02T15:40:00.000Z' },
      ],
    };
    const { worked, breakSec } = computeClockinLiveSeconds(record, now);
    expect(breakSec).toBe(600);
    expect(worked).toBe(3000);
  });
});
