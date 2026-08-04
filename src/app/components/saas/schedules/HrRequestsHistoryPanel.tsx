import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  Search,
  User,
  X,
  XCircle,
  PauseCircle,
  ChevronRight,
} from 'lucide-react';
import type { LeaveType, VacationRequest, VacationSettings, VacationStatus } from '../../../lib/vacationsApi';
import { getDaysUsed, getDaysAllowed } from '../../../lib/vacationsApi';
import { formatDateRangeEs, formatDateTimeEs } from '../../../lib/formatDateEs';
import { formatQtyEs } from '../../../lib/formatNumberEs';
import { normalizeClockinUserId } from '../../../lib/clockinUserId';
import { useModalClose } from '../../../hooks/useModalClose';

type MemberRow = {
  user_id: string;
  fullName: string;
  role: string;
  startDate?: string;
  endDate?: string;
  hoursPerWeek?: number;
  workday?: string;
  scheduleWeeklyHours?: number;
};

type Props = {
  members: MemberRow[];
  vacations: VacationRequest[];
  vacSettings: VacationSettings | null;
  leaveLabels: Record<LeaveType, string>;
  statusLabels: Record<VacationStatus, string>;
};

const STATUS_TONE: Record<VacationStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
};

const STATUS_ICON = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: PauseCircle,
} as const;

function samePersonId(a?: string | null, b?: string | null): boolean {
  const na = normalizeClockinUserId(a);
  const nb = normalizeClockinUserId(b);
  return Boolean(na) && na === nb;
}

function requestInYear(v: VacationRequest, year: number): boolean {
  const startY = new Date(v.startDate).getFullYear();
  if (startY === year) return true;
  const endY = new Date(v.endDate || v.startDate).getFullYear();
  if (Number.isFinite(endY) && endY === year) return true;
  if (v.createdAt) {
    const createdY = new Date(v.createdAt).getFullYear();
    if (Number.isFinite(createdY) && createdY === year) return true;
  }
  return false;
}

/**
 * Historial CEO/RRHH: solicitudes del equipo + resumen por trabajador.
 */
export function HrRequestsHistoryPanel({
  members,
  vacations,
  vacSettings,
  leaveLabels,
  statusLabels,
}: Props) {
  const years = useMemo(() => {
    const set = new Set<number>();
    const yNow = new Date().getFullYear();
    set.add(yNow);
    for (const v of vacations) {
      for (const raw of [v.startDate, v.endDate, v.createdAt]) {
        if (!raw) continue;
        const y = new Date(raw).getFullYear();
        if (Number.isFinite(y)) set.add(y);
      }
    }
    return [...set].sort((a, b) => b - a);
  }, [vacations]);

  const [year, setYear] = useState(years[0] || new Date().getFullYear());
  const [memberId, setMemberId] = useState<string>('all');
  const [status, setStatus] = useState<VacationStatus | 'all'>('all');
  const [leaveType, setLeaveType] = useState<LeaveType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'requests' | 'workers'>('requests');
  const [detail, setDetail] = useState<VacationRequest | null>(null);

  useModalClose(Boolean(detail), () => setDetail(null));

  const membersSorted = useMemo(
    () => [...members].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [members],
  );

  const selectedMember = useMemo(
    () => (memberId === 'all' ? null : members.find((m) => samePersonId(m.user_id, memberId)) || null),
    [members, memberId],
  );

  const yearVacations = useMemo(
    () => vacations.filter((v) => requestInYear(v, year)),
    [vacations, year],
  );

  const matchesMemberFilter = (v: VacationRequest) => {
    if (memberId === 'all') return true;
    if (samePersonId(v.member_id, memberId)) return true;
    // Respaldo: IDs históricos distintos pero mismo nombre
    if (selectedMember?.fullName) {
      return String(v.member_name || '').trim().toLowerCase()
        === selectedMember.fullName.trim().toLowerCase();
    }
    return false;
  };

  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return yearVacations
      .filter(matchesMemberFilter)
      .filter((v) => (status === 'all' ? true : v.status === status))
      .filter((v) => (leaveType === 'all' ? true : v.leaveType === leaveType))
      .filter((v) => {
        if (!needle) return true;
        return (
          v.member_name.toLowerCase().includes(needle)
          || (leaveLabels[v.leaveType] || v.leaveType).toLowerCase().includes(needle)
          || String(v.notes || '').toLowerCase().includes(needle)
          || String(v.reviewNote || '').toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => String(b.createdAt || b.startDate).localeCompare(String(a.createdAt || a.startDate)));
  }, [yearVacations, memberId, selectedMember, status, leaveType, search, leaveLabels]);

  const workerRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return members
      .map((m) => {
        const mine = yearVacations.filter(
          (v) =>
            samePersonId(v.member_id, m.user_id)
            || String(v.member_name || '').trim().toLowerCase() === m.fullName.trim().toLowerCase(),
        );
        const approved = mine.filter((v) => v.status === 'approved').length;
        const rejected = mine.filter((v) => v.status === 'rejected').length;
        const pending = mine.filter((v) => v.status === 'pending').length;
        const cancelled = mine.filter((v) => v.status === 'cancelled').length;
        const used = vacSettings
          ? getDaysUsed(yearVacations, m.user_id, year, vacSettings)
          : mine.filter((v) => v.status === 'approved' && v.leaveType === 'vacation').reduce((s, v) => s + v.totalDays, 0);
        const allowed = vacSettings
          ? getDaysAllowed(vacSettings, m.user_id, {
              startDate: m.startDate,
              endDate: m.endDate,
              year,
              hoursPerWeek: m.hoursPerWeek,
              workday: m.workday,
              scheduleWeeklyHours: m.scheduleWeeklyHours,
            })
          : 0;
        return {
          ...m,
          approved,
          rejected,
          pending,
          cancelled,
          total: mine.length,
          used,
          allowed,
          remaining: Math.max(0, allowed - used),
        };
      })
      .filter((m) => !needle || m.fullName.toLowerCase().includes(needle) || m.role.toLowerCase().includes(needle))
      .filter((m) => (memberId === 'all' ? true : samePersonId(m.user_id, memberId)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }, [members, yearVacations, vacSettings, year, search, memberId]);

  const leaveTypeOptions = useMemo(() => {
    const ids = new Set(vacations.map((v) => v.leaveType));
    return (Object.keys(leaveLabels) as LeaveType[]).filter((id) => ids.has(id) || leaveLabels[id]);
  }, [vacations, leaveLabels]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <History className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Historial del equipo</h2>
          <div className="ml-auto flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setView('requests')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                view === 'requests'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500'
              }`}
            >
              Solicitudes
            </button>
            <button
              type="button"
              onClick={() => setView('workers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                view === 'workers'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500'
              }`}
            >
              Por trabajador
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          <label className="text-[11px] font-semibold text-gray-500">
            Año
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-gray-500 sm:col-span-2">
            Trabajador
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            >
              <option value="all">Todo el equipo</option>
              {membersSorted.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </label>
          {view === 'requests' ? (
            <>
              <label className="text-[11px] font-semibold text-gray-500">
                Estado
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VacationStatus | 'all')}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  <option value="all">Todos</option>
                  {(Object.keys(statusLabels) as VacationStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-gray-500">
                Tipo
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType | 'all')}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  <option value="all">Todos</option>
                  {leaveTypeOptions.map((id) => (
                    <option key={id} value={id}>
                      {leaveLabels[id]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === 'workers' ? 'Buscar trabajador…' : 'Buscar por nombre, tipo o notas…'}
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900"
          />
        </div>
      </div>

      {view === 'workers' ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {workerRows.length === 0 ? (
            <EmptyHistory text="No hay trabajadores con estos filtros" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-gray-400">Trabajador</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-gray-400">Solicitudes</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-gray-400">Aprob.</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-gray-400">Rech.</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-gray-400">Pend.</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-gray-400">Vac. usadas</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-gray-400">Saldo</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-gray-400">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {workerRows.map((m) => (
                    <tr key={m.user_id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.fullName}</p>
                            <p className="text-[11px] text-gray-400">{m.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums font-medium">{formatQtyEs(m.total)}</td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums text-emerald-600">{m.approved ? formatQtyEs(m.approved) : '—'}</td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums text-red-600">{m.rejected ? formatQtyEs(m.rejected) : '—'}</td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums text-amber-600">{m.pending ? formatQtyEs(m.pending) : '—'}</td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums">{formatQtyEs(m.used)}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold tabular-nums text-blue-600">
                        {formatQtyEs(m.remaining)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setMemberId(m.user_id);
                            setView('requests');
                          }}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Ver solicitudes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              Historial de solicitudes ({filteredRequests.length})
            </p>
          </div>
          {filteredRequests.length === 0 ? (
            <EmptyHistory text="No hay solicitudes con estos filtros" />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filteredRequests.map((req) => {
                const Icon = STATUS_ICON[req.status] || Clock;
                return (
                  <li key={req._id}>
                    <button
                      type="button"
                      onClick={() => setDetail(req)}
                      className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-950/20 sm:px-5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{req.member_name}</p>
                          <span className="text-xs text-gray-400">·</span>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            {leaveLabels[req.leaveType] || req.leaveType}
                          </p>
                          {req.needsHrReview && req.status === 'pending' ? (
                            <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                              Solape
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {formatDateRangeEs(req.startDate, req.endDate)} · {formatQtyEs(req.totalDays)} d
                          {req.createdAt ? ` · Pedida ${formatDateTimeEs(req.createdAt)}` : ''}
                        </p>
                        {req.notes ? (
                          <p className="mt-1 line-clamp-1 text-xs text-gray-600 dark:text-gray-400">Nota: {req.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[req.status]}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {statusLabels[req.status] || req.status}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {detail ? (
        <RequestDetailModal
          req={detail}
          leaveLabels={leaveLabels}
          statusLabels={statusLabels}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function RequestDetailModal({
  req,
  leaveLabels,
  statusLabels,
  onClose,
}: {
  req: VacationRequest;
  leaveLabels: Record<LeaveType, string>;
  statusLabels: Record<VacationStatus, string>;
  onClose: () => void;
}) {
  const Icon = STATUS_ICON[req.status] || Clock;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[71] mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:inset-y-auto sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hr-request-detail-title"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Detalle solicitud</p>
            <h3 id="hr-request-detail-title" className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
              {leaveLabels[req.leaveType] || req.leaveType}
            </h3>
            <p className="text-sm text-gray-500">{req.member_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${STATUS_TONE[req.status]}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {statusLabels[req.status] || req.status}
          </span>

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-950/40">
            <div>
              <dt className="text-[11px] font-semibold uppercase text-gray-400">Desde</dt>
              <dd className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{req.startDate}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-gray-400">Hasta</dt>
              <dd className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{req.endDate}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-gray-400">Días</dt>
              <dd className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{formatQtyEs(req.totalDays)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-gray-400">Periodo</dt>
              <dd className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDateRangeEs(req.startDate, req.endDate)}
              </dd>
            </div>
          </dl>

          {req.createdAt ? (
            <DetailBlock label="Pedida">{formatDateTimeEs(req.createdAt)}</DetailBlock>
          ) : null}

          {req.notes ? <DetailBlock label="Nota del trabajador">{req.notes}</DetailBlock> : null}

          {(req.reviewedAt || req.reviewedByName) ? (
            <DetailBlock
              label="Revisión RRHH"
              value={[
                req.reviewedByName ? `Por ${req.reviewedByName}` : null,
                req.reviewedAt ? formatDateTimeEs(req.reviewedAt) : null,
              ].filter(Boolean).join(' · ')}
            />
          ) : null}

          {req.reviewNote ? <DetailBlock label="Respuesta RRHH">{req.reviewNote}</DetailBlock> : null}

          {req.conflictSummary ? (
            <DetailBlock label="Aviso de solape" value={req.conflictSummary} tone="warn" />
          ) : null}

          {req.urgency === 'urgent' ? (
            <DetailBlock label="Urgencia" value="Marcada como urgente" tone="warn" />
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

function DetailBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        tone === 'warn'
          ? 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30'
          : 'border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950/20'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase text-gray-400">{label}</p>
      <p
        className={`mt-1 text-sm whitespace-pre-wrap ${
          tone === 'warn' ? 'text-orange-900 dark:text-orange-200' : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyHistory({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <History className="mb-3 h-9 w-9 text-gray-300 dark:text-gray-600" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}
