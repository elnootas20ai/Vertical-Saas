import type { ScheduleTemplate, Weekday } from './schedulesApi';
import { WEEKDAYS } from './schedulesApi';
import type { VacationRequest } from './vacationsApi';
import type { ClockinRecord } from './clockinsApi';
import type { CompanyHoliday } from './companyHolidaysApi';
import { isHoliday, getHolidayForDate } from './companyHolidaysApi';
import type { AvailabilityBlock } from './availabilityBlocksApi';
import { isBlockActiveOnDate } from './availabilityBlocksApi';
import { formatDateEs, formatDateRangeEs } from './formatDateEs';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConflictType =
  | 'vacation_vs_schedule'
  | 'vacation_vs_vacation'
  | 'block_vs_schedule'
  | 'holiday_vs_schedule'
  | 'vacation_vs_clockin'
  | 'block_vs_clockin'
  | 'schedule_undefined'
  | 'shift_uncovered';

export type ConflictSeverity = 'error' | 'warning' | 'info';

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  memberId: string;
  memberName: string;
  date: string;
  description: string;
  relatedMemberId?: string;
  relatedMemberName?: string;
  meta: Record<string, any>;
}

export interface DetectorOptions {
  dateRange: { start: string; end: string };
  departmentFilter?: string;
  workCenterFilter?: string;
  minOverlapDays?: number;
  maxVacationOverlapPercent?: number;
}

export interface DetectorData {
  schedules: ScheduleTemplate[];
  vacations: VacationRequest[];
  clockins: ClockinRecord[];
  holidays: CompanyHoliday[];
  blocks: AvailabilityBlock[];
  members: { user_id: string; fullName: string; role?: string; employment?: { department?: string } }[];
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

function dateToWeekday(date: string): Weekday {
  const d = new Date(date + 'T00:00:00');
  const idx = (d.getDay() + 6) % 7;
  return WEEKDAYS[idx];
}

function isWeekend(date: string): boolean {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}

let conflictCounter = 0;
function nextId(): string {
  return `conflict_${Date.now()}_${++conflictCounter}`;
}

// ─── Detectors ───────────────────────────────────────────────────────────────

export function detectVacationVsSchedule(
  vacations: VacationRequest[],
  schedules: ScheduleTemplate[],
  options: DetectorOptions,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const approved = vacations.filter(v => v.status === 'approved');

  for (const vac of approved) {
    const schedule = schedules.find(s => s.member_id === vac.member_id);
    if (!schedule) continue;

    const dates = dateRange(
      max(vac.startDate, options.dateRange.start),
      min(vac.endDate, options.dateRange.end),
    );

    for (const date of dates) {
      const weekday = dateToWeekday(date);
      const shift = schedule.weekly[weekday];
      if (shift?.enabled) {
        conflicts.push({
          id: nextId(),
          type: 'vacation_vs_schedule',
          severity: 'warning',
          memberId: vac.member_id,
          memberName: vac.member_name,
          date,
          description: `${vac.member_name} tiene turno ${shift.start}-${shift.end} pero está de vacaciones`,
          meta: { vacationId: vac._id, scheduleId: schedule._id, shift },
        });
      }
    }
  }
  return conflicts;
}

export function detectVacationOverlaps(
  vacations: VacationRequest[],
  members: DetectorData['members'],
  options: DetectorOptions,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const approved = vacations.filter(v => v.status === 'approved' || v.status === 'pending');
  const threshold = options.minOverlapDays ?? 1;
  const seen = new Set<string>();

  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (a.member_id === b.member_id) continue;

      if (options.departmentFilter) {
        const memberA = members.find(m => m.user_id === a.member_id);
        const memberB = members.find(m => m.user_id === b.member_id);
        if (memberA?.employment?.department !== options.departmentFilter) continue;
        if (memberB?.employment?.department !== options.departmentFilter) continue;
      }

      const overlapStart = max(a.startDate, b.startDate);
      const overlapEnd = min(a.endDate, b.endDate);
      if (overlapStart > overlapEnd) continue;

      const overlapDays = dateRange(overlapStart, overlapEnd).filter(d => !isWeekend(d)).length;
      if (overlapDays < threshold) continue;

      const key = [a.member_id, b.member_id].sort().join(':') + ':' + overlapStart;
      if (seen.has(key)) continue;
      seen.add(key);

      conflicts.push({
        id: nextId(),
        type: 'vacation_vs_vacation',
        severity: 'warning',
        memberId: a.member_id,
        memberName: a.member_name,
        date: overlapStart,
        description: `${a.member_name} y ${b.member_name} tienen vacaciones solapadas (${overlapDays} días: ${overlapStart} → ${overlapEnd})`,
        relatedMemberId: b.member_id,
        relatedMemberName: b.member_name,
        meta: { vacationA: a._id, vacationB: b._id, overlapDays, overlapStart, overlapEnd },
      });
    }
  }
  return conflicts;
}

export function detectBlockVsSchedule(
  blocks: AvailabilityBlock[],
  schedules: ScheduleTemplate[],
  options: DetectorOptions,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const dates = dateRange(options.dateRange.start, options.dateRange.end);

  for (const block of blocks) {
    const schedule = schedules.find(s => s.member_id === block.member_id);
    if (!schedule) continue;

    for (const date of dates) {
      if (!isBlockActiveOnDate(block, date)) continue;
      const weekday = dateToWeekday(date);
      const shift = schedule.weekly[weekday];
      if (!shift?.enabled) continue;

      if (!block.allDay && block.startTime && block.endTime) {
        if (block.endTime <= shift.start || block.startTime >= shift.end) continue;
      }

      conflicts.push({
        id: nextId(),
        type: 'block_vs_schedule',
        severity: 'warning',
        memberId: block.member_id,
        memberName: block.member_name,
        date,
        description: `${block.member_name} tiene bloqueo (${block.reason}) pero tiene turno ${shift.start}-${shift.end}`,
        meta: { blockId: block._id, scheduleId: schedule._id, reason: block.reason },
      });
    }
  }
  return conflicts;
}

export function detectHolidayVsSchedule(
  holidays: CompanyHoliday[],
  schedules: ScheduleTemplate[],
  options: DetectorOptions,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const dates = dateRange(options.dateRange.start, options.dateRange.end);

  for (const date of dates) {
    const holiday = getHolidayForDate(date, holidays);
    if (!holiday) continue;

    for (const schedule of schedules) {
      const weekday = dateToWeekday(date);
      const shift = schedule.weekly[weekday];
      if (!shift?.enabled) continue;

      if (holiday.halfDay) {
        if (holiday.halfDayPeriod === 'morning' && shift.start >= '14:00') continue;
        if (holiday.halfDayPeriod === 'afternoon' && shift.end <= '14:00') continue;
      }

      conflicts.push({
        id: nextId(),
        type: 'holiday_vs_schedule',
        severity: 'info',
        memberId: schedule.member_id,
        memberName: schedule.member_name,
        date,
        description: `${schedule.member_name} tiene turno el ${date} que es festivo (${holiday.name})`,
        meta: { holidayId: holiday._id, holidayName: holiday.name, scheduleId: schedule._id },
      });
    }
  }
  return conflicts;
}

export function detectVacationVsClockin(
  vacations: VacationRequest[],
  clockins: ClockinRecord[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  const approved = vacations.filter(v => v.status === 'approved');

  for (const clockin of clockins) {
    const vacOnDate = approved.find(v =>
      v.member_id === clockin.member_id &&
      clockin.date >= v.startDate &&
      clockin.date <= v.endDate,
    );
    if (!vacOnDate) continue;

    conflicts.push({
      id: nextId(),
      type: 'vacation_vs_clockin',
      severity: 'error',
      memberId: clockin.member_id,
      memberName: clockin.member_name,
      date: clockin.date,
      description: `${clockin.member_name} fichó el ${formatDateEs(clockin.date)} pero tiene vacaciones aprobadas (${formatDateRangeEs(vacOnDate.startDate, vacOnDate.endDate)})`,
      meta: { clockinId: clockin._id, vacationId: vacOnDate._id },
    });
  }
  return conflicts;
}

export function detectBlockVsClockin(
  blocks: AvailabilityBlock[],
  clockins: ClockinRecord[],
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const clockin of clockins) {
    const activeBlock = blocks.find(b =>
      b.member_id === clockin.member_id && isBlockActiveOnDate(b, clockin.date),
    );
    if (!activeBlock) continue;

    conflicts.push({
      id: nextId(),
      type: 'block_vs_clockin',
      severity: 'warning',
      memberId: clockin.member_id,
      memberName: clockin.member_name,
      date: clockin.date,
      description: `${clockin.member_name} fichó el ${formatDateEs(clockin.date)} pero tiene bloqueo activo (${activeBlock.reason})`,
      meta: { clockinId: clockin._id, blockId: activeBlock._id, reason: activeBlock.reason },
    });
  }
  return conflicts;
}

export function detectUndefinedSchedules(
  schedules: ScheduleTemplate[],
  members: DetectorData['members'],
  weekStart: string,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const scheduledMemberIds = new Set(schedules.map(s => s.member_id));

  for (const member of members) {
    if (scheduledMemberIds.has(member.user_id)) continue;
    conflicts.push({
      id: nextId(),
      type: 'schedule_undefined',
      severity: 'warning',
      memberId: member.user_id,
      memberName: member.fullName,
      date: weekStart,
      description: `${member.fullName} no tiene horario definido para la semana del ${weekStart}`,
      meta: {},
    });
  }
  return conflicts;
}

export function detectUncoveredShifts(
  schedules: ScheduleTemplate[],
  vacations: VacationRequest[],
  blocks: AvailabilityBlock[],
  options: DetectorOptions,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const dates = dateRange(options.dateRange.start, options.dateRange.end);
  // Vacaciones/baja aprobadas no generan “turno sin cubrir” (ausencia planificada).
  // Se detectan aparte vía detectVacationVsSchedule si hace falta cobertura.
  void vacations;

  for (const schedule of schedules) {
    for (const date of dates) {
      const weekday = dateToWeekday(date);
      const shift = schedule.weekly[weekday];
      if (!shift?.enabled) continue;

      const blocked = blocks.some(b =>
        b.member_id === schedule.member_id && isBlockActiveOnDate(b, date),
      );

      if (blocked) {
        conflicts.push({
          id: nextId(),
          type: 'shift_uncovered',
          severity: 'error',
          memberId: schedule.member_id,
          memberName: schedule.member_name,
          date,
          description: `Turno ${shift.start}-${shift.end} de ${schedule.member_name} el ${date} sin cubrir (bloqueo)`,
          meta: { scheduleId: schedule._id, reason: 'block' },
        });
      }
    }
  }
  return conflicts;
}

// ─── Main aggregator ─────────────────────────────────────────────────────────

export function detectAllConflicts(
  data: DetectorData,
  options: DetectorOptions,
): Conflict[] {
  conflictCounter = 0;
  const all: Conflict[] = [
    ...detectVacationVsSchedule(data.vacations, data.schedules, options),
    ...detectVacationOverlaps(data.vacations, data.members, options),
    ...detectBlockVsSchedule(data.blocks, data.schedules, options),
    ...detectHolidayVsSchedule(data.holidays, data.schedules, options),
    ...detectVacationVsClockin(data.vacations, data.clockins),
    ...detectBlockVsClockin(data.blocks, data.clockins),
    ...detectUndefinedSchedules(data.schedules, data.members, options.dateRange.start),
    ...detectUncoveredShifts(data.schedules, data.vacations, data.blocks, options),
  ];

  return all.sort((a, b) => {
    const severityOrder: Record<ConflictSeverity, number> = { error: 0, warning: 1, info: 2 };
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return a.date.localeCompare(b.date);
  });
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function max(a: string, b: string): string { return a > b ? a : b; }
function min(a: string, b: string): string { return a < b ? a : b; }

export const CONFLICT_TYPE_LABELS: Record<string, Record<ConflictType, string>> = {
  es: {
    vacation_vs_schedule: 'Vacación vs Turno',
    vacation_vs_vacation: 'Vacaciones solapadas',
    block_vs_schedule: 'Bloqueo vs Turno',
    holiday_vs_schedule: 'Festivo vs Turno',
    vacation_vs_clockin: 'Fichaje en vacaciones',
    block_vs_clockin: 'Fichaje en bloqueo',
    schedule_undefined: 'Sin horario',
    shift_uncovered: 'Turno sin cubrir',
  },
  en: {
    vacation_vs_schedule: 'Vacation vs Shift',
    vacation_vs_vacation: 'Overlapping vacations',
    block_vs_schedule: 'Block vs Shift',
    holiday_vs_schedule: 'Holiday vs Shift',
    vacation_vs_clockin: 'Clock-in on vacation',
    block_vs_clockin: 'Clock-in while blocked',
    schedule_undefined: 'No schedule',
    shift_uncovered: 'Uncovered shift',
  },
  pt: {
    vacation_vs_schedule: 'Férias vs Turno',
    vacation_vs_vacation: 'Férias sobrepostas',
    block_vs_schedule: 'Bloqueio vs Turno',
    holiday_vs_schedule: 'Feriado vs Turno',
    vacation_vs_clockin: 'Registo em férias',
    block_vs_clockin: 'Registo em bloqueio',
    schedule_undefined: 'Sem horário',
    shift_uncovered: 'Turno descoberto',
  },
  fr: {
    vacation_vs_schedule: 'Congé vs Poste',
    vacation_vs_vacation: 'Congés chevauchés',
    block_vs_schedule: 'Blocage vs Poste',
    holiday_vs_schedule: 'Jour férié vs Poste',
    vacation_vs_clockin: 'Pointage en congé',
    block_vs_clockin: 'Pointage en blocage',
    schedule_undefined: 'Sans horaire',
    shift_uncovered: 'Poste non couvert',
  },
};

export const SEVERITY_CONFIG: Record<ConflictSeverity, { label: string; color: string; bg: string }> = {
  error: { label: 'Crítico', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  warning: { label: 'Aviso', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  info: { label: 'Info', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
};
