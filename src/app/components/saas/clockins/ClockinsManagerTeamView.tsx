import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Monitor,
  MoreHorizontal,
  Pencil,
  Search,
  Smartphone,
  Timer,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { TableColHeader, applySortToArray, type SortState } from '../TableColHeader';
import type { ActiveMember, DailySummary, EnrichedClockinRecord } from '../../../lib/clockinsApi';
import {
  adjustClockinViaApi,
  fetchClockins,
  formatMinutes,
  getTimeDiffMinutes,
} from '../../../lib/clockinsApi';
import { resolveClockinMemberName, ROLE_BADGE, STATUS_ORDER } from '../../../lib/clockinsDisplay';
import { sessionTurnLabel } from '../../../lib/clockinHistoryUtils';

interface Props {
  businessId: string;
  records: EnrichedClockinRecord[];
  selectedDate: string;
  todayStr: string;
  activeMembers: ActiveMember[];
  totalHours: number;
  dailySummary: DailySummary | null;
  dailySummaryLoading: boolean;
  fmtTime: (iso: string) => string;
  isAdmin: boolean;
  searchText: string;
  onSearchChange: (v: string) => void;
  filterRole: string;
  onFilterRoleChange: (v: string) => void;
  availableRoles: string[];
  onShiftDate: (days: number) => void;
  onDateChange: (date: string) => void;
  onRecordsUpdate: () => void;
  onOpenManualClockin: () => void;
  onEditSchedule: (memberId: string) => void;
  onViewMemberHistory: (memberId: string) => void;
  businessMembers?: { user_id: string; fullName?: string; email?: string; role?: string }[];
  STATUS: Record<string, { label: string; color: string; dot: string }>;
}

const ENTRY_LABELS: Record<string, string> = {
  clock_in: 'Entrada',
  break_start: 'Inicio descanso',
  break_end: 'Fin descanso',
  clock_out: 'Salida',
};

const ENTRY_DOT: Record<string, string> = {
  clock_in: 'bg-green-500',
  break_start: 'bg-amber-500',
  break_end: 'bg-amber-400',
  clock_out: 'bg-red-500',
};

function TimeDiffBadge({ diff }: { diff: number | null }) {
  if (diff === null || diff === 0) return null;
  const isLate = diff > 0;
  return (
    <span
      className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded ${
        isLate
          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
      }`}
    >
      {isLate ? '+' : ''}
      {diff}m
    </span>
  );
}

function fmtHoursShort(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function ClockinsManagerTeamView({
  businessId,
  records,
  selectedDate,
  todayStr,
  activeMembers,
  totalHours,
  dailySummary,
  dailySummaryLoading,
  fmtTime,
  searchText,
  onSearchChange,
  filterRole,
  onFilterRoleChange,
  availableRoles,
  onShiftDate,
  onDateChange,
  onRecordsUpdate,
  onOpenManualClockin,
  onEditSchedule,
  onViewMemberHistory,
  businessMembers = [],
  STATUS,
}: Props) {
  const [sortState, setSortState] = useState<SortState>({ key: 'status', dir: 'asc' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByMember, setHistoryByMember] = useState<Record<string, EnrichedClockinRecord[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEntryIdx, setEditEntryIdx] = useState(-1);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const dateLabel = useMemo(
    () =>
      new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [selectedDate],
  );

  const visibleRecords = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return records.filter((r) => {
      if (filterRole !== 'all' && r.member_role !== filterRole) return false;
      const name = resolveClockinMemberName(r, businessMembers).toLowerCase();
      if (needle && !name.includes(needle) && !r.member_email?.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [records, searchText, filterRole, businessMembers]);

  const sortedRecords = useMemo(
    () =>
      applySortToArray(visibleRecords, sortState, (r, key) => {
        if (key === 'member') return resolveClockinMemberName(r, businessMembers);
        if (key === 'status') return STATUS_ORDER[r.status] ?? 9;
        if (key === 'net') return r.totalMinutes;
        if (key === 'role') return r.member_role || '';
        return '';
      }),
    [visibleRecords, sortState, businessMembers],
  );

  const insightText = useMemo(() => {
    if (!dailySummary) return null;
    const realClockins = visibleRecords.filter((r) => !r.roster_placeholder && r.entries?.length);
    const parts: string[] = [];
    if (dailySummary.scheduled > 0) {
      parts.push(`${dailySummary.clocked} de ${dailySummary.scheduled} con turno han fichado`);
    } else if (realClockins.length > 0) {
      parts.push(`${realClockins.length} ${realClockins.length === 1 ? 'fichaje real' : 'fichajes reales'} hoy`);
    }
    if (activeMembers.length > 0) {
      parts.push(`${activeMembers.length} ${activeMembers.length === 1 ? 'persona trabajando' : 'personas trabajando'} ahora`);
    }
    if (dailySummary.noShow > 0) {
      parts.push(`${dailySummary.noShow} ${dailySummary.noShow === 1 ? 'ausencia' : 'ausencias'} sin fichar`);
    }
    if (dailySummary.late > 0) {
      parts.push(`${dailySummary.late} ${dailySummary.late === 1 ? 'retraso' : 'retrasos'}`);
    }
    if (dailySummary.totalWorkedMinutes > 0) {
      parts.push(`${fmtHoursShort(dailySummary.totalWorkedMinutes)} trabajados en total`);
    }
    return parts.length ? parts.join(' · ') : 'Sin actividad registrada hoy';
  }, [dailySummary, activeMembers.length, visibleRecords]);

  const loadMemberHistory = useCallback(
    async (memberId: string) => {
      if (!businessId || !memberId) return;
      setHistoryLoading(memberId);
      try {
        const all = await fetchClockins(businessId, { memberId, recordsOnly: true });
        // Incluye hoy (antes se excluía selectedDate y el CEO no veía la sesión cerrada).
        const recent = all
          .filter((r) => (r.entries?.length || 0) > 0)
          .sort((a, b) =>
            b.date.localeCompare(a.date)
            || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
          )
          .slice(0, 14);
        setHistoryByMember((prev) => ({ ...prev, [memberId]: recent }));
      } catch {
        setHistoryByMember((prev) => ({ ...prev, [memberId]: prev[memberId] || [] }));
      } finally {
        setHistoryLoading(null);
      }
    },
    [businessId],
  );

  // Si cambia el día, invalidar caché de “Últimos días”.
  useEffect(() => {
    setHistoryByMember({});
  }, [selectedDate]);

  const toggleExpand = (record: EnrichedClockinRecord) => {
    const next = expandedId === record._id ? null : record._id;
    setExpandedId(next);
    if (next) loadMemberHistory(record.member_id);
  };

  const startEdit = (record: EnrichedClockinRecord, entryIdx: number) => {
    const entry = record.entries[entryIdx];
    const time = new Date(entry.time);
    setEditingId(record._id);
    setEditEntryIdx(entryIdx);
    setEditTimeValue(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
    setMenuOpenId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditEntryIdx(-1);
    setEditTimeValue('');
  };

  const saveEdit = async (record: EnrichedClockinRecord) => {
    if (!editTimeValue || adjusting) return;
    setAdjusting(true);
    try {
      const [h, m] = editTimeValue.split(':').map(Number);
      const newTime = new Date(`${record.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      await adjustClockinViaApi(record.business_id, record._id, editEntryIdx, newTime.toISOString());
      cancelEdit();
      onRecordsUpdate();
    } catch {
      /* silencioso */
    } finally {
      setAdjusting(false);
    }
  };

  const statusFilterOptions = useMemo(
    () =>
      Object.entries(STATUS).map(([value, { label }]) => ({ value, label })),
    [STATUS],
  );

  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const filteredSorted = useMemo(() => {
    if (statusFilter.size === 0) return sortedRecords;
    return sortedRecords.filter((r) => statusFilter.has(r.status));
  }, [sortedRecords, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Cabecera: fecha + KPIs del día */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-700/80">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onShiftDate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Día anterior"
            >
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
            <button
              type="button"
              onClick={() => onShiftDate(1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Día siguiente"
            >
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            {selectedDate !== todayStr && (
              <button
                type="button"
                onClick={() => onDateChange(todayStr)}
                className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg hover:bg-amber-100 transition-colors"
              >
                Hoy
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900 dark:text-white capitalize">{dateLabel}</h2>
            {dailySummaryLoading ? (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando resumen…
              </p>
            ) : insightText ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{insightText}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpenManualClockin}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Fichar
          </button>
        </div>

        {dailySummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-700/80">
            <KpiCell
              icon={<UserCheck className="w-4 h-4 text-blue-500" />}
              label="Fichados"
              value={dailySummary.scheduled > 0 ? `${dailySummary.clocked}/${dailySummary.scheduled}` : String(dailySummary.clocked)}
            />
            <KpiCell
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              label="Puntuales"
              value={String(dailySummary.onTime)}
            />
            <KpiCell
              icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
              label="Retrasos"
              value={String(dailySummary.late)}
              sub={dailySummary.avgLateMinutes > 0 ? `≈${dailySummary.avgLateMinutes} min` : undefined}
            />
            <KpiCell
              icon={<UserX className="w-4 h-4 text-red-500" />}
              label="Sin fichar"
              value={String(dailySummary.noShow)}
              alert={dailySummary.noShow > 0}
            />
            <KpiCell
              icon={<Timer className="w-4 h-4 text-violet-500" />}
              label="Horas hoy"
              value={fmtHoursShort(totalHours)}
            />
            <KpiCell
              icon={<UsersPulse count={activeMembers.length} />}
              label="Activos ahora"
              value={String(activeMembers.length)}
              sub={activeMembers.length > 0 ? activeMembers.slice(0, 3).map((a) => a.member_name.split(' ')[0]).join(', ') : undefined}
            />
          </div>
        )}
      </div>

      {/* Barra de búsqueda compacta */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar miembro…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        {availableRoles.length > 0 && (
          <select
            value={filterRole}
            onChange={(e) => onFilterRoleChange(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Todos los roles</option>
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filteredSorted.length} fichajes</span>
      </div>

      {/* Tabla principal */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {filteredSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CalendarDays className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">
              {records.length === 0 ? 'No hay miembros en el equipo' : 'Nadie coincide con la búsqueda'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40">
                  <th className="w-8 px-2 py-3" />
                  <TableColHeader label="Miembro" sortKey="member" sortState={sortState} onSort={setSortState} />
                  <TableColHeader
                    label="Estado"
                    sortKey="status"
                    sortState={sortState}
                    onSort={setSortState}
                    filterOptions={statusFilterOptions}
                    filterSelected={statusFilter}
                    onFilterToggle={(v) =>
                      setStatusFilter((s) => {
                        const n = new Set(s);
                        if (n.has(v)) n.delete(v);
                        else n.add(v);
                        return n;
                      })
                    }
                    onFilterClear={() => setStatusFilter(new Set())}
                  />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    Horario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Entrada
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Salida
                  </th>
                  <TableColHeader label="Jornada" sortKey="net" sortState={sortState} onSort={setSortState} align="right" />
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filteredSorted.map((r) => {
                  const memberLabel = resolveClockinMemberName(r, businessMembers);
                  const ci = r.entries.find((e) => e.type === 'clock_in');
                  const co = r.entries.find((e) => e.type === 'clock_out');
                  const ciIdx = r.entries.findIndex((e) => e.type === 'clock_in');
                  const coIdx = r.entries.findIndex((e) => e.type === 'clock_out');
                  const sc = STATUS[r.status] || STATUS.offline;
                  const ciDiff = ci ? getTimeDiffMinutes(ci, r) : null;
                  const coDiff = co ? getTimeDiffMinutes(co, r) : null;
                  const isExpanded = expandedId === r._id;
                  const turnLabel = sessionTurnLabel(r);
                  const isEditingCi = editingId === r._id && editEntryIdx === ciIdx;
                  const isEditingCo = editingId === r._id && editEntryIdx === coIdx;
                  const schedule =
                    r.scheduled_start && r.scheduled_end
                      ? `${r.scheduled_start} – ${r.scheduled_end}`
                      : r.scheduled_start || r.scheduled_end || '—';
                  const history = historyByMember[r.member_id] || [];

                  return (
                    <React.Fragment key={r._id}>
                      <tr
                        className={`group transition-colors ${isExpanded ? 'bg-blue-50/40 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'}`}
                      >
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(r)}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            aria-expanded={isExpanded}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(r)}
                            className="flex items-center gap-3 text-left min-w-0"
                          >
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                r.status === 'active'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                  : r.status === 'break'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    : r.status === 'offline'
                                      ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {memberLabel.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {memberLabel}
                                {turnLabel ? (
                                  <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                                    {turnLabel}
                                  </span>
                                ) : null}
                              </p>
                              <span
                                className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_BADGE[r.member_role || 'Usuario'] || ROLE_BADGE.Usuario}`}
                              >
                                {r.member_role || 'Usuario'}
                              </span>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${r.status === 'active' ? 'animate-pulse' : ''}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                          {schedule}
                        </td>
                        <td className="px-4 py-3">
                          {isEditingCi ? (
                            <EditTimeInline
                              value={editTimeValue}
                              onChange={setEditTimeValue}
                              onSave={() => saveEdit(r)}
                              onCancel={cancelEdit}
                              adjusting={adjusting}
                            />
                          ) : (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                {ci ? fmtTime(ci.time) : '—'}
                              </span>
                              <TimeDiffBadge diff={ciDiff} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditingCo ? (
                            <EditTimeInline
                              value={editTimeValue}
                              onChange={setEditTimeValue}
                              onSave={() => saveEdit(r)}
                              onCancel={cancelEdit}
                              adjusting={adjusting}
                            />
                          ) : (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                {co ? fmtTime(co.time) : '—'}
                              </span>
                              <TimeDiffBadge diff={coDiff} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                            {formatMinutes(r.totalMinutes)}
                          </p>
                          {r.breakMinutes > 0 && (
                            <p className="text-[10px] text-gray-400 tabular-nums">−{formatMinutes(r.breakMinutes)} desc.</p>
                          )}
                        </td>
                        <td className="px-2 py-3 relative">
                          {!r.roster_placeholder && (
                            <div ref={menuOpenId === r._id ? menuRef : undefined}>
                              <button
                                type="button"
                                onClick={() => setMenuOpenId(menuOpenId === r._id ? null : r._id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              {menuOpenId === r._id && (
                                <div className="absolute right-2 top-full mt-1 z-30 w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 text-sm">
                                  {ci && ciIdx >= 0 && (
                                    <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => startEdit(r, ciIdx)}>
                                      Ajustar entrada
                                    </MenuItem>
                                  )}
                                  {co && coIdx >= 0 && (
                                    <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => startEdit(r, coIdx)}>
                                      Ajustar salida
                                    </MenuItem>
                                  )}
                                  <MenuItem icon={<Clock className="w-3.5 h-3.5" />} onClick={() => { setMenuOpenId(null); onViewMemberHistory(r.member_id); }}>
                                    Historial completo
                                  </MenuItem>
                                  <MenuItem icon={<CalendarDays className="w-3.5 h-3.5" />} onClick={() => { setMenuOpenId(null); onEditSchedule(r.member_id); }}>
                                    Editar horario
                                  </MenuItem>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-gray-50/60 dark:bg-gray-900/30">
                          <td colSpan={8} className="px-4 py-4">
                            <ExpandedMemberDetail
                              record={r}
                              memberLabel={memberLabel}
                              fmtTime={fmtTime}
                              history={history}
                              historyLoading={historyLoading === r.member_id}
                              onViewFullHistory={() => onViewMemberHistory(r.member_id)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCell({
  icon,
  label,
  value,
  sub,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${alert ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${alert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
    </div>
  );
}

function UsersPulse({ count }: { count: number }) {
  return (
    <span className="relative flex h-4 w-4">
      {count > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40" />}
      <span className={`relative inline-flex rounded-full h-4 w-4 ${count > 0 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
    </span>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60"
    >
      {icon}
      {children}
    </button>
  );
}

function EditTimeInline({
  value,
  onChange,
  onSave,
  onCancel,
  adjusting,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  adjusting: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-1.5 py-0.5 text-sm border border-blue-300 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24"
      />
      <button type="button" onClick={onSave} disabled={adjusting} className="p-0.5 text-green-600 hover:text-green-700">
        {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button type="button" onClick={onCancel} className="p-0.5 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ExpandedMemberDetail({
  record: r,
  memberLabel,
  fmtTime,
  history,
  historyLoading,
  onViewFullHistory,
}: {
  record: EnrichedClockinRecord;
  memberLabel: string;
  fmtTime: (iso: string) => string;
  history: EnrichedClockinRecord[];
  historyLoading: boolean;
  onViewFullHistory: () => void;
}) {
  const device = (r as { device_type?: string }).device_type;
  const geo = (r as { geo?: { latitude: number; longitude: number } }).geo;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Jornada de hoy — {memberLabel}
        </h4>
        {r.entries.length === 0 ? (
          <p className="text-sm text-gray-500">Sin fichajes registrados hoy.</p>
        ) : (
          <div className="space-y-1.5">
            {r.entries.map((entry, i) => {
              const diff = getTimeDiffMinutes(entry, r);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ENTRY_DOT[entry.type] || 'bg-gray-400'}`} />
                  <span className="text-xs font-medium text-gray-500 w-28 shrink-0">{ENTRY_LABELS[entry.type] || entry.type}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{fmtTime(entry.time)}</span>
                  <TimeDiffBadge diff={diff} />
                </div>
              );
            })}
          </div>
        )}
        {(device || geo || r.notes) && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {device === 'mobile' && (
              <span className="inline-flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-blue-500" /> Móvil
              </span>
            )}
            {device === 'desktop' && (
              <span className="inline-flex items-center gap-1">
                <Monitor className="w-3.5 h-3.5" /> PC
              </span>
            )}
            {geo && (
              <a
                href={`https://maps.google.com/?q=${geo.latitude},${geo.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                <MapPin className="w-3.5 h-3.5" /> Ver ubicación
              </a>
            )}
            {r.notes && <span className="italic">Nota: {r.notes}</span>}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Últimos días</h4>
          <button type="button" onClick={onViewFullHistory} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Ver todo el historial →
          </button>
        </div>
        {historyLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial…
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Sin fichajes anteriores recientes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase text-gray-400">
                <th className="text-left py-1.5 font-semibold">Fecha</th>
                <th className="text-left py-1.5 font-semibold">Entrada</th>
                <th className="text-left py-1.5 font-semibold">Salida</th>
                <th className="text-right py-1.5 font-semibold">Horas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {history.map((h) => {
                const hi = h.entries.find((e) => e.type === 'clock_in');
                const ho = h.entries.find((e) => e.type === 'clock_out');
                return (
                  <tr key={h._id} className="text-gray-700 dark:text-gray-300">
                    <td className="py-2 font-medium">
                      {new Date(`${h.date}T12:00:00`).toLocaleDateString('es-ES', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="py-2 tabular-nums">{hi ? fmtTime(hi.time) : '—'}</td>
                    <td className="py-2 tabular-nums">{ho ? fmtTime(ho.time) : '—'}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatMinutes(h.totalMinutes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
