import { getApiBase } from './apiBase';
import {
  DEFAULT_BUSINESS_HOURS_CONFIG,
  hasValidBusinessHoursConfig,
  normalizeBusinessHoursConfig,
  normalizeScheduleTimeValue,
  scheduleTimeToMinutes,
} from './businessHoursUtils';
import { ensureCouchDb } from './ensureCouchDb';
import { formatDateRangeEs } from './formatDateEs';
import type { BusinessHoursConfig } from './settingsApi';

const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const DB = (env.VITE_COUCHDB_DB || 'vertial') + '-schedules';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    credentials: 'include',
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    details?: { reason?: string; error?: string };
  };
  if (!res.ok) {
    const reason = data?.details?.reason || data?.details?.error || data?.error;
    throw new Error(reason || 'Error en horarios');
  }
  return data;
}

async function ensureDb() {
  await ensureCouchDb(DB, () => req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' }));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = typeof WEEKDAYS[number];

export interface DayShift {
  enabled: boolean;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
}

export interface ScheduleTemplate {
  _id: string;
  _rev?: string;
  type: 'schedule';
  business_id: string;
  member_id: string;
  member_name: string;
  week_start: string;
  work_center_id?: string;
  work_center_name?: string;
  weekly: Record<Weekday, DayShift>;
  weeklyHours: number;
  template_id?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftTemplate {
  _id: string;
  _rev?: string;
  type: 'shift_template';
  business_id: string;
  name: string;
  color: string;
  weekly: Record<Weekday, DayShift>;
  weeklyHours: number;
  createdAt: string;
  updatedAt: string;
}

export type RuleCriteria = 'role' | 'department' | 'position';

export interface AssignmentRule {
  _id: string;
  _rev?: string;
  type: 'assignment_rule';
  business_id: string;
  name: string;
  criteria: RuleCriteria;
  criteria_value: string;
  template_id: string;
  template_name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** YYYY-MM-DD en calendario local (evita que toISOString() mueva el día en ES). */
export function toLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getMonday(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalIsoDate(d);
}

export function emptyShift(): DayShift {
  const breakTimes = defaultTenMinuteBreak('09:00', '17:00');
  return { enabled: false, start: '09:00', end: '17:00', ...breakTimes };
}

/** Pausa laboral por defecto: 10 minutos. */
export const DEFAULT_BREAK_MINUTES = 10;

function minutesToHhMm(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Suma minutos a una hora HH:mm (ciclo 24 h). */
export function addScheduleMinutes(value: string, deltaMinutes: number, fallback = '13:00'): string {
  const base = scheduleTimeToMinutes(value);
  if (base < 0) return fallback;
  return minutesToHhMm(base + deltaMinutes);
}

/**
 * Fin de pausa = inicio + 10 min (predeterminado del producto).
 */
export function breakEndFromStart(breakStart: string, fallbackStart = '13:00'): string {
  const start = normalizeScheduleTimeValue(breakStart, fallbackStart) || fallbackStart;
  return addScheduleMinutes(start, DEFAULT_BREAK_MINUTES, start);
}

/**
 * Pausa de 10 min cerca del centro del turno (o 13:00–13:10 si el turno es corto).
 */
export function defaultTenMinuteBreak(
  start = '09:00',
  end = '17:00',
): Pick<DayShift, 'breakStart' | 'breakEnd'> {
  const startMin = scheduleTimeToMinutes(start);
  let endMin = scheduleTimeToMinutes(end);
  if (startMin < 0 || endMin < 0) {
    return { breakStart: '13:00', breakEnd: '13:10' };
  }
  if (endMin <= startMin) endMin += 24 * 60;
  const workLen = endMin - startMin;
  if (workLen <= DEFAULT_BREAK_MINUTES + 10) {
    // Turno muy corto: pausa justo después de entrar (+10 min), 10 min de duración.
    const breakStart = minutesToHhMm(startMin + Math.min(10, Math.max(0, workLen - DEFAULT_BREAK_MINUTES)));
    return { breakStart, breakEnd: breakEndFromStart(breakStart) };
  }
  const mid = startMin + Math.floor(workLen / 2);
  const breakStart = minutesToHhMm(mid);
  return { breakStart, breakEnd: breakEndFromStart(breakStart) };
}

const LABOR_WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

/** Primer día marcado (o lunes) para sembrar la franja rápida. */
export function firstEnabledShift(
  weekly: Record<Weekday, DayShift>,
): DayShift {
  for (const day of WEEKDAYS) {
    if (weekly[day]?.enabled) return { ...weekly[day] };
  }
  return { ...weekly.monday };
}

/** Copia entrada/salida/pausa a todos los días ya marcados como laborables. */
export function applyShiftTimesToEnabledDays(
  weekly: Record<Weekday, DayShift>,
  times: Pick<DayShift, 'start' | 'end' | 'breakStart' | 'breakEnd'>,
): Record<Weekday, DayShift> {
  const next = { ...weekly };
  for (const day of WEEKDAYS) {
    if (!next[day]?.enabled) continue;
    next[day] = {
      ...next[day],
      start: times.start,
      end: times.end,
      breakStart: times.breakStart,
      breakEnd: times.breakEnd,
    };
  }
  return next;
}

/** Activa Lun–Vie con la misma franja; sábado/domingo no se tocan. */
export function applyShiftTimesToLaborDays(
  weekly: Record<Weekday, DayShift>,
  times: Pick<DayShift, 'start' | 'end' | 'breakStart' | 'breakEnd'>,
): Record<Weekday, DayShift> {
  const next = { ...weekly };
  for (const day of LABOR_WEEKDAYS) {
    next[day] = {
      ...next[day],
      enabled: true,
      start: times.start,
      end: times.end,
      breakStart: times.breakStart,
      breakEnd: times.breakEnd,
    };
  }
  return next;
}

/**
 * Convierte el horario de tienda (openingHours) en la plantilla semanal
 * de turnos de trabajador. Es la base predeterminada de horarios RRHH.
 */
export function weeklyFromOpeningHours(
  hours?: BusinessHoursConfig | null,
): Record<Weekday, DayShift> {
  const cfg = normalizeBusinessHoursConfig(
    hours && hasValidBusinessHoursConfig(hours) ? hours : DEFAULT_BUSINESS_HOURS_CONFIG,
  );
  const lunchEnabled = Boolean(cfg.lunchBreak?.enabled);
  // Sin pausa de tienda: misma hora inicio/fin → 0 min (no restar 1 h “fantasma”).
  const breakStart = lunchEnabled
    ? normalizeScheduleTimeValue(cfg.lunchBreak.from, '13:00')
    : '00:00';
  const breakEnd = lunchEnabled
    ? normalizeScheduleTimeValue(cfg.lunchBreak.to, '14:00')
    : '00:00';

  const weekly = {} as Record<Weekday, DayShift>;
  for (const day of WEEKDAYS) {
    const d = cfg.schedule[day];
    const start = normalizeScheduleTimeValue(d.from, '09:00');
    const end = normalizeScheduleTimeValue(d.to, '19:00');
    weekly[day] = {
      enabled: Boolean(d.open),
      start,
      end,
      breakStart,
      breakEnd,
    };
  }
  return weekly;
}

/** Solape en minutos entre [a0,a1) y [b0,b1) (línea temporal en minutos). */
function overlapMinutes(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Minutos trabajados en un día (resta pausa solo si cae dentro del turno).
 * Si salida < entrada → turno nocturno (+24 h).
 */
export function computeDayWorkMinutes(shift: Pick<DayShift, 'enabled' | 'start' | 'end' | 'breakStart' | 'breakEnd'>): number {
  if (!shift?.enabled) return 0;
  const start = scheduleTimeToMinutes(shift.start);
  const end = scheduleTimeToMinutes(shift.end);
  if (start < 0 || end < 0) return 0;
  if (end === start) return 0;

  const workEnd = end < start ? end + 24 * 60 : end;
  const work = workEnd - start;

  const bStart = scheduleTimeToMinutes(shift.breakStart);
  const bEnd = scheduleTimeToMinutes(shift.breakEnd);
  if (bStart < 0 || bEnd < 0 || bEnd === bStart) return work;

  const breakEnd = bEnd < bStart ? bEnd + 24 * 60 : bEnd;
  const brk = Math.max(
    overlapMinutes(start, workEnd, bStart, breakEnd),
    overlapMinutes(start, workEnd, bStart + 1440, breakEnd + 1440),
    overlapMinutes(start, workEnd, bStart - 1440, breakEnd - 1440),
  );
  return Math.max(0, work - brk);
}

/** Horas de un día (1 decimal). */
export function computeDayHours(shift: DayShift): number {
  return Math.round((computeDayWorkMinutes(shift) / 60) * 100) / 100;
}

/** Horario base de trabajador: prioriza horario de tienda si es válido. */
export function defaultWeekly(openingHours?: BusinessHoursConfig | null): Record<Weekday, DayShift> {
  return weeklyFromOpeningHours(openingHours);
}

export function computeWeeklyHours(weekly: Record<Weekday, DayShift>): number {
  let totalMin = 0;
  for (const day of WEEKDAYS) {
    const s = weekly[day];
    if (!s) continue;
    totalMin += computeDayWorkMinutes(s);
  }
  return Math.round((totalMin / 60) * 100) / 100;
}

export const WEEKDAY_LABELS: Record<string, Record<Weekday, string>> = {
  es: { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' },
  en: { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' },
  pt: { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' },
  fr: { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' },
};

export const TEMPLATE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

// ─── Schedule CRUD ───────────────────────────────────────────────────────────

export async function listSchedules(businessId: string, weekStart?: string): Promise<ScheduleTemplate[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  return ((payload.docs || []) as ScheduleTemplate[])
    .filter(d => {
      if (d?.type !== 'schedule' || d?.business_id !== businessId || (d as any).deletedAt) return false;
      if (weekStart && d.week_start && d.week_start !== weekStart) return false;
      return true;
    })
    .sort((a, b) => a.member_name.localeCompare(b.member_name));
}

/**
 * Horario del miembro: prioriza la semana pedida (o la actual),
 * si no hay, el más reciente (p. ej. asignado en la invitación).
 */
export async function getSchedule(businessId: string, memberId: string, weekStart?: string): Promise<ScheduleTemplate | null> {
  const all = await listSchedules(businessId);
  const mine = all.filter((s) => s.member_id === memberId);
  if (!mine.length) return null;
  const target = weekStart || getMonday();
  return (
    mine.find((s) => s.week_start === target)
    || mine.slice().sort((a, b) => String(b.week_start || '').localeCompare(String(a.week_start || '')))[0]
    || null
  );
}

/** Horas semanales del horario asignado (semana actual o la más reciente). */
export async function getMemberScheduleWeeklyHours(
  businessId: string,
  memberId: string,
): Promise<number | null> {
  const s = await getSchedule(businessId, memberId);
  if (!s) return null;
  const h = Number(s.weeklyHours) > 0 ? Number(s.weeklyHours) : computeWeeklyHours(s.weekly);
  return h > 0 ? h : null;
}

/** Inferir jornada a partir de horas semanales del horario (misma regla que backend). */
export function inferWorkdayFromWeeklyHours(hours: number): string {
  const h = Number(hours) || 0;
  if (h <= 0) return '';
  if (h >= 35) return 'completa';
  if (h >= 18) return 'media';
  return 'parcial';
}

export async function saveSchedule(
  businessId: string,
  memberId: string,
  memberName: string,
  weekly: Record<Weekday, DayShift>,
  existing?: ScheduleTemplate | null,
  templateId?: string,
  weekStart?: string,
  workCenterId?: string,
  workCenterName?: string,
): Promise<ScheduleTemplate> {
  await ensureDb();
  const now = new Date().toISOString();
  const ws = weekStart || existing?.week_start || getMonday();
  const id = existing?._id || `schedule:${businessId}:${memberId}:${ws}`;
  const doc: ScheduleTemplate = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'schedule',
    business_id: businessId,
    member_id: memberId,
    member_name: memberName,
    week_start: ws,
    ...(workCenterId ? { work_center_id: workCenterId, work_center_name: workCenterName || '' } : {}),
    weekly,
    weeklyHours: computeWeeklyHours(weekly),
    ...(templateId ? { template_id: templateId } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

export async function deleteSchedule(schedule: ScheduleTemplate): Promise<void> {
  if (!schedule._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(schedule._id)}?rev=${schedule._rev}`,
    { method: 'DELETE' },
  );
}

// ─── Shift Template CRUD ─────────────────────────────────────────────────────

export async function listShiftTemplates(businessId: string): Promise<ShiftTemplate[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  return ((payload.docs || []) as ShiftTemplate[])
    .filter(d => d?.type === 'shift_template' && d?.business_id === businessId && !((d as any).deletedAt))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveShiftTemplate(
  businessId: string,
  name: string,
  color: string,
  weekly: Record<Weekday, DayShift>,
  existing?: ShiftTemplate | null,
): Promise<ShiftTemplate> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = existing?._id || `shift_template:${businessId}:${Date.now()}`;
  const doc: ShiftTemplate = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'shift_template',
    business_id: businessId,
    name,
    color,
    weekly,
    weeklyHours: computeWeeklyHours(weekly),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

/**
 * Resiembra plantillas RRHH desde el horario de tienda.
 * No toca turnos personales ya guardados en schedules.
 */
export async function applyOpeningHoursToShiftTemplates(
  businessId: string,
  openingHours: BusinessHoursConfig | null | undefined,
  opts?: { storeLabel?: string },
): Promise<{ updated: number; created: number }> {
  const bid = String(businessId || '').trim();
  if (!bid) return { updated: 0, created: 0 };
  const weekly = defaultWeekly(openingHours);
  const templates = await listShiftTemplates(bid);
  if (templates.length === 0) {
    const label = String(opts?.storeLabel || 'tienda').trim() || 'tienda';
    await saveShiftTemplate(
      bid,
      `Horario ${label}`,
      TEMPLATE_COLORS[0] || '#2563eb',
      weekly,
      null,
    );
    return { updated: 0, created: 1 };
  }
  for (const t of templates) {
    await saveShiftTemplate(bid, t.name, t.color, weekly, t);
  }
  return { updated: templates.length, created: 0 };
}

export async function deleteShiftTemplate(template: ShiftTemplate): Promise<void> {
  if (!template._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(template._id)}?rev=${template._rev}`,
    { method: 'DELETE' },
  );
}

// ─── Assignment Rule CRUD ────────────────────────────────────────────────────

export async function listAssignmentRules(businessId: string): Promise<AssignmentRule[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  return ((payload.docs || []) as AssignmentRule[])
    .filter(d => d?.type === 'assignment_rule' && d?.business_id === businessId && !((d as any).deletedAt))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveAssignmentRule(
  businessId: string,
  data: { name: string; criteria: RuleCriteria; criteria_value: string; template_id: string; template_name: string; active: boolean },
  existing?: AssignmentRule | null,
): Promise<AssignmentRule> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = existing?._id || `assignment_rule:${businessId}:${Date.now()}`;
  const doc: AssignmentRule = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'assignment_rule',
    business_id: businessId,
    ...data,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

export async function deleteAssignmentRule(rule: AssignmentRule): Promise<void> {
  if (!rule._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(rule._id)}?rev=${rule._rev}`,
    { method: 'DELETE' },
  );
}

// ─── Schedule warnings (conflict detection on save) ─────────────────────────

export interface ScheduleWarning {
  day: Weekday;
  date: string;
  reason: 'vacation' | 'block' | 'holiday';
  detail: string;
}

export async function checkScheduleConflicts(
  businessId: string,
  memberId: string,
  weekly: Record<Weekday, DayShift>,
  weekStart: string,
): Promise<ScheduleWarning[]> {
  const warnings: ScheduleWarning[] = [];
  try {
    const [{ listVacations }, { listBlocks, isBlockActiveOnDate }, { listCompanyHolidays, getHolidayForDate }] = await Promise.all([
      import('./vacationsApi'),
      import('./availabilityBlocksApi'),
      import('./companyHolidaysApi'),
    ]);

    const [vacations, blocks, holidays] = await Promise.all([
      listVacations(businessId, { memberId, status: 'approved' as any }),
      listBlocks(businessId, { memberId }),
      listCompanyHolidays(businessId),
    ]);

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const day = WEEKDAYS[i];
      if (!weekly[day]?.enabled) continue;

      const vac = vacations.find(v => dateStr >= v.startDate && dateStr <= v.endDate);
      if (vac) {
        warnings.push({ day, date: dateStr, reason: 'vacation', detail: `${vac.member_name} está de vacaciones (${formatDateRangeEs(vac.startDate, vac.endDate)})` });
        continue;
      }

      const block = blocks.find(b => isBlockActiveOnDate(b, dateStr));
      if (block) {
        warnings.push({ day, date: dateStr, reason: 'block', detail: `Bloqueo activo: ${block.reason}` });
        continue;
      }

      const holiday = getHolidayForDate(dateStr, holidays);
      if (holiday) {
        warnings.push({ day, date: dateStr, reason: 'holiday', detail: `Festivo: ${holiday.name}` });
      }
    }
  } catch { /* best-effort */ }
  return warnings;
}

// ─── Bulk Operations ─────────────────────────────────────────────────────────

export interface TeamMember {
  user_id: string;
  fullName: string;
  role?: string;
  employment?: {
    department?: string;
    position?: string;
  };
}

export interface BulkAssignResult {
  applied: ScheduleTemplate[];
  skipped: { memberId: string; memberName: string; reason: string }[];
  warnings: { memberId: string; memberName: string; warnings: ScheduleWarning[] }[];
}

export async function applyTemplateToMembers(
  businessId: string,
  template: ShiftTemplate,
  members: TeamMember[],
  existingSchedules: ScheduleTemplate[],
  weekStart?: string,
  workCenterId?: string,
  workCenterName?: string,
  skipConflicts?: boolean,
): Promise<BulkAssignResult> {
  const ws = weekStart || getMonday();
  const result: BulkAssignResult = { applied: [], skipped: [], warnings: [] };

  for (const member of members) {
    if (skipConflicts) {
      const conflicts = await checkScheduleConflicts(businessId, member.user_id, template.weekly, ws);
      const vacOrBlock = conflicts.filter(w => w.reason === 'vacation' || w.reason === 'block');
      if (vacOrBlock.length > 0) {
        result.skipped.push({
          memberId: member.user_id,
          memberName: member.fullName,
          reason: vacOrBlock[0].detail,
        });
        continue;
      }
      if (conflicts.length > 0) {
        result.warnings.push({ memberId: member.user_id, memberName: member.fullName, warnings: conflicts });
      }
    }

    const existing = existingSchedules.find(s => s.member_id === member.user_id);
    const saved = await saveSchedule(
      businessId,
      member.user_id,
      member.fullName,
      template.weekly,
      existing,
      template._id,
      ws,
      workCenterId,
      workCenterName,
    );
    result.applied.push(saved);
  }
  return result;
}

export async function autoAssignByRules(
  businessId: string,
  rules: AssignmentRule[],
  templates: ShiftTemplate[],
  members: TeamMember[],
  existingSchedules: ScheduleTemplate[],
  weekStart?: string,
): Promise<{ applied: number; skipped: number; warnings: ScheduleWarning[] }> {
  let applied = 0;
  let skipped = 0;
  const allWarnings: ScheduleWarning[] = [];
  const activeRules = rules.filter(r => r.active);
  const ws = weekStart || getMonday();

  for (const member of members) {
    const matchingRule = activeRules.find(rule => {
      if (rule.criteria === 'role') return member.role === rule.criteria_value;
      if (rule.criteria === 'department') return member.employment?.department === rule.criteria_value;
      if (rule.criteria === 'position') return member.employment?.position === rule.criteria_value;
      return false;
    });
    if (!matchingRule) { skipped++; continue; }

    const template = templates.find(t => t._id === matchingRule.template_id);
    if (!template) { skipped++; continue; }

    const conflicts = await checkScheduleConflicts(businessId, member.user_id, template.weekly, ws);
    const blockers = conflicts.filter(w => w.reason === 'vacation' || w.reason === 'block');
    if (blockers.length > 0) { skipped++; continue; }
    allWarnings.push(...conflicts);

    const existing = existingSchedules.find(s => s.member_id === member.user_id);
    await saveSchedule(businessId, member.user_id, member.fullName, template.weekly, existing, template._id, ws);
    applied++;
  }

  return { applied, skipped, warnings: allWarnings };
}

// ─── Schedule for a specific date (used by worker calendar) ──────────────────

export function getScheduleForDate(
  schedule: ScheduleTemplate,
  date: Date,
): DayShift | null {
  const dayIndex = (date.getDay() + 6) % 7;
  const day = WEEKDAYS[dayIndex];
  const shift = schedule.weekly[day];
  return shift?.enabled ? shift : null;
}

export function getWeekSchedule(
  schedule: ScheduleTemplate,
  weekStartDate: Date,
): { date: Date; day: Weekday; shift: DayShift }[] {
  const result: { date: Date; day: Weekday; shift: DayShift }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + i);
    const day = WEEKDAYS[i];
    result.push({ date, day, shift: schedule.weekly[day] });
  }
  return result;
}
