import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateDaysAgo,
  filterRecordsSince,
  formatHoursShort,
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
});
