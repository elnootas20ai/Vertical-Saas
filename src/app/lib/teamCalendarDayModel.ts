/**
 * Quién trabaja / falta un día concreto (popup calendario trabajador).
 */

import type { ScheduleTemplate, Weekday } from './schedulesApi';
import { WEEKDAYS } from './schedulesApi';
import type { VacationRequest, LeaveType } from './vacationsApi';
import { LEAVE_TYPE_SHORT_ES } from './vacationsApi';
import type { WorkerAssignment } from './authApi';
import {
  getTeamMemberCalendarColor,
  resolveMemberStoreLabel,
} from './teamCalendarColors';

export type DayRosterMember = {
  user_id: string;
  fullName: string;
  role?: string;
  employment?: {
    salesPointId?: string;
    assignments?: WorkerAssignment[];
  };
};

export type DayRosterRow = {
  memberId: string;
  fullName: string;
  kind: 'work' | 'leave_approved' | 'leave_pending' | 'off';
  label: string;
  detail: string;
  colorHex: string;
  storeLabel: string;
  isMe: boolean;
};

function mondayOfIso(iso: string): string {
  const d = new Date(`${String(iso || '').trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso || '').trim();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function weekdayOfIso(iso: string): Weekday {
  const d = new Date(`${String(iso || '').trim()}T12:00:00`);
  return WEEKDAYS[(d.getDay() + 6) % 7] as Weekday;
}

function scheduleForMemberIso(
  memberId: string,
  iso: string,
  schedules: ScheduleTemplate[],
): ScheduleTemplate | null {
  const weekStart = mondayOfIso(iso);
  const mine = schedules.filter((s) => s.member_id === memberId);
  if (!mine.length) return null;
  return (
    mine.find((s) => s.week_start === weekStart)
    || mine.slice().sort((a, b) => String(b.week_start || '').localeCompare(String(a.week_start || '')))[0]
    || null
  );
}

function leaveForMember(
  vacations: VacationRequest[],
  memberId: string,
  iso: string,
): VacationRequest | null {
  const hits = vacations.filter(
    (v) =>
      v.member_id === memberId
      && (v.status === 'approved' || v.status === 'pending')
      && iso >= v.startDate
      && iso <= v.endDate,
  );
  if (!hits.length) return null;
  return hits.find((v) => v.status === 'approved') || hits[0];
}

export function buildDayRoster(options: {
  iso: string;
  members: DayRosterMember[];
  schedules: ScheduleTemplate[];
  vacations: VacationRequest[];
  workCenters?: Array<{ _id?: string; id?: string; name?: string }>;
  leaveLabels?: Record<string, string>;
  currentUserId?: string;
  storeFallbackLabel?: string;
}): {
  working: DayRosterRow[];
  away: DayRosterRow[];
  off: DayRosterRow[];
  workingCount: number;
  awayCount: number;
} {
  const {
    iso,
    members,
    schedules,
    vacations,
    workCenters = [],
    leaveLabels = {},
    currentUserId = '',
    storeFallbackLabel = '',
  } = options;

  const wd = weekdayOfIso(iso);
  const working: DayRosterRow[] = [];
  const away: DayRosterRow[] = [];
  const off: DayRosterRow[] = [];

  for (const member of members) {
    const color = getTeamMemberCalendarColor(member.user_id);
    const sched = scheduleForMemberIso(member.user_id, iso, schedules);
    const storeLabel = resolveMemberStoreLabel({
      scheduleWorkCenterId: sched?.work_center_id,
      scheduleWorkCenterName: sched?.work_center_name,
      employmentSalesPointId: member.employment?.salesPointId,
      assignments: member.employment?.assignments,
      workCenters,
      fallbackLabel: storeFallbackLabel,
    });
    const isMe = Boolean(currentUserId && member.user_id === currentUserId);
    const leave = leaveForMember(vacations, member.user_id, iso);

    if (leave) {
      const type = (leave.leaveType || 'other') as LeaveType;
      const full = leaveLabels[type] || LEAVE_TYPE_SHORT_ES[type] || 'Ausencia';
      const short = LEAVE_TYPE_SHORT_ES[type] || full.slice(0, 6);
      const pending = leave.status === 'pending';
      away.push({
        memberId: member.user_id,
        fullName: member.fullName,
        kind: pending ? 'leave_pending' : 'leave_approved',
        label: pending ? `${short} · pend.` : short,
        detail: pending ? `${full} · pendiente de RRHH` : `${full} · aprobado`,
        colorHex: pending ? '#D97706' : '#059669',
        storeLabel,
        isMe,
      });
      continue;
    }

    const shift = sched?.weekly?.[wd];
    if (shift?.enabled) {
      working.push({
        memberId: member.user_id,
        fullName: member.fullName,
        kind: 'work',
        label: `${shift.start}–${shift.end}`,
        detail: `Turno ${shift.start} – ${shift.end}`,
        colorHex: color.hex,
        storeLabel,
        isMe,
      });
      continue;
    }

    off.push({
      memberId: member.user_id,
      fullName: member.fullName,
      kind: 'off',
      label: 'Libre',
      detail: 'Sin turno ese día',
      colorHex: '#A8A29E',
      storeLabel,
      isMe,
    });
  }

  const byMe = (a: DayRosterRow, b: DayRosterRow) =>
    Number(b.isMe) - Number(a.isMe) || a.fullName.localeCompare(b.fullName, 'es');

  working.sort(byMe);
  away.sort(byMe);
  off.sort(byMe);

  return {
    working,
    away,
    off,
    workingCount: working.length,
    awayCount: away.length,
  };
}
