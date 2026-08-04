import { Store, Clock, MapPin, CalendarRange } from 'lucide-react';
import type { WorkCenter } from '../../../lib/workCentersApi';
import type { DayShift, ScheduleTemplate } from '../../../lib/schedulesApi';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  getMonday,
} from '../../../lib/schedulesApi';
import {
  formatStoreHoursToday,
  getScheduleDayKeyForDate,
  listStoreHoursWeek,
  type StoreHoursToday,
} from '../../../lib/workerStoreHours';
import { SCHEDULE_DAY_LABELS_ES } from '../../../lib/businessHoursUtils';
import { useBusiness } from '../../../context/BusinessContext';
import { getHrLocationCopy } from '../../../lib/retailLocationCopy';

interface WorkerStoreScheduleCardProps {
  workCenter: WorkCenter | null;
  storeLabel?: string;
  /** true si ya hay tienda en la invitación / Equipo (aunque aún no cargue el horario). */
  hasAssignment?: boolean;
  compact?: boolean;
  /** Horario de tienda ya calculado sobre el centro real (no stub). */
  storeHoursToday?: StoreHoursToday | null;
  /** Turno personal de hoy (Horarios / plantilla de invitación). */
  personalShiftToday?: DayShift | null;
  hasPersonalSchedule?: boolean;
  personalDayOff?: boolean;
  memberSchedule?: ScheduleTemplate | null;
  scheduleLoading?: boolean;
  storeResolving?: boolean;
}

function shiftLabel(shift: DayShift | null | undefined): string {
  if (!shift?.enabled) return 'Libre';
  const start = String(shift.start || '').trim();
  const end = String(shift.end || '').trim();
  if (!start || !end) return 'Turno';
  return `${start} – ${end}`;
}

export function WorkerStoreScheduleCard({
  workCenter,
  storeLabel,
  hasAssignment = false,
  compact = false,
  storeHoursToday: storeHoursProp,
  personalShiftToday = null,
  hasPersonalSchedule = false,
  personalDayOff = false,
  memberSchedule = null,
  scheduleLoading = false,
  storeResolving = false,
}: WorkerStoreScheduleCardProps) {
  const { currentBusiness } = useBusiness();
  const hrCopy = getHrLocationCopy(currentBusiness?.businessType);
  const todayKey = getScheduleDayKeyForDate();
  const storeToday = storeHoursProp || formatStoreHoursToday(workCenter);
  const storeWeek = listStoreHoursWeek(workCenter);
  const title = storeLabel || workCenter?.name || hrCopy.workerStoreFallback;
  const dayLabels = WEEKDAY_LABELS.es;

  const personalHeadline = scheduleLoading
    ? 'Cargando tu turno…'
    : personalShiftToday
      ? `Tu turno: ${shiftLabel(personalShiftToday)}`
      : hasPersonalSchedule && personalDayOff
        ? 'Hoy libre (según tu horario)'
        : hasPersonalSchedule
          ? 'Sin turno hoy'
          : null;

  // Horario del local (info). No alarmar: el turno del trabajador lo marca el CEO.
  const storeHeadline =
    storeResolving
      ? 'Cargando horario de tienda…'
      : storeToday.from && storeToday.to
        ? `Horario tienda: ${storeToday.from} – ${storeToday.to}`
        : storeToday.status === 'closed'
          ? 'Tienda: cerrada hoy'
          : storeToday.status === 'open' && storeToday.headline
            ? `Tienda: ${storeToday.headline}`
            : null;

  if (!workCenter && !hasAssignment && !hasPersonalSchedule) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4">
        <div className="flex items-start gap-3">
          <Store className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{hrCopy.workerNoStoreTitle}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {hrCopy.workerNoStoreHint}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-5 h-5 text-orange-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</p>
              {personalHeadline ? (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {personalHeadline}
                </p>
              ) : null}
              {storeHeadline ? (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {storeHeadline}
                </p>
              ) : null}
              {!personalHeadline && !storeHeadline ? (
                <p className="text-xs text-gray-500">
                  Hoy ({SCHEDULE_DAY_LABELS_ES[todayKey]})
                </p>
              ) : null}
            </div>
          </div>
          <Clock className="w-5 h-5 text-orange-400 shrink-0" />
        </div>
      </div>
    );
  }

  const personalWeek = memberSchedule
    ? WEEKDAYS.map((day) => ({
        day,
        label: dayLabels[day],
        isToday: day === WEEKDAYS[(new Date().getDay() + 6) % 7],
        text: shiftLabel(memberSchedule.weekly[day]),
        open: Boolean(memberSchedule.weekly[day]?.enabled),
      }))
    : [];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
          <Store className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{hrCopy.scheduleCardSubtitle}</p>
        </div>
      </div>

      {/* Turno personal (prioridad) */}
      <div className="px-5 py-3 bg-emerald-50/70 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40">
        <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold mb-1 flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5" />
          Tu horario
        </p>
        {scheduleLoading ? (
          <p className="text-sm text-gray-500">Cargando tu turno…</p>
        ) : personalShiftToday ? (
          <>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {shiftLabel(personalShiftToday)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Turno de hoy ({SCHEDULE_DAY_LABELS_ES[todayKey]}). Semana del {memberSchedule?.week_start || getMonday()}.
            </p>
          </>
        ) : hasPersonalSchedule && personalDayOff ? (
          <>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-200">Hoy libre</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Día libre según tu horario.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Sin turno asignado
            </p>
          </>
        )}
      </div>

      {/* Horario de tienda (solo si hay datos reales o estado cerrado/fuera) */}
      {storeResolving || storeToday.status !== 'no_schedule' ? (
      <div className="px-5 py-3 bg-orange-50/60 dark:bg-orange-950/20 border-b border-orange-100 dark:border-orange-900/40">
        <p className="text-xs uppercase tracking-wide text-orange-700 dark:text-orange-300 font-semibold mb-1">
          Horario de la tienda
        </p>
        {storeResolving ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : storeToday.from && storeToday.to ? (
          <>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {storeToday.from} – {storeToday.to}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Horario de apertura del local (tu turno lo marca el gerente).
            </p>
          </>
        ) : storeToday.status === 'closed' ? (
          <>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-200">Cerrada hoy</p>
            <p className="text-xs text-gray-500 mt-0.5">Según el calendario del local.</p>
          </>
        ) : storeToday.status === 'open' && storeToday.headline ? (
          <>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{storeToday.headline}</p>
            <p className="text-xs text-gray-500 mt-0.5">Horario del local</p>
          </>
        ) : null}
      </div>
      ) : null}

      {/* Semana: prioriza patrón personal */}
      {personalWeek.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Tu patrón semanal
          </div>
          {personalWeek.map((row) => (
            <div
              key={row.day}
              className={`flex items-center justify-between px-5 py-2.5 text-sm ${
                row.isToday ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
              }`}
            >
              <span
                className={
                  row.isToday
                    ? 'font-semibold text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300'
                }
              >
                {row.label}
                {row.isToday ? ' · hoy' : ''}
              </span>
              <span className={row.open ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}>
                {row.text}
              </span>
            </div>
          ))}
        </div>
      ) : storeWeek.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Semana de la tienda
          </div>
          {storeWeek.map((row) => (
            <div
              key={row.dayKey}
              className={`flex items-center justify-between px-5 py-2.5 text-sm ${
                row.isToday ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
              }`}
            >
              <span
                className={
                  row.isToday
                    ? 'font-semibold text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300'
                }
              >
                {row.label}
                {row.isToday ? ' · hoy' : ''}
              </span>
              <span className={row.open ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}>
                {row.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {workCenter?.address ? (
        <div className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 border-t border-gray-100 dark:border-gray-700">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {[workCenter.address, workCenter.city].filter(Boolean).join(', ')}
        </div>
      ) : null}
    </div>
  );
}
