import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateDaysAgo,
  filterRecordsSince,
  formatHoursShort,
  pickActiveClockinRecord,
  pickPreferredMemberClockin,
  sessionTurnLabel,
  sumWorkedMinutes,
  todayDateStr,
} from '../src/app/lib/clockinHistoryUtils.ts';

describe('clockinHistoryUtils', () => {
  it('todayDateStr returns YYYY-MM-DD', () => {
    assert.match(todayDateStr(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('filterRecordsSince keeps recent dates', () => {
    const since = dateDaysAgo(7);
    const records = [
      { date: since, totalMinutes: 60, breakMinutes: 0 },
      { date: '2000-01-01', totalMinutes: 30, breakMinutes: 0 },
    ];
    const filtered = filterRecordsSince(records, since);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].date, since);
  });

  it('sumWorkedMinutes and formatHoursShort', () => {
    const total = sumWorkedMinutes([
      { totalMinutes: 90, breakMinutes: 0 },
      { totalMinutes: 30, breakMinutes: 0 },
    ]);
    assert.equal(total, 120);
    assert.equal(formatHoursShort(125), '2h 05m');
    assert.equal(formatHoursShort(45), '45 min');
  });

  it('pickActiveClockinRecord prefers open shift over completed same day', () => {
    const completed = {
      _id: 'a',
      date: '2026-06-15',
      status: 'completed',
      entries: [{ type: 'clock_in', time: '2026-06-15T08:00:00.000Z' }],
      totalMinutes: 240,
      breakMinutes: 0,
    };
    const active = {
      _id: 'b',
      date: '2026-06-15',
      status: 'active',
      entries: [{ type: 'clock_in', time: '2026-06-15T16:00:00.000Z' }],
      totalMinutes: 0,
      breakMinutes: 0,
    };
    assert.equal(pickActiveClockinRecord([completed, active])?._id, 'b');
    assert.equal(pickActiveClockinRecord([completed]), null);
  });

  it('pickPreferredMemberClockin and sessionTurnLabel', () => {
    const early = {
      _id: '1',
      date: '2026-06-15',
      status: 'completed',
      entries: [{ type: 'clock_in', time: '2026-06-15T08:00:00.000Z' }],
      totalMinutes: 120,
      breakMinutes: 0,
    };
    const late = {
      _id: '2',
      date: '2026-06-15',
      status: 'completed',
      entries: [{ type: 'clock_in', time: '2026-06-15T16:00:00.000Z' }],
      totalMinutes: 90,
      breakMinutes: 0,
    };
    assert.equal(pickPreferredMemberClockin(early, late)._id, '2');
    assert.equal(sessionTurnLabel({ session_index: 2, same_day_sessions: 2 }), '2.º turno');
  });
});
