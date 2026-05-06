import { getApiBase } from './apiBase';
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
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en horarios');
  return data;
}

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' });
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

export function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function emptyShift(): DayShift {
  return { enabled: false, start: '09:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00' };
}

export function defaultWeekly(): Record<Weekday, DayShift> {
  const base: DayShift = { enabled: true, start: '09:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00' };
  return {
    monday: { ...base },
    tuesday: { ...base },
    wednesday: { ...base },
    thursday: { ...base },
    friday: { ...base },
    saturday: { ...emptyShift() },
    sunday: { ...emptyShift() },
  };
}

export function computeWeeklyHours(weekly: Record<Weekday, DayShift>): number {
  let total = 0;
  for (const day of WEEKDAYS) {
    const s = weekly[day];
    if (!s.enabled) continue;
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    const [bsh, bsm] = s.breakStart.split(':').map(Number);
    const [beh, bem] = s.breakEnd.split(':').map(Number);
    const work = (eh * 60 + em) - (sh * 60 + sm);
    const brk = (beh * 60 + bem) - (bsh * 60 + bsm);
    total += Math.max(0, work - Math.max(0, brk));
  }
  return Math.round((total / 60) * 100) / 100;
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

export async function getSchedule(businessId: string, memberId: string, weekStart?: string): Promise<ScheduleTemplate | null> {
  const all = await listSchedules(businessId, weekStart);
  return all.find(s => s.member_id === memberId) || null;
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
        warnings.push({ day, date: dateStr, reason: 'vacation', detail: `${vac.member_name} está de vacaciones (${vac.startDate} → ${vac.endDate})` });
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
