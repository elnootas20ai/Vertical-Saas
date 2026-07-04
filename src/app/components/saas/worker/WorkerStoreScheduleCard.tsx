import { Store, Clock, MapPin } from 'lucide-react';
import type { WorkCenter } from '../../../lib/workCentersApi';
import {
  formatStoreHoursToday,
  getScheduleDayKeyForDate,
  listStoreHoursWeek,
} from '../../../lib/workerStoreHours';
import { SCHEDULE_DAY_LABELS_ES } from '../../../lib/businessHoursUtils';
import { useBusiness } from '../../../context/BusinessContext';
import { getHrLocationCopy } from '../../../lib/retailLocationCopy';

interface WorkerStoreScheduleCardProps {
  workCenter: WorkCenter | null;
  storeLabel?: string;
  compact?: boolean;
}

export function WorkerStoreScheduleCard({
  workCenter,
  storeLabel,
  compact = false,
}: WorkerStoreScheduleCardProps) {
  const { currentBusiness } = useBusiness();
  const hrCopy = getHrLocationCopy(currentBusiness?.businessType);
  const todayKey = getScheduleDayKeyForDate();
  const today = formatStoreHoursToday(workCenter);
  const week = listStoreHoursWeek(workCenter);
  const title = storeLabel || workCenter?.name || hrCopy.workerStoreFallback;

  if (!workCenter) {
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
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Hoy ({SCHEDULE_DAY_LABELS_ES[todayKey]}):{' '}
                <span className={today.open ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold'}>
                  {today.open ? today.label : 'Cerrado'}
                </span>
              </p>
            </div>
          </div>
          <Clock className="w-5 h-5 text-orange-400 shrink-0" />
        </div>
      </div>
    );
  }

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
      <div className="px-5 py-3 bg-orange-50/60 dark:bg-orange-950/20 border-b border-orange-100 dark:border-orange-900/40">
        <p className="text-xs uppercase tracking-wide text-orange-700 dark:text-orange-300 font-semibold mb-1">Hoy</p>
        <p className={`text-lg font-bold ${today.open ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>
          {today.open ? today.label : 'Cerrado'}
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {week.map((row) => (
          <div
            key={row.dayKey}
            className={`flex items-center justify-between px-5 py-2.5 text-sm ${
              row.isToday ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
            }`}
          >
            <span className={`${row.isToday ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
              {row.label}
              {row.isToday ? ' · hoy' : ''}
            </span>
            <span className={row.open ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}>
              {row.text}
            </span>
          </div>
        ))}
      </div>
      {workCenter.address ? (
        <div className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 border-t border-gray-100 dark:border-gray-700">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {[workCenter.address, workCenter.city].filter(Boolean).join(', ')}
        </div>
      ) : null}
    </div>
  );
}
