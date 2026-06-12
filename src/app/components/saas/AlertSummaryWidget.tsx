import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  fetchAlerts,
  fetchAlertSummary,
  SOURCE_LABELS,
  SOURCE_COLORS,
  normalizeAlertSummary,
  type AlertSummary,
  type AlertRecord,
  type AlertSource,
} from '../../lib/alertCenterApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeAlertLists,
  mergeDocumentAlertsIntoSummary,
  isSyntheticDocumentAlert,
} from '../../lib/documentAlertsApi';
import { ArrowRight, RefreshCw } from 'lucide-react';
import {
  AlertProShell,
  AlertProKpiStrip,
  AlertProRow,
  AlertProEmpty,
} from './alertCenterProUi';

export function AlertSummaryWidget({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId =
    currentBusiness?.business_id?.replace(/^business:/, '')
    || currentBusiness?.id?.replace(/^business:/, '')
    || user?.user_id
    || user?.id
    || '';
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [recent, setRecent] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [summaryRes, alertsRes, docAlerts] = await Promise.all([
        fetchAlertSummary(businessId),
        fetchAlerts(businessId, { status: 'new,seen', order: 'desc', page: 1, limit: 8 }),
        dataUserId ? fetchDocumentAlertsAsRecords(dataUserId, businessId) : Promise.resolve([]),
      ]);
      const baseSummary = normalizeAlertSummary(summaryRes.summary);
      const mergedSummary = mergeDocumentAlertsIntoSummary(baseSummary, docAlerts);
      const mergedRecent = mergeAlertLists(alertsRes.alerts || [], docAlerts, 5);
      setSummary(mergedSummary);
      setRecent(mergedRecent);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [businessId, dataUserId]);

  useEffect(() => { void load(); }, [load]);

  const goCenter = () => navigate('/saas/alerts');

  const handleAlertClick = (alert: AlertRecord) => {
    if (alert.route) navigate(alert.route);
    else goCenter();
  };

  if (loading && !summary) {
    return (
      <div className={`flex h-52 items-center justify-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${embedded ? 'border-dashed' : ''}`}>
        <RefreshCw className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const hasAlerts = (summary?.unresolved ?? 0) > 0;
  const highCount = summary?.byPriority?.high ?? 0;
  const unresolved = summary?.unresolved ?? 0;

  if (!hasAlerts) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={goCenter}
        onKeyDown={(e) => { if (e.key === 'Enter') goCenter(); }}
        className={`group cursor-pointer overflow-hidden rounded-2xl border border-zinc-200/90 transition hover:shadow-lg dark:border-zinc-800 ${embedded ? '' : 'shadow-sm'}`}
      >
        <AlertProShell
          compact
          title="Centro de alertas"
          subtitle="Stock · Finanzas · RRHH · Documentación"
        />
        <div className="bg-white dark:bg-zinc-950">
          <AlertProEmpty />
          <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 transition group-hover:text-zinc-900 dark:group-hover:text-zinc-200">
              Abrir centro de alertas <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  const topSources = Object.entries(summary?.bySource || {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5) as [AlertSource, number][];

  return (
    <div
      className={`group overflow-hidden rounded-2xl border border-zinc-200/90 transition hover:shadow-lg dark:border-zinc-800 ${embedded ? '' : 'shadow-sm'}`}
    >
      <AlertProShell
        compact
        title="Centro de alertas"
        subtitle="Stock · Finanzas · RRHH · Documentación · Operaciones"
        badge={
          unresolved > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900/50">
              {unresolved} activas
            </span>
          ) : undefined
        }
        kpis={(
          <AlertProKpiStrip
            compact
            unresolved={unresolved}
            high={highCount}
            newCount={summary?.byStatus?.new ?? 0}
          />
        )}
      />

      <div className="space-y-2 bg-zinc-50 p-3 dark:bg-zinc-950">
        {recent.slice(0, 5).map((alert) => (
          <AlertProRow
            key={alert.id}
            alert={alert}
            showArrow={false}
            onClick={() => handleAlertClick(alert)}
          />
        ))}

        {topSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            {topSources.map(([src, count]) => (
              <span
                key={src}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[src] || '#71717a' }} />
                {SOURCE_LABELS[src] || src}
                <span className="font-bold text-zinc-900 dark:text-zinc-200">{count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-200/80 px-1 pt-3 dark:border-zinc-800">
          <span className="text-[11px] text-zinc-500">
            {summary?.byStatus?.new ?? 0} nuevas sin leer
            {recent.some((a) => isSyntheticDocumentAlert(a.id)) && ' · incl. documentación'}
          </span>
          <button
            type="button"
            onClick={goCenter}
            className="text-[11px] font-semibold text-zinc-700 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            Ver todas →
          </button>
        </div>
      </div>
    </div>
  );
}
