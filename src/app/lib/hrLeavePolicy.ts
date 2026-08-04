/**
 * Política RRHH de permisos/vacaciones — base estatal ES + overrides de empresa.
 * Fuente única para validar solicitudes, solapes y cupos por tipo.
 */
import {
  HR_REQUEST_TYPES,
  getHrRequestType,
  type LeaveType,
  type HrRequestTypeDef,
} from './hrRequestCatalog';

export type LeaveTypePolicyOverride = {
  /** 0 = sin tope de días por solicitud */
  maxDays?: number;
  enabled?: boolean;
  consumesVacationBalance?: boolean;
  allowSameDay?: boolean;
  blocksWorkWhenApproved?: boolean;
  /** null/undefined = usar antelación global de vacaciones */
  minNoticeDays?: number | null;
};

export type ResolvedLeaveTypePolicy = HrRequestTypeDef & {
  maxDays: number;
  enabled: boolean;
};

/** Cupos legales/orientativos ES (empresa puede cambiar). 0 = sin tope. */
export const ES_DEFAULT_MAX_DAYS: Record<LeaveType, number> = {
  vacation: 0, // cupo = saldo devengado
  personal: 0,
  sick: 0,
  accident: 0,
  unpaid: 0,
  // ET art. 37.3.a — 15 días naturales por matrimonio
  marriage: 15,
  // Orientativo clásico; convenio puede ampliar
  bereavement: 2,
  // 16 semanas ≈ 112 días naturales (orientativo)
  maternity: 112,
  paternity: 112,
  training: 5,
  other: 0,
};

export type DateRangeLike = {
  _id?: string;
  startDate: string;
  endDate: string;
  status?: string;
  leaveType?: string;
  member_id?: string;
  member_name?: string;
};

export type LeaveTeamMemberLike = {
  user_id: string;
  fullName?: string;
  name?: string;
  role?: string;
  status?: string;
};

export type LeaveCoverageAway = {
  memberId: string;
  memberName: string;
  role: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  requestId: string;
};

export type LeaveCoverageSnapshot = {
  startDate: string;
  endDate: string;
  requesterId: string;
  requesterRole: string;
  away: LeaveCoverageAway[];
  approvedAway: LeaveCoverageAway[];
  pendingAway: LeaveCoverageAway[];
  sameRoleAway: LeaveCoverageAway[];
  available: Array<{ memberId: string; memberName: string; role: string }>;
  sameRoleAvailable: Array<{ memberId: string; memberName: string; role: string }>;
  teamSize: number;
};

export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

/** Solicitudes activas que cuentan para solape (pendiente o aprobada). Cancelada/rechazada = libres. */
export function isActiveLeaveStatus(status?: string | null): boolean {
  const s = String(status || '').trim().toLowerCase();
  return s === 'pending' || s === 'approved';
}

/** Solo estas descuentan saldo de vacaciones. */
export function isBalanceConsumingStatus(status?: string | null): boolean {
  return String(status || '').trim().toLowerCase() === 'approved';
}

export function findOverlappingLeaveRequests(
  existing: DateRangeLike[],
  memberId: string,
  startDate: string,
  endDate: string,
  options?: { excludeId?: string | null },
): DateRangeLike[] {
  const mid = String(memberId || '').trim();
  const exclude = String(options?.excludeId || '').trim();
  return existing.filter((r) => {
    if (!isActiveLeaveStatus(r.status)) return false;
    if (String(r.member_id || '').trim() !== mid) return false;
    if (exclude && String(r._id || '').trim() === exclude) return false;
    return datesOverlap(startDate, endDate, r.startDate, r.endDate);
  });
}

/** Otros miembros del equipo con ausencia activa (pendiente/aprobada) en el rango. */
export function findTeamLeaveOverlaps(
  existing: DateRangeLike[],
  memberId: string,
  startDate: string,
  endDate: string,
  options?: { excludeId?: string | null },
): DateRangeLike[] {
  const mid = String(memberId || '').trim();
  const exclude = String(options?.excludeId || '').trim();
  return existing.filter((r) => {
    if (!isActiveLeaveStatus(r.status)) return false;
    if (String(r.member_id || '').trim() === mid) return false;
    if (exclude && String(r._id || '').trim() === exclude) return false;
    return datesOverlap(startDate, endDate, r.startDate, r.endDate);
  });
}

function memberDisplayName(m: LeaveTeamMemberLike): string {
  return String(m.fullName || m.name || '').trim() || 'Sin nombre';
}

/**
 * Cobertura del equipo en las fechas de una solicitud: quién falta y quién queda.
 * Excluye la propia solicitud (excludeId) y al solicitante de la lista «disponible».
 */
export function buildLeaveCoverageSnapshot(
  startDate: string,
  endDate: string,
  requesterId: string,
  allRequests: DateRangeLike[],
  members: LeaveTeamMemberLike[],
  options?: { excludeId?: string | null },
): LeaveCoverageSnapshot {
  const mid = String(requesterId || '').trim();
  const roleById = new Map<string, string>();
  const nameById = new Map<string, string>();
  const activeMembers = members.filter((m) => {
    const id = String(m.user_id || '').trim();
    if (!id) return false;
    const st = String(m.status || 'active').toLowerCase();
    if (st === 'inactive' || st === 'disabled') return false;
    const name = memberDisplayName(m);
    if (/^demo(\s|$)/i.test(name)) return false;
    roleById.set(id, String(m.role || 'Usuario').trim() || 'Usuario');
    nameById.set(id, name);
    return true;
  });

  const requesterRole = roleById.get(mid) || 'Usuario';
  const teamOverlaps = findTeamLeaveOverlaps(allRequests, mid, startDate, endDate, options);

  const awayMap = new Map<string, LeaveCoverageAway>();
  for (const r of teamOverlaps) {
    const id = String(r.member_id || '').trim();
    if (!id) continue;
    const prev = awayMap.get(id);
    const status = String(r.status || 'pending');
    // Preferir aprobada si hay varias
    if (prev && prev.status === 'approved' && status !== 'approved') continue;
    awayMap.set(id, {
      memberId: id,
      memberName: String(r.member_name || nameById.get(id) || 'Sin nombre').trim(),
      role: roleById.get(id) || 'Usuario',
      leaveType: String(r.leaveType || 'other'),
      status,
      startDate: r.startDate,
      endDate: r.endDate,
      requestId: String(r._id || ''),
    });
  }

  const away = [...awayMap.values()].sort((a, b) =>
    a.memberName.localeCompare(b.memberName, 'es'),
  );
  const awayIds = new Set(away.map((a) => a.memberId));
  const available = activeMembers
    .filter((m) => {
      const id = String(m.user_id || '').trim();
      return id !== mid && !awayIds.has(id);
    })
    .map((m) => ({
      memberId: String(m.user_id).trim(),
      memberName: memberDisplayName(m),
      role: String(m.role || 'Usuario').trim() || 'Usuario',
    }))
    .sort((a, b) => a.memberName.localeCompare(b.memberName, 'es'));

  const sameRoleAway = away.filter((a) => a.role === requesterRole);
  const sameRoleAvailable = available.filter((a) => a.role === requesterRole);

  return {
    startDate,
    endDate,
    requesterId: mid,
    requesterRole,
    away,
    approvedAway: away.filter((a) => a.status === 'approved'),
    pendingAway: away.filter((a) => a.status === 'pending'),
    sameRoleAway,
    available,
    sameRoleAvailable,
    teamSize: activeMembers.filter((m) => String(m.user_id || '').trim() !== mid).length,
  };
}

/** Texto corto para notificación / resumen almacenado. */
export function formatLeaveCoverageSummary(
  coverage: LeaveCoverageSnapshot,
  leaveLabel: (leaveType: string) => string,
): string {
  if (!coverage.away.length) {
    return coverage.available.length
      ? `Nadie más falta esas fechas · ${coverage.available.length} disponible${coverage.available.length === 1 ? '' : 's'} en el equipo`
      : 'No hay más miembros en el equipo para cubrir';
  }
  const names = coverage.away
    .slice(0, 4)
    .map((a) => {
      const st = a.status === 'approved' ? 'aprobada' : 'pendiente';
      return `${a.memberName} (${leaveLabel(a.leaveType)}, ${st})`;
    })
    .join('; ');
  const more = coverage.away.length > 4 ? ` (+${coverage.away.length - 4})` : '';
  const same =
    coverage.sameRoleAway.length > 0
      ? ` · Mismo rol (${coverage.requesterRole}): ${coverage.sameRoleAway.length} fuera`
      : '';
  return `También fuera: ${names}${more}${same}`;
}

export function resolveLeaveTypePolicy(
  leaveType: LeaveType | string | null | undefined,
  overrides?: Partial<Record<LeaveType, LeaveTypePolicyOverride>> | null,
): ResolvedLeaveTypePolicy {
  const base = getHrRequestType(leaveType);
  const ov = overrides?.[base.id];
  const maxDaysRaw = ov?.maxDays;
  const maxDays =
    maxDaysRaw != null && Number.isFinite(Number(maxDaysRaw))
      ? Math.max(0, Number(maxDaysRaw))
      : ES_DEFAULT_MAX_DAYS[base.id] ?? 0;

  return {
    ...base,
    maxDays,
    enabled: ov?.enabled !== false,
    consumesVacationBalance:
      ov?.consumesVacationBalance != null
        ? Boolean(ov.consumesVacationBalance)
        : base.consumesVacationBalance,
    allowSameDay: ov?.allowSameDay != null ? Boolean(ov.allowSameDay) : base.allowSameDay,
    blocksWorkWhenApproved:
      ov?.blocksWorkWhenApproved != null
        ? Boolean(ov.blocksWorkWhenApproved)
        : base.blocksWorkWhenApproved,
    // minNotice: se resuelve en validate con settings globales
  };
}

export function listDefaultLeaveTypePolicies(): Record<LeaveType, LeaveTypePolicyOverride> {
  const out = {} as Record<LeaveType, LeaveTypePolicyOverride>;
  for (const t of HR_REQUEST_TYPES) {
    out[t.id] = {
      maxDays: ES_DEFAULT_MAX_DAYS[t.id] ?? 0,
      enabled: true,
      consumesVacationBalance: t.consumesVacationBalance,
      allowSameDay: t.allowSameDay,
      blocksWorkWhenApproved: t.blocksWorkWhenApproved,
      minNoticeDays: null,
    };
  }
  return out;
}

export function mergeLeaveTypePolicies(
  stored?: Partial<Record<LeaveType, LeaveTypePolicyOverride>> | null,
): Record<LeaveType, LeaveTypePolicyOverride> {
  const defaults = listDefaultLeaveTypePolicies();
  if (!stored || typeof stored !== 'object') return defaults;
  for (const t of HR_REQUEST_TYPES) {
    const ov = stored[t.id];
    if (!ov) continue;
    defaults[t.id] = { ...defaults[t.id], ...ov };
  }
  return defaults;
}

export function leaveTypeLabelEs(id: string | null | undefined): string {
  return getHrRequestType(id).label;
}
