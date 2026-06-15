import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Users,
  User,
  Clock,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import {
  type ClockinRecord,
  type ActiveMember,
  listClockins,
  fetchActiveNow,
  formatMinutes,
  getDisplayTime,
} from '../../../lib/clockinsApi';
import {
  dateDaysAgo,
  filterRecordsInMonth,
  filterRecordsSince,
  formatHoursShort,
  sumBreakMinutes,
  sumWorkedMinutes,
  todayDateStr,
  sessionTurnLabel,
  sortClockinsByClockIn,
} from '../../../lib/clockinHistoryUtils';

type MainTab = 'mine' | 'team';
type RangeTab = 'week' | 'month' | 'all';
type TeamRangeTab = 'today' | 'week';

const ENTRY_LABELS: Record<string, string> = {
  clock_in: 'Entrada',
  break_start: 'Inicio descanso',
  break_end: 'Fin descanso',
  clock_out: 'Salida',
};

interface ClockinHistoryPanelProps {
  businessId: string;
  memberId: string;
  /** Si true, pestaña Equipo con detalle completo (gerente). */
  managerView?: boolean;
}

function RecordRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ClockinRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ciEntry = entry.entries.find((e) => e.type === 'clock_in');
  const coEntry = entry.entries.find((e) => e.type === 'clock_out');
  const ciTime = ciEntry
    ? new Date(getDisplayTime(ciEntry, entry)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const coTime = coEntry
    ? new Date(getDisplayTime(coEntry, entry)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const dateLabel = new Date(`${entry.date}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
          <CalendarDays className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{dateLabel}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {ciTime} → {coTime}
            {entry.breakMinutes > 0 ? ` · descanso ${entry.breakMinutes} min` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatMinutes(entry.totalMinutes)}</p>
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Completado</span>
        </div>
      </button>
      {expanded ? (
        <div className="px-4 pb-4 pl-14 space-y-2">
          {entry.entries.map((e, idx) => (
            <div key={`${e.type}-${idx}`} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium w-28">{ENTRY_LABELS[e.type] || e.type}</span>
              <span>
                {new Date(getDisplayTime(e, entry)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {e.geo ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600">
                  <MapPin className="w-3 h-3" /> GPS
                </span>
              ) : null}
            </div>
          ))}
          {entry.scheduled_start ? (
            <p className="text-[11px] text-gray-400 pt-1">
              Turno planificado: {entry.scheduled_start}
              {entry.scheduled_end ? ` – ${entry.scheduled_end}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TeamMemberCard({
  name,
  record,
  active,
  turnLabel,
}: {
  name: string;
  record?: ClockinRecord | null;
  active?: ActiveMember | null;
  turnLabel?: string | null;
}) {
  const status = active?.status || record?.status;
  const isWorking = status === 'active';
  const isBreak = status === 'break';
  const ci = record?.entries.find((e) => e.type === 'clock_in');
  const ciTime = ci
    ? new Date(getDisplayTime(ci, record!)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          isWorking
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : isBreak
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : record?.status === 'completed'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        }`}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {name}
          {turnLabel ? (
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
              {turnLabel}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isWorking ? 'Trabajando ahora' : isBreak ? 'En descanso' : record?.status === 'completed' ? 'Jornada cerrada' : 'Sin fichar hoy'}
          {ciTime ? ` · entrada ${ciTime}` : ''}
        </p>
      </div>
      {isWorking ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      ) : isBreak ? (
        <PauseCircle className="w-5 h-5 text-amber-500 shrink-0" />
      ) : record?.status === 'completed' ? (
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{formatMinutes(record.totalMinutes)}</span>
      ) : (
        <Clock className="w-4 h-4 text-gray-300 shrink-0" />
      )}
    </div>
  );
}

export function ClockinHistoryPanel({ businessId, memberId, managerView = false }: ClockinHistoryPanelProps) {
  const [mainTab, setMainTab] = useState<MainTab>(managerView ? 'team' : 'mine');
  const [rangeTab, setRangeTab] = useState<RangeTab>('week');
  const [teamRangeTab, setTeamRangeTab] = useState<TeamRangeTab>('today');
  const [monthOffset, setMonthOffset] = useState(0);
  const [myRecords, setMyRecords] = useState<ClockinRecord[]>([]);
  const [teamToday, setTeamToday] = useState<ClockinRecord[]>([]);
  const [teamWeek, setTeamWeek] = useState<ClockinRecord[]>([]);
  const [activeNow, setActiveNow] = useState<ActiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [mine, todayAll, weekAll, active] = await Promise.all([
        memberId ? listClockins(businessId, { memberId }) : Promise.resolve([]),
        listClockins(businessId, { date: todayDateStr() }),
        listClockins(businessId).then((all) =>
          filterRecordsSince(
            all.filter((r) => r.status === 'completed'),
            dateDaysAgo(7),
          ),
        ),
        fetchActiveNow(businessId).catch(() => [] as ActiveMember[]),
      ]);
      setMyRecords(sortClockinsByClockIn(mine.filter((r) => r.status === 'completed')));
      setTeamToday(sortClockinsByClockIn(todayAll.filter((r) => (r.entries?.length || 0) > 0)));
      setTeamWeek(weekAll);
      setActiveNow(active);
    } finally {
      setLoading(false);
    }
  }, [businessId, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthOffset);
    return d;
  }, [monthOffset]);

  const filteredMine = useMemo(() => {
    const completed = myRecords.filter((r) => r.status === 'completed');
    if (rangeTab === 'week') {
      return filterRecordsSince(completed, dateDaysAgo(7)).sort((a, b) => b.date.localeCompare(a.date));
    }
    if (rangeTab === 'month') {
      return filterRecordsInMonth(completed, monthDate.getFullYear(), monthDate.getMonth()).sort((a, b) =>
        b.date.localeCompare(a.date),
      );
    }
    return [...completed].sort((a, b) => b.date.localeCompare(a.date));
  }, [myRecords, rangeTab, monthDate]);

  const mineStats = useMemo(
    () => ({
      days: new Set(filteredMine.map((r) => r.date)).size,
      sessions: filteredMine.length,
      worked: sumWorkedMinutes(filteredMine),
      breaks: sumBreakMinutes(filteredMine),
    }),
    [filteredMine],
  );

  const activeByMember = useMemo(() => new Map(activeNow.map((a) => [a.member_id, a])), [activeNow]);

  const teamRows = useMemo(() => {
    return teamToday
      .map((record) => ({
        id: record._id,
        memberId: record.member_id,
        name: record.member_name,
        record,
        active: activeByMember.get(record.member_id) || null,
        turnLabel: sessionTurnLabel(record),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  }, [teamToday, activeByMember]);

  const teamWeekGrouped = useMemo(() => {
    const map = new Map<string, { name: string; minutes: number; dates: Set<string> }>();
    for (const r of teamWeek) {
      const id = r.member_id;
      const prev = map.get(id) || { name: r.member_name, minutes: 0, dates: new Set<string>() };
      prev.minutes += r.totalMinutes || 0;
      if (r.date) prev.dates.add(r.date);
      map.set(id, prev);
    }
    return [...map.entries()]
      .map(([id, data]) => ({ id, name: data.name, minutes: data.minutes, days: data.dates.size }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [teamWeek]);

  const monthLabel = monthDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Historial de fichajes</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Actualizar
          </button>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-xl">
          <button
            type="button"
            onClick={() => setMainTab('mine')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-colors ${
              mainTab === 'mine'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <User className="w-4 h-4" />
            Mis fichajes
          </button>
          <button
            type="button"
            onClick={() => setMainTab('team')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-colors ${
              mainTab === 'team'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            {managerView ? 'Equipo' : 'Equipo hoy'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        </div>
      ) : mainTab === 'mine' ? (
        <>
          <div className="px-4 pt-3 flex flex-wrap gap-2">
            {(['week', 'month', 'all'] as RangeTab[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setRangeTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  rangeTab === id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                {id === 'week' ? 'Esta semana' : id === 'month' ? 'Este mes' : 'Todo'}
              </button>
            ))}
            {rangeTab === 'month' ? (
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" onClick={() => setMonthOffset((o) => o + 1)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium capitalize min-w-[100px] text-center">{monthLabel}</span>
                <button
                  type="button"
                  disabled={monthOffset === 0}
                  onClick={() => setMonthOffset((o) => Math.max(0, o - 1))}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2 p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3 text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{mineStats.days}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Días</p>
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatHoursShort(mineStats.worked)}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Trabajado</p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatHoursShort(mineStats.breaks)}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Descanso</p>
            </div>
          </div>

          <div>
            {filteredMine.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">No hay fichajes en este periodo</p>
            ) : (
              filteredMine.map((entry) => (
                <RecordRow
                  key={entry._id}
                  entry={entry}
                  expanded={expandedId === entry._id}
                  onToggle={() => setExpandedId((id) => (id === entry._id ? null : entry._id))}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <div className="p-4 space-y-3">
          {managerView ? (
            <div className="flex gap-2">
              {(['today', 'week'] as TeamRangeTab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTeamRangeTab(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    teamRangeTab === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {id === 'today' ? 'Hoy' : 'Esta semana'}
                </button>
              ))}
            </div>
          ) : null}

          {teamRangeTab === 'week' && managerView ? (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Horas del equipo · últimos 7 días · {teamWeekGrouped.length} persona
                {teamWeekGrouped.length !== 1 ? 's' : ''}
              </p>
              {teamWeekGrouped.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Sin fichajes esta semana</p>
              ) : (
                teamWeekGrouped.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300 shrink-0">
                      {row.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{row.name}</p>
                      <p className="text-xs text-gray-500">{row.days} día{row.days !== 1 ? 's' : ''} fichados</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatHoursShort(row.minutes)}</span>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Estado del equipo hoy · {teamRows.length} fichaje{teamRows.length !== 1 ? 's' : ''}
              </p>
              {teamRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Nadie ha fichado hoy todavía</p>
              ) : (
                teamRows.map((row) => (
                  <TeamMemberCard
                    key={row.id}
                    name={row.name}
                    record={row.record}
                    active={row.active}
                    turnLabel={row.turnLabel}
                  />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
