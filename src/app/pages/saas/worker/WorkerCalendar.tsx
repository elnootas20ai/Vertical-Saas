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
import { formatDateEs, formatDateRangeEs } from '../../../lib/formatDateEs';
import { VERTIAL_BTN_PRIMARY } from '../../../lib/vertialUiTokens';
import {
  WORKER_CARD,
  WORKER_MUTED,
  WORKER_PAGE_WIDE,
  WORKER_SECTION_TITLE,
} from '../../../lib/workerUi';
import { Layout } from '../../../components/saas/Layout';
import { TeamCalendarSidebar } from '../../../components/saas/schedules/TeamCalendarSidebar';
import { TeamCalendarDayPopup } from '../../../components/saas/schedules/TeamCalendarDayPopup';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';
import { useWorkCenters } from '../../../hooks/useWorkCenters';
import { buildDayRoster } from '../../../lib/teamCalendarDayModel';
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
import { mergeBusinessMembers } from '../../../lib/schedulesDisplay';
import { salesPointRefsMatch } from '../../../lib/clockinsMemberStore';
import { getPrimarySiteAssignment } from '../../../lib/workerStoreAssignment';
import type { WorkerAssignment } from '../../../lib/authApi';

const SHIFT_COLOR = 'bg-stone-500';
const VAC_APPROVED = 'bg-emerald-500';
const VAC_PENDING = 'bg-orange-500';
/** Rojo sutil (denegado): no satura el mes. */
const VAC_REJECTED = 'bg-rose-200 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200';
const BLOCK_COLOR = 'bg-stone-400';
const ASK_CHIP = 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300';

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

/** Prioridad visual: aprobada → pendiente → denegada. */
function leaveOnDay(vacations: VacationRequest[], iso: string): VacationRequest | null {
  const hits = vacations.filter(
    (v) =>
      (v.status === 'approved' || v.status === 'pending' || v.status === 'rejected')
      && dateInRange(iso, v.startDate, v.endDate),
  );
  if (!hits.length) return null;
  return (
    hits.find((v) => v.status === 'approved')
    || hits.find((v) => v.status === 'pending')
    || hits.find((v) => v.status === 'rejected')
    || hits[0]
  );
}

type DayDetail = {
  iso: string;
  shift: DayShift | null;
  leave: VacationRequest | null;
  block: AvailabilityBlock | null;
};

/** Estado del día para el trabajador. */
type DayAskState = 'taken_approved' | 'taken_pending' | 'taken_rejected' | 'blocked' | 'available';

function dayAskState(detail: DayDetail): DayAskState {
  if (detail.leave?.status === 'approved') return 'taken_approved';
  if (detail.leave?.status === 'pending') return 'taken_pending';
  if (detail.leave?.status === 'rejected') return 'taken_rejected';
  if (detail.block) return 'blocked';
  return 'available';
}

type TeamMemberRow = {
  user_id: string;
  fullName: string;
  role: string;
  employment?: {
    salesPointId?: string;
    assignments?: WorkerAssignment[];
  };
};

/**
 * Calendario trabajador (MVP):
 * turnos asignados + solicitudes RRHH (pending/approved) + bloqueos del gerente.
 * Pedir permiso → /saas/worker/requests (una sola vía).
 * Equipo de la tienda en sidebar derecha.
 */
export function WorkerCalendar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const { activeWorkCenters } = useWorkCenters();
  const { assignedPdvId, storeLabel } = useWorkerAssignedStore();

  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = String(user?.user_id || user?.id || '').trim();
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const dayLabelsMap = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;
  const blockLabels = BLOCK_REASON_LABELS[lang] || BLOCK_REASON_LABELS.es;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [allSchedules, setAllSchedules] = useState<ScheduleTemplate[]>([]);
  const [schedules, setSchedules] = useState<ScheduleTemplate[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [teamVacations, setTeamVacations] = useState<VacationRequest[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [settings, setSettings] = useState<VacationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const currentWeekStart = getMonday();
  const storeId = String(assignedPdvId || '').trim();

  const load = useCallback(async () => {
    if (!businessId || !memberId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allSched, vacsMine, vacsTeam, sett, memberBlocks, apiUsers] = await Promise.all([
        listSchedules(businessId),
        listVacations(businessId, { memberId }),
        listVacations(businessId),
        getSettings(businessId, { createIfMissing: false }),
        listBlocks(businessId, { memberId }).catch(() => [] as AvailabilityBlock[]),
        listUsers(businessId).catch(() => []),
      ]);
      setAllSchedules(allSched);
      setSchedules(allSched.filter((s) => s.member_id === memberId));
      setVacations(vacsMine);
      setTeamVacations(vacsTeam);
      setSettings(sett);
      setBlocks(memberBlocks);

      const merged = mergeBusinessMembers(
        (currentBusiness?.members || []) as {
          user_id: string;
          fullName?: string;
          email?: string;
          role?: string;
          employment?: unknown;
        }[],
        (apiUsers || []) as {
          user_id: string;
          fullName?: string;
          role?: string;
          employment?: unknown;
        }[],
      );
      setTeamMembers(
        merged.map((m) => {
          const emp = (m.employment || {}) as {
            salesPointId?: string;
            assignments?: WorkerAssignment[];
          };
          return {
            user_id: m.user_id,
            fullName: m.fullName,
            role: m.role,
            employment: {
              salesPointId: String(emp.salesPointId || '').trim() || undefined,
              assignments: Array.isArray(emp.assignments) ? emp.assignments : undefined,
            },
          };
        }),
      );
    } catch {
      toast.error('No se pudo cargar el calendario');
    }
    setLoading(false);
  }, [businessId, memberId, listUsers, currentBusiness?.members]);

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

  const storeTeam = useMemo(() => {
    if (!storeId) return teamMembers;
    return teamMembers.filter((m) => {
      if (m.user_id === memberId) return true;
      const sales = String(m.employment?.salesPointId || '').trim();
      const assign = String(getPrimarySiteAssignment(m.employment?.assignments)?.entityId || '').trim();
      const sched =
        allSchedules.find((s) => s.member_id === m.user_id && s.week_start === currentWeekStart)
        || allSchedules.find((s) => s.member_id === m.user_id);
      const wc = String(sched?.work_center_id || '').trim();
      return [sales, assign, wc].some((ref) => ref && salesPointRefsMatch(ref, storeId));
    });
  }, [teamMembers, storeId, memberId, allSchedules, currentWeekStart]);

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
      // Solo ausencia aprobada / bloqueo tapan el turno; pendiente y denegada se ven encima.
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

  const dayRoster = useMemo(() => {
    if (!selectedDay) return null;
    return buildDayRoster({
      iso: selectedDay.iso,
      members: storeTeam,
      schedules: allSchedules,
      vacations: teamVacations,
      workCenters: activeWorkCenters,
      leaveLabels,
      currentUserId: memberId,
      storeFallbackLabel: storeLabel || '',
    });
  }, [
    selectedDay,
    storeTeam,
    allSchedules,
    teamVacations,
    activeWorkCenters,
    leaveLabels,
    memberId,
    storeLabel,
  ]);

  const myPopupStatus = useMemo(() => {
    if (!selectedDay) {
      return { status: 'available' as const, text: '' };
    }
    const ask = dayAskState(selectedDay);
    if (ask === 'taken_approved' && selectedDay.leave) {
      const typeLabel = leaveLabels[selectedDay.leave.leaveType] || selectedDay.leave.leaveType;
      return { status: 'taken_approved' as const, text: `Ya tienes ${typeLabel} aprobado.` };
    }
    if (ask === 'taken_pending' && selectedDay.leave) {
      const typeLabel = leaveLabels[selectedDay.leave.leaveType] || selectedDay.leave.leaveType;
      return { status: 'taken_pending' as const, text: `Ya pediste ${typeLabel} (pendiente).` };
    }
    if (ask === 'taken_rejected' && selectedDay.leave) {
      const typeLabel = leaveLabels[selectedDay.leave.leaveType] || selectedDay.leave.leaveType;
      return { status: 'taken_rejected' as const, text: `${typeLabel} fue denegado. Puedes pedir otra cosa.` };
    }
    if (ask === 'blocked') {
      return { status: 'blocked' as const, text: 'Hay un bloqueo del gerente este día.' };
    }
    if (selectedDay.shift) {
      return {
        status: 'available' as const,
        text: `Tienes turno ${selectedDay.shift.start}–${selectedDay.shift.end}. Puedes pedir permiso.`,
      };
    }
    return { status: 'off' as const, text: 'Día libre para ti. Puedes pedir permiso aquí.' };
  }, [selectedDay, leaveLabels]);

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
    <Layout title={t('worker.calendar.title')} subtitle="Turnos y permisos">
      <div className={WORKER_PAGE_WIDE}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`${WORKER_MUTED} hidden sm:block`}>
            Naranja = pendiente · Verde = aprobado · Rosa = denegado · Gris = turno
          </p>
          <button
            type="button"
            onClick={() => goRequest()}
            className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto`}
          >
            <Plus className="h-4 w-4" />
            Pedir a RRHH
          </button>
        </div>

        <div className={`grid grid-cols-2 gap-2 ${canShowVacationBalance ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            iconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
            label="Turnos"
            value={String(monthStats.workDays)}
          />
          <StatCard
            icon={<Umbrella className="h-4 w-4" />}
            iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
            label="Aprobados"
            value={String(monthStats.leaveApprovedDays)}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            iconClass="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
            label="Pendientes"
            value={String(monthStats.leavePendingDays)}
          />
          {canShowVacationBalance && balance ? (
            <StatCard
              icon={<Umbrella className="h-4 w-4" />}
              iconClass="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
              label={`Disponibles ${year}`}
              value={`${Number(balance.requestable ?? 0)} d`}
            />
          ) : null}
        </div>

        {settings ? (
          <details className={`${WORKER_CARD} group open:pb-0`}>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stone-800 marker:content-none dark:text-stone-100 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                Reglas de permisos
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-90" />
              </span>
            </summary>
            <ul className="space-y-1 border-t border-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-600 dark:border-stone-800 dark:text-stone-400">
              <li>
                {settings.dayBasis === 'business'
                  ? 'Se cuentan solo laborables (lun–vie).'
                  : 'Se cuentan días naturales (incluye fines de semana).'}
              </li>
              {settings.minNoticeDays ? (
                <li>
                  Antelación mínima: {settings.minNoticeDays}{' '}
                  {settings.minNoticeDays === 1 ? 'día' : 'días'}.
                </li>
              ) : null}
              {settings.maxConsecutiveDays ? (
                <li>
                  Máximo {settings.maxConsecutiveDays} días seguidos por solicitud (no es tu saldo).
                </li>
              ) : null}
              <li>
                {settings.accrualMode === 'monthly'
                  ? `Saldo: ~${settings.daysPerMonth ?? 2.5} días por mes completo de alta.`
                  : `Cupo: ${settings.defaultDaysPerYear} días/año (según meses de alta).`}
              </li>
            </ul>
          </details>
        ) : null}

        {todayDetail ? (
          <div className={`${WORKER_CARD} p-3 sm:p-4`}>
            <h3 className={`mb-2 flex items-center gap-2 ${WORKER_SECTION_TITLE}`}>
              <CalendarDays className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
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

        {/* Calendario (izq) + Equipo (der) */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-4">
          <div className="min-w-0 space-y-3">
            <div className={WORKER_CARD}>
              <div className="flex items-center justify-between border-b border-stone-100 px-2 py-2 dark:border-stone-800 sm:px-3 sm:py-3">
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="h-5 w-5 text-stone-600 dark:text-stone-400" />
                </button>
                <h3 className="text-sm font-semibold capitalize text-stone-900 dark:text-stone-100 sm:text-base">
                  {monthName}
                </h3>
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="h-5 w-5 text-stone-600 dark:text-stone-400" />
                </button>
              </div>

              <div className="p-2 sm:p-3">
                <div className="mb-1 grid grid-cols-7 gap-px">
                  {dayLabels.map((d) => (
                    <div
                      key={d}
                      className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-stone-400 sm:text-xs"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((day, i) => {
                    if (!day) return <div key={`e-${i}`} className="min-h-[44px] sm:min-h-[64px]" />;
                    const detail = resolveDay(day);
                    const chip = dayChip(detail, leaveLabels);
                    const ask = dayAskState(detail);
                    const isPastDay = detail.iso < isoDate(today);
                    const askTint =
                      ask === 'taken_approved'
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/35'
                        : ask === 'taken_pending'
                          ? 'bg-orange-50/90 dark:bg-orange-950/30'
                          : ask === 'taken_rejected'
                            ? 'bg-rose-50/70 dark:bg-rose-950/25'
                            : ask === 'blocked'
                              ? 'bg-stone-100 dark:bg-stone-800/50'
                              : 'bg-stone-50/60 dark:bg-stone-900/40';
                    const dotColor =
                      ask === 'taken_approved'
                        ? 'bg-emerald-500'
                        : ask === 'taken_pending'
                          ? 'bg-orange-500'
                          : ask === 'taken_rejected'
                            ? 'bg-rose-300'
                            : ask === 'blocked'
                              ? 'bg-stone-400'
                              : detail.shift
                                ? 'bg-stone-500'
                                : !isPastDay
                                  ? 'bg-stone-300'
                                  : '';
                    return (
                      <button
                        key={detail.iso}
                        type="button"
                        onClick={() => openDay(day)}
                        className={`min-h-[44px] touch-manipulation rounded-md border border-stone-100/80 p-1 text-left transition-colors dark:border-stone-800 sm:min-h-[64px] sm:rounded-lg sm:p-1.5 ${askTint} ${
                          isToday(day)
                            ? 'ring-2 ring-stone-400 dark:ring-stone-500'
                            : selectedDay?.iso === detail.iso
                              ? 'ring-2 ring-[#2563EB]'
                              : ask === 'available' && !isPastDay
                                ? 'hover:bg-stone-100 dark:hover:bg-stone-800/60'
                                : 'hover:opacity-90'
                        }`}
                      >
                        <span
                          className={`block text-[11px] font-medium sm:text-xs ${
                            isToday(day)
                              ? 'font-bold text-stone-900 dark:text-stone-100'
                              : 'text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          {day}
                        </span>
                        {dotColor ? (
                          <span
                            className={`mt-1 block h-1.5 w-1.5 rounded-full sm:hidden ${dotColor}`}
                            aria-hidden
                          />
                        ) : null}
                        {chip ? (
                          <div
                            className={`mt-1 hidden truncate rounded px-1 py-0.5 text-[9px] font-medium sm:block ${
                              chip.solid ? 'text-white' : ''
                            } ${chip.color}`}
                            title={chip.title}
                          >
                            {chip.label}
                          </div>
                        ) : !isPastDay ? (
                          <div
                            className={`mt-1 hidden truncate rounded px-1 py-0.5 text-[9px] font-medium sm:block ${ASK_CHIP}`}
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

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5">
              <LegendDot color={SHIFT_COLOR} label="Turno" />
              <LegendDot color={VAC_PENDING} label="Pendiente" />
              <LegendDot color={VAC_APPROVED} label="Aprobado" />
              <LegendDot color="bg-rose-300" label="Denegado" />
              <LegendDot color="bg-stone-300" label="Pedir" />
            </div>

            <p className={`text-center ${WORKER_MUTED}`}>
              Toca un día para ver el equipo y pedir
            </p>
          </div>

          <TeamCalendarSidebar
            members={storeTeam}
            schedules={schedules.length ? schedules : allSchedules}
            allSchedules={allSchedules}
            workCenters={activeWorkCenters}
            weekStart={currentWeekStart}
            storeFilterLabel={storeLabel || 'Tu tienda'}
          />
        </div>

        {selectedDay && dayRoster ? (
          <TeamCalendarDayPopup
            iso={selectedDay.iso}
            storeLabel={storeLabel || undefined}
            working={dayRoster.working}
            away={dayRoster.away}
            off={dayRoster.off}
            myStatus={myPopupStatus.status}
            myStatusText={myPopupStatus.text}
            onClose={() => setSelectedDay(null)}
            onRequestDay={() => {
              const iso = selectedDay.iso;
              setSelectedDay(null);
              goRequest(iso, iso);
            }}
          />
        ) : null}

        {/* Patrón semanal | Solicitudes activas */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {!patternSchedule ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Aún no tienes horario asignado. Cuando te asignen turnos,
              aquí verás los días de trabajo.
            </div>
          ) : (
            <div className={`overflow-hidden ${WORKER_CARD}`}>
              <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-800">
                <h3 className={WORKER_SECTION_TITLE}>Patrón semanal</h3>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
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
                            : 'text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {dayLabelsMap[day]}
                      </span>
                      {shift?.enabled ? (
                        <span className="text-sm font-medium tabular-nums text-stone-900 dark:text-stone-50">
                          {shift.start} - {shift.end}
                        </span>
                      ) : (
                        <span className="text-sm text-stone-300 dark:text-stone-600">Libre</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`overflow-hidden ${WORKER_CARD}`}>
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
              <h3 className={WORKER_SECTION_TITLE}>Solicitudes activas</h3>
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
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</p>
          <p className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">{value}</p>
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
): { color: string; label: string; title: string; solid: boolean } | null {
  if (detail.leave) {
    const type = (detail.leave.leaveType || 'other') as LeaveType;
    const typeLabel = leaveLabels[type] || detail.leave.leaveType;
    const short = LEAVE_TYPE_SHORT_ES[type] || typeLabel.slice(0, 8);
    if (detail.leave.status === 'approved') {
      return {
        color: VAC_APPROVED,
        label: short,
        title: `${typeLabel} · aprobado`,
        solid: true,
      };
    }
    if (detail.leave.status === 'pending') {
      return {
        color: VAC_PENDING,
        label: `${short}·P`,
        title: `${typeLabel} · solicitud pendiente`,
        solid: true,
      };
    }
    if (detail.leave.status === 'rejected') {
      return {
        color: VAC_REJECTED,
        label: `${short}·X`,
        title: `${typeLabel} · denegado`,
        solid: false,
      };
    }
  }
  if (detail.block) {
    return { color: BLOCK_COLOR, label: 'Bloqueo', title: detail.block.reason, solid: true };
  }
  if (detail.shift) {
    return {
      color: SHIFT_COLOR,
      label: `${detail.shift.start}-${detail.shift.end}`,
      title: `${detail.shift.start}-${detail.shift.end}`,
      solid: true,
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
      <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
        <span className="font-semibold">Ya pedido:</span> {typeLabel} ({statusLabels.pending}).
        Espera a RRHH o cancela esa solicitud si quieres cambiar las fechas.
      </p>
    );
  }
  if (ask === 'taken_rejected' && detail.leave) {
    const typeLabel = leaveLabels[detail.leave.leaveType] || detail.leave.leaveType;
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
        <span className="font-semibold">Denegado:</span> {typeLabel}. Puedes pedir otra fecha o tipo de permiso.
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
            : detail.leave.status === 'rejected'
              ? 'border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
              : 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-100'
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
