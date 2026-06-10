import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
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
      const [summaryRes, alertsRes] = await Promise.all([
        fetchAlertSummary(businessId),
        fetchAlerts(businessId, { status: 'new,seen', order: 'desc', page: 1, limit: 4 }),
      ]);
      setSummary(normalizeAlertSummary(summaryRes.summary));
      setRecent(alertsRes.alerts || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const goCenter = () => navigate('/saas/alerts');

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
          subtitle="Visión ejecutiva del negocio"
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
    .slice(0, 4) as [AlertSource, number][];

  return (
    <div
      className={`group cursor-pointer overflow-hidden rounded-2xl border border-zinc-200/90 transition hover:shadow-lg dark:border-zinc-800 ${embedded ? '' : 'shadow-sm'}`}
      role="button"
      tabIndex={0}
      onClick={goCenter}
      onKeyDown={(e) => { if (e.key === 'Enter') goCenter(); }}
    >
      <AlertProShell
        compact
        title="Centro de alertas"
        subtitle="Delivery · Finanzas · RRHH · Operaciones"
        badge={
          unresolved > 0 ? (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300 ring-1 ring-red-500/30">
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
        {recent.slice(0, 3).map((alert) => (
          <AlertProRow
            key={alert.id}
            alert={alert}
            showArrow={false}
            onClick={() => {
              if (alert.route) navigate(alert.route);
              else goCenter();
            }}
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
          </span>
          <span className="text-[11px] font-semibold text-zinc-700 transition group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-white">
            Ver todas →
          </span>
        </div>
      </div>
    </div>
  );
}
