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
import type { ClockinRecord } from '../../../lib/clockinsApi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_DANGER, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

interface WorkerClockInCardProps {
  businessId: string;
  memberId: string;
  memberName: string;
  /** sm = muy denso · md = equilibrado (recomendado) · lg = grande */
  size?: 'sm' | 'md' | 'lg';
  /** @deprecated usar size="sm" */
  compact?: boolean;
  showHistoryLink?: boolean;
  onSessionCompleted?: (rec: ClockinRecord) => void;
}

export function WorkerClockInCard({
  businessId,
  memberId,
  memberName,
  size,
  compact = false,
  showHistoryLink = true,
  onSessionCompleted,
}: WorkerClockInCardProps) {
  const cardSize: 'sm' | 'md' | 'lg' = size || (compact ? 'sm' : 'lg');
  const isSm = cardSize === 'sm';
  const isMd = cardSize === 'md';
  const { t } = useTranslation();
  const {
    storeLabel,
    assignedPdvId,
    assignedWorkCenterId,
    canClockInEntry,
    hasAssignment,
    explicitAssignment,
    loading: storeLoading,
  } = useWorkerAssignedStore();

  // Tienda de la contratación (Equipo / invitación). Enlaza el fichaje a ese local.
  const storeId = String(assignedPdvId || assignedWorkCenterId || '').trim().replace(/^wc:/, '');
  const wcId = String(assignedWorkCenterId || storeId || '').trim().replace(/^wc:/, '');
  const cleanStoreLabel = String(storeLabel || '').trim();
  const storeContext = storeId
    ? {
        sales_point_id: storeId,
        sales_point_name: cleanStoreLabel || undefined,
        work_center_id: wcId || storeId,
      }
    : undefined;

  const {
    loading,
    acting,
    error,
    info,
    isClockedIn,
    isOnBreak,
    elapsedSeconds,
    breakSeconds,
    remainingMinutes,
    autoOutUsesShiftEnd,
    todaySessionCount,
    canStartNewSession,
    geoLocation,
    geoStatus,
    handleClockIn,
    handleClockOut,
    handleBreakToggle,
  } = useWorkerClockIn(businessId, memberId, memberName, storeContext, {
    onSessionCompleted,
  });

  if (loading || storeLoading) {
    return (
      <div className={`flex justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 ${isSm ? 'p-4' : isMd ? 'p-5' : 'p-6'}`}>
        <Loader2 className="h-5 w-5 animate-spin text-[var(--v-blue,#2563eb)]" />
      </div>
    );
  }

  const shellClass = isClockedIn
    ? isOnBreak
      ? 'border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30'
      : 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30'
    : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900';

  const titleClass = isClockedIn
    ? isOnBreak
      ? 'text-amber-800 dark:text-amber-200'
      : 'text-emerald-800 dark:text-emerald-200'
    : 'text-stone-600 dark:text-stone-300';

  const timerClass = isClockedIn
    ? isOnBreak
      ? 'text-amber-900 dark:text-amber-100'
      : 'text-emerald-900 dark:text-emerald-100'
    : 'text-stone-900 dark:text-stone-50';

  const btnPrimary = isSm
    ? `${VERTIAL_BTN_PRIMARY} !min-h-9 w-full !px-3 !py-2 !text-sm`
    : isMd
      ? `${VERTIAL_BTN_PRIMARY} !min-h-10 w-full !px-4 !py-2.5 !text-sm`
      : `${VERTIAL_BTN_PRIMARY} px-6 py-3 text-base`;
  const btnSecondary = isSm
    ? `${VERTIAL_BTN_SECONDARY} !min-h-9 flex-1 !px-2.5 !py-2 !text-xs`
    : isMd
      ? `${VERTIAL_BTN_SECONDARY} !min-h-10 flex-1 !px-3 !py-2 !text-sm`
      : VERTIAL_BTN_SECONDARY;
  const btnDanger = isSm
    ? `${VERTIAL_BTN_DANGER} !min-h-9 flex-1 !px-2.5 !py-2 !text-xs`
    : isMd
      ? `${VERTIAL_BTN_DANGER} !min-h-10 flex-1 !px-3 !py-2 !text-sm`
      : VERTIAL_BTN_DANGER;

  const timerSize = isSm ? 'text-2xl' : isMd ? 'text-4xl' : 'text-5xl';
  const padSize = isSm ? 'p-3.5' : isMd ? 'p-5' : 'p-6 sm:p-8';
  const titleSize = isSm ? 'text-xs' : 'text-sm';
  const stackButtons = isSm || isMd;

  return (
    <div className={isSm ? 'space-y-2' : 'space-y-3'}>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          {info}
        </div>
      ) : null}

      {(explicitAssignment || hasAssignment) && cleanStoreLabel ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200">
          Tienda: <span className="font-semibold">{cleanStoreLabel}</span>
        </div>
      ) : (explicitAssignment || hasAssignment) && storeId && !cleanStoreLabel ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200">
          Tienda asignada (cargando…)
        </div>
      ) : !hasAssignment && !isClockedIn ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-300">
          Sin tienda asignada. Puedes fichar igual.
        </div>
      ) : null}

      <div className={`rounded-2xl border text-center shadow-sm ${shellClass} ${padSize}`}>
        <p className={`mb-0.5 font-medium ${titleSize} ${titleClass}`}>
          {isClockedIn
            ? isOnBreak
              ? t('worker.clock.onBreak', 'En descanso')
              : t('worker.clock.working', 'Trabajando')
            : t('worker.clock.readyToStart', 'Listo para empezar')}
        </p>
        <p className={`mb-3 font-mono font-bold tracking-wider ${timerSize} ${timerClass}`}>
          {formatClockTimer(elapsedSeconds)}
        </p>
        {breakSeconds > 0 ? (
          <p className={`mb-2 text-stone-500 dark:text-stone-400 ${isSm ? 'text-[11px]' : 'text-xs'}`}>
            <Coffee className="mr-1 inline h-3 w-3" />
            {t('worker.clock.breakTime', 'Descanso')}: {formatClockTimer(breakSeconds)}
          </p>
        ) : null}

        <div className={`flex items-center justify-center gap-2 ${stackButtons ? 'flex-col' : ''}`}>
          {!isClockedIn ? (
            <button
              type="button"
              onClick={() => void handleClockIn()}
              disabled={acting || !canClockInEntry || !canStartNewSession}
              className={btnPrimary}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {todaySessionCount > 0
                ? t('worker.clock.clockInAgain', 'Fichar entrada otra vez')
                : t('worker.clock.clockIn', 'Fichar entrada')}
            </button>
          ) : (
            <div className={`flex w-full gap-2 ${stackButtons ? '' : 'justify-center'}`}>
              <button
                type="button"
                onClick={() => void handleBreakToggle()}
                disabled={acting}
                className={btnSecondary}
              >
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coffee className="h-3.5 w-3.5" />}
                {isOnBreak ? t('worker.clock.endBreak', 'Fin descanso') : t('worker.clock.startBreak', 'Descanso')}
              </button>
              <button
                type="button"
                onClick={() => void handleClockOut()}
                disabled={acting}
                className={btnDanger}
              >
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                {t('worker.clock.clockOut', 'Fichar salida')}
              </button>
            </div>
          )}
        </div>

        {!isClockedIn && canStartNewSession && todaySessionCount > 0 ? (
          <p className="mt-2 text-[11px] text-stone-500">
            Turnos hoy: {todaySessionCount}
          </p>
        ) : null}

        {isClockedIn && !isOnBreak && remainingMinutes <= 15 && Number.isFinite(remainingMinutes) ? (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
            {autoOutUsesShiftEnd
              ? `Salida automática en ${remainingMinutes} min`
              : `Auto-salida en ${remainingMinutes} min`}
          </p>
        ) : null}

        <div className={`mt-2.5 flex items-center justify-center gap-1 text-[11px] ${
          geoStatus === 'granted' || geoLocation
            ? 'text-emerald-600 dark:text-emerald-400'
            : geoStatus === 'denied'
              ? 'text-red-600 dark:text-red-400'
              : 'text-stone-400'
        }`}>
          {geoStatus === 'granted' || geoLocation ? (
            <>
              <MapPin className="h-3 w-3" />
              {t('worker.clock.geoActive', 'Ubicación activada')}
            </>
          ) : geoStatus === 'denied' ? (
            <>
              <MapPinOff className="h-3 w-3" />
              {t('worker.clock.geoDenied', 'Ubicación denegada')}
            </>
          ) : (
            <>
              <MapPin className="h-3 w-3" />
              {isSm || isMd
                ? 'Ubicación opcional'
                : t('worker.clock.geoRequired', 'Se pedirá ubicación al fichar (opcional)')}
            </>
          )}
        </div>
      </div>

      {showHistoryLink ? (
        <Link
          to="/saas/worker/clock"
          className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Ver historial y fichaje completo
          <ChevronRight className="h-4 w-4 text-stone-400" />
        </Link>
      ) : null}
    </div>
  );
}
