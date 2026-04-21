import type { ScheduleTemplate } from './schedulesApi';
import type { VacationRequest } from './vacationsApi';
import type { CompanyHoliday } from './companyHolidaysApi';
import { getHolidayForDate } from './companyHolidaysApi';
import type { AvailabilityBlock } from './availabilityBlocksApi';
import { isBlockActiveOnDate } from './availabilityBlocksApi';
import { WEEKDAYS } from './schedulesApi';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScheduleAlertType =
  | 'shift_uncovered'
  | 'vacation_overlap'
  | 'schedule_undefined'
  | 'vacation_pending_review'
  | 'holiday_with_shifts'
  | 'block_conflict';

export interface ScheduleAlert {
  id: string;
  type: ScheduleAlertType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  memberIds: string[];
  date?: string;
  actionLabel: string;
  actionTab: string;
  createdAt: string;
}

export interface AlertGeneratorData {
  schedules: ScheduleTemplate[];
  vacations: VacationRequest[];
  holidays: CompanyHoliday[];
  blocks: AvailabilityBlock[];
  members: { user_id: string; fullName: string; employment?: { department?: string } }[];
  weekStart: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function weekEndFromStart(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function dateToWeekdayIndex(date: string): number {
  const d = new Date(date + 'T00:00:00');
  return (d.getDay() + 6) % 7;
}

let alertCounter = 0;
function nextAlertId(): string {
  return `alert_${Date.now()}_${++alertCounter}`;
}

// ─── Alert generators ────────────────────────────────────────────────────────

export function getUndefinedScheduleAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  const scheduledIds = new Set(data.schedules.map(s => s.member_id));
  const missing = data.members.filter(m => !scheduledIds.has(m.user_id));
  if (missing.length === 0) return [];

  const names = missing.slice(0, 3).map(m => m.fullName).join(', ');
  const extra = missing.length > 3 ? ` y ${missing.length - 3} más` : '';

  return [{
    id: nextAlertId(),
    type: 'schedule_undefined',
    severity: 'warning',
    title: `${missing.length} miembro${missing.length > 1 ? 's' : ''} sin horario`,
    description: `${names}${extra} no tiene${missing.length > 1 ? 'n' : ''} horario definido para la semana del ${data.weekStart}`,
    memberIds: missing.map(m => m.user_id),
    date: data.weekStart,
    actionLabel: 'Asignar horarios',
    actionTab: 'calendar',
    createdAt: new Date().toISOString(),
  }];
}

export function getVacationOverlapAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];
  const approved = data.vacations.filter(v => v.status === 'approved' || v.status === 'pending');
  const weekEnd = weekEndFromStart(data.weekStart);
  const seen = new Set<string>();

  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (a.member_id === b.member_id) continue;

      const overlapStart = a.startDate > b.startDate ? a.startDate : b.startDate;
      const overlapEnd = a.endDate < b.endDate ? a.endDate : b.endDate;
      if (overlapStart > overlapEnd) continue;
      if (overlapEnd < data.weekStart || overlapStart > weekEnd) continue;

      const key = [a.member_id, b.member_id].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      const memberA = data.members.find(m => m.user_id === a.member_id);
      const memberB = data.members.find(m => m.user_id === b.member_id);
      const sameDept = memberA?.employment?.department &&
        memberA.employment.department === memberB?.employment?.department;

      alerts.push({
        id: nextAlertId(),
        type: 'vacation_overlap',
        severity: sameDept ? 'warning' : 'info',
        title: 'Vacaciones solapadas',
        description: `${a.member_name} y ${b.member_name} tienen vacaciones solapadas del ${overlapStart} al ${overlapEnd}${sameDept ? ` (mismo departamento: ${memberA?.employment?.department})` : ''}`,
        memberIds: [a.member_id, b.member_id],
        date: overlapStart,
        actionLabel: 'Ver vacaciones',
        actionTab: 'vacations',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return alerts;
}

export function getShiftUncoveredAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];
  const weekEnd = weekEndFromStart(data.weekStart);
  const dates = dateRange(data.weekStart, weekEnd);
  const approved = data.vacations.filter(v => v.status === 'approved');
  const uncoveredByDate: Record<string, string[]> = {};

  for (const schedule of data.schedules) {
    for (const date of dates) {
      const weekdayIdx = dateToWeekdayIndex(date);
      const weekday = WEEKDAYS[weekdayIdx];
      const shift = schedule.weekly[weekday];
      if (!shift?.enabled) continue;

      const onVacation = approved.some(v =>
        v.member_id === schedule.member_id && date >= v.startDate && date <= v.endDate,
      );
      const blocked = data.blocks.some(b =>
        b.member_id === schedule.member_id && isBlockActiveOnDate(b, date),
      );

      if (onVacation || blocked) {
        if (!uncoveredByDate[date]) uncoveredByDate[date] = [];
        uncoveredByDate[date].push(schedule.member_name);
      }
    }
  }

  for (const [date, names] of Object.entries(uncoveredByDate)) {
    const display = names.slice(0, 3).join(', ');
    const extra = names.length > 3 ? ` y ${names.length - 3} más` : '';
    alerts.push({
      id: nextAlertId(),
      type: 'shift_uncovered',
      severity: 'critical',
      title: `${names.length} turno${names.length > 1 ? 's' : ''} sin cubrir el ${date}`,
      description: `${display}${extra} tiene${names.length > 1 ? 'n' : ''} turno asignado pero no está${names.length > 1 ? 'n' : ''} disponible${names.length > 1 ? 's' : ''}`,
      memberIds: [],
      date,
      actionLabel: 'Ver calendario',
      actionTab: 'calendar',
      createdAt: new Date().toISOString(),
    });
  }
  return alerts;
}

export function getPendingVacationAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  const pending = data.vacations.filter(v => v.status === 'pending');
  if (pending.length === 0) return [];

  const maxHours = 48;
  const now = Date.now();
  const old = pending.filter(v => (now - new Date(v.createdAt).getTime()) > maxHours * 3600000);

  const alerts: ScheduleAlert[] = [];
  if (old.length > 0) {
    const names = old.slice(0, 3).map(v => v.member_name).join(', ');
    const extra = old.length > 3 ? ` y ${old.length - 3} más` : '';
    alerts.push({
      id: nextAlertId(),
      type: 'vacation_pending_review',
      severity: 'warning',
      title: `${old.length} solicitud${old.length > 1 ? 'es' : ''} pendiente${old.length > 1 ? 's' : ''} > 48h`,
      description: `Solicitudes de ${names}${extra} llevan más de 48 horas sin revisar`,
      memberIds: old.map(v => v.member_id),
      actionLabel: 'Revisar solicitudes',
      actionTab: 'vacations',
      createdAt: new Date().toISOString(),
    });
  }

  if (pending.length > 0 && old.length !== pending.length) {
    alerts.push({
      id: nextAlertId(),
      type: 'vacation_pending_review',
      severity: 'info',
      title: `${pending.length} solicitud${pending.length > 1 ? 'es' : ''} pendiente${pending.length > 1 ? 's' : ''}`,
      description: `Hay ${pending.length} solicitud${pending.length > 1 ? 'es' : ''} de vacaciones esperando revisión`,
      memberIds: pending.map(v => v.member_id),
      actionLabel: 'Revisar solicitudes',
      actionTab: 'vacations',
      createdAt: new Date().toISOString(),
    });
  }
  return alerts;
}

export function getHolidayWithShiftsAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];
  const weekEnd = weekEndFromStart(data.weekStart);
  const dates = dateRange(data.weekStart, weekEnd);

  for (const date of dates) {
    const holiday = getHolidayForDate(date, data.holidays);
    if (!holiday) continue;

    const membersWithShift: string[] = [];
    for (const schedule of data.schedules) {
      const weekdayIdx = dateToWeekdayIndex(date);
      const shift = schedule.weekly[WEEKDAYS[weekdayIdx]];
      if (shift?.enabled) membersWithShift.push(schedule.member_name);
    }

    if (membersWithShift.length > 0) {
      alerts.push({
        id: nextAlertId(),
        type: 'holiday_with_shifts',
        severity: 'info',
        title: `Turnos en festivo: ${holiday.name}`,
        description: `${membersWithShift.length} miembro${membersWithShift.length > 1 ? 's' : ''} tiene${membersWithShift.length > 1 ? 'n' : ''} turno el ${date} (${holiday.name})`,
        memberIds: [],
        date,
        actionLabel: 'Ver festivos',
        actionTab: 'holidays',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return alerts;
}

export function getBlockConflictAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];
  const weekEnd = weekEndFromStart(data.weekStart);
  const dates = dateRange(data.weekStart, weekEnd);

  for (const block of data.blocks) {
    const schedule = data.schedules.find(s => s.member_id === block.member_id);
    if (!schedule) continue;

    let conflictDays = 0;
    for (const date of dates) {
      if (!isBlockActiveOnDate(block, date)) continue;
      const weekdayIdx = dateToWeekdayIndex(date);
      const shift = schedule.weekly[WEEKDAYS[weekdayIdx]];
      if (shift?.enabled) conflictDays++;
    }

    if (conflictDays > 0) {
      alerts.push({
        id: nextAlertId(),
        type: 'block_conflict',
        severity: 'warning',
        title: `Bloqueo conflicta con turno`,
        description: `${block.member_name} tiene bloqueo (${block.reason}) que conflicta con ${conflictDays} día${conflictDays > 1 ? 's' : ''} de turno esta semana`,
        memberIds: [block.member_id],
        date: data.weekStart,
        actionLabel: 'Ver bloqueos',
        actionTab: 'blocks',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return alerts;
}

// ─── Main generator ──────────────────────────────────────────────────────────

export function generateAlerts(data: AlertGeneratorData): ScheduleAlert[] {
  alertCounter = 0;
  const all: ScheduleAlert[] = [
    ...getShiftUncoveredAlerts(data),
    ...getUndefinedScheduleAlerts(data),
    ...getVacationOverlapAlerts(data),
    ...getPendingVacationAlerts(data),
    ...getHolidayWithShiftsAlerts(data),
    ...getBlockConflictAlerts(data),
  ];

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// ─── Dismissed alerts (localStorage) ─────────────────────────────────────────

const DISMISSED_KEY = 'udar_dismissed_alerts';

export function getDismissedAlertIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function dismissAlert(alertId: string): void {
  const dismissed = getDismissedAlertIds();
  dismissed.add(alertId);
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed])); } catch {}
}

export function clearDismissedAlerts(): void {
  try { localStorage.removeItem(DISMISSED_KEY); } catch {}
}

// ─── Config labels ───────────────────────────────────────────────────────────

export const ALERT_TYPE_LABELS: Record<string, Record<ScheduleAlertType, string>> = {
  es: {
    shift_uncovered: 'Turno sin cubrir',
    vacation_overlap: 'Vacaciones solapadas',
    schedule_undefined: 'Sin horario definido',
    vacation_pending_review: 'Solicitud pendiente',
    holiday_with_shifts: 'Turnos en festivo',
    block_conflict: 'Conflicto de bloqueo',
  },
  en: {
    shift_uncovered: 'Uncovered shift',
    vacation_overlap: 'Overlapping vacations',
    schedule_undefined: 'No schedule defined',
    vacation_pending_review: 'Pending request',
    holiday_with_shifts: 'Shifts on holiday',
    block_conflict: 'Block conflict',
  },
};

export const ALERT_SEVERITY_CONFIG = {
  critical: { icon: 'AlertTriangle', cls: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
  warning: { icon: 'AlertCircle', cls: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' },
  info: { icon: 'Info', cls: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
};
