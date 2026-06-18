import { describe, expect, it } from 'vitest';
import {
  buildTpvActiveStaff,
  pickDefaultOrderTakerForSession,
} from '../src/app/lib/tpvActiveStaff.ts';
import {
  clockinValidForRegisterSession,
  clockinBelongsToLocalDay,
} from '../src/app/lib/clockinHistoryUtils.ts';

describe('buildTpvActiveStaff', () => {
  it('only shows real clockins, not session opener without fichaje', () => {
    const staff = buildTpvActiveStaff(
      { workerId: 'account:u1', workerName: 'Ana' },
      [],
    );
    expect(staff.length).toBe(0);
  });

  it('merges store clockins without duplicates', () => {
    const staff = buildTpvActiveStaff(
      { workerId: 'u1', workerName: 'Ana' },
      [{ id: 'u1', name: 'Ana Fichada', status: 'break' }, { id: 'u2', name: 'Luis', status: 'active' }],
    );
    expect(staff.length).toBe(2);
    expect(staff.find((w) => w.id === 'u1')?.status).toBe('break');
    expect(staff.find((w) => w.id === 'u2')?.name).toBe('Luis');
  });
});

describe('pickDefaultOrderTakerForSession', () => {
  it('prefers clocked worker over opener', () => {
    const id = pickDefaultOrderTakerForSession(
      { workerId: 'u1', workerName: 'Ana' },
      [{ id: 'u2', name: 'Luis', status: 'active' }],
    );
    expect(id).toBe('u2');
  });

  it('falls back to opener when nobody clocked in', () => {
    const id = pickDefaultOrderTakerForSession(
      { workerId: 'account:u1', workerName: 'Ana' },
      [],
    );
    expect(id).toBe('u1');
  });
});

describe('clockinValidForRegisterSession', () => {
  const dayKey = '2026-06-18';

  it('accepts fichaje before register session opened on same day', () => {
    expect(clockinValidForRegisterSession(
      {
        date: dayKey,
        entries: [{ type: 'clock_in', time: '2026-06-18T08:00:00.000Z' }],
      },
      '2026-06-18T10:00:00.000Z',
      dayKey,
    )).toBe(true);
  });

  it('accepts fichaje after register session opened', () => {
    expect(clockinValidForRegisterSession(
      {
        date: dayKey,
        entries: [{ type: 'clock_in', time: '2026-06-18T11:00:00.000Z' }],
      },
      '2026-06-18T10:00:00.000Z',
      dayKey,
    )).toBe(true);
  });

  it('rejects fichaje from another calendar day', () => {
    expect(clockinBelongsToLocalDay(
      {
        date: '2026-06-17',
        entries: [{ type: 'clock_in', time: '2026-06-17T20:00:00.000Z' }],
      },
      dayKey,
    )).toBe(false);
  });
});
