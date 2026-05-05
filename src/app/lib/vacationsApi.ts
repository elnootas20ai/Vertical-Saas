const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
}

function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

const DB = (env.VITE_COUCHDB_DB || 'vertial') + '-vacations';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en vacaciones');
  return data;
}

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeaveType = 'vacation' | 'personal' | 'sick' | 'other';
export type VacationStatus = 'pending' | 'approved' | 'rejected';

export interface VacationRequest {
  _id: string;
  _rev?: string;
  type: 'vacation_request';
  business_id: string;
  member_id: string;
  member_name: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  leaveType: LeaveType;
  status: VacationStatus;
  notes: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface VacationSettings {
  _id: string;
  _rev?: string;
  type: 'vacation_settings';
  business_id: string;
  defaultDaysPerYear: number;
  allowances: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function countBusinessDays(start: string, end: string): number {
  let count = 0;
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export const LEAVE_TYPE_LABELS: Record<string, Record<LeaveType, string>> = {
  es: { vacation: 'Vacaciones', personal: 'Asuntos propios', sick: 'Enfermedad', other: 'Otro' },
  en: { vacation: 'Vacation', personal: 'Personal', sick: 'Sick leave', other: 'Other' },
  pt: { vacation: 'Férias', personal: 'Pessoal', sick: 'Doença', other: 'Outro' },
  fr: { vacation: 'Congés', personal: 'Personnel', sick: 'Maladie', other: 'Autre' },
};

export const STATUS_LABELS: Record<string, Record<VacationStatus, string>> = {
  es: { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' },
  en: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' },
  pt: { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada' },
  fr: { pending: 'En attente', approved: 'Approuvée', rejected: 'Rejetée' },
};

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listVacations(businessId: string, filters?: { memberId?: string; status?: VacationStatus; year?: number }): Promise<VacationRequest[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  let records = ((payload.docs || []) as VacationRequest[]).filter(
    d => d?.type === 'vacation_request' && d?.business_id === businessId && !((d as any).deletedAt),
  );
  if (filters?.memberId) records = records.filter(r => r.member_id === filters.memberId);
  if (filters?.status) records = records.filter(r => r.status === filters.status);
  if (filters?.year) records = records.filter(r => new Date(r.startDate).getFullYear() === filters.year);
  return records.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function createVacationRequest(
  businessId: string,
  memberId: string,
  memberName: string,
  data: { startDate: string; endDate: string; leaveType: LeaveType; notes: string },
): Promise<VacationRequest> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = `vacation:${businessId}:${Date.now()}`;
  const doc: VacationRequest = {
    _id: id,
    type: 'vacation_request',
    business_id: businessId,
    member_id: memberId,
    member_name: memberName,
    startDate: data.startDate,
    endDate: data.endDate,
    totalDays: countBusinessDays(data.startDate, data.endDate),
    leaveType: data.leaveType,
    status: 'pending',
    notes: data.notes,
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: '',
    createdAt: now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

export async function reviewVacation(
  record: VacationRequest,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  reviewerName: string,
  reviewNote?: string,
): Promise<VacationRequest & { autoDisabledShifts?: string[] }> {
  const now = new Date().toISOString();
  const updated: VacationRequest = {
    ...record,
    status: decision,
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedAt: now,
    reviewNote: reviewNote || '',
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  const saved = { ...updated, _rev: result.rev };

  let autoDisabledShifts: string[] | undefined;
  if (decision === 'approved') {
    try {
      autoDisabledShifts = await disableShiftsDuringVacation(record.business_id, record.member_id, record.startDate, record.endDate);
    } catch { /* best-effort */ }
  }
  return { ...saved, autoDisabledShifts };
}

async function disableShiftsDuringVacation(
  businessId: string,
  memberId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const { listSchedules, saveSchedule, WEEKDAYS } = await import('./schedulesApi');
  const schedules = await listSchedules(businessId);
  const memberSchedules = schedules.filter(s => s.member_id === memberId);
  const disabled: string[] = [];

  for (const schedule of memberSchedules) {
    let changed = false;
    const weeklyClone = { ...schedule.weekly };
    const cur = new Date(startDate);
    const end = new Date(endDate);

    while (cur <= end) {
      const dayIdx = (cur.getDay() + 6) % 7;
      const weekday = WEEKDAYS[dayIdx] as keyof typeof weeklyClone;
      if (weeklyClone[weekday]?.enabled) {
        weeklyClone[weekday] = { ...weeklyClone[weekday], enabled: false };
        disabled.push(`${cur.toISOString().slice(0, 10)} (${weekday})`);
        changed = true;
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (changed) {
      await saveSchedule(
        businessId,
        memberId,
        schedule.member_name,
        weeklyClone,
        schedule,
        schedule.template_id,
        schedule.week_start,
        schedule.work_center_id,
        schedule.work_center_name,
      );
    }
  }
  return disabled;
}

export async function deleteVacation(record: VacationRequest): Promise<void> {
  if (!record._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}?rev=${record._rev}`,
    { method: 'DELETE' },
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSettings(businessId: string): Promise<VacationSettings> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  const docs = (payload.docs || []) as VacationSettings[];
  const existing = docs.find(d => d?.type === 'vacation_settings' && d?.business_id === businessId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const id = `vacation-settings:${businessId}`;
  const doc: VacationSettings = {
    _id: id,
    type: 'vacation_settings',
    business_id: businessId,
    defaultDaysPerYear: 22,
    allowances: {},
    createdAt: now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

export async function saveSettings(settings: VacationSettings): Promise<VacationSettings> {
  const updated = { ...settings, updatedAt: new Date().toISOString() };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(settings._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

export function getDaysUsed(requests: VacationRequest[], memberId: string, year: number): number {
  return requests
    .filter(r => r.member_id === memberId && r.status === 'approved' && new Date(r.startDate).getFullYear() === year)
    .reduce((sum, r) => sum + r.totalDays, 0);
}

export function getDaysAllowed(settings: VacationSettings, memberId: string): number {
  return settings.allowances[memberId] ?? settings.defaultDaysPerYear;
}
