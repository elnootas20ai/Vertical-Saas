import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Plus,
  Search,
  ThumbsDown,
  ThumbsUp,
  Umbrella,
  X,
} from 'lucide-react';
import type { VacationRequest, VacationSettings, LeaveType, VacationStatus } from '../../../lib/vacationsApi';
import { getDaysUsed, getDaysAllowed, countBusinessDays } from '../../../lib/vacationsApi';
import { ROLE_BADGE } from '../../../lib/schedulesDisplay';

interface TeamMember {
  user_id: string;
  fullName: string;
  role: string;
}

interface Props {
  members: TeamMember[];
  vacations: VacationRequest[];
  vacSettings: VacationSettings | null;
  currentYear: number;
  canManage: boolean;
  userId?: string;
  leaveLabels: Record<LeaveType, string>;
  statusLabels: Record<VacationStatus, string>;
  expandedId: string | null;
  reviewNotes: Record<string, string>;
  onExpand: (id: string | null) => void;
  onReviewNote: (id: string, note: string) => void;
  onReview: (req: VacationRequest, decision: 'approved' | 'rejected') => void;
  onDelete: (req: VacationRequest) => void;
  onRequest: () => void;
}

export function VacationsTeamPanel({
  members,
  vacations,
  vacSettings,
  currentYear,
  canManage,
  userId,
  leaveLabels,
  statusLabels,
  expandedId,
  reviewNotes,
  onExpand,
  onReviewNote,
  onReview,
  onDelete,
  onRequest,
}: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VacationStatus | 'all'>('all');

  const myStats = useMemo(() => {
    if (!userId || !vacSettings) return null;
    const used = getDaysUsed(vacations, userId, currentYear);
    const allowed = getDaysAllowed(vacSettings, userId);
    return { used, allowed, remaining: Math.max(0, allowed - used), pending: vacations.filter((v) => v.member_id === userId && v.status === 'pending').length };
  }, [vacations, userId, vacSettings, currentYear]);

  const pending = useMemo(() => vacations.filter((v) => v.status === 'pending'), [vacations]);

  const teamBalance = useMemo(() => {
    if (!canManage || !vacSettings) return [];
    const needle = search.trim().toLowerCase();
    return members
      .map((m) => {
        const used = getDaysUsed(vacations, m.user_id, currentYear);
        const allowed = getDaysAllowed(vacSettings, m.user_id);
        const pendingCount = vacations.filter((v) => v.member_id === m.user_id && v.status === 'pending').length;
        const approvedUpcoming = vacations.filter(
          (v) => v.member_id === m.user_id && v.status === 'approved' && v.endDate >= new Date().toISOString().slice(0, 10),
        ).length;
        return { ...m, used, allowed, remaining: Math.max(0, allowed - used), pendingCount, approvedUpcoming };
      })
      .filter((m) => !needle || m.fullName.toLowerCase().includes(needle))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }, [members, vacations, vacSettings, currentYear, canManage, search]);

  const shownRequests = useMemo(() => {
    const base = canManage ? vacations : vacations.filter((v) => v.member_id === userId);
    return base.filter((v) => statusFilter === 'all' || v.status === statusFilter);
  }, [vacations, canManage, userId, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {myStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-[280px]">
            <MiniKpi label="Asignados" value={String(myStats.allowed)} tone="blue" />
            <MiniKpi label="Usados" value={String(myStats.used)} tone="amber" />
            <MiniKpi label="Restantes" value={String(myStats.remaining)} tone="green" />
            <MiniKpi label="Pendientes" value={String(myStats.pending)} tone="red" />
          </div>
        )}
        <button type="button" onClick={onRequest} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-sm shrink-0">
          <Plus className="w-4 h-4" /> Solicitar
        </button>
      </div>

      {canManage && pending.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200/60 dark:border-amber-800/40 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Pendientes de aprobar ({pending.length})</h3>
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
            {pending.map((req) => {
              const open = expandedId === req._id;
              return (
                <div key={req._id} className="p-4">
                  <button type="button" onClick={() => onExpand(open ? null : req._id)} className="w-full flex items-start justify-between gap-3 text-left">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{req.member_name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                        {leaveLabels[req.leaveType]} · {req.startDate} → {req.endDate} · <strong>{req.totalDays}d</strong>
                      </p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="mt-3 space-y-3">
                      {req.notes && <p className="text-xs text-gray-500 italic">{req.notes}</p>}
                      <textarea
                        value={reviewNotes[req._id] || ''}
                        onChange={(e) => onReviewNote(req._id, e.target.value)}
                        rows={2}
                        placeholder="Nota para el trabajador (opcional)…"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => onReview(req, 'rejected')} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                          <ThumbsDown className="w-4 h-4" /> Rechazar
                        </button>
                        <button type="button" onClick={() => onReview(req, 'approved')} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg">
                          <ThumbsUp className="w-4 h-4" /> Aprobar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canManage && vacSettings && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Umbrella className="w-4 h-4 text-blue-500" /> Saldo del equipo ({currentYear})
            </h3>
            <div className="relative ml-auto min-w-[160px] max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 outline-none"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Miembro</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Asignados</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Usados</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Restantes</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Pend.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {teamBalance.map((m) => (
                  <tr key={m.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{m.fullName}</p>
                      <span className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ROLE_BADGE[m.role] || ROLE_BADGE.Usuario}`}>{m.role}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums">{m.allowed}</td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums font-medium text-amber-600 dark:text-amber-400">{m.used}</td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{m.remaining}</td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums">{m.pendingCount || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {canManage ? `Todas las solicitudes (${currentYear})` : 'Mis solicitudes'}
          </h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VacationStatus | 'all')}
            className="ml-auto px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
          >
            <option value="all">Todos los estados</option>
            {(Object.keys(statusLabels) as VacationStatus[]).map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </div>
        {shownRequests.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <Umbrella className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Sin solicitudes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/30">
                  {canManage && <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Miembro</th>}
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Fechas</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Días</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Estado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {shownRequests.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20">
                    {canManage && <td className="px-4 py-2.5 text-sm font-medium">{r.member_name}</td>}
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{leaveLabels[r.leaveType]}</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-gray-600 dark:text-gray-300">{r.startDate} → {r.endDate}</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold tabular-nums">{r.totalDays}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.status} label={statusLabels[r.status]} />
                    </td>
                    <td className="px-2 py-2.5">
                      {r.status === 'pending' && r.member_id === userId && (
                        <button type="button" onClick={() => onDelete(r)} className="p-1 text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'amber' | 'green' | 'red' }) {
  const c = {
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase text-gray-400">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${c[tone]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status, label }: { status: VacationStatus; label: string }) {
  const cls =
    status === 'approved'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : status === 'rejected'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

export { countBusinessDays };
