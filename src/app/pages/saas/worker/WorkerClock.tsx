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
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  type ClockinRecord,
  listClockins,
  getDisplayTime,
} from '../../../lib/clockinsApi';
import { useWorkerClockIn, formatClockTimer } from '../../../hooks/useWorkerClockIn';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';
import { WorkerStoreScheduleCard } from '../../../components/saas/worker/WorkerStoreScheduleCard';
import { ClockinHistoryPanel } from '../../../components/saas/clockins/ClockinHistoryPanel';

export function WorkerClock() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = user?.user_id || '';
  const memberName = user?.fullName || '';
  const { showStoreBlock, workCenter, storeLabel, assignedPdvId, canClockInEntry, loading: storeLoading } = useWorkerAssignedStore();

  const storeContext = useMemo(
    () =>
      assignedPdvId
        ? { sales_point_id: assignedPdvId, sales_point_name: storeLabel || undefined }
        : undefined,
    [assignedPdvId, storeLabel],
  );

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
  } = useWorkerClockIn(businessId, memberId, memberName, storeContext);

  const [history, setHistory] = useState<ClockinRecord[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);

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
  }, [loadHistory, historyRefresh]);

  const handleClockOut = useCallback(async () => {
    const rec = await baseClockOut();
    if (rec) {
      setHistory((prev) => [rec, ...prev].slice(0, 50));
      setHistoryRefresh((n) => n + 1);
    }
  }, [baseClockOut]);

  const weekRecords = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return history.filter((r) => new Date(r.date) >= weekAgo);
  }, [history]);

  const weekMinutes = weekRecords.reduce((sum, r) => sum + r.totalMinutes, 0);
  const weekHours = weekMinutes / 60;
  const weekDaysWorked = new Set(weekRecords.map((r) => r.date)).size;
  const avgDaily = weekDaysWorked > 0 ? weekHours / weekDaysWorked : 0;

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

        {showStoreBlock ? (
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

            <div className="flex flex-col items-center justify-center gap-2 mt-6">
              {!isClockedIn ? (
                <>
                  <button
                    onClick={() => void handleClockIn()}
                    disabled={acting || storeLoading || !canClockInEntry || (record?.status === 'completed')}
                    className="flex items-center gap-3 px-8 py-4 bg-white text-emerald-600 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                  >
                    {acting || storeLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                    {t('worker.clock.clockIn', 'Fichar entrada')}
                  </button>
                  {!storeLoading && !canClockInEntry && record?.status !== 'completed' ? (
                    <p className="text-white/70 text-xs max-w-xs">
                      Sin tienda o local asignado. Pide a tu gerente que te asigne uno en Equipo para poder fichar.
                    </p>
                  ) : null}
                </>
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
            { label: t('worker.clock.daysWorked', 'Días trabajados'), value: `${weekDaysWorked}`, icon: <CalendarDays className="w-4 h-4" />, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400' },
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

        <ClockinHistoryPanel
          key={historyRefresh}
          businessId={businessId}
          memberId={memberId}
        />
      </div>
    </Layout>
  );
}
