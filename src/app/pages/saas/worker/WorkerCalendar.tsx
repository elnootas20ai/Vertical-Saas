import { useState, useMemo, useEffect, useCallback, type FormEvent } from 'react';
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
  X,
  Palmtree,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  listSchedules,
  getMonday,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type ScheduleTemplate,
  type DayShift,
  type Weekday,
} from '../../../lib/schedulesApi';
import {
  listVacations,
  getSettings,
  createVacationRequest,
  getMemberVacationBalance,
  validateVacationRequestPolicy,
  countVacationRequestDays,
  LEAVE_TYPE_LABELS,
  STATUS_LABELS,
  type VacationRequest,
  type VacationSettings,
  type LeaveType,
} from '../../../lib/vacationsApi';

const SHIFT_COLOR = 'bg-blue-500';
const VAC_APPROVED = 'bg-emerald-500';
const VAC_PENDING = 'bg-amber-500';

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

function pickScheduleForDate(schedules: ScheduleTemplate[], date: Date): ScheduleTemplate | null {
  const ws = mondayOf(date);
  return schedules.find((s) => s.week_start === ws) || schedules[0] || null;
}

function shiftForDate(schedules: ScheduleTemplate[], date: Date): DayShift | null {
  const sched = pickScheduleForDate(schedules, date);
  if (!sched) return null;
  const weekday = WEEKDAYS[(date.getDay() + 6) % 7] as Weekday;
  const shift = sched.weekly[weekday];
  return shift?.enabled ? shift : null;
}

function dateInRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export function WorkerCalendar() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = user?.user_id || '';
  const memberName = user?.fullName || '';
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const dayLabelsMap = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<ScheduleTemplate[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [settings, setSettings] = useState<VacationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'vacation' as LeaveType,
    notes: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const load = useCallback(async () => {
    if (!businessId || !memberId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allSched, vacs, sett] = await Promise.all([
        listSchedules(businessId),
        listVacations(businessId, { memberId, year }),
        getSettings(businessId),
      ]);
      setSchedules(allSched.filter((s) => s.member_id === memberId));
      setVacations(vacs);
      setSettings(sett);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [businessId, memberId, year]);

  useEffect(() => {
    void load();
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

  const vacationOnDay = useCallback(
    (iso: string) =>
      vacations.find(
        (v) =>
          (v.status === 'approved' || v.status === 'pending')
          && dateInRange(iso, v.startDate, v.endDate),
      ) || null,
    [vacations],
  );

  const monthStats = useMemo(() => {
    let workDays = 0;
    let vacationDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const iso = isoDate(date);
      const vac = vacationOnDay(iso);
      if (vac?.status === 'approved') {
        vacationDays += 1;
        continue;
      }
      if (shiftForDate(schedules, date)) workDays += 1;
    }
    return { workDays, vacationDays };
  }, [year, month, daysInMonth, schedules, vacationOnDay]);

  const balance = useMemo(() => {
    if (!settings || !memberId) return null;
    return getMemberVacationBalance(settings, vacations, memberId, {
      startDate: user?.employment?.startDate,
      endDate: user?.employment?.endDate,
      year,
    });
  }, [settings, vacations, memberId, user?.employment?.startDate, user?.employment?.endDate, year]);

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

  const todayShift = shiftForDate(schedules, today);
  const showTodayCard =
    month === today.getMonth() && year === today.getFullYear() && todayShift;

  const previewDays =
    form.startDate && form.endDate && form.endDate >= form.startDate
      ? countVacationRequestDays(form.startDate, form.endDate, settings)
      : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!businessId || !memberId) return;
    setFormError('');
    const policy = validateVacationRequestPolicy(form.startDate, form.endDate, settings);
    if (!policy.ok) {
      setFormError(policy.error);
      return;
    }
    if (balance && form.leaveType === 'vacation' && previewDays > balance.remaining + 0.05) {
      setFormError(`No tienes saldo suficiente (quedan ${Number(balance.remaining ?? 0).toFixed(1)} días).`);
      return;
    }
    setSubmitting(true);
    try {
      await createVacationRequest(
        businessId,
        memberId,
        memberName,
        {
          startDate: form.startDate,
          endDate: form.endDate,
          leaveType: form.leaveType,
          notes: form.notes,
        },
        settings,
      );
      setShowForm(false);
      setForm({ startDate: '', endDate: '', leaveType: 'vacation', notes: '' });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout title={t('worker.calendar.title')} subtitle={t('worker.calendar.subtitle')}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('worker.calendar.title')} subtitle={t('worker.calendar.subtitle')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Turnos del horario asignado · Vacaciones orientadas a España (mín. 30 días naturales/año ≈ 2,5/mes).
          </p>
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Pedir vacaciones
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Días a trabajar (mes)</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{monthStats.workDays}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                <Umbrella className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Vacaciones (mes)</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{monthStats.vacationDays}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                <Palmtree className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Saldo {year}</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                  {balance ? `${Number(balance.remaining ?? 0).toFixed(1)} d` : '—'}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Devengado / Usado</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                  {balance
                    ? `${Number(balance.accrued ?? 0).toFixed(1)} / ${Number(balance.used ?? 0).toFixed(1)}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {settings && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
            Política empresa: {settings.dayBasis === 'business' ? 'días laborables (lun–vie)' : 'días naturales'}
            {settings.maxConsecutiveDays
              ? ` · máx. ${settings.maxConsecutiveDays} días seguidos`
              : ' · sin tope de días seguidos'}
            {settings.onlyWeekdays ? ' · solo lun–vie' : ''}
            {settings.minNoticeDays ? ` · antelación mín. ${settings.minNoticeDays} días` : ''}
            {' · '}
            {settings.accrualMode === 'monthly'
              ? `+${settings.daysPerMonth ?? 2.5} días/mes`
              : `${settings.defaultDaysPerYear} días/año`}
          </div>
        )}

        {showTodayCard && todayShift && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              Horario de hoy
            </h3>
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              <div className={`h-10 w-1 rounded-full ${SHIFT_COLOR}`} />
              <div>
                <p className="text-sm font-medium">Turno</p>
                <p className="mt-0.5 flex items-center gap-3 text-xs opacity-80">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {todayShift.start} - {todayShift.end}
                  </span>
                  {todayShift.breakStart && todayShift.breakEnd ? (
                    <span className="inline-flex items-center gap-1">
                      <Coffee className="h-3 w-3" />
                      {todayShift.breakStart} - {todayShift.breakEnd}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        )}

        {!patternSchedule && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            Aún no tienes horario asignado. Cuando te inviten con una plantilla de turnos (o tu gerente te asigne una),
            aquí verás los días que trabajas.
          </div>
        )}

        {patternSchedule && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
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
                    className={`flex items-center justify-between px-5 py-3 ${isTodayDay ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                  >
                    <span className={`text-sm font-medium ${isTodayDay ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
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
          <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
            <h3 className="font-semibold capitalize text-gray-900 dark:text-gray-100">{monthName}</h3>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="p-4">
            <div className="mb-2 grid grid-cols-7 gap-px">
              {dayLabels.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={i} className="min-h-[72px]" />;
                const date = new Date(year, month, day);
                const iso = isoDate(date);
                const shift = shiftForDate(schedules, date);
                const vac = vacationOnDay(iso);
                return (
                  <div
                    key={i}
                    className={`min-h-[72px] rounded-lg p-1.5 ${
                      isToday(day)
                        ? 'bg-blue-50 ring-2 ring-blue-300 dark:bg-blue-900/20 dark:ring-blue-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday(day) ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {day}
                    </span>
                    {vac ? (
                      <div
                        className={`mt-1 truncate rounded px-1.5 py-0.5 text-[9px] font-medium text-white ${
                          vac.status === 'approved' ? VAC_APPROVED : VAC_PENDING
                        }`}
                        title={`${leaveLabels[vac.leaveType]} (${statusLabels[vac.status]})`}
                      >
                        {vac.status === 'approved' ? 'Vacaciones' : 'Pendiente'}
                      </div>
                    ) : shift ? (
                      <div
                        className={`mt-1 truncate rounded px-1.5 py-0.5 text-[9px] font-medium text-white ${SHIFT_COLOR}`}
                        title={`${shift.start}-${shift.end}`}
                      >
                        {shift.start}-{shift.end}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 px-2">
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${SHIFT_COLOR}`} />
            <span className="text-xs text-gray-500">Turno</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${VAC_APPROVED}`} />
            <span className="text-xs text-gray-500">Vacaciones aprobadas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${VAC_PENDING}`} />
            <span className="text-xs text-gray-500">Solicitud pendiente</span>
          </div>
        </div>

        {vacations.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold">Mis solicitudes {year}</h3>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {vacations.slice(0, 8).map((v) => (
                <li key={v._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {v.startDate} → {v.endDate}
                  </span>
                  <span className="text-gray-500">
                    {leaveLabels[v.leaveType]} · {v.totalDays} d · {statusLabels[v.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:max-w-md sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Pedir vacaciones</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Desde
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Hasta
                <input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Tipo
                <select
                  value={form.leaveType}
                  onChange={(e) => setForm((p) => ({ ...p, leaveType: e.target.value as LeaveType }))}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  {(Object.keys(leaveLabels) as LeaveType[]).map((k) => (
                    <option key={k} value={k}>
                      {leaveLabels[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Nota (opcional)
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              {previewDays > 0 && (
                <p className="text-xs text-gray-500">
                  Esta solicitud cuenta <strong>{previewDays}</strong> día(s)
                  {balance ? ` · saldo disponible ${Number(balance.remaining ?? 0).toFixed(1)}` : ''}.
                </p>
              )}
              {formError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Umbrella className="h-4 w-4" />}
                Enviar solicitud
              </button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
