import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  Loader2,
  Coffee,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  getSchedule,
  WEEKDAYS,
  WEEKDAY_LABELS,
} from '../../../lib/schedulesApi';
import type { ScheduleTemplate, DayShift, Weekday } from '../../../lib/schedulesApi';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  breakStart?: string;
  breakEnd?: string;
  type: 'shift';
}

const SHIFT_COLOR = 'bg-blue-500';
const SHIFT_BG = 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300';

export function WorkerCalendar() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const dayLabelsMap = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedule, setSchedule] = useState<ScheduleTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSchedule = useCallback(async () => {
    if (!businessId || !user?.user_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const sched = await getSchedule(businessId, user.user_id);
      setSchedule(sched);
    } catch {}
    setLoading(false);
  }, [businessId, user?.user_id]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [firstDayOfWeek, daysInMonth]);

  const getShiftForDay = (day: number): DayShift | null => {
    if (!schedule) return null;
    const date = new Date(year, month, day);
    const weekdayIndex = (date.getDay() + 6) % 7;
    const weekday = WEEKDAYS[weekdayIndex];
    const shift = schedule.weekly[weekday];
    return shift?.enabled ? shift : null;
  };

  const today = new Date();
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

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

  const todayShift = getShiftForDay(today.getDate());
  const showTodayCard = month === today.getMonth() && year === today.getFullYear() && todayShift;

  const weeklyHours = schedule?.weeklyHours ?? 0;

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
        {/* Summary card */}
        {schedule && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('worker.calendar.weeklyHours') || 'Horas/semana'}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{weeklyHours}h</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('worker.calendar.workDays') || 'Días laborables'}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                    {schedule ? WEEKDAYS.filter(d => schedule.weekly[d].enabled).length : 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Today's Schedule */}
        {showTodayCard && todayShift && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-500" />
              {t('worker.calendar.todaySchedule') || 'Horario de hoy'}
            </h3>
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${SHIFT_BG}`}>
              <div className={`w-1 h-10 rounded-full ${SHIFT_COLOR}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t('worker.calendar.shift') || 'Turno'}</p>
                <div className="flex items-center gap-3 text-xs opacity-70 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {todayShift.start} - {todayShift.end}
                  </span>
                  {todayShift.breakStart && todayShift.breakEnd && (
                    <span className="flex items-center gap-1">
                      <Coffee className="w-3 h-3" />
                      {todayShift.breakStart} - {todayShift.breakEnd}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!schedule && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <CalendarDays className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {t('worker.calendar.noSchedule') || 'No tienes un horario asignado'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {t('worker.calendar.contactManager') || 'Contacta con tu gerente para que te asigne un horario.'}
            </p>
          </div>
        )}

        {/* Weekly detail */}
        {schedule && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('worker.calendar.weeklySchedule') || 'Horario semanal'}
              </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {WEEKDAYS.map(day => {
                const shift = schedule.weekly[day];
                const todayWeekday = WEEKDAYS[(today.getDay() + 6) % 7];
                const isTodayDay = day === todayWeekday;
                return (
                  <div key={day} className={`flex items-center justify-between px-5 py-3 ${isTodayDay ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                    <div className="flex items-center gap-3">
                      {isTodayDay && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                      <span className={`text-sm font-medium ${isTodayDay ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {dayLabelsMap[day]}
                      </span>
                    </div>
                    {shift?.enabled ? (
                      <div className="flex items-center gap-4 text-sm tabular-nums">
                        <span className="font-medium text-gray-900 dark:text-white">{shift.start} - {shift.end}</span>
                        {shift.breakStart && shift.breakEnd && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Coffee className="w-3 h-3" />
                            {shift.breakStart}-{shift.breakEnd}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300 dark:text-gray-600">{t('worker.calendar.dayOff') || 'Libre'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Calendar */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{monthName}</h3>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-7 gap-px mb-2">
              {dayLabels.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map((day, i) => {
                const shift = day ? getShiftForDay(day) : null;
                return (
                  <div
                    key={i}
                    className={`min-h-[80px] p-1.5 rounded-lg transition-colors ${
                      day
                        ? isToday(day)
                          ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 dark:ring-blue-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        : ''
                    }`}
                  >
                    {day && (
                      <>
                        <span className={`text-xs font-medium ${isToday(day) ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                          {day}
                        </span>
                        {shift && (
                          <div className={`mt-1 text-[9px] px-1.5 py-0.5 rounded truncate text-white font-medium ${SHIFT_COLOR}`} title={`${shift.start} - ${shift.end}`}>
                            {shift.start}-{shift.end}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 px-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${SHIFT_COLOR}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('worker.calendar.shift') || 'Turno'}</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
