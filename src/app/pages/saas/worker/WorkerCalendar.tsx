import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  Loader2,
  Coffee,
  Umbrella,
  Plus,
  Ban,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDateRangeEs } from '../../../lib/formatDateEs';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  listSchedules,
  getMonday,
  WEEKDAYS,
  WEEKDAY_LABELS,
  computeWeeklyHours,
  type ScheduleTemplate,
  type DayShift,
  type Weekday,
} from '../../../lib/schedulesApi';
import {
  listVacations,
  getSettings,
  getMemberVacationBalance,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_SHORT_ES,
  STATUS_LABELS,
  type LeaveType,
  type VacationRequest,
  type VacationSettings,
} from '../../../lib/vacationsApi';
import {
  listBlocks,
  getMemberBlocksForDate,
  BLOCK_REASON_LABELS,
  type AvailabilityBlock,
} from '../../../lib/availabilityBlocksApi';

const SHIFT_COLOR = 'bg-blue-500';
const VAC_APPROVED = 'bg-emerald-500';
const VAC_PENDING = 'bg-amber-500';
const BLOCK_COLOR = 'bg-violet-500';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(date: Date): string {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return isoDate(d);
}

/** Horario de esa semana; si no hay doc, patrón reciente (plantilla). */
function pickScheduleForDate(
  schedules: ScheduleTemplate[],
  date: Date,
  patternFallback: ScheduleTemplate | null,
): ScheduleTemplate | null {
  const ws = mondayOf(date);
  return schedules.find((s) => s.week_start === ws) || patternFallback;
}

function shiftForDate(
  schedules: ScheduleTemplate[],
  date: Date,
  patternFallback: ScheduleTemplate | null,
): DayShift | null {
  const sched = pickScheduleForDate(schedules, date, patternFallback);
  if (!sched) return null;
  const weekday = WEEKDAYS[(date.getDay() + 6) % 7] as Weekday;
  const shift = sched.weekly[weekday];
  return shift?.enabled ? shift : null;
}

function dateInRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

/** Prioriza aprobada sobre pendiente si hay solape. */
function leaveOnDay(vacations: VacationRequest[], iso: string): VacationRequest | null {
  const hits = vacations.filter(
    (v) =>
      (v.status === 'approved' || v.status === 'pending')
      && dateInRange(iso, v.startDate, v.endDate),
  );
  if (!hits.length) return null;
  return hits.find((v) => v.status === 'approved') || hits[0];
}

type DayDetail = {
  iso: string;
  shift: DayShift | null;
  leave: VacationRequest | null;
  block: AvailabilityBlock | null;
};

/** Estado claro para el trabajador: ¿ese día ya está pedido? (igual se puede pedir otro permiso). */
type DayAskState = 'taken_approved' | 'taken_pending' | 'blocked' | 'available';

function dayAskState(detail: DayDetail): DayAskState {
  if (detail.leave?.status === 'approved') return 'taken_approved';
  if (detail.leave?.status === 'pending') return 'taken_pending';
  if (detail.block) return 'blocked';
  return 'available';
}

/**
 * Calendario trabajador (MVP):
 * turnos asignados + solicitudes RRHH (pending/approved) + bloqueos del gerente.
 * Pedir permiso → /saas/worker/requests (una sola vía).
 */
export function WorkerCalendar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = String(user?.user_id || user?.id || '').trim();
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const dayLabelsMap = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;
  const blockLabels = BLOCK_REASON_LABELS[lang] || BLOCK_REASON_LABELS.es;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<ScheduleTemplate[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [settings, setSettings] = useState<VacationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const load = useCallback(async () => {
    if (!businessId || !memberId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allSched, vacs, sett, memberBlocks] = await Promise.all([
        listSchedules(businessId),
        listVacations(businessId, { memberId }),
        getSettings(businessId, { createIfMissing: false }),
        listBlocks(businessId, { memberId }).catch(() => [] as AvailabilityBlock[]),
      ]);
      setSchedules(allSched.filter((s) => s.member_id === memberId));
      setVacations(vacs);
      setSettings(sett);
      setBlocks(memberBlocks);
    } catch {
      toast.error('No se pudo cargar el calendario');
    }
    setLoading(false);
  }, [businessId, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Al volver a la pestaña (p. ej. tras aprobar RRHH), refrescar.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const patternSchedule = useMemo(() => {
    const thisMonday = getMonday();
    return (
      schedules.find((s) => s.week_start === thisMonday)
      || schedules.slice().sort((a, b) => (b.week_start || '').localeCompare(a.week_start || ''))[0]
      || null
    );
  }, [schedules]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [firstDayOfWeek, daysInMonth]);

  const resolveDay = useCallback(
    (day: number): DayDetail => {
      const date = new Date(year, month, day);
      const iso = isoDate(date);
      const leave = leaveOnDay(vacations, iso);
      const dayBlocks = getMemberBlocksForDate(blocks, memberId, iso);
      const block = dayBlocks[0] || null;
      // Leave aprobada / bloqueo tienen prioridad visual sobre el turno.
      const shift =
        leave?.status === 'approved' || block
          ? null
          : shiftForDate(schedules, date, patternSchedule);
      return { iso, shift, leave, block };
    },
    [year, month, vacations, blocks, memberId, schedules, patternSchedule],
  );

  const monthStats = useMemo(() => {
    let workDays = 0;
    let leaveApprovedDays = 0;
    let leavePendingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const detail = resolveDay(d);
      if (detail.leave?.status === 'approved') {
        leaveApprovedDays += 1;
        continue;
      }
      if (detail.leave?.status === 'pending') leavePendingDays += 1;
      if (detail.shift) workDays += 1;
    }
    return { workDays, leaveApprovedDays, leavePendingDays };
  }, [daysInMonth, resolveDay]);

  const employmentStartDate = String(user?.employment?.startDate || '').trim();
  const hasManualVacationAllowance = Boolean(
    settings
      && memberId
      && settings.allowances?.[memberId] != null
      && Number.isFinite(Number(settings.allowances[memberId])),
  );
  const contractHours = Number(user?.employment?.hoursPerWeek);
  const contractWorkday = String(user?.employment?.workday || '').trim();
  const scheduleHrs = (() => {
    if (!patternSchedule) return null;
    const h = Number(patternSchedule.weeklyHours) > 0
      ? Number(patternSchedule.weeklyHours)
      : computeWeeklyHours(patternSchedule.weekly);
    return h > 0 ? h : null;
  })();
  const effectiveHours =
    (Number.isFinite(contractHours) && contractHours > 0 ? contractHours : null)
    ?? scheduleHrs;
  const hasContractHoursBasis = Boolean(
    effectiveHours != null
    || ['completa', 'media', 'parcial'].includes(contractWorkday.toLowerCase()),
  );
  const canShowVacationBalance = Boolean(
    hasManualVacationAllowance
    || (employmentStartDate && hasContractHoursBasis),
  );

  const balance = useMemo(() => {
    if (!settings || !memberId || !canShowVacationBalance) return null;
    return getMemberVacationBalance(settings, vacations, memberId, {
      startDate: employmentStartDate || undefined,
      endDate: user?.employment?.endDate,
      year,
      hoursPerWeek: effectiveHours ?? undefined,
      workday: contractWorkday || undefined,
      scheduleWeeklyHours: scheduleHrs ?? undefined,
    });
  }, [
    settings,
    vacations,
    memberId,
    employmentStartDate,
    user?.employment?.endDate,
    year,
    canShowVacationBalance,
    effectiveHours,
    contractWorkday,
    scheduleHrs,
  ]);

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const monthName = currentDate.toLocaleString(lang, { month: 'long', year: 'numeric' });
  const dayLabels = [
    dayLabelsMap.monday?.slice(0, 3),
    dayLabelsMap.tuesday?.slice(0, 3),
    dayLabelsMap.wednesday?.slice(0, 3),
    dayLabelsMap.thursday?.slice(0, 3),
    dayLabelsMap.friday?.slice(0, 3),
    dayLabelsMap.saturday?.slice(0, 3),
    dayLabelsMap.sunday?.slice(0, 3),
  ];

  const todayDetail = useMemo(() => {
    const now = new Date();
    if (month !== now.getMonth() || year !== now.getFullYear()) return null;
    return resolveDay(now.getDate());
  }, [month, year, resolveDay]);

  const activeRequests = useMemo(
    () =>
      [...vacations]
        .filter((v) => v.status === 'pending' || v.status === 'approved')
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))),
    [vacations],
  );

  function goRequest(startIso?: string, endIso?: string) {
    const start = startIso || isoDate(today);
    const end = endIso || start;
    navigate(`/saas/worker/requests?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  }

  function openDay(day: number) {
    setSelectedDay(resolveDay(day));
  }

  if (loading) {
    return (
      <Layout title={t('worker.calendar.title')} subtitle={t('worker.calendar.subtitle')}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('worker.calendar.title')} subtitle="Tus turnos y solicitudes a RRHH">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Verde = aprobado · Ámbar = pendiente · Días claros = puedes pedir.
            Si ya hay permiso, igual puedes enviar otra solicitud (RRHH verá el solape).
          </p>
          <button
            type="button"
            onClick={() => goRequest()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Pedir a RRHH
          </button>
        </div>

        <div className={`grid grid-cols-2 gap-2 ${canShowVacationBalance ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <StatCard
            icon={<CalendarDays className="h-5 w-5" />}
            iconClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
            label="Turnos (mes)"
            value={String(monthStats.workDays)}
          />
          <StatCard
            icon={<Umbrella className="h-5 w-5" />}
            iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
            label="Aprobados (mes)"
            value={String(monthStats.leaveApprovedDays)}
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            iconClass="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
            label="Pendientes (mes)"
            value={String(monthStats.leavePendingDays)}
          />
          {canShowVacationBalance && balance ? (
            <StatCard
              icon={<Umbrella className="h-5 w-5" />}
              iconClass="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400"
              label={`Disponibles ${year}`}
              value={`${Number(balance.requestable ?? 0)} d`}
            />
          ) : null}
        </div>

        {settings ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
            Política: {settings.dayBasis === 'business' ? 'días laborables' : 'días naturales'}
            {settings.minNoticeDays ? ` · antelación mín. ${settings.minNoticeDays} d` : ''}
            {settings.maxConsecutiveDays
              ? ` · tope por solicitud: ${settings.maxConsecutiveDays} d seguidos (no es tu saldo)`
              : ''}
            {' · '}
            {settings.accrualMode === 'monthly'
              ? `+${settings.daysPerMonth ?? 2.5} d por mes completo de alta`
              : `cupo ${settings.defaultDaysPerYear} d/año (por meses completos)`}
          </div>
        ) : null}

        {todayDetail ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              Hoy
            </h3>
            <DaySummary
              detail={todayDetail}
              leaveLabels={leaveLabels}
              statusLabels={statusLabels}
              blockLabels={blockLabels}
            />
          </div>
        ) : null}

        {!patternSchedule ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            Aún no tienes horario asignado. Cuando te asignen turnos,
            aquí verás los días de trabajo.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Patrón semanal</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {WEEKDAYS.map((day) => {
                const shift = patternSchedule.weekly[day];
                const todayWeekday = WEEKDAYS[(today.getDay() + 6) % 7];
                const isTodayDay = day === todayWeekday;
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      isTodayDay ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        isTodayDay
                          ? 'text-blue-700 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {dayLabelsMap[day]}
                    </span>
                    {shift?.enabled ? (
                      <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                        {shift.start} - {shift.end}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-300 dark:text-gray-600">Libre</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
            <h3 className="font-semibold capitalize text-gray-900 dark:text-gray-100">{monthName}</h3>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="p-3 sm:p-4">
            <div className="mb-2 grid grid-cols-7 gap-px">
              {dayLabels.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="min-h-[68px]" />;
                const detail = resolveDay(day);
                const chip = dayChip(detail, leaveLabels);
                const ask = dayAskState(detail);
                const isPastDay = detail.iso < isoDate(today);
                const askTint =
                  ask === 'taken_approved'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40'
                    : ask === 'taken_pending'
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : ask === 'blocked'
                        ? 'bg-violet-50 dark:bg-violet-950/30'
                        : '';
                return (
                  <button
                    key={detail.iso}
                    type="button"
                    onClick={() => openDay(day)}
                    className={`min-h-[68px] rounded-lg p-1.5 text-left transition-colors ${askTint} ${
                      isToday(day)
                        ? 'ring-2 ring-blue-300 dark:ring-blue-700'
                        : selectedDay?.iso === detail.iso
                          ? 'ring-1 ring-gray-300 dark:ring-gray-500'
                          : ask === 'available' && !isPastDay
                            ? 'hover:bg-sky-50 dark:hover:bg-sky-950/20'
                            : 'hover:opacity-90'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday(day)
                          ? 'font-bold text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {day}
                    </span>
                    {chip ? (
                      <div
                        className={`mt-1 truncate rounded px-1 py-0.5 text-[9px] font-medium text-white ${chip.color}`}
                        title={chip.title}
                      >
                        {chip.label}
                      </div>
                    ) : !isPastDay ? (
                      <div
                        className="mt-1 truncate rounded px-1 py-0.5 text-[9px] font-medium text-sky-700 dark:text-sky-300"
                        title="Puedes pedir permiso este día"
                      >
                        Pedir
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 px-1">
          <LegendDot color={SHIFT_COLOR} label="Turno" />
          <LegendDot color={VAC_APPROVED} label="Ya aprobado (ocupado)" />
          <LegendDot color={VAC_PENDING} label="Ya pedido (pendiente)" />
          <LegendDot color="bg-sky-400" label="Puedes pedir" />
          <LegendDot color={BLOCK_COLOR} label="Bloqueo gerente" />
        </div>

        {selectedDay ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {selectedDay.iso}
              </h3>
              <button
                type="button"
                onClick={() => goRequest(selectedDay.iso, selectedDay.iso)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                  dayAskState(selectedDay) === 'available'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-slate-600 hover:bg-slate-700'
                }`}
              >
                <Send className="h-3.5 w-3.5" />
                {dayAskState(selectedDay) === 'available' ? 'Pedir este día' : 'Pedir otro permiso'}
              </button>
            </div>
            <DayAskBanner detail={selectedDay} leaveLabels={leaveLabels} statusLabels={statusLabels} />
            <div className="mt-3">
              <DaySummary
                detail={selectedDay}
                leaveLabels={leaveLabels}
                statusLabels={statusLabels}
                blockLabels={blockLabels}
              />
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-gray-400">Toca un día para ver si puedes pedir o ya está ocupado</p>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h3 className="text-sm font-semibold">Solicitudes activas</h3>
            <button
              type="button"
              onClick={() => navigate('/saas/worker/requests')}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Ver todas
            </button>
          </div>
          {activeRequests.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No hay solicitudes pendientes ni aprobadas. Usa «Pedir a RRHH».
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {activeRequests.slice(0, 10).map((v) => (
                <li
                  key={v._id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {leaveLabels[v.leaveType] || v.leaveType}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateRangeEs(v.startDate, v.endDate)}
                      {v.totalDays ? ` · ${v.totalDays} d` : ''}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      v.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    }`}
                  >
                    {statusLabels[v.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2.5">
        <div className={`rounded-lg p-2 ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-gray-500">{label}</p>
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function dayChip(
  detail: DayDetail,
  leaveLabels: Record<string, string>,
): { color: string; label: string; title: string } | null {
  if (detail.leave) {
    const type = (detail.leave.leaveType || 'other') as LeaveType;
    const typeLabel = leaveLabels[type] || detail.leave.leaveType;
    const short = LEAVE_TYPE_SHORT_ES[type] || typeLabel.slice(0, 8);
    const statusBit = detail.leave.status === 'approved' ? 'aprobado' : 'pendiente';
    return {
      color: detail.leave.status === 'approved' ? VAC_APPROVED : VAC_PENDING,
      label: detail.leave.status === 'approved' ? short : `${short}·P`,
      title: `${typeLabel} · ${statusBit} · este día ya está pedido`,
    };
  }
  if (detail.block) {
    return { color: BLOCK_COLOR, label: 'Bloqueo', title: detail.block.reason };
  }
  if (detail.shift) {
    return {
      color: SHIFT_COLOR,
      label: `${detail.shift.start}-${detail.shift.end}`,
      title: `${detail.shift.start}-${detail.shift.end} · puedes pedir permiso encima`,
    };
  }
  return null;
}

function DayAskBanner({
  detail,
  leaveLabels,
  statusLabels,
}: {
  detail: DayDetail;
  leaveLabels: Record<string, string>;
  statusLabels: Record<string, string>;
}) {
  const ask = dayAskState(detail);
  if (ask === 'taken_approved' && detail.leave) {
    const typeLabel = leaveLabels[detail.leave.leaveType] || detail.leave.leaveType;
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
        <span className="font-semibold">Ya aprobado:</span> {typeLabel} ({statusLabels.approved}).
        Este día cuenta como permiso. Puedes enviar otra solicitud si hace falta; RRHH verá el solape.
      </p>
    );
  }
  if (ask === 'taken_pending' && detail.leave) {
    const typeLabel = leaveLabels[detail.leave.leaveType] || detail.leave.leaveType;
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <span className="font-semibold">Ya pedido:</span> {typeLabel} ({statusLabels.pending}).
        Espera a RRHH o cancela esa solicitud si quieres cambiar las fechas.
      </p>
    );
  }
  if (ask === 'blocked') {
    return (
      <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
        <span className="font-semibold">Bloqueo del gerente</span> este día. Aun así puedes pedir un permiso; RRHH lo valora.
      </p>
    );
  }
  return (
    <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <span className="font-semibold">Puedes pedir</span> permiso o vacaciones este día (según política y saldo).
    </p>
  );
}

function DaySummary({
  detail,
  leaveLabels,
  statusLabels,
  blockLabels,
}: {
  detail: DayDetail;
  leaveLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  blockLabels: Record<string, string>;
}) {
  if (detail.leave) {
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border p-3 ${
          detail.leave.status === 'approved'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
        }`}
      >
        <Umbrella className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">
            {leaveLabels[detail.leave.leaveType] || detail.leave.leaveType}
          </p>
          <p className="text-xs opacity-80">
            {statusLabels[detail.leave.status]} · {formatDateRangeEs(detail.leave.startDate, detail.leave.endDate)}
          </p>
          {detail.leave.notes ? (
            <p className="mt-1 text-xs opacity-70">{detail.leave.notes}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (detail.block) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
        <Ban className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">
            Bloqueo · {blockLabels[detail.block.reason] || detail.block.reason}
          </p>
          <p className="text-xs opacity-80">
            {detail.block.allDay
              ? 'Todo el día'
              : `${detail.block.startTime || ''} - ${detail.block.endTime || ''}`}
          </p>
        </div>
      </div>
    );
  }

  if (detail.shift) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <div className={`h-10 w-1 rounded-full ${SHIFT_COLOR}`} />
        <div>
          <p className="text-sm font-medium">Turno</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs opacity-80">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {detail.shift.start} - {detail.shift.end}
            </span>
            {detail.shift.breakStart && detail.shift.breakEnd ? (
              <span className="inline-flex items-center gap-1">
                <Coffee className="h-3 w-3" />
                {detail.shift.breakStart} - {detail.shift.breakEnd}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  return (
    <p className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 px-3 py-4 text-center text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200">
      Día libre · puedes pedir permiso aquí
    </p>
  );
}
