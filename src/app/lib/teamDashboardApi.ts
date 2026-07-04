import { listCompanyHolidays } from './companyHolidaysApi';
import { listPayrollDocumentsRequest } from './payrollApi';
import { listBlocks } from './availabilityBlocksApi';
import { generateAlerts } from './scheduleAlertsApi';
import { getMonday, listSchedules } from './schedulesApi';
import { listVacations } from './vacationsApi';
import { fetchActiveNow } from './clockinsApi';
import {
  buildTeamDashboardSnapshot,
  EMPTY_TEAM_DASHBOARD_SNAPSHOT,
  pickLatestSchedulePerMember,
  type TeamDashboardMemberRef,
  type TeamDashboardSnapshot,
} from './teamDashboardMetrics';

export type { TeamDashboardMemberRef, TeamDashboardSnapshot } from './teamDashboardMetrics';
export {
  buildTeamDashboardSnapshot,
  countPayslipsThisMonth,
  EMPTY_TEAM_DASHBOARD_SNAPSHOT,
  pickLatestSchedulePerMember,
} from './teamDashboardMetrics';

export async function fetchTeamDashboardSnapshot(
  businessId: string,
  members: TeamDashboardMemberRef[],
): Promise<TeamDashboardSnapshot> {
  if (!businessId || members.length === 0) {
    return { ...EMPTY_TEAM_DASHBOARD_SNAPSHOT, totalMembers: members.length };
  }

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getMonday();

  const [vacations, schedules, blocks, payrollDocs, holidays, activeNow] = await Promise.all([
    listVacations(businessId).catch(() => []),
    listSchedules(businessId).catch(() => []),
    listBlocks(businessId).catch(() => []),
    listPayrollDocumentsRequest({
      businessId,
      memberIds: members.map((m) => m.user_id).filter(Boolean),
    }).catch(() => []),
    listCompanyHolidays(businessId).catch(() => []),
    fetchActiveNow(businessId).catch(() => []),
  ]);

  const latestSchedules = pickLatestSchedulePerMember(schedules);
  const alerts = generateAlerts({
    schedules: latestSchedules,
    vacations,
    holidays,
    blocks,
    members: members.map((m) => ({ user_id: m.user_id, fullName: m.fullName })),
    weekStart,
  });

  return buildTeamDashboardSnapshot({
    members,
    vacations,
    schedules,
    blocks,
    payrollDocs,
    scheduleAlertsCount: alerts.length,
    clockedInNow: activeNow.filter((a) => a.status === 'active' || a.status === 'break').length,
    today,
  });
}
