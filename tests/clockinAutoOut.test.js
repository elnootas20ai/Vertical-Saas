import { describe, expect, it } from 'vitest';
import {
  AUTO_OUT_GRACE_MS,
  getAutoClockOutAtMs,
  shouldAutoClockOut,
} from '../src/app/lib/clockinAutoOut.ts';

describe('clockinAutoOut', () => {
  it('cierra 10 min después del fin de turno', () => {
    const record = {
      date: '2026-06-01',
      status: 'active',
      scheduled_start: '09:00',
      scheduled_end: '17:00',
      entries: [{ type: 'clock_in', time: '2026-06-01T08:50:00' }],
    };
    const at = getAutoClockOutAtMs(record);
    const expected = new Date('2026-06-01T17:00:00').getTime() + AUTO_OUT_GRACE_MS;
    expect(at).toBe(expected);
    expect(shouldAutoClockOut(record, expected - 1)).toBe(false);
    expect(shouldAutoClockOut(record, expected)).toBe(true);
  });

  it('no cierra en descanso aunque pase el plazo', () => {
    const record = {
      date: '2026-06-01',
      status: 'break',
      scheduled_end: '10:00',
      entries: [
        { type: 'clock_in', time: '2026-06-01T09:00:00' },
        { type: 'break_start', time: '2026-06-01T09:30:00' },
      ],
    };
    const after = new Date('2026-06-01T10:20:00').getTime();
    expect(shouldAutoClockOut(record, after)).toBe(false);
  });

  it('turno noche: fin al día siguiente + 10 min', () => {
    const record = {
      date: '2026-06-01',
      status: 'active',
      scheduled_start: '22:00',
      scheduled_end: '02:00',
      entries: [{ type: 'clock_in', time: '2026-06-01T21:55:00' }],
    };
    const at = getAutoClockOutAtMs(record);
    const expected = new Date('2026-06-02T02:00:00').getTime() + AUTO_OUT_GRACE_MS;
    expect(at).toBe(expected);
  });
});
