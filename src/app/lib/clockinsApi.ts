import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';
const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const DB = (env.VITE_COUCHDB_DB || 'vertial') + '-clockins';
const REQ_TIMEOUT_MS = 20_000;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      headers: { ...getHeaders(), ...(init?.headers || {}) },
      ...init,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data?.error || 'Error en fichajes');
    return data;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('La operación de fichaje tardó demasiado. Comprueba la conexión e inténtalo de nuevo.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureDb() {
  await ensureCouchDb(DB, () => req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' }));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface ClockEntry {
  type: 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
  time: string;
  geo?: GeoLocation;
}

export type ClockinDeviceType = 'mobile' | 'tablet' | 'desktop' | 'kiosk';

export interface ClockinRecord {
  _id: string;
  _rev?: string;
  type: 'clockin';
  business_id: string;
  member_id: string;
  member_name: string;
  date: string;
  entries: ClockEntry[];
  totalMinutes: number;
  breakMinutes: number;
  status: 'active' | 'break' | 'completed' | 'offline';
  notes: string;
  scheduled_start?: string;
  scheduled_end?: string;
  device_type?: ClockinDeviceType;
  geo?: GeoLocation;
  /** PDV / tienda donde se fichó (delivery TPV). */
  sales_point_id?: string;
  sales_point_name?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseScheduleMs(dateStr: string, timeHHMM: string): number {
  const [h, m] = timeHHMM.split(':').map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
}

function computeMinutes(
  entries: ClockEntry[],
  scheduledStart?: string,
  scheduledEnd?: string,
  dateStr?: string,
): { totalMinutes: number; breakMinutes: number } {
  let totalMinutes = 0;
  let breakMinutes = 0;
  const clockIn = entries.find(e => e.type === 'clock_in');
  const clockOut = entries.find(e => e.type === 'clock_out');
  if (clockIn) {
    let startMs = new Date(clockIn.time).getTime();
    let endMs = clockOut ? new Date(clockOut.time).getTime() : Date.now();

    if (dateStr && scheduledStart) {
      const schedStartMs = parseScheduleMs(dateStr, scheduledStart);
      if (startMs < schedStartMs) startMs = schedStartMs;
    }
    if (dateStr && scheduledEnd) {
      const schedEndMs = parseScheduleMs(dateStr, scheduledEnd);
      if (endMs > schedEndMs) endMs = schedEndMs;
    }

    totalMinutes = Math.round(Math.max(0, endMs - startMs) / 60000);

    const breakPairs: { start?: string; end?: string }[] = [];
    for (const e of entries) {
      if (e.type === 'break_start') breakPairs.push({ start: e.time });
      if (e.type === 'break_end' && breakPairs.length > 0) {
        const last = breakPairs[breakPairs.length - 1];
        if (!last.end) last.end = e.time;
      }
    }
    for (const pair of breakPairs) {
      if (pair.start) {
        let bStart = new Date(pair.start).getTime();
        let bEnd = pair.end ? new Date(pair.end).getTime() : Date.now();
        bStart = Math.max(bStart, startMs);
        bEnd = Math.min(bEnd, endMs);
        if (bEnd > bStart) {
          breakMinutes += Math.round((bEnd - bStart) / 60000);
        }
      }
    }
  }
  return { totalMinutes: Math.max(0, totalMinutes - breakMinutes), breakMinutes };
}

function deriveStatus(entries: ClockEntry[]): ClockinRecord['status'] {
  const types = entries.map(e => e.type);
  if (types.includes('clock_out')) return 'completed';
  const breakStarts = types.filter(t => t === 'break_start').length;
  const breakEnds = types.filter(t => t === 'break_end').length;
  if (breakStarts > breakEnds) return 'break';
  return 'active';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listClockins(
  businessId: string,
  filters?: { date?: string; memberId?: string; salesPointId?: string },
): Promise<ClockinRecord[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.date) params.set('date', filters.date);
    if (filters?.memberId) params.set('memberId', filters.memberId);
    if (filters?.salesPointId) params.set('salesPointId', filters.salesPointId);
    params.set('recordsOnly', '1');
    const qs = params.toString() ? `?${params}` : '';
    const data = await req<{ clockins: ClockinRecord[] }>(
      `/api/clockins/${encodeURIComponent(businessId)}${qs}`,
    );
    return (data.clockins || []).filter((d) => d?.type === 'clockin' && !((d as { deletedAt?: string }).deletedAt));
  } catch {
    await ensureDb();
    const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
    let records = ((payload.docs || []) as ClockinRecord[]).filter(
      d => d?.type === 'clockin' && d?.business_id === businessId && !((d as any).deletedAt),
    );
    if (filters?.date) records = records.filter(r => r.date === filters.date);
    if (filters?.memberId) records = records.filter(r => r.member_id === filters.memberId);
    if (filters?.salesPointId) {
      const sp = filters.salesPointId;
      records = records.filter((r) => {
        const rid = String(r.sales_point_id || '').trim();
        if (!rid) return true;
        return rid === sp || rid === `wc:${sp}`;
      });
    }
    return records.sort((a, b) => b.date.localeCompare(a.date) || a.member_name.localeCompare(b.member_name));
  }
}

export async function getTodayClockin(businessId: string, memberId: string): Promise<ClockinRecord | null> {
  const records = await listClockins(businessId, { date: todayStr(), memberId });
  return records[0] || null;
}

export interface ClockInOptions {
  geo?: GeoLocation;
  device_type?: ClockinDeviceType;
  sales_point_id?: string;
  sales_point_name?: string;
}

export async function clockIn(
  businessId: string,
  memberId: string,
  memberName: string,
  options?: ClockInOptions,
): Promise<ClockinRecord> {
  const data = await req<{ clockin: ClockinRecord }>(
    `/api/clockins/${encodeURIComponent(businessId)}/check-in`,
    {
      method: 'POST',
      body: JSON.stringify({
        memberId,
        memberName,
        sales_point_id: options?.sales_point_id,
        sales_point_name: options?.sales_point_name,
        device_type: options?.device_type,
        geo: options?.geo,
      }),
    },
  );
  return data.clockin;
}

export async function addEntry(record: ClockinRecord, entryType: ClockEntry['type'], geo?: GeoLocation): Promise<ClockinRecord> {
  const data = await req<{ clockin: ClockinRecord }>(
    `/api/clockins/${encodeURIComponent(record.business_id)}/record/${encodeURIComponent(record._id)}/entry`,
    {
      method: 'PUT',
      body: JSON.stringify({ entryType, geo }),
    },
  );
  return data.clockin;
}

export async function clockOut(record: ClockinRecord, geo?: GeoLocation): Promise<ClockinRecord> {
  if (record.status === 'break') {
    const afterBreak = await addEntry(record, 'break_end', geo);
    return addEntry(afterBreak, 'clock_out', geo);
  }
  return addEntry(record, 'clock_out', geo);
}

export async function startBreak(record: ClockinRecord, geo?: GeoLocation): Promise<ClockinRecord> {
  return addEntry(record, 'break_start', geo);
}

export async function endBreak(record: ClockinRecord, geo?: GeoLocation): Promise<ClockinRecord> {
  return addEntry(record, 'break_end', geo);
}

export async function updateNotes(record: ClockinRecord, notes: string): Promise<ClockinRecord> {
  const updated = { ...record, notes, updatedAt: new Date().toISOString() };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

/**
 * Reasigna la fecha de un fichaje (campo `date`). Necesario para "Fichar en
 * nombre de…" cuando la jornada es de un día anterior: el `clockIn` original
 * siempre crea el doc con `date = hoy`, y el endpoint /adjust del backend solo
 * mueve las horas de los entries, no el campo `date`. Si no actualizamos el
 * `date`, el fichaje no aparece en la tabla del día correcto y descuadra
 * estadísticas/absentismo.
 */
export async function updateClockinDate(record: ClockinRecord, newDate: string): Promise<ClockinRecord> {
  if (record.date === newDate) return record;
  const updated: ClockinRecord = { ...record, date: newDate, updatedAt: new Date().toISOString() };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

export async function deleteClockin(record: ClockinRecord): Promise<void> {
  if (!record._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}?rev=${record._rev}`,
    { method: 'DELETE' },
  );
}

export async function adjustClockinEntry(
  record: ClockinRecord,
  entryIndex: number,
  newTime: string,
): Promise<ClockinRecord> {
  const entries = [...record.entries];
  if (entryIndex < 0 || entryIndex >= entries.length) throw new Error('Índice de entrada inválido');
  entries[entryIndex] = { ...entries[entryIndex], time: newTime };
  const { totalMinutes, breakMinutes } = computeMinutes(entries, record.scheduled_start, record.scheduled_end, record.date);
  const updated: ClockinRecord = {
    ...record,
    entries,
    totalMinutes,
    breakMinutes,
    status: deriveStatus(entries),
    updatedAt: new Date().toISOString(),
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

/**
 * Returns the display time for a clock entry based on schedule rules:
 * - clock_in: if actual < scheduled_start → scheduled_start; otherwise actual
 * - clock_out: if actual > scheduled_end → scheduled_end; otherwise actual
 */
export function getDisplayTime(
  entry: ClockEntry,
  record: ClockinRecord,
): string {
  const actualDate = new Date(entry.time);
  const dateStr = record.date;

  if (entry.type === 'clock_in' && record.scheduled_start) {
    const [h, m] = record.scheduled_start.split(':').map(Number);
    const scheduled = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    if (actualDate < scheduled) return scheduled.toISOString();
  }

  if (entry.type === 'clock_out' && record.scheduled_end) {
    const [h, m] = record.scheduled_end.split(':').map(Number);
    const scheduled = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    if (actualDate > scheduled) return scheduled.toISOString();
  }

  return entry.time;
}

/**
 * Computes the difference in minutes between actual and scheduled time.
 * Positive = late/stayed longer, Negative = early.
 */
export function getTimeDiffMinutes(
  entry: ClockEntry,
  record: ClockinRecord,
): number | null {
  if (entry.type === 'clock_in' && record.scheduled_start) {
    const [h, m] = record.scheduled_start.split(':').map(Number);
    const scheduled = new Date(`${record.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    return Math.round((new Date(entry.time).getTime() - scheduled.getTime()) / 60000);
  }
  if (entry.type === 'clock_out' && record.scheduled_end) {
    const [h, m] = record.scheduled_end.split(':').map(Number);
    const scheduled = new Date(`${record.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    return Math.round((new Date(entry.time).getTime() - scheduled.getTime()) / 60000);
  }
  return null;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

// ─── Backend API (role-aware endpoints) ──────────────────────────────────────

export interface EnrichedClockinRecord extends ClockinRecord {
  member_role: string;
  member_email: string;
  roster_placeholder?: boolean;
}

export interface ClockinStatsSummary {
  totalMinutes: number;
  totalBreakMinutes: number;
  totalSessions: number;
  completedSessions: number;
  uniqueMembers: number;
  avgMinutesPerSession: number;
}

export interface MemberStats {
  member_id: string;
  member_name: string;
  role: string;
  totalMinutes: number;
  breakMinutes: number;
  sessions: number;
  avgMinutes: number;
}

export interface DateStats {
  date: string;
  totalMinutes: number;
  sessions: number;
}

export interface WeekStats {
  week: string;
  totalMinutes: number;
  sessions: number;
}

export interface MonthStats {
  month: string;
  totalMinutes: number;
  sessions: number;
}

export interface RoleStats {
  role: string;
  totalMinutes: number;
  sessions: number;
  memberCount: number;
}

export interface ClockinStats {
  summary: ClockinStatsSummary;
  byMember: MemberStats[];
  byDate: DateStats[];
  byWeek: WeekStats[];
  byMonth: MonthStats[];
  byRole: RoleStats[];
}

export interface ActiveMember {
  member_id: string;
  member_name: string;
  member_role: string;
  status: 'active' | 'break';
  clock_in: string | null;
  totalMinutes: number;
}

export interface MemberPerformance {
  member_id: string;
  member_name: string;
  role: string;
  hoursWorked: number;
  sessions: number;
  salesCount: number;
  salesAmount: number;
  salesPerHour: number;
  revenuePerHour: number;
}

export interface OrgClockNode {
  id: string;
  user_id: string;
  label: string;
  role: string;
  clock: {
    status: string;
    clock_in: string | null;
    clock_out: string | null;
    totalMinutes: number;
  };
}

export interface OrgClockEdge {
  id: string;
  source: string;
  target: string;
}

export async function fetchClockins(
  businessId: string,
  filters?: { date?: string; memberId?: string; recordsOnly?: boolean; salesPointId?: string },
): Promise<EnrichedClockinRecord[]> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.memberId) params.set('memberId', filters.memberId);
  if (filters?.recordsOnly) params.set('recordsOnly', '1');
  if (filters?.salesPointId) params.set('salesPointId', filters.salesPointId);
  const qs = params.toString() ? `?${params}` : '';
  const data = await req<{ clockins: EnrichedClockinRecord[] }>(
    `/api/clockins/${encodeURIComponent(businessId)}${qs}`,
  );
  return data.clockins || [];
}

export async function fetchActiveNow(businessId: string): Promise<ActiveMember[]> {
  const data = await req<{ active: ActiveMember[] }>(
    `/api/clockins/${encodeURIComponent(businessId)}/active`,
  );
  return data.active || [];
}

export async function fetchClockinStats(
  businessId: string,
  filters?: { from?: string; to?: string },
): Promise<ClockinStats> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString() ? `?${params}` : '';
  const data = await req<{ stats: ClockinStats }>(
    `/api/clockins/${encodeURIComponent(businessId)}/stats${qs}`,
  );
  return data.stats;
}

export async function fetchPerformance(
  businessId: string,
  filters?: { from?: string; to?: string },
): Promise<MemberPerformance[]> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString() ? `?${params}` : '';
  const data = await req<{ performance: MemberPerformance[] }>(
    `/api/clockins/${encodeURIComponent(businessId)}/performance${qs}`,
  );
  return data.performance || [];
}

export async function fetchOrgClockStatus(
  businessId: string,
): Promise<{ nodes: OrgClockNode[]; edges: OrgClockEdge[] }> {
  const data = await req<{ nodes: OrgClockNode[]; edges: OrgClockEdge[] }>(
    `/api/clockins/${encodeURIComponent(businessId)}/org-status`,
  );
  return { nodes: data.nodes || [], edges: data.edges || [] };
}

export async function adjustClockinViaApi(
  businessId: string,
  clockinId: string,
  entryIndex: number,
  newTime: string,
): Promise<ClockinRecord> {
  const data = await req<{ clockin: ClockinRecord }>(
    `/api/clockins/${encodeURIComponent(businessId)}/adjust`,
    {
      method: 'PUT',
      body: JSON.stringify({ clockinId, entryIndex, newTime }),
    },
  );
  return data.clockin;
}

// ─── Absenteeism ─────────────────────────────────────────────────────────────

export interface AbsenteeismDay {
  date: string;
  expected: { member_id: string; member_name: string; scheduled_start: string; scheduled_end: string }[];
  present: { member_id: string; member_name: string; clock_in: string | null; clock_out: string | null }[];
  absent: { member_id: string; member_name: string; scheduled_start: string; scheduled_end: string }[];
  rate: number;
}

export interface AbsenteeismSummary {
  totalDays: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  overallRate: number;
}

export async function fetchAbsenteeism(
  businessId: string,
  filters?: { from?: string; to?: string },
): Promise<{ report: AbsenteeismDay[]; summary: AbsenteeismSummary }> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString() ? `?${params}` : '';
  return req(`/api/clockins/${encodeURIComponent(businessId)}/absenteeism${qs}`);
}

// ─── Overtime ────────────────────────────────────────────────────────────────

export interface OvertimeMember {
  member_id: string;
  member_name: string;
  role: string;
  period: { from: string; to: string };
  scheduled_minutes: number;
  worked_minutes: number;
  overtime_minutes: number;
  daily_breakdown: { date: string; scheduled: number; worked: number; overtime: number }[];
}

export interface OvertimeSummary {
  totalOvertime: number;
  totalWorked: number;
  totalScheduled: number;
  membersWithOvertime: number;
}

export async function fetchOvertime(
  businessId: string,
  filters?: { from?: string; to?: string; memberId?: string },
): Promise<{ report: OvertimeMember[]; summary: OvertimeSummary }> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.memberId) params.set('memberId', filters.memberId);
  const qs = params.toString() ? `?${params}` : '';
  return req(`/api/clockins/${encodeURIComponent(businessId)}/overtime${qs}`);
}

// ─── Payroll summary ─────────────────────────────────────────────────────────

export interface PayrollClockinSummary {
  member_id: string;
  member_name: string;
  role: string;
  period: string;
  total_worked_minutes: number;
  total_break_minutes: number;
  total_overtime_minutes: number;
  total_sessions: number;
  days_worked: number;
  days_absent: number;
  late_count: number;
  total_late_minutes: number;
  daily_detail: {
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    worked_minutes: number;
    break_minutes: number;
    overtime_minutes: number;
    is_late: boolean;
    late_minutes: number;
  }[];
}

export async function fetchPayrollSummary(
  businessId: string,
  period: string,
): Promise<PayrollClockinSummary[]> {
  const data = await req<{ summaries: PayrollClockinSummary[] }>(
    `/api/clockins/${encodeURIComponent(businessId)}/payroll-summary?period=${period}`,
  );
  return data.summaries || [];
}

// ─── Export ──────────────────────────────────────────────────────────────────

// ─── Notificar al equipo de gestión un evento de fichaje ─────────────────────

export type ClockinEventType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

/**
 * Avisa al backend de que se acaba de producir un fichaje (entrada, salida,
 * inicio o fin de descanso). El backend resuelve a quién notificar
 * (Admin/Gerente del business + owner, excluyendo al propio trabajador) y emite
 * notificación in-app + SSE en tiempo real + Web Push si procede.
 *
 * Idempotente desde el punto de vista del cliente: si falla se ignora porque la
 * UI ya refleja el cambio de estado del fichaje en local.
 */
export async function notifyClockinEvent(
  businessId: string,
  data: {
    memberId: string;
    memberName: string;
    eventType: ClockinEventType;
    time?: string;
    device?: ClockinDeviceType;
    lateMinutes?: number;
    workedMinutes?: number;
    breakMinutes?: number;
    hasGeo?: boolean;
  },
): Promise<{ ok: boolean; recipients: number }> {
  return req(`/api/clockins/${encodeURIComponent(businessId)}/notify`, {
    method: 'POST',
    body: JSON.stringify({
      memberId: data.memberId,
      memberName: data.memberName,
      eventType: data.eventType,
      time: data.time || new Date().toISOString(),
      device: data.device || '',
      lateMinutes: data.lateMinutes ?? 0,
      workedMinutes: data.workedMinutes ?? 0,
      breakMinutes: data.breakMinutes ?? 0,
      hasGeo: Boolean(data.hasGeo),
    }),
  });
}

// ─── Resumen diario para dashboards de gerente ────────────────────────────────

export interface DailySummary {
  ok: boolean;
  date: string;
  scheduled: number;
  clocked: number;
  noShow: number;
  noShowMembers: Array<{ memberId: string; memberName: string; role: string }>;
  onTime: number;
  late: number;
  earlyEntry: number;
  completed: number;
  totalWorkedMinutes: number;
  avgLateMinutes: number;
  lateMembers: Array<{ memberId: string; memberName: string; lateMinutes: number }>;
}

export async function fetchDailySummary(
  businessId: string,
  date?: string,
): Promise<DailySummary> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return req<DailySummary>(`/api/clockins/${encodeURIComponent(businessId)}/daily-summary${qs}`);
}

export async function exportClockinsCsv(
  businessId: string,
  filters?: { from?: string; to?: string; memberId?: string },
): Promise<void> {
  const params = new URLSearchParams({ format: 'csv' });
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.memberId) params.set('memberId', filters.memberId);
  const url = `${getApiBase()}/api/clockins/${encodeURIComponent(businessId)}/export?${params}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Error al exportar');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fichajes_${filters?.from || 'all'}_${filters?.to || 'all'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
