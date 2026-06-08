import type { BusinessMember } from './businessApi';
import { isBlockActiveOnDate, type AvailabilityBlock } from './availabilityBlocksApi';
import { WEEKDAYS, type ScheduleTemplate, type Weekday } from './schedulesApi';
import type { VacationRequest } from './vacationsApi';

export type TeamDashboardMemberRef = Pick<BusinessMember, 'user_id' | 'fullName'>;

export type TeamDashboardSnapshot = {
  totalMembers: number;
  clockedInNow: number;
  onVacationToday: number;
  onAbsenceToday: number;
  scheduledToday: number;
  noShiftToday: number;
  pendingVacationRequests: number;
  payslipsThisMonth: number;
  membersWithoutSchedule: number;
  scheduleAlertsCount: number;
  onVacationNames: string[];
  onAbsenceNames: string[];
};

export const EMPTY_TEAM_DASHBOARD_SNAPSHOT: TeamDashboardSnapshot = {
  totalMembers: 0,
  clockedInNow: 0,
  onVacationToday: 0,
  onAbsenceToday: 0,
  scheduledToday: 0,
  noShiftToday: 0,
  pendingVacationRequests: 0,
  payslipsThisMonth: 0,
  membersWithoutSchedule: 0,
  scheduleAlertsCount: 0,
  onVacationNames: [],
  onAbsenceNames: [],
};

function todayIso(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function weekdayForDate(date: string): Weekday {
  const d = new Date(`${date}T12:00:00`);
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

export function pickLatestSchedulePerMember(schedules: ScheduleTemplate[]): ScheduleTemplate[] {
  const byMember = new Map<string, ScheduleTemplate>();
  for (const schedule of schedules) {
    const prev = byMember.get(schedule.member_id);
    if (!prev || String(schedule.week_start || '') >= String(prev.week_start || '')) {
      byMember.set(schedule.member_id, schedule);
    }
  }
  return Array.from(byMember.values());
}

export type TeamDashboardPayrollDoc = {
  worker_id: string;
  documentType: string;
  period?: string;
  createdAt?: string;
};

export function countPayslipsThisMonth(
  docs: TeamDashboardPayrollDoc[],
  memberIds: Set<string>,
  monthPeriod: string,
): number {
  return docs.filter((doc) => {
    if (doc.documentType !== 'nomina' || !memberIds.has(doc.worker_id)) return false;
    if (doc.period === monthPeriod) return true;
    return !doc.period && String(doc.createdAt || '').startsWith(monthPeriod);
  }).length;
}

export function buildTeamDashboardSnapshot(params: {
  members: TeamDashboardMemberRef[];
  vacations: VacationRequest[];
  schedules: ScheduleTemplate[];
  blocks: AvailabilityBlock[];
  payrollDocs: TeamDashboardPayrollDoc[];
  scheduleAlertsCount: number;
  clockedInNow?: number;
  today?: string;
}): TeamDashboardSnapshot {
  const today = params.today || todayIso();
  const monthPeriod = today.slice(0, 7);
  const memberIds = new Set(params.members.map((m) => m.user_id));
  const schedules = pickLatestSchedulePerMember(params.schedules);
  const weekday = weekdayForDate(today);

  const onVacationIds = new Set<string>();
  const onAbsenceIds = new Set<string>();
  const onVacationNames: string[] = [];
  const onAbsenceNames: string[] = [];

  for (const vacation of params.vacations) {
    if (vacation.status !== 'approved') continue;
    if (!dateInRange(today, vacation.startDate, vacation.endDate)) continue;
    if (vacation.leaveType === 'vacation') {
      onVacationIds.add(vacation.member_id);
      onVacationNames.push(vacation.member_name);
    } else {
      onAbsenceIds.add(vacation.member_id);
      onAbsenceNames.push(vacation.member_name);
    }
  }

  for (const block of params.blocks) {
    if (!isBlockActiveOnDate(block, today)) continue;
    if (!onAbsenceIds.has(block.member_id)) {
      onAbsenceIds.add(block.member_id);
      onAbsenceNames.push(block.member_name);
    }
  }

  let scheduledToday = 0;
  let noShiftToday = 0;

  for (const member of params.members) {
    if (onVacationIds.has(member.user_id) || onAbsenceIds.has(member.user_id)) continue;
    const schedule = schedules.find((s) => s.member_id === member.user_id);
    if (schedule?.weekly[weekday]?.enabled) scheduledToday += 1;
    else noShiftToday += 1;
  }

  const membersWithoutSchedule = params.members.filter(
    (m) => !schedules.some((s) => s.member_id === m.user_id),
  ).length;

  return {
    totalMembers: params.members.length,
    clockedInNow: params.clockedInNow ?? 0,
    onVacationToday: onVacationIds.size,
    onAbsenceToday: onAbsenceIds.size,
    scheduledToday,
    noShiftToday,
    pendingVacationRequests: params.vacations.filter((v) => v.status === 'pending').length,
    payslipsThisMonth: countPayslipsThisMonth(params.payrollDocs, memberIds, monthPeriod),
    membersWithoutSchedule,
    scheduleAlertsCount: params.scheduleAlertsCount,
    onVacationNames: onVacationNames.slice(0, 6),
    onAbsenceNames: onAbsenceNames.slice(0, 6),
  };
}
