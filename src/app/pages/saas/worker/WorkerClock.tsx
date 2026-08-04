import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { type ClockinRecord } from '../../../lib/clockinsApi';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';
import { WorkerStoreScheduleCard } from '../../../components/saas/worker/WorkerStoreScheduleCard';
import { WorkerClockInCard } from '../../../components/saas/worker/WorkerClockInCard';
import { ClockinHistoryPanel } from '../../../components/saas/clockins/ClockinHistoryPanel';
import { hasOpeningHoursPayload } from '../../../lib/businessHoursUtils';
import { WORKER_PAGE_WIDE } from '../../../lib/workerUi';

export function WorkerClock() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = String(user?.user_id || user?.id || '').trim();
  const memberName = user?.fullName || '';
  const {
    workCenter,
    resolvedWorkCenter,
    storeLabel,
    hasAssignment,
    storeHoursToday,
    personalShiftToday,
    hasPersonalSchedule,
    personalDayOff,
    memberSchedule,
    scheduleLoading,
    storeResolving,
    loading: storeLoading,
  } = useWorkerAssignedStore();

  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [seedRecords, setSeedRecords] = useState<ClockinRecord[]>([]);

  const onSessionCompleted = useCallback((rec: ClockinRecord) => {
    if (rec.status !== 'completed') return;
    setSeedRecords((prev) => {
      const rest = prev.filter((r) => r._id !== rec._id);
      return [rec, ...rest].slice(0, 50);
    });
    setHistoryRefresh((n) => n + 1);
  }, []);

  const showStoreBlock = useMemo(() => {
    if (storeLoading || storeResolving || scheduleLoading) return false;
    if (hasPersonalSchedule || personalShiftToday) return true;
    if (hasAssignment && (workCenter || storeLabel)) return true;
    if (resolvedWorkCenter && hasOpeningHoursPayload(resolvedWorkCenter.openingHours)) return true;
    return false;
  }, [
    storeLoading,
    storeResolving,
    scheduleLoading,
    hasPersonalSchedule,
    personalShiftToday,
    hasAssignment,
    workCenter,
    storeLabel,
    resolvedWorkCenter,
  ]);

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
      <div className={`${WORKER_PAGE_WIDE} flex flex-col gap-3`}>
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:gap-4">
          <div className="min-w-0">
            <WorkerClockInCard
              businessId={businessId}
              memberId={memberId}
              memberName={memberName}
              size="md"
              showHistoryLink={false}
              onSessionCompleted={onSessionCompleted}
            />
          </div>
          <div className="min-w-0">
            {storeLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-stone-200 bg-white py-10 dark:border-stone-700 dark:bg-stone-900">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--v-blue,#2563eb)]" />
              </div>
            ) : showStoreBlock ? (
              <WorkerStoreScheduleCard
                workCenter={workCenter}
                storeLabel={storeLabel}
                hasAssignment={hasAssignment}
                storeHoursToday={storeHoursToday}
                personalShiftToday={personalShiftToday}
                hasPersonalSchedule={hasPersonalSchedule}
                personalDayOff={personalDayOff}
                memberSchedule={memberSchedule}
                scheduleLoading={scheduleLoading}
                storeResolving={storeResolving}
              />
            ) : null}
          </div>
        </div>

        {/* Abajo: historial encajado en panel (altura fija + scroll) */}
        <div className="h-[340px] min-h-[280px] max-h-[40vh]">
          <ClockinHistoryPanel
            businessId={businessId}
            memberId={memberId}
            refreshKey={historyRefresh}
            seedRecords={seedRecords}
            compact
          />
        </div>
      </div>
    </Layout>
  );
}
