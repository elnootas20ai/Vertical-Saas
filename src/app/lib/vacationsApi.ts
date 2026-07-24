import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';
import {
  computeAccruedVacationDays,
  computeVacationBalance,
  resolveAccrualMode,
  resolveDaysPerMonth,
  type VacationAccrualMode,
  type VacationBalance,
} from './vacationAccrual';
import { createNotificationRequest } from './notificationApi';

export {
  computeAccruedVacationDays,
  computeVacationBalance,
  resolveAccrualMode,
  resolveDaysPerMonth,
  type VacationAccrualMode,
  type VacationBalance,
} from './vacationAccrual';

const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
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
  await ensureCouchDb(DB, () => req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' }));
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
  /** Override manual por trabajador (cupo fijo anual). */
  allowances: Record<string, number>;
  /** annual_fixed = cupo entero al año; monthly = se van sumando días cada mes. */
  accrualMode?: VacationAccrualMode;
  /** Días que se suman por mes completo (p. ej. 2.5 naturales ≈ 30/12, o 1.83 ≈ 22/12). */
  daysPerMonth?: number;
  /**
   * Cómo contar días de una solicitud.
   * - business: lun–vie (aprox. 22 días/año)
   * - natural: todos los días del periodo (mín. legal ES = 30/año → ~2,5/mes)
   */
  dayBasis?: 'business' | 'natural';
  /** Máximo de días naturales seguidos en una solicitud (7 ≈ 1 semana, 14 ≈ 2). 0 = sin límite. */
  maxConsecutiveDays?: number;
  /** Si true, no se pueden pedir vacaciones que caigan en fin de semana. */
  onlyWeekdays?: boolean;
  /** Días mínimos de antelación respecto a hoy. */
  minNoticeDays?: number;
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

/** Días naturales inclusive (España art. 38 ET → 30/año ≈ 2,5/mes). */
export function countNaturalDays(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export function countVacationRequestDays(
  start: string,
  end: string,
  settings?: Pick<VacationSettings, 'dayBasis'> | null,
): number {
  // Por defecto naturales (orientación legal ES); dayBasis 'business' = lun–vie.
  return settings?.dayBasis === 'business'
    ? countBusinessDays(start, end)
    : countNaturalDays(start, end);
}

export function validateVacationRequestPolicy(
  start: string,
  end: string,
  settings: VacationSettings | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!start || !end) return { ok: false, error: 'Indica fecha de inicio y fin.' };
  if (end < start) return { ok: false, error: 'La fecha de fin no puede ser anterior al inicio.' };

  const natural = countNaturalDays(start, end);
  if (natural <= 0) return { ok: false, error: 'El periodo no es válido.' };

  const maxConsec = Number(settings?.maxConsecutiveDays || 0);
  if (maxConsec > 0 && natural > maxConsec) {
    return {
      ok: false,
      error: `La empresa permite como máximo ${maxConsec} días seguidos (≈ ${Math.round(maxConsec / 7)} semana(s)).`,
    };
  }

  const minNotice = Number(settings?.minNoticeDays || 0);
  if (minNotice > 0) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const startDate = new Date(`${start}T12:00:00`);
    const diff = Math.floor((startDate.getTime() - today.getTime()) / 86_400_000);
    if (diff < minNotice) {
      return { ok: false, error: `Debes pedirlas con al menos ${minNotice} días de antelación.` };
    }
  }

  if (settings?.onlyWeekdays) {
    const cur = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    while (cur <= endDate) {
      const dow = cur.getDay();
      if (dow === 0 || dow === 6) {
        return { ok: false, error: 'La empresa solo permite vacaciones en días laborables (lun–vie).' };
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  return { ok: true };
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
  settings?: VacationSettings | null,
): Promise<VacationRequest> {
  const policy = validateVacationRequestPolicy(data.startDate, data.endDate, settings || null);
  if (!policy.ok) throw new Error(policy.error);

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
    totalDays: countVacationRequestDays(data.startDate, data.endDate, settings),
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
    try {
      await createNotificationRequest(record.member_id, {
        level: 'info',
        category: 'team',
        title: 'Vacaciones aprobadas',
        message: `Tu solicitud del ${record.startDate} al ${record.endDate} ha sido aprobada.`,
        entityId: record._id,
        entityType: 'vacation',
        route: '/saas/vacations',
        metadata: { startDate: record.startDate, endDate: record.endDate, leaveType: record.leaveType },
      });
    } catch { /* best-effort */ }
  } else if (decision === 'rejected') {
    try {
      await createNotificationRequest(record.member_id, {
        level: 'warning',
        category: 'team',
        title: 'Vacaciones rechazadas',
        message: `Tu solicitud del ${record.startDate} al ${record.endDate} ha sido rechazada.`,
        entityId: record._id,
        entityType: 'vacation',
        route: '/saas/vacations',
      });
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
    // Orientación legal ES (art. 38 ET): 30 naturales/año ≈ 2,5/mes; muchas empresas usan 22 laborables.
    defaultDaysPerYear: 30,
    allowances: {},
    accrualMode: 'monthly',
    daysPerMonth: 2.5,
    dayBasis: 'natural',
    maxConsecutiveDays: 14,
    onlyWeekdays: false,
    minNoticeDays: 7,
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
    .filter(r => r.member_id === memberId && r.status === 'approved' && r.leaveType === 'vacation' && new Date(r.startDate).getFullYear() === year)
    .reduce((sum, r) => sum + r.totalDays, 0);
}

export function getDaysPending(requests: VacationRequest[], memberId: string, year: number): number {
  return requests
    .filter(r => r.member_id === memberId && r.status === 'pending' && r.leaveType === 'vacation' && new Date(r.startDate).getFullYear() === year)
    .reduce((sum, r) => sum + r.totalDays, 0);
}

/**
 * Días disponibles este año.
 * Con modo monthly: según meses de alta (pasa startDate del contrato).
 * Con override en allowances: cupo fijo.
 */
export function getDaysAllowed(
  settings: VacationSettings,
  memberId: string,
  options?: { startDate?: string; endDate?: string; year?: number; asOf?: Date | string },
): number {
  return computeAccruedVacationDays(settings, memberId, {
    startDate: options?.startDate,
    endDate: options?.endDate,
    year: options?.year ?? new Date().getFullYear(),
    asOf: options?.asOf,
  });
}

export function getMemberVacationBalance(
  settings: VacationSettings,
  requests: VacationRequest[],
  memberId: string,
  options?: { startDate?: string; endDate?: string; year?: number; asOf?: Date | string },
): VacationBalance {
  const year = options?.year ?? new Date().getFullYear();
  return computeVacationBalance(
    settings,
    memberId,
    getDaysUsed(requests, memberId, year),
    getDaysPending(requests, memberId, year),
    { ...options, year },
  );
}
