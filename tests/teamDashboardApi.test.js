import { describe, expect, it } from 'vitest';
import {
  buildTeamDashboardSnapshot,
  countPayslipsThisMonth,
  pickLatestSchedulePerMember,
} from '../src/app/lib/teamDashboardMetrics';
import { defaultWeekly } from '../src/app/lib/schedulesApi';

describe('teamDashboardApi', () => {
  it('counts payslips for business members in current month', () => {
    const count = countPayslipsThisMonth(
      [
        { worker_id: 'u1', documentType: 'nomina', period: '2026-05' },
        { worker_id: 'u2', documentType: 'nomina', period: '2026-05' },
        { worker_id: 'u3', documentType: 'contrato', period: '2026-05' },
      ],
      new Set(['u1', 'u2']),
      '2026-05',
    );
    expect(count).toBe(2);
  });

  it('builds today availability snapshot', () => {
    const weekly = defaultWeekly();
    weekly.monday.enabled = true;

    const snapshot = buildTeamDashboardSnapshot({
      members: [{ user_id: 'u1', fullName: 'Uriel Test' }],
      vacations: [
        {
          member_id: 'u2',
          member_name: 'Ana Test',
          status: 'approved',
          leaveType: 'vacation',
          startDate: '2026-05-01',
          endDate: '2026-12-31',
        },
      ],
      schedules: [
        {
          member_id: 'u1',
          member_name: 'Uriel Test',
          week_start: '2026-05-05',
          weekly,
        },
      ],
      blocks: [],
      payrollDocs: [],
      scheduleAlertsCount: 2,
      clockedInNow: 1,
      today: '2026-05-05',
    });

    expect(snapshot.clockedInNow).toBe(1);
    expect(snapshot.onVacationToday).toBe(1);
    expect(snapshot.scheduleAlertsCount).toBe(2);
  });

  it('keeps latest schedule per member', () => {
    const weekly = defaultWeekly();
    const picked = pickLatestSchedulePerMember([
      { member_id: 'u1', week_start: '2026-05-01', weekly },
      { member_id: 'u1', week_start: '2026-05-12', weekly },
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].week_start).toBe('2026-05-12');
  });
});
