import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  fetchAlertSummary,
  SOURCE_LABELS,
  SOURCE_COLORS,
  type AlertSummary,
  type AlertSource,
} from '../../lib/alertCenterApi';
import {
  Bell, AlertCircle, AlertTriangle, CheckCircle,
  ArrowRight, RefreshCw,
} from 'lucide-react';

export function AlertSummaryWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?._id?.replace('business:', '') || currentBusiness?.id || user?.userId || '';

  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await fetchAlertSummary(businessId);
      setSummary(res.summary);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !summary) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div
        onClick={() => navigate('/saas/alerts')}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/50 px-6 py-8 transition hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800/30 dark:hover:border-gray-600"
      >
        <CheckCircle className="h-8 w-8 text-emerald-400" />
        <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">Sin alertas pendientes</p>
        <p className="mt-0.5 text-xs text-gray-400">Todo funciona correctamente</p>
      </div>
    );
  }

  const topSources = Object.entries(summary.bySource)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 4) as [AlertSource, number][];

  return (
    <div
      onClick={() => navigate('/saas/alerts')}
      className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            {summary.byStatus.new > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alertas globales</h3>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
      </div>

      {/* Counters */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-lg font-bold text-red-700 dark:text-red-400">{summary.byPriority.high}</span>
          </div>
          <p className="text-[10px] text-red-600/80 dark:text-red-400/60">Alta</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-lg font-bold text-amber-700 dark:text-amber-400">{summary.byPriority.medium}</span>
          </div>
          <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60">Media</p>
        </div>
        <div className="rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
          <div className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-lg font-bold text-blue-700 dark:text-blue-400">{summary.byPriority.low}</span>
          </div>
          <p className="text-[10px] text-blue-600/80 dark:text-blue-400/60">Baja</p>
        </div>
      </div>

      {/* Top sources */}
      {topSources.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {topSources.map(([src, count]) => (
            <div key={src} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: SOURCE_COLORS[src] || '#6B7280' }}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {SOURCE_LABELS[src] || src}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-900 dark:text-gray-200">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {summary.unresolved} sin resolver
        </span>
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          Ver todas →
        </span>
      </div>
    </div>
  );
}
