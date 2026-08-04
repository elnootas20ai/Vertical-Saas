import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';
import {
  computeAccruedVacationDays,
  computeVacationBalance,
  resolveAccrualMode,
  resolveDaysPerMonth,
  resolveFteFactor,
  resolveWeeklyContractHours,
  type VacationAccrualMode,
  type VacationBalance,
  type VacationContractInput,
} from './vacationAccrual';
import { createNotificationRequest } from './notificationApi';
import { formatDateEs, formatDateRangeEs } from './formatDateEs';
import {
  getHrRequestType,
  LEAVE_TYPE_LABELS_ES,
  type HrRequestUrgency,
  type LeaveType,
} from './hrRequestCatalog';
import {
  findOverlappingLeaveRequests,
  findTeamLeaveOverlaps,
  isBalanceConsumingStatus,
  leaveTypeLabelEs,
  mergeLeaveTypePolicies,
  resolveLeaveTypePolicy,
  type LeaveTypePolicyOverride,
} from './hrLeavePolicy';

export type { LeaveType, HrRequestUrgency } from './hrRequestCatalog';
export type { LeaveTypePolicyOverride } from './hrLeavePolicy';
export {
  HR_REQUEST_TYPES,
  WORK_BLOCKING_LEAVE_TYPES,
  getHrRequestType,
  listHrRequestTypesForWorker,
  LEAVE_TYPE_LABELS_ES,
  LEAVE_TYPE_SHORT_ES,
  LEAVE_TYPE_CHIP_CLASS,
} from './hrRequestCatalog';
export {
  datesOverlap,
  findOverlappingLeaveRequests,
  mergeLeaveTypePolicies,
  resolveLeaveTypePolicy,
  ES_DEFAULT_MAX_DAYS,
} from './hrLeavePolicy';

export {
  computeAccruedVacationDays,
  computeVacationBalance,
  resolveAccrualMode,
  resolveDaysPerMonth,
  resolveFteFactor,
  resolveWeeklyContractHours,
  DEFAULT_FULL_TIME_WEEKLY_HOURS,
  type VacationAccrualMode,
  type VacationBalance,
  type VacationContractInput,
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

export type VacationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

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
  /** Urgente: accidente, baja, etc. Destaca en bandeja RRHH. */
  urgency?: HrRequestUrgency;
  /** Solape con otra solicitud activa: RRHH debe valorar. */
  needsHrReview?: boolean;
  conflictWithIds?: string[];
  conflictSummary?: string;
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
  /** annual_fixed = fracción del cupo anual por meses completos; monthly = +días/mes completos. */
  accrualMode?: VacationAccrualMode;
  /** Días que se suman por mes a jornada completa (p. ej. 2.5 naturales ≈ 30/12). */
  daysPerMonth?: number;
  /** Horas/semana = 100 % del cupo (por defecto 40). */
  fullTimeWeeklyHours?: number;
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
  /**
   * Meses mínimos de alta en la empresa antes de poder pedir vacaciones.
   * 0 = sin mínimo. Valores típicos: 2, 3 o 4.
   */
  minTenureMonthsForVacation?: number;
  /**
   * false (predeterminado): solo se pueden pedir días ya generados.
   * true: permite pedir por encima del saldo (RRHH decide al aprobar).
   */
  allowRequestUnaccrued?: boolean;
  /** Cupos / flags por tipo (base ES + overrides empresa). */
  leaveTypePolicies?: Partial<Record<LeaveType, LeaveTypePolicyOverride>>;
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

export function normalizeVacationSettings(settings: VacationSettings): VacationSettings {
  const leaveTypePolicies = mergeLeaveTypePolicies(settings.leaveTypePolicies);
  return {
    ...settings,
    defaultDaysPerYear: Number(settings.defaultDaysPerYear) > 0 ? Number(settings.defaultDaysPerYear) : 30,
    accrualMode: settings.accrualMode === 'annual_fixed' ? 'annual_fixed' : 'monthly',
    daysPerMonth: Number(settings.daysPerMonth) > 0 ? Number(settings.daysPerMonth) : 2.5,
    fullTimeWeeklyHours:
      Number(settings.fullTimeWeeklyHours) > 0 ? Number(settings.fullTimeWeeklyHours) : 40,
    dayBasis: settings.dayBasis === 'business' ? 'business' : 'natural',
    maxConsecutiveDays: Number(settings.maxConsecutiveDays ?? 14),
    onlyWeekdays: Boolean(settings.onlyWeekdays),
    minNoticeDays: Number(settings.minNoticeDays ?? 7),
    minTenureMonthsForVacation: Math.max(
      0,
      Math.min(24, Math.floor(Number(settings.minTenureMonthsForVacation ?? 2))),
    ),
    allowRequestUnaccrued: settings.allowRequestUnaccrued === true,
    leaveTypePolicies,
    allowances: settings.allowances && typeof settings.allowances === 'object' ? settings.allowances : {},
  };
}

/** Fecha (YYYY-MM-DD) a partir de la cual ya se cumplen `months` de alta (calendario local). */
export function vacationEligibleFromDate(
  employmentStartDate: string | null | undefined,
  months: number,
): string | null {
  const start = String(employmentStartDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || months <= 0) return null;
  const d = new Date(`${start}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function validateVacationRequestPolicy(
  start: string,
  end: string,
  settings: VacationSettings | null | undefined,
  leaveType?: LeaveType | string | null,
  options?: { employmentStartDate?: string | null },
): { ok: true } | { ok: false; error: string } {
  if (!start || !end) return { ok: false, error: 'Indica fecha de inicio y fin.' };
  if (end < start) return { ok: false, error: 'La fecha de fin no puede ser anterior al inicio.' };

  const natural = countNaturalDays(start, end);
  if (natural <= 0) return { ok: false, error: 'El periodo no es válido.' };

  const normalized = settings ? normalizeVacationSettings(settings) : null;
  const typeDef = resolveLeaveTypePolicy(leaveType, normalized?.leaveTypePolicies);
  if (!typeDef.enabled) {
    return { ok: false, error: `El tipo «${typeDef.label}» no está habilitado en esta empresa.` };
  }

  const isVacation = typeDef.id === 'vacation';
  const countedDays = countVacationRequestDays(start, end, normalized);

  if (typeDef.maxDays > 0 && natural > typeDef.maxDays) {
    return {
      ok: false,
      error: `«${typeDef.label}» permite como máximo ${typeDef.maxDays} día(s) (política empresa / base legal).`,
    };
  }

  const maxConsec = Number(normalized?.maxConsecutiveDays || 0);
  if (isVacation && maxConsec > 0 && natural > maxConsec) {
    return {
      ok: false,
      error: `La empresa permite como máximo ${maxConsec} días seguidos (≈ ${Math.round(maxConsec / 7)} semana(s)).`,
    };
  }

  const typeNotice = normalized?.leaveTypePolicies?.[typeDef.id]?.minNoticeDays;
  const minNotice =
    typeNotice != null && Number.isFinite(Number(typeNotice))
      ? Number(typeNotice)
      : Number(normalized?.minNoticeDays || 0);
  if (!typeDef.allowSameDay && minNotice > 0) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const startDate = new Date(`${start}T12:00:00`);
    const diff = Math.floor((startDate.getTime() - today.getTime()) / 86_400_000);
    if (diff < minNotice) {
      return { ok: false, error: `Debes pedirla con al menos ${minNotice} días de antelación.` };
    }
  }

  if (isVacation && normalized?.onlyWeekdays) {
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

  const minTenure = Number(normalized?.minTenureMonthsForVacation || 0);
  if (isVacation && minTenure > 0) {
    const empStart = String(options?.employmentStartDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(empStart)) {
      return {
        ok: false,
        error: 'No se pueden pedir vacaciones: falta la fecha de alta en tu ficha de equipo.',
      };
    }
    const eligibleFrom = vacationEligibleFromDate(empStart, minTenure);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);
    if (eligibleFrom && todayIso < eligibleFrom) {
      return {
        ok: false,
        error: `Las vacaciones se pueden pedir tras ${minTenure} mes(es) de alta (a partir del ${formatDateEs(eligibleFrom)}).`,
      };
    }
  }

  void countedDays;
  return { ok: true };
}

/**
 * Saldo estricto: solo cuentan días YA APROBADOS por RRHH.
 * Pendientes / canceladas / rechazadas no descuentan ni bloquean el cupo.
 */
export function validateVacationBalanceForRequest(
  settings: VacationSettings | null | undefined,
  requests: VacationRequest[],
  memberId: string,
  start: string,
  end: string,
  leaveType: LeaveType | string | null | undefined,
  options?: VacationBalanceOptions,
): { ok: true } | { ok: false; error: string } {
  const normalized = settings ? normalizeVacationSettings(settings) : null;
  const typeDef = resolveLeaveTypePolicy(leaveType, normalized?.leaveTypePolicies);
  if (!typeDef.consumesVacationBalance) return { ok: true };
  if (normalized?.allowRequestUnaccrued) return { ok: true };
  if (!normalized) return { ok: true };

  const year = options?.year ?? new Date(start).getFullYear();
  // Solo aprobadas entran en el saldo; canceladas/pendientes se ignoran.
  const approvedOnly = (requests || []).filter((r) => isBalanceConsumingStatus(r.status));
  const balance = getMemberVacationBalance(normalized, approvedOnly, memberId, {
    ...options,
    year,
  });
  const days = countVacationRequestDays(start, end, normalized);
  // Solo días enteros pedibles (no 1 día con 0,3 generados al darte de alta).
  const requestable = Number(balance.requestable ?? Math.floor(Number(balance.remaining || 0)));
  if (days > requestable + 0.05) {
    const generating = Number(balance.remaining || 0);
    const genHint =
      generating > 0 && generating < 1
        ? ` Llevas ${generating.toFixed(1)} d generados; hace falta 1 d completo.`
        : '';
    return {
      ok: false,
      error: `Solo puedes pedir días ya generados. Puedes pedir ahora: ${requestable} d; esta solicitud: ${days} d.${genHint}`,
    };
  }
  return { ok: true };
}

const LEAVE_LABELS_FALLBACK: Record<LeaveType, string> = { ...LEAVE_TYPE_LABELS_ES };

export const LEAVE_TYPE_LABELS: Record<string, Record<LeaveType, string>> = {
  es: LEAVE_LABELS_FALLBACK,
  en: {
    ...LEAVE_LABELS_FALLBACK,
    vacation: 'Vacation',
    personal: 'Personal day',
    sick: 'Sick leave',
    accident: 'Work accident',
    unpaid: 'Unpaid leave',
    maternity: 'Maternity',
    paternity: 'Paternity',
    bereavement: 'Bereavement',
    marriage: 'Marriage leave',
    training: 'Training',
    other: 'Other',
  },
  pt: LEAVE_LABELS_FALLBACK,
  fr: LEAVE_LABELS_FALLBACK,
};

export const STATUS_LABELS: Record<string, Record<VacationStatus, string>> = {
  es: { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' },
  en: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' },
  pt: { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelada' },
  fr: { pending: 'En attente', approved: 'Approuvée', rejected: 'Rejetée', cancelled: 'Annulée' },
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
  data: {
    startDate: string;
    endDate: string;
    leaveType: LeaveType;
    notes: string;
    urgency?: HrRequestUrgency;
  },
  settings?: VacationSettings | null,
  options?: {
    notifyOwnerUserId?: string | null;
    existingRequests?: VacationRequest[];
    employmentStartDate?: string;
    employmentEndDate?: string;
    hoursPerWeek?: number | null;
    workday?: string | null;
    scheduleWeeklyHours?: number | null;
  },
): Promise<VacationRequest> {
  const normalized = settings ? normalizeVacationSettings(settings) : null;
  const typeDef = resolveLeaveTypePolicy(data.leaveType, normalized?.leaveTypePolicies);
  const notes = String(data.notes || '').trim();
  if (typeDef.notesRequired && notes.length < 3) {
    throw new Error('Indica el motivo de la solicitud (mín. 3 caracteres).');
  }

  const policy = validateVacationRequestPolicy(
    data.startDate,
    data.endDate,
    normalized,
    data.leaveType,
    { employmentStartDate: options?.employmentStartDate },
  );
  if (!policy.ok) throw new Error(policy.error);

  let existing = options?.existingRequests;
  if (!existing) {
    existing = await listVacations(businessId, { memberId }).catch(() => [] as VacationRequest[]);
  }

  const balanceCheck = validateVacationBalanceForRequest(
    normalized,
    existing,
    memberId,
    data.startDate,
    data.endDate,
    data.leaveType,
    {
      startDate: options?.employmentStartDate,
      endDate: options?.employmentEndDate,
      year: new Date(data.startDate).getFullYear(),
      hoursPerWeek: options?.hoursPerWeek,
      workday: options?.workday,
      scheduleWeeklyHours: options?.scheduleWeeklyHours,
    },
  );
  if (!balanceCheck.ok) throw new Error(balanceCheck.error);

  const overlaps = findOverlappingLeaveRequests(
    existing,
    memberId,
    data.startDate,
    data.endDate,
  );

  // Cobertura de equipo (quién más falta) — listado completo del negocio.
  let teamPool = existing;
  try {
    const allBiz = await listVacations(businessId);
    if (allBiz.length) teamPool = allBiz;
  } catch {
    /* usar existing */
  }
  const teamOverlaps = findTeamLeaveOverlaps(
    teamPool,
    memberId,
    data.startDate,
    data.endDate,
  );

  const selfConflict = overlaps.length > 0;
  const teamConflict = teamOverlaps.length > 0;
  const needsHrReview = selfConflict || teamConflict;
  const conflictWithIds = [
    ...overlaps.map((o) => String(o._id || '')).filter(Boolean),
    ...teamOverlaps.map((o) => String(o._id || '')).filter(Boolean),
  ];
  const summaryParts: string[] = [];
  if (selfConflict) {
    summaryParts.push(
      `Solape propio: ${overlaps
        .map((o) => `${leaveTypeLabelEs(o.leaveType)} (${formatDateRangeEs(o.startDate, o.endDate)})`)
        .join('; ')}`,
    );
  }
  if (teamConflict) {
    summaryParts.push(
      `También fuera: ${teamOverlaps
        .slice(0, 5)
        .map((o) => {
          const name = String(o.member_name || 'Compañero').trim();
          const st = o.status === 'approved' ? 'aprobada' : 'pendiente';
          return `${name} · ${leaveTypeLabelEs(o.leaveType)} (${formatDateRangeEs(o.startDate, o.endDate)}, ${st})`;
        })
        .join('; ')}${teamOverlaps.length > 5 ? ` (+${teamOverlaps.length - 5})` : ''}`,
    );
  } else {
    summaryParts.push('Nadie más del equipo tiene ausencia activa en esas fechas');
  }
  const conflictSummary = summaryParts.filter(Boolean).join(' · ') || undefined;

  await ensureDb();
  const now = new Date().toISOString();
  const id = `vacation:${businessId}:${Date.now()}`;
  const urgency: HrRequestUrgency = data.urgency
    ? data.urgency
    : typeDef.defaultUrgent || needsHrReview
      ? 'urgent'
      : 'normal';
  const doc: VacationRequest = {
    _id: id,
    type: 'vacation_request',
    business_id: businessId,
    member_id: memberId,
    member_name: memberName,
    startDate: data.startDate,
    endDate: data.endDate,
    totalDays: countVacationRequestDays(data.startDate, data.endDate, normalized),
    leaveType: typeDef.id,
    status: 'pending',
    notes,
    urgency,
    needsHrReview: needsHrReview || undefined,
    conflictWithIds: needsHrReview ? conflictWithIds : undefined,
    conflictSummary,
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
  const saved = { ...doc, _rev: result.rev };

  const ownerId = String(options?.notifyOwnerUserId || '').trim();
  if (ownerId && ownerId !== memberId) {
    const label = LEAVE_TYPE_LABELS_ES[typeDef.id] || typeDef.label;
    try {
      await createNotificationRequest(ownerId, {
        level: needsHrReview || urgency === 'urgent' ? 'warning' : 'info',
        category: 'team',
        title: teamConflict
          ? `Solicitud con equipo fuera: ${label}`
          : needsHrReview
            ? `Conflicto de solicitudes: ${label}`
            : urgency === 'urgent'
              ? `Solicitud urgente: ${label}`
              : `Nueva solicitud: ${label}`,
        message: [
          `${memberName} pide ${label} del ${formatDateEs(data.startDate)} al ${formatDateEs(data.endDate)}.`,
          conflictSummary || '',
        ]
          .filter(Boolean)
          .join(' '),
        entityId: saved._id,
        entityType: 'vacation',
        route: '/saas/equipo/solicitudes',
        metadata: {
          startDate: data.startDate,
          endDate: data.endDate,
          leaveType: typeDef.id,
          urgency,
          memberId,
          needsHrReview,
          conflictWithIds,
          teamAwayCount: teamOverlaps.length,
        },
      });
    } catch {
      /* best-effort */
    }
  }

  return saved;
}

/** El trabajador cancela una solicitud aún pendiente (libera fechas y no descuenta días). */
export async function cancelVacationRequest(
  record: VacationRequest,
  memberId: string,
): Promise<VacationRequest> {
  if (record.status !== 'pending') {
    throw new Error('Solo puedes cancelar solicitudes pendientes.');
  }
  const mid = String(memberId || '').trim();
  const owner = String(record.member_id || '').trim();
  if (!mid || owner !== mid) {
    throw new Error('No puedes cancelar la solicitud de otra persona.');
  }
  const now = new Date().toISOString();
  const updated: VacationRequest = {
    ...record,
    status: 'cancelled',
    updatedAt: now,
    // Al cancelar queda libre: sin solape ni reserva de saldo.
    needsHrReview: false,
    conflictWithIds: [],
    conflictSummary: '',
    reviewNote: record.reviewNote || 'Cancelada por el trabajador',
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

export async function reviewVacation(
  record: VacationRequest,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  reviewerName: string,
  reviewNote?: string,
): Promise<VacationRequest & { autoDisabledShifts?: string[] }> {
  if (decision === 'approved') {
    const all = await listVacations(record.business_id, { memberId: record.member_id }).catch(
      () => [] as VacationRequest[],
    );
    const approvedOverlap = findOverlappingLeaveRequests(
      all.filter((r) => r.status === 'approved'),
      record.member_id,
      record.startDate,
      record.endDate,
      { excludeId: record._id },
    );
    if (approvedOverlap.length > 0) {
      const detail = approvedOverlap
        .map((o) => `${leaveTypeLabelEs(o.leaveType)} (${formatDateRangeEs(o.startDate, o.endDate)})`)
        .join('; ');
      throw new Error(
        `No se puede aprobar: solapa con otra solicitud ya aprobada (${detail}). Rechaza o cancela una antes.`,
      );
    }
  }

  const now = new Date().toISOString();
  const updated: VacationRequest = {
    ...record,
    status: decision,
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedAt: now,
    reviewNote: reviewNote || '',
    updatedAt: now,
    // Al resolver, limpia bandera de conflicto
    needsHrReview: decision === 'approved' || decision === 'rejected' ? false : record.needsHrReview,
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
      const label = LEAVE_TYPE_LABELS_ES[record.leaveType] || 'Solicitud';
      await createNotificationRequest(record.member_id, {
        level: 'info',
        category: 'team',
        title: `${label} aprobada`,
        message: `Tu solicitud (${label}) del ${formatDateEs(record.startDate)} al ${formatDateEs(record.endDate)} ha sido aprobada.`,
        entityId: record._id,
        entityType: 'vacation',
        route: '/saas/worker/calendar',
        metadata: { startDate: record.startDate, endDate: record.endDate, leaveType: record.leaveType },
      });
    } catch { /* best-effort */ }
  } else if (decision === 'rejected') {
    try {
      const label = LEAVE_TYPE_LABELS_ES[record.leaveType] || 'Solicitud';
      await createNotificationRequest(record.member_id, {
        level: 'warning',
        category: 'team',
        title: `${label} rechazada`,
        message: `Tu solicitud (${label}) del ${formatDateEs(record.startDate)} al ${formatDateEs(record.endDate)} ha sido rechazada.`,
        entityId: record._id,
        entityType: 'vacation',
        route: '/saas/worker/requests',
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
  const memberSchedules = schedules.filter((s) => s.member_id === memberId);
  const disabled: string[] = [];

  const leaveStart = String(startDate || '').slice(0, 10);
  const leaveEnd = String(endDate || '').slice(0, 10);
  if (!leaveStart || !leaveEnd || leaveEnd < leaveStart) return disabled;

  for (const schedule of memberSchedules) {
    const weekStart = String(schedule.week_start || '').slice(0, 10);
    if (!weekStart) continue;

    // Solo tocar el doc de esa semana (antes se apagaba el patrón en TODAS las semanas).
    const weekEndDate = new Date(`${weekStart}T12:00:00`);
    if (Number.isNaN(weekEndDate.getTime())) continue;
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const y = weekEndDate.getFullYear();
    const m = String(weekEndDate.getMonth() + 1).padStart(2, '0');
    const d = String(weekEndDate.getDate()).padStart(2, '0');
    const weekEnd = `${y}-${m}-${d}`;

    if (leaveStart > weekEnd || leaveEnd < weekStart) continue;

    const rangeFrom = leaveStart > weekStart ? leaveStart : weekStart;
    const rangeTo = leaveEnd < weekEnd ? leaveEnd : weekEnd;
    let changed = false;
    const weeklyClone = { ...schedule.weekly };
    const cur = new Date(`${rangeFrom}T12:00:00`);
    const end = new Date(`${rangeTo}T12:00:00`);

    while (cur <= end) {
      const dayIdx = (cur.getDay() + 6) % 7;
      const weekday = WEEKDAYS[dayIdx] as keyof typeof weeklyClone;
      const dayIso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (weeklyClone[weekday]?.enabled) {
        weeklyClone[weekday] = { ...weeklyClone[weekday], enabled: false };
        disabled.push(`${dayIso} (${weekday})`);
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

function buildDefaultVacationSettings(businessId: string): VacationSettings {
  const now = new Date().toISOString();
  return normalizeVacationSettings({
    _id: `vacation-settings:${businessId}`,
    type: 'vacation_settings',
    business_id: businessId,
    // Orientación legal ES (art. 38 ET): 30 naturales/año ≈ 2,5/mes.
    defaultDaysPerYear: 30,
    allowances: {},
    accrualMode: 'monthly',
    daysPerMonth: 2.5,
    fullTimeWeeklyHours: 40,
    dayBasis: 'natural',
    maxConsecutiveDays: 14,
    onlyWeekdays: false,
    minNoticeDays: 7,
    minTenureMonthsForVacation: 2,
    allowRequestUnaccrued: false,
    leaveTypePolicies: mergeLeaveTypePolicies(null),
    createdAt: now,
    updatedAt: now,
  });
}

export async function getSettings(
  businessId: string,
  options?: { createIfMissing?: boolean },
): Promise<VacationSettings> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  const docs = (payload.docs || []) as VacationSettings[];
  const existing = docs.find(d => d?.type === 'vacation_settings' && d?.business_id === businessId);
  if (existing) return normalizeVacationSettings(existing);

  const doc = buildDefaultVacationSettings(businessId);
  // Trabajador: no crear política de empresa al abrir el formulario (evita 403 / carreras).
  if (options?.createIfMissing === false) return doc;

  try {
    const result = await req<{ rev: string }>(
      `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(doc._id)}`,
      { method: 'PUT', body: JSON.stringify(doc) },
    );
    return { ...doc, _rev: result.rev };
  } catch {
    return doc;
  }
}

export async function saveSettings(settings: VacationSettings): Promise<VacationSettings> {
  const updated = normalizeVacationSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(settings._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

function requestConsumesVacationBalance(
  r: VacationRequest,
  settings?: VacationSettings | null,
): boolean {
  const policies = settings ? normalizeVacationSettings(settings).leaveTypePolicies : null;
  return resolveLeaveTypePolicy(r.leaveType, policies).consumesVacationBalance;
}

export function getDaysUsed(
  requests: VacationRequest[],
  memberId: string,
  year: number,
  settings?: VacationSettings | null,
): number {
  const mid = String(memberId || '').trim();
  return requests
    .filter(
      (r) =>
        String(r.member_id || '').trim() === mid
        && isBalanceConsumingStatus(r.status)
        && requestConsumesVacationBalance(r, settings)
        && new Date(r.startDate).getFullYear() === year,
    )
    .reduce((sum, r) => sum + Number(r.totalDays || 0), 0);
}

/** Días en trámite (informativo). No reducen el saldo disponible. */
export function getDaysPending(
  requests: VacationRequest[],
  memberId: string,
  year: number,
  settings?: VacationSettings | null,
): number {
  const mid = String(memberId || '').trim();
  return requests
    .filter(
      (r) =>
        String(r.member_id || '').trim() === mid
        && String(r.status || '').toLowerCase() === 'pending'
        && requestConsumesVacationBalance(r, settings)
        && new Date(r.startDate).getFullYear() === year,
    )
    .reduce((sum, r) => sum + Number(r.totalDays || 0), 0);
}

/**
 * Días disponibles este año.
 * Con modo monthly: según meses de alta (pasa startDate del contrato).
 * Con override en allowances: cupo fijo.
 */
export type VacationBalanceOptions = {
  startDate?: string;
  endDate?: string;
  year?: number;
  asOf?: Date | string;
  contract?: VacationContractInput | null;
  /** Atajos desde ficha laboral. */
  hoursPerWeek?: number | null;
  workday?: string | null;
  scheduleWeeklyHours?: number | null;
};

/** ¿Ya puede pedir vacaciones según meses de alta de la empresa? */
export function isVacationTenureEligible(
  settings: VacationSettings | null | undefined,
  employmentStartDate?: string | null,
  asOf: Date = new Date(),
): boolean {
  const normalized = settings ? normalizeVacationSettings(settings) : null;
  const months = Number(normalized?.minTenureMonthsForVacation || 0);
  if (months <= 0) return true;
  const emp = String(employmentStartDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emp)) return false;
  const eligibleFrom = vacationEligibleFromDate(emp, months);
  if (!eligibleFrom) return false;
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, '0');
  const d = String(asOf.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` >= eligibleFrom;
}

function contractFromBalanceOptions(
  options?: VacationBalanceOptions,
): VacationContractInput | null {
  if (!options) return null;
  if (options.contract) return options.contract;
  return {
    hoursPerWeek: options.hoursPerWeek,
    workday: options.workday,
    scheduleWeeklyHours: options.scheduleWeeklyHours,
  };
}

export function getDaysAllowed(
  settings: VacationSettings,
  memberId: string,
  options?: VacationBalanceOptions,
): number {
  return computeAccruedVacationDays(settings, memberId, {
    startDate: options?.startDate,
    endDate: options?.endDate,
    year: options?.year ?? new Date().getFullYear(),
    asOf: options?.asOf,
    contract: contractFromBalanceOptions(options),
  });
}

export function getMemberVacationBalance(
  settings: VacationSettings,
  requests: VacationRequest[],
  memberId: string,
  options?: VacationBalanceOptions,
): VacationBalance {
  const year = options?.year ?? new Date().getFullYear();
  const normalized = normalizeVacationSettings(settings);
  const balance = computeVacationBalance(
    normalized,
    memberId,
    getDaysUsed(requests, memberId, year, normalized),
    getDaysPending(requests, memberId, year, normalized),
    {
      startDate: options?.startDate,
      endDate: options?.endDate,
      year,
      asOf: options?.asOf,
      contract: contractFromBalanceOptions(options),
    },
  );
  // Hasta cumplir meses de alta: pedibles = 0 (también con cupo manual).
  // Si RRHH quiere permitir antes: minTenureMonthsForVacation = 0 o allowRequestUnaccrued.
  const asOfDate =
    typeof options?.asOf === 'string'
      ? new Date(`${String(options.asOf).slice(0, 10)}T12:00:00`)
      : (options?.asOf || new Date());
  if (!isVacationTenureEligible(normalized, options?.startDate, asOfDate)) {
    return { ...balance, requestable: 0 };
  }
  return balance;
}
