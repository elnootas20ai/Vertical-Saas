import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Coffee,
  Loader2,
  MapPin,
  MapPinOff,
  ChevronRight,
} from 'lucide-react';
import { useWorkerClockIn, formatClockTimer } from '../../../hooks/useWorkerClockIn';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';

interface WorkerClockInCardProps {
  businessId: string;
  memberId: string;
  memberName: string;
  compact?: boolean;
  showHistoryLink?: boolean;
}

export function WorkerClockInCard({
  businessId,
  memberId,
  memberName,
  compact = false,
  showHistoryLink = true,
}: WorkerClockInCardProps) {
  const { t } = useTranslation();
  const { storeLabel, assignedPdvId, canClockInEntry, loading: storeLoading } = useWorkerAssignedStore();
  const storeContext =
    assignedPdvId
      ? { sales_point_id: assignedPdvId, sales_point_name: storeLabel || undefined }
      : undefined;
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
    handleClockOut,
    handleBreakToggle,
  } = useWorkerClockIn(businessId, memberId, memberName, storeContext);

  if (loading || storeLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const gradient = isClockedIn
    ? isOnBreak
      ? 'from-amber-500 to-orange-600'
      : 'from-emerald-500 to-teal-600'
    : 'from-slate-700 to-slate-900';

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!canClockInEntry && !isClockedIn ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Sin tienda o local asignado. Pide a tu gerente que te asigne uno en Equipo para poder fichar.
        </div>
      ) : null}

      <div className={`rounded-2xl bg-gradient-to-br ${gradient} ${compact ? 'p-5' : 'p-8'} text-center text-white`}>
        <p className="text-white/70 text-sm mb-1">
          {isClockedIn
            ? isOnBreak
              ? t('worker.clock.onBreak', 'En descanso')
              : t('worker.clock.working', 'Trabajando')
            : t('worker.clock.readyToStart', 'Listo para empezar')}
        </p>
        <p className={`font-bold font-mono tracking-wider mb-3 ${compact ? 'text-3xl' : 'text-5xl'}`}>
          {formatClockTimer(elapsedSeconds)}
        </p>
        {breakSeconds > 0 ? (
          <p className="text-white/60 text-xs mb-3">
            <Coffee className="w-3 h-3 inline mr-1" />
            {t('worker.clock.breakTime', 'Descanso')}: {formatClockTimer(breakSeconds)}
          </p>
        ) : null}

        <div className={`flex items-center justify-center gap-2 ${compact ? 'flex-wrap' : ''}`}>
          {!isClockedIn ? (
            <button
              type="button"
              onClick={() => void handleClockIn()}
              disabled={acting || !canClockInEntry || record?.status === 'completed'}
              className="inline-flex items-center gap-2 px-5 py-3 bg-white text-emerald-600 rounded-xl font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {t('worker.clock.clockIn', 'Fichar entrada')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleBreakToggle()}
                disabled={acting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-white/20 hover:bg-white/30 disabled:opacity-50"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4" />}
                {isOnBreak ? t('worker.clock.endBreak', 'Fin descanso') : t('worker.clock.startBreak', 'Descanso')}
              </button>
              <button
                type="button"
                onClick={() => void handleClockOut()}
                disabled={acting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-white text-red-600 disabled:opacity-50"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {t('worker.clock.clockOut', 'Fichar salida')}
              </button>
            </>
          )}
        </div>

        {record?.status === 'completed' ? (
          <p className="text-white/50 text-xs mt-3">{t('worker.clock.completedToday', 'Ya fichaste hoy.')}</p>
        ) : null}

        {isClockedIn && !isOnBreak && remainingMinutes < 30 ? (
          <p className="text-amber-100 text-xs mt-2">Auto-salida en {remainingMinutes} min</p>
        ) : null}

        <div className={`flex items-center justify-center gap-1.5 mt-3 text-xs ${
          geoStatus === 'granted' || geoLocation ? 'text-emerald-200' : geoStatus === 'denied' ? 'text-red-200' : 'text-white/50'
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
      </div>

      {showHistoryLink ? (
        <Link
          to="/saas/worker/clock"
          className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          Ver historial y fichaje completo
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>
      ) : null}
    </div>
  );
}
