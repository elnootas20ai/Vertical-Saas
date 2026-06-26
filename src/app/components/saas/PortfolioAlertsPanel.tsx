import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Bell, RefreshCw } from 'lucide-react';
import {
  fetchAlertSummary,
  normalizeAlertSummary,
  SOURCE_COLORS,
  SOURCE_LABELS,
  type AlertSource,
  type AlertSummary,
} from '../../lib/alertCenterApi';

type PortfolioAlertRow = {
  businessId: string;
  businessName: string;
  summary: AlertSummary;
};

interface PortfolioAlertsPanelProps {
  rows: { businessId: string; business: { name: string } }[];
}

export function PortfolioAlertsPanel({ rows }: PortfolioAlertsPanelProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PortfolioAlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!rows.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        rows.map(async (r) => {
          try {
            const res = await fetchAlertSummary(r.businessId);
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              summary: normalizeAlertSummary(res.summary),
            };
          } catch {
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              summary: normalizeAlertSummary(null),
            };
          }
        }),
      );
      setItems(results);
    } finally {
      setLoading(false);
    }
  }, [rows]);

  useEffect(() => {
    void load();
  }, [load]);

  const aggregate = useMemo(() => {
    let unresolved = 0;
    let high = 0;
    let newest = 0;
    const bySource: Partial<Record<AlertSource, number>> = {};
    for (const item of items) {
      unresolved += item.summary.unresolved;
      high += item.summary.byPriority.high;
      newest += item.summary.byStatus.new;
      for (const [src, count] of Object.entries(item.summary.bySource || {})) {
        const key = src as AlertSource;
        bySource[key] = (bySource[key] || 0) + (Number(count) || 0);
      }
    }
    return { unresolved, high, newest, bySource };
  }, [items]);

  const activeBusinesses = useMemo(
    () =>
      [...items]
        .filter((i) => i.summary.unresolved > 0)
        .sort(
          (a, b) =>
            b.summary.byPriority.high - a.summary.byPriority.high
            || b.summary.unresolved - a.summary.unresolved,
        ),
    [items],
  );

  const topSources = useMemo(
    () =>
      Object.entries(aggregate.bySource)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 4) as [AlertSource, number][],
    [aggregate.bySource],
  );

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500" />
          Alertas del grupo
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/alerts')}
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Centro de alertas →
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : aggregate.unresolved === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Sin alertas activas en el grupo</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {rows.length} empresa{rows.length !== 1 ? 's' : ''} revisada{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Activas</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-300">{aggregate.unresolved}</p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Alta prioridad</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{aggregate.high}</p>
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Sin leer</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{aggregate.newest}</p>
            </div>
          </div>

          {topSources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {topSources.map(([src, count]) => (
                <span
                  key={src}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[src] || '#71717a' }} />
                  {SOURCE_LABELS[src] || src}
                  <span className="font-bold text-gray-900 dark:text-gray-200">{count}</span>
                </span>
              ))}
            </div>
          )}

          <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {activeBusinesses.map((item) => (
              <button
                key={item.businessId}
                type="button"
                onClick={() => navigate('/saas/alerts')}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
              >
                <AlertTriangle className={`w-4 h-4 shrink-0 ${item.summary.byPriority.high > 0 ? 'text-red-500' : 'text-amber-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{item.businessName}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    {item.summary.unresolved} activa{item.summary.unresolved !== 1 ? 's' : ''}
                    {item.summary.byPriority.high > 0 ? ` · ${item.summary.byPriority.high} urgentes` : ''}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
