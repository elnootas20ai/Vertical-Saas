import React, { useEffect, useMemo, useState } from 'react';
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
import {
  getMemberVacationBalance,
  countBusinessDays,
  mergeLeaveTypePolicies,
} from '../../../lib/vacationsApi';
import { ROLE_BADGE } from '../../../lib/schedulesDisplay';
import { formatDateRangeEs } from '../../../lib/formatDateEs';
import { formatQtyEs } from '../../../lib/formatNumberEs';
import { HrLeaveCoverageCard } from './HrLeaveCoverageCard';

interface TeamMember {
  user_id: string;
  fullName: string;
  role: string;
  startDate?: string;
  endDate?: string;
  hoursPerWeek?: number;
  workday?: string;
  scheduleWeeklyHours?: number;
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
  onSaveSettings?: (next: VacationSettings) => Promise<void>;
  /** Si true, no muestra el bloque ámbar de pendientes (va a Recepción). */
  hidePendingInbox?: boolean;
  /** Solo política + saldo (pantalla de Ajustes). */
  settingsOnly?: boolean;
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
  onSaveSettings,
  hidePendingInbox = false,
  settingsOnly = false,
}: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VacationStatus | 'all'>('all');
  const [savingPolicy, setSavingPolicy] = useState(false);

  const myStats = useMemo(() => {
    if (!userId || !vacSettings) return null;
    const me = members.find((m) => m.user_id === userId);
    const bal = getMemberVacationBalance(vacSettings, vacations, userId, {
      startDate: me?.startDate,
      endDate: me?.endDate,
      year: currentYear,
      hoursPerWeek: me?.hoursPerWeek,
      workday: me?.workday,
      scheduleWeeklyHours: me?.scheduleWeeklyHours,
    });
    return {
      used: bal.used,
      allowed: bal.accrued,
      remaining: bal.remaining,
      requestable: bal.requestable,
      pending: vacations.filter((v) => v.member_id === userId && v.status === 'pending').length,
    };
  }, [vacations, userId, vacSettings, currentYear, members]);

  const pending = useMemo(
    () =>
      vacations
        .filter((v) => v.status === 'pending')
        .sort((a, b) => {
          const ca = a.needsHrReview ? 0 : 1;
          const cb = b.needsHrReview ? 0 : 1;
          if (ca !== cb) return ca - cb;
          const ua = a.urgency === 'urgent' ? 0 : 1;
          const ub = b.urgency === 'urgent' ? 0 : 1;
          if (ua !== ub) return ua - ub;
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        }),
    [vacations],
  );

  const teamBalance = useMemo(() => {
    if (!canManage || !vacSettings) return [];
    const needle = search.trim().toLowerCase();
    return members
      .map((m) => {
        const bal = getMemberVacationBalance(vacSettings, vacations, m.user_id, {
          startDate: m.startDate,
          endDate: m.endDate,
          year: currentYear,
          hoursPerWeek: m.hoursPerWeek,
          workday: m.workday,
          scheduleWeeklyHours: m.scheduleWeeklyHours,
        });
        const pendingCount = vacations.filter((v) => v.member_id === m.user_id && v.status === 'pending').length;
        const approvedUpcoming = vacations.filter(
          (v) => v.member_id === m.user_id && v.status === 'approved' && v.endDate >= new Date().toISOString().slice(0, 10),
        ).length;
        return {
          ...m,
          used: bal.used,
          allowed: bal.accrued,
          remaining: bal.remaining,
          requestable: bal.requestable,
          completedMonths: bal.completedMonths,
          pendingCount,
          approvedUpcoming,
        };
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
      {!settingsOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {myStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-[280px]">
              <MiniKpi label="Cargados" value={formatQtyEs(myStats.allowed)} tone="blue" />
              <MiniKpi label="Usados" value={formatQtyEs(myStats.used)} tone="amber" />
              <MiniKpi label="Disponibles" value={formatQtyEs(myStats.requestable)} tone="green" />
              <MiniKpi label="Pendientes" value={formatQtyEs(myStats.pending)} tone="red" />
            </div>
          )}
          <button type="button" onClick={onRequest} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-sm shrink-0">
            <Plus className="w-4 h-4" /> Solicitar
          </button>
        </div>
      ) : null}

      {canManage && vacSettings && onSaveSettings && (
        <VacationPolicyCard
          settings={vacSettings}
          leaveLabels={leaveLabels}
          saving={savingPolicy}
          onSave={async (next) => {
            setSavingPolicy(true);
            try {
              await onSaveSettings(next);
            } finally {
              setSavingPolicy(false);
            }
          }}
        />
      )}

      {canManage && !hidePendingInbox && pending.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200/60 dark:border-amber-800/40 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Solicitudes pendientes ({pending.length})
            </h3>
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
            {pending.map((req) => {
              const open = expandedId === req._id;
              return (
                <div
                  key={req._id}
                  className={`p-4 ${
                    req.needsHrReview
                      ? 'bg-orange-50/70 dark:bg-orange-950/25'
                      : req.urgency === 'urgent'
                        ? 'bg-rose-50/50 dark:bg-rose-950/20'
                        : ''
                  }`}
                >
                  <button type="button" onClick={() => onExpand(open ? null : req._id)} className="w-full flex items-start justify-between gap-3 text-left">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{req.member_name}</p>
                        {req.needsHrReview ? (
                          <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                            Valorar solape
                          </span>
                        ) : null}
                        {req.urgency === 'urgent' ? (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            Urgente
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                        {leaveLabels[req.leaveType] || req.leaveType} · {formatDateRangeEs(req.startDate, req.endDate)} · <strong>{formatQtyEs(req.totalDays)}d</strong>
                      </p>
                      {req.conflictSummary ? (
                        <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">{req.conflictSummary}</p>
                      ) : null}
                      {!open ? (
                        <HrLeaveCoverageCard
                          request={req}
                          allRequests={vacations}
                          members={members}
                          leaveLabels={leaveLabels}
                          compact
                        />
                      ) : null}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="mt-3 space-y-3">
                      <HrLeaveCoverageCard
                        request={req}
                        allRequests={vacations}
                        members={members}
                        leaveLabels={leaveLabels}
                      />
                      {req.notes && <p className="text-xs text-gray-500 italic">{req.notes}</p>}
                      {req.needsHrReview ? (
                        <p className="text-xs text-orange-700 dark:text-orange-300 rounded-lg bg-orange-50 dark:bg-orange-950/30 px-3 py-2">
                          Hay solape (propio o con el equipo). Revisa la cobertura arriba antes de aprobar.
                        </p>
                      ) : null}
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
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Cargados</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Usados</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Disponibles</th>
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
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums">{formatQtyEs(m.allowed)}</td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums font-medium text-amber-600 dark:text-amber-400">{formatQtyEs(m.used)}</td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{formatQtyEs(m.requestable)}</td>
                    <td className="px-4 py-2.5 text-center text-sm tabular-nums">{m.pendingCount ? formatQtyEs(m.pendingCount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!settingsOnly ? (
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
                      <td className="px-4 py-2.5 text-sm tabular-nums text-gray-600 dark:text-gray-300">{formatDateRangeEs(r.startDate, r.endDate)}</td>
                      <td className="px-4 py-2.5 text-center text-sm font-bold tabular-nums">{formatQtyEs(r.totalDays)}</td>
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
      ) : null}
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

function VacationPolicyCard({
  settings,
  saving,
  onSave,
  leaveLabels,
}: {
  settings: VacationSettings;
  saving: boolean;
  onSave: (next: VacationSettings) => Promise<void>;
  leaveLabels: Record<LeaveType, string>;
}) {
  const [draft, setDraft] = useState({
    dayBasis: settings.dayBasis === 'business' ? 'business' : 'natural',
    maxConsecutiveDays: Number(settings.maxConsecutiveDays ?? 14),
    onlyWeekdays: Boolean(settings.onlyWeekdays),
    minNoticeDays: Number(settings.minNoticeDays ?? 7),
    minTenureMonthsForVacation: Number(settings.minTenureMonthsForVacation ?? 2),
    accrualMode: settings.accrualMode === 'annual_fixed' ? 'annual_fixed' : 'monthly',
    daysPerMonth: Number(settings.daysPerMonth ?? 2.5),
    defaultDaysPerYear: Number(settings.defaultDaysPerYear ?? 30),
    allowRequestUnaccrued: settings.allowRequestUnaccrued === true,
    leaveTypePolicies: mergeLeaveTypePolicies(settings.leaveTypePolicies),
  });

  useEffect(() => {
    setDraft({
      dayBasis: settings.dayBasis === 'business' ? 'business' : 'natural',
      maxConsecutiveDays: Number(settings.maxConsecutiveDays ?? 14),
      onlyWeekdays: Boolean(settings.onlyWeekdays),
      minNoticeDays: Number(settings.minNoticeDays ?? 7),
      minTenureMonthsForVacation: Number(settings.minTenureMonthsForVacation ?? 2),
      accrualMode: settings.accrualMode === 'annual_fixed' ? 'annual_fixed' : 'monthly',
      daysPerMonth: Number(settings.daysPerMonth ?? 2.5),
      defaultDaysPerYear: Number(settings.defaultDaysPerYear ?? 30),
      allowRequestUnaccrued: settings.allowRequestUnaccrued === true,
      leaveTypePolicies: mergeLeaveTypePolicies(settings.leaveTypePolicies),
    });
  }, [settings._id, settings._rev, settings.updatedAt]);

  const policyRows = (Object.keys(leaveLabels) as LeaveType[]).filter((id) => leaveLabels[id]);

  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-950/20 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-violet-600" />
          Política RRHH (base España + tu ajuste)
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Predeterminado ET: 30 días naturales/año (≈ 2,5/mes), solo saldo ya generado. Cupos por tipo (matrimonio 15, etc.) editables.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
          Cómo contar días
          <select
            value={draft.dayBasis}
            onChange={(e) => setDraft((p) => ({ ...p, dayBasis: e.target.value as 'natural' | 'business' }))}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
          >
            <option value="natural">Naturales (recomendado ES)</option>
            <option value="business">Laborables (lun–vie)</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
          Máx. días seguidos (0 = sin límite)
          <select
            value={String(draft.maxConsecutiveDays)}
            onChange={(e) => setDraft((p) => ({ ...p, maxConsecutiveDays: Number(e.target.value) }))}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
          >
            <option value="0">Sin límite</option>
            <option value="7">7 días (≈ 1 semana)</option>
            <option value="14">14 días (≈ 2 semanas)</option>
            <option value="21">21 días (≈ 3 semanas)</option>
            <option value="30">30 días</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
          Antelación mínima (días)
          <input
            type="number"
            min={0}
            max={90}
            value={draft.minNoticeDays}
            onChange={(e) => setDraft((p) => ({ ...p, minNoticeDays: Math.max(0, Number(e.target.value) || 0) }))}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
          Alta mínima para pedir vacaciones
          <select
            value={String(draft.minTenureMonthsForVacation)}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                minTenureMonthsForVacation: Math.max(0, Number(e.target.value) || 0),
              }))
            }
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
          >
            <option value="0">Sin mínimo</option>
            <option value="2">2 meses desde el alta</option>
            <option value="3">3 meses desde el alta</option>
            <option value="4">4 meses desde el alta</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
          Devengo
          <select
            value={draft.accrualMode}
            onChange={(e) => setDraft((p) => ({ ...p, accrualMode: e.target.value as 'monthly' | 'annual_fixed' }))}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
          >
            <option value="monthly">Mensual (carga al completar cada mes de alta)</option>
            <option value="annual_fixed">Cupo anual (repartido por meses completos)</option>
          </select>
        </label>
        {draft.accrualMode === 'monthly' ? (
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
            Días por mes
            <input
              type="number"
              step="0.1"
              min={0}
              max={5}
              value={draft.daysPerMonth}
              onChange={(e) => setDraft((p) => ({ ...p, daysPerMonth: Number(e.target.value) || 0 }))}
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
            />
          </label>
        ) : (
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
            Días por año
            <input
              type="number"
              min={0}
              max={60}
              value={draft.defaultDaysPerYear}
              onChange={(e) => setDraft((p) => ({ ...p, defaultDaysPerYear: Number(e.target.value) || 0 }))}
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900"
            />
          </label>
        )}
        <label className="flex items-start gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200 mt-5">
          <input
            type="checkbox"
            checked={draft.onlyWeekdays}
            onChange={(e) => setDraft((p) => ({ ...p, onlyWeekdays: e.target.checked }))}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>Solo días laborables (lun–vie) en vacaciones</span>
        </label>
        <label className="flex items-start gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200 mt-5 sm:col-span-2">
          <input
            type="checkbox"
            checked={!draft.allowRequestUnaccrued}
            onChange={(e) => setDraft((p) => ({ ...p, allowRequestUnaccrued: !e.target.checked }))}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>
            Solo pedir días ya generados (recomendado). Si lo desactivas, el trabajador puede pedir por encima del saldo y RRHH decide.
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-violet-200/80 bg-white/70 dark:border-violet-900 dark:bg-gray-900/40 overflow-hidden">
        <div className="px-3 py-2 border-b border-violet-100 dark:border-violet-900/50">
          <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Cupos por tipo de solicitud</p>
          <p className="text-[11px] text-gray-500">0 = sin tope. Matrimonio 15 y duelo 2 vienen de base legal orientativa.</p>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {policyRows.map((id) => {
            const row = draft.leaveTypePolicies[id] || { maxDays: 0, enabled: true };
            return (
              <div key={id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-200 min-w-[9rem]">
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        leaveTypePolicies: {
                          ...p.leaveTypePolicies,
                          [id]: { ...p.leaveTypePolicies[id], enabled: e.target.checked },
                        },
                      }))
                    }
                    className="rounded border-gray-300"
                  />
                  {leaveLabels[id]}
                </label>
                <label className="flex items-center gap-1 text-[11px] text-gray-500 ml-auto">
                  Máx. días
                  <input
                    type="number"
                    min={0}
                    max={366}
                    value={Number(row.maxDays ?? 0)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        leaveTypePolicies: {
                          ...p.leaveTypePolicies,
                          [id]: {
                            ...p.leaveTypePolicies[id],
                            maxDays: Math.max(0, Number(e.target.value) || 0),
                          },
                        },
                      }))
                    }
                    className="w-16 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm tabular-nums"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void onSave({
              ...settings,
              dayBasis: draft.dayBasis as 'natural' | 'business',
              maxConsecutiveDays: draft.maxConsecutiveDays,
              onlyWeekdays: draft.onlyWeekdays,
              minNoticeDays: draft.minNoticeDays,
              minTenureMonthsForVacation: draft.minTenureMonthsForVacation,
              accrualMode: draft.accrualMode as 'monthly' | 'annual_fixed',
              daysPerMonth: draft.daysPerMonth,
              defaultDaysPerYear: draft.defaultDaysPerYear,
              allowRequestUnaccrued: draft.allowRequestUnaccrued,
              leaveTypePolicies: draft.leaveTypePolicies,
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar política'}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: VacationStatus; label: string }) {
  const cls =
    status === 'approved'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : status === 'rejected'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : status === 'cancelled'
          ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

export { countBusinessDays };
