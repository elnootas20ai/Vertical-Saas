import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Clock,
  CalendarDays,
  Coffee,
  TrendingUp,
  Timer,
  Loader2,
  AlertTriangle,
  MapPin,
  MapPinOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  type ClockinRecord,
  listClockins,
  formatMinutes,
  getDisplayTime,
} from '../../../lib/clockinsApi';
import { useWorkerClockIn, formatClockTimer } from '../../../hooks/useWorkerClockIn';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';
import { WorkerStoreScheduleCard } from '../../../components/saas/worker/WorkerStoreScheduleCard';

export function WorkerClock() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const memberId = user?.user_id || '';
  const memberName = user?.fullName || '';
  const { isDelivery, workCenter, storeLabel } = useWorkerAssignedStore();

  const {
    record,
    loading,
    acting,
    error,
    isClockedIn,
    isOnBreak,
    elapsedSeconds,
    breakSeconds,
    remainingMinutes,
    geoLocation,
    geoStatus,
    handleClockIn,
    handleClockOut: baseClockOut,
    handleBreakToggle,
  } = useWorkerClockIn(businessId, memberId, memberName);

  const [history, setHistory] = useState<ClockinRecord[]>([]);

  const loadHistory = useCallback(async () => {
    if (!businessId || !memberId) return;
    try {
      const all = await listClockins(businessId, { memberId });
      setHistory(all.filter((r) => r.status === 'completed'));
    } catch {
      /* historial opcional */
    }
  }, [businessId, memberId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleClockOut = useCallback(async () => {
    const rec = await baseClockOut();
    if (rec) setHistory((prev) => [rec, ...prev].slice(0, 50));
  }, [baseClockOut]);

  const weekRecords = history.filter((r) => {
    const d = new Date(r.date);
    const now = new Date();
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return d >= weekAgo;
  });
  const weekMinutes = weekRecords.reduce((sum, r) => sum + r.totalMinutes, 0);
  const weekHours = weekMinutes / 60;
  const avgDaily = weekRecords.length > 0 ? weekHours / weekRecords.length : 0;

  if (loading) {
    return (
      <Layout title={t('worker.clock.title')} subtitle={t('worker.clock.subtitle')}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </Layout>
    );
  }

  if (!businessId || !memberId) {
    return (
      <Layout title={t('worker.clock.title')} subtitle={t('worker.clock.subtitle')}>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          No hay empresa activa. Si acabas de aceptar una invitación, espera unos segundos o recarga la página.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('worker.clock.title')} subtitle={t('worker.clock.subtitle')}>
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {isDelivery ? (
          <WorkerStoreScheduleCard workCenter={workCenter} storeLabel={storeLabel} />
        ) : null}

        {/* Main Clock Card */}
        <div className={`relative overflow-hidden rounded-2xl p-8 text-center transition-all duration-700 ${
          isClockedIn
            ? isOnBreak
              ? 'bg-gradient-to-br from-amber-500 to-orange-600'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600'
            : 'bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800'
        }`}>
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute w-96 h-96 bg-white/5 rounded-full -top-48 -right-48" />
            <div className="absolute w-72 h-72 bg-white/5 rounded-full -bottom-36 -left-36" />
          </div>

          <div className="relative">
            <p className="text-white/60 text-sm font-medium mb-2">
              {isClockedIn
                ? isOnBreak ? t('worker.clock.onBreak', 'En descanso') : t('worker.clock.working', 'Trabajando')
                : t('worker.clock.readyToStart', 'Listo para empezar')}
            </p>

            <div className="text-6xl sm:text-7xl font-bold text-white font-mono tracking-wider mb-2">
              {formatClockTimer(elapsedSeconds)}
            </div>

            {isClockedIn && record && record.entries.find(e => e.type === 'clock_in') && (
              <p className="text-white/50 text-sm mb-1">
                {t('worker.clock.startedAt', 'Iniciado a las')} {new Date(getDisplayTime(record.entries.find(e => e.type === 'clock_in')!, record)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            {breakSeconds > 0 && (
              <p className="text-white/50 text-xs">
                <Coffee className="w-3 h-3 inline mr-1" />
                {t('worker.clock.breakTime', 'Descanso')}: {formatClockTimer(breakSeconds)}
              </p>
            )}

            {isClockedIn && !isOnBreak && remainingMinutes < 30 && (
              <p className="text-amber-200 text-xs mt-1 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Auto-salida en {Math.floor(remainingMinutes / 60)}h {remainingMinutes % 60}m
              </p>
            )}

            <div className="flex items-center justify-center gap-3 mt-6">
              {!isClockedIn ? (
                <button
                  onClick={() => void handleClockIn()}
                  disabled={acting || (record?.status === 'completed')}
                  className="flex items-center gap-3 px-8 py-4 bg-white text-emerald-600 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {acting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                  {t('worker.clock.clockIn', 'Fichar entrada')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void handleBreakToggle()}
                    disabled={acting}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 ${
                      isOnBreak
                        ? 'bg-white text-amber-600 hover:bg-amber-50'
                        : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                    }`}
                  >
                    {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coffee className="w-5 h-5" />}
                    {isOnBreak ? t('worker.clock.endBreak', 'Fin descanso') : t('worker.clock.startBreak', 'Descanso')}
                  </button>
                  <button
                    onClick={() => void handleClockOut()}
                    disabled={acting}
                    className="flex items-center gap-2 px-5 py-3 bg-white text-red-600 rounded-xl font-semibold shadow-lg hover:bg-red-50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
                    {t('worker.clock.clockOut', 'Fichar salida')}
                  </button>
                </>
              )}
            </div>

            {record?.status === 'completed' && (
              <p className="text-white/40 text-xs mt-3">
                {t('worker.clock.completedToday', 'Ya fichaste hoy. El fichaje ha sido completado.')}
              </p>
            )}

            <div className={`flex items-center justify-center gap-1.5 mt-3 text-xs ${
              geoStatus === 'granted' || geoLocation
                ? 'text-emerald-200'
                : geoStatus === 'denied' ? 'text-red-200' : 'text-white/40'
            }`}>
              {geoStatus === 'granted' || geoLocation ? (
                <>
                  <MapPin className="w-3.5 h-3.5" />
                  {t('worker.clock.geoActive', 'Ubicación activada')}
                </>
              ) : geoStatus === 'denied' ? (
                <>
                  <MapPinOff className="w-3.5 h-3.5" />
                  {t('worker.clock.geoDenied', 'Ubicación denegada')}
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5" />
                  {t('worker.clock.geoRequired', 'Se solicitará ubicación al fichar')}
                </>
              )}
            </div>

            {isClockedIn && !isOnBreak && (
              <p className="text-white/30 text-[10px] mt-3">
                {t('worker.clock.autoStopInfo', 'Se fichará salida automáticamente tras 4h continuas sin descanso')}
              </p>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('worker.clock.weekHours', 'Horas semana'), value: `${weekHours.toFixed(1)}h`, icon: <Clock className="w-4 h-4" />, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
            { label: t('worker.clock.dailyAvg', 'Media diaria'), value: `${avgDaily.toFixed(1)}h`, icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400' },
            { label: t('worker.clock.daysWorked', 'Días trabajados'), value: `${weekRecords.length}`, icon: <CalendarDays className="w-4 h-4" />, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400' },
            { label: t('worker.clock.extraHours', 'Horas extra'), value: weekHours > 40 ? `+${(weekHours - 40).toFixed(1)}h` : '0h', icon: <Timer className="w-4 h-4" />, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${stat.color}`}>
                {stat.icon}
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* History */}
        <HistorySection history={history} t={t} />
      </div>
    </Layout>
  );
}

// ─── History Section with month navigation ────────────────────────────────────

function HistorySection({ history, t }: { history: ClockinRecord[]; t: (key: string, fallback?: string) => string }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthOffset);
    return d;
  }, [monthOffset]);

  const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const monthRecords = useMemo(
    () => history.filter((r) => r.date.startsWith(monthKey)).sort((a, b) => b.date.localeCompare(a.date)),
    [history, monthKey],
  );

  const monthTotalMinutes = monthRecords.reduce((s, r) => s + r.totalMinutes, 0);
  const monthBreakMinutes = monthRecords.reduce((s, r) => s + r.breakMinutes, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize min-w-[140px] text-center">{monthLabel}</h3>
          <button onClick={() => setMonthOffset((o) => Math.max(0, o - 1))} disabled={monthOffset === 0} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{monthRecords.length} días</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatMinutes(monthTotalMinutes)}</span>
        </div>
      </div>

      {monthRecords.length > 0 && (
        <div className="grid grid-cols-3 gap-3 p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{monthRecords.length}</p>
            <p className="text-[10px] text-gray-500 uppercase">Días trabajados</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatMinutes(monthTotalMinutes)}</p>
            <p className="text-[10px] text-gray-500 uppercase">Total trabajado</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatMinutes(monthBreakMinutes)}</p>
            <p className="text-[10px] text-gray-500 uppercase">Descansos</p>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {monthRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
            {t('worker.clock.noHistory', 'Sin fichajes este mes')}
          </div>
        ) : (
          monthRecords.map((entry) => {
            const ciEntry = entry.entries.find((e) => e.type === 'clock_in');
            const coEntry = entry.entries.find((e) => e.type === 'clock_out');
            const ciTime = ciEntry ? new Date(getDisplayTime(ciEntry, entry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            const coTime = coEntry ? new Date(getDisplayTime(coEntry, entry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

            return (
              <div key={entry._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.date}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {ciTime} → {coTime} · <Coffee className="w-3 h-3 inline" /> {entry.breakMinutes} min
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {formatMinutes(entry.totalMinutes)}
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {t('worker.clock.complete', 'Completado')}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
