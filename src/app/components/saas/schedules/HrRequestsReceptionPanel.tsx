import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  ThumbsDown,
  ThumbsUp,
  User,
} from 'lucide-react';
import type { LeaveType, VacationRequest } from '../../../lib/vacationsApi';
import { formatDateRangeEs, formatDateTimeEs } from '../../../lib/formatDateEs';
import { formatQtyEs } from '../../../lib/formatNumberEs';
import type { LeaveTeamMemberLike } from '../../../lib/hrLeavePolicy';
import { HrLeaveCoverageCard } from './HrLeaveCoverageCard';

type Props = {
  pending: VacationRequest[];
  /** Todas las solicitudes (para ver quién más falta en esas fechas). */
  allRequests: VacationRequest[];
  members: LeaveTeamMemberLike[];
  leaveLabels: Record<LeaveType, string>;
  expandedId: string | null;
  reviewNotes: Record<string, string>;
  onExpand: (id: string | null) => void;
  onReviewNote: (id: string, note: string) => void;
  onReview: (req: VacationRequest, decision: 'approved' | 'rejected') => void;
};

/**
 * Recepción de alertas RRHH: bandeja tipo notificaciones para aprobar/rechazar.
 */
export function HrRequestsReceptionPanel({
  pending,
  allRequests,
  members,
  leaveLabels,
  expandedId,
  reviewNotes,
  onExpand,
  onReviewNote,
  onReview,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'urgent' | 'conflict'>('all');

  const sorted = useMemo(() => {
    let list = [...pending];
    if (filter === 'urgent') list = list.filter((r) => r.urgency === 'urgent' || r.needsHrReview);
    if (filter === 'conflict') list = list.filter((r) => r.needsHrReview);
    return list.sort((a, b) => {
      const ca = a.needsHrReview ? 0 : 1;
      const cb = b.needsHrReview ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const ua = a.urgency === 'urgent' ? 0 : 1;
      const ub = b.urgency === 'urgent' ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }, [pending, filter]);

  const urgentCount = pending.filter((r) => r.urgency === 'urgent' || r.needsHrReview).length;
  const conflictCount = pending.filter((r) => r.needsHrReview).length;

  if (pending.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Recepción al día</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
          No hay solicitudes nuevas. Cuando un trabajador pida vacaciones o un permiso, la alerta aparece aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-800/60 dark:from-amber-950/30 dark:to-gray-900">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-500/30">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Recepción de solicitudes
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {pending.length} alerta{pending.length === 1 ? '' : 's'} pendiente
              {pending.length === 1 ? '' : 's'} · abre y aprueba o rechaza
            </p>
          </div>
          <div className="-mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-0.5 sm:w-auto sm:flex-wrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ['all', `Todas (${pending.length})`],
                ['urgent', `Urgentes (${urgentCount})`],
                ['conflict', `Solapes (${conflictCount})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold min-h-10 ${
                  filter === id
                    ? 'bg-amber-600 text-white'
                    : 'bg-white/80 text-gray-600 ring-1 ring-amber-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-amber-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          No hay alertas en este filtro.
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((req) => {
            const open = expandedId === req._id;
            const isConflict = Boolean(req.needsHrReview);
            const isUrgent = req.urgency === 'urgent' || isConflict;
            return (
              <li
                key={req._id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-gray-800 ${
                  isConflict
                    ? 'border-orange-300 dark:border-orange-700'
                    : isUrgent
                      ? 'border-rose-300 dark:border-rose-800'
                      : 'border-amber-200 dark:border-amber-800/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onExpand(open ? null : req._id)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50/80 dark:hover:bg-gray-700/30"
                >
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isConflict
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                        : isUrgent
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}
                  >
                    {isConflict ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : isUrgent ? (
                      <Bell className="h-5 w-5" />
                    ) : (
                      <Inbox className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{req.member_name}</p>
                      {isConflict ? (
                        <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                          Solape
                        </span>
                      ) : null}
                      {req.urgency === 'urgent' ? (
                        <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                          Urgente
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        <Clock className="h-3 w-3" />
                        Pendiente
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                      {leaveLabels[req.leaveType] || req.leaveType} ·{' '}
                      {formatDateRangeEs(req.startDate, req.endDate)} · <strong>{formatQtyEs(req.totalDays)}d</strong>
                    </p>
                    {req.createdAt ? (
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        Recibida {formatDateTimeEs(req.createdAt)}
                      </p>
                    ) : null}
                    {req.conflictSummary ? (
                      <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">{req.conflictSummary}</p>
                    ) : null}
                    {!open ? (
                      <HrLeaveCoverageCard
                        request={req}
                        allRequests={allRequests}
                        members={members}
                        leaveLabels={leaveLabels}
                        compact
                      />
                    ) : null}
                  </div>
                  <ChevronDown
                    className={`mt-2 h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>

                {open ? (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <User className="h-3.5 w-3.5" />
                      Cobertura y decisión
                    </div>
                    <HrLeaveCoverageCard
                      request={req}
                      allRequests={allRequests}
                      members={members}
                      leaveLabels={leaveLabels}
                    />
                    {req.notes ? (
                      <p className="rounded-xl bg-white px-3 py-2 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                        Nota del trabajador: {req.notes}
                      </p>
                    ) : null}
                    {isConflict ? (
                      <p className="rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                        Hay solape con otra solicitud del mismo trabajador. Aprueba solo una o rechaza/cancela la otra.
                      </p>
                    ) : null}
                    <textarea
                      value={reviewNotes[req._id] || ''}
                      onChange={(e) => onReviewNote(req._id, e.target.value)}
                      rows={2}
                      placeholder="Nota para el trabajador (opcional)…"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                      <button
                        type="button"
                        onClick={() => onReview(req, 'rejected')}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 sm:min-h-10 sm:w-auto sm:py-2"
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => onReview(req, 'approved')}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 sm:min-h-10 sm:w-auto sm:py-2"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        Aprobar
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
