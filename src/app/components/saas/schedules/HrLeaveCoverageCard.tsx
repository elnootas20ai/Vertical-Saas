import { useMemo } from 'react';
import { CheckCircle2, UserMinus, UserCheck, Users } from 'lucide-react';
import type { LeaveType, VacationRequest } from '../../../lib/vacationsApi';
import { formatDateRangeEs } from '../../../lib/formatDateEs';
import {
  buildLeaveCoverageSnapshot,
  type LeaveTeamMemberLike,
} from '../../../lib/hrLeavePolicy';

type Props = {
  request: Pick<VacationRequest, '_id' | 'member_id' | 'startDate' | 'endDate'>;
  allRequests: VacationRequest[];
  members: LeaveTeamMemberLike[];
  leaveLabels: Partial<Record<LeaveType, string>> | Record<string, string>;
  /** Compacto para la fila cerrada. */
  compact?: boolean;
};

export function HrLeaveCoverageCard({
  request,
  allRequests,
  members,
  leaveLabels,
  compact = false,
}: Props) {
  const coverage = useMemo(
    () =>
      buildLeaveCoverageSnapshot(
        request.startDate,
        request.endDate,
        request.member_id,
        allRequests,
        members,
        { excludeId: request._id },
      ),
    [request._id, request.member_id, request.startDate, request.endDate, allRequests, members],
  );

  const labelOf = (t: string) => leaveLabels[t as LeaveType] || t;

  if (compact) {
    if (coverage.away.length === 0) {
      return (
        <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          Nadie más falta · {coverage.available.length} disponible
          {coverage.available.length === 1 ? '' : 's'}
        </p>
      );
    }
    const preview = coverage.away
      .slice(0, 2)
      .map((a) => a.memberName)
      .join(', ');
    const more = coverage.away.length > 2 ? ` +${coverage.away.length - 2}` : '';
    return (
      <p className="mt-1 text-[11px] font-medium text-orange-700 dark:text-orange-300">
        También fuera: {preview}
        {more}
        {coverage.sameRoleAway.length > 0
          ? ` · ${coverage.sameRoleAway.length} del mismo rol`
          : ''}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/80 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <p className="text-xs font-bold text-gray-900 dark:text-white">
          Cobertura del equipo · {formatDateRangeEs(request.startDate, request.endDate)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-orange-50 px-2 py-1.5 text-center dark:bg-orange-950/40">
          <p className="text-base font-bold text-orange-800 dark:text-orange-200">{coverage.away.length}</p>
          <p className="text-[10px] font-semibold uppercase text-orange-600/90 dark:text-orange-400">Fuera</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center dark:bg-emerald-950/40">
          <p className="text-base font-bold text-emerald-800 dark:text-emerald-200">
            {coverage.available.length}
          </p>
          <p className="text-[10px] font-semibold uppercase text-emerald-600/90 dark:text-emerald-400">
            Disponibles
          </p>
        </div>
        <div className="rounded-lg bg-violet-50 px-2 py-1.5 text-center dark:bg-violet-950/40">
          <p className="text-base font-bold text-violet-800 dark:text-violet-200">
            {coverage.sameRoleAvailable.length}
          </p>
          <p className="text-[10px] font-semibold uppercase text-violet-600/90 dark:text-violet-400">
            Mismo rol
          </p>
        </div>
      </div>

      {coverage.away.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
            <UserMinus className="h-3.5 w-3.5" />
            Quién falta esas fechas
          </p>
          <ul className="space-y-1.5">
            {coverage.away.map((a) => (
              <li
                key={`${a.memberId}:${a.requestId}`}
                className="flex items-start justify-between gap-2 rounded-lg bg-orange-50/80 px-2.5 py-1.5 dark:bg-orange-950/30"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {a.memberName}
                    <span className="ml-1 font-normal text-gray-500">· {a.role}</span>
                  </p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400">
                    {labelOf(a.leaveType)} · {formatDateRangeEs(a.startDate, a.endDate)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    a.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                >
                  {a.status === 'approved' ? 'Aprobada' : 'Pendiente'}
                </span>
              </li>
            ))}
          </ul>
          {coverage.sameRoleAway.length > 0 ? (
            <p className="mt-2 text-[11px] font-medium text-rose-700 dark:text-rose-300">
              Atención: {coverage.sameRoleAway.length} persona
              {coverage.sameRoleAway.length === 1 ? '' : 's'} del mismo rol (
              {coverage.requesterRole}) también fuera.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Nadie más del equipo falta en esas fechas.
        </div>
      )}

      {coverage.available.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <UserCheck className="h-3.5 w-3.5" />
            Quién puede cubrir
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {coverage.available
              .slice(0, 8)
              .map((a) => `${a.memberName}${a.role ? ` (${a.role})` : ''}`)
              .join(' · ')}
            {coverage.available.length > 8 ? ` · +${coverage.available.length - 8} más` : ''}
          </p>
        </div>
      ) : coverage.teamSize === 0 ? (
        <p className="text-xs text-gray-500">No hay más miembros en el equipo.</p>
      ) : (
        <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
          Nadie más disponible: todo el resto del equipo ya tiene ausencia en esas fechas.
        </p>
      )}
    </div>
  );
}
