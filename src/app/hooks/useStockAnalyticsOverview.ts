import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultStockAnalyticsRange,
  fetchStockAnalyticsOverview,
  STOCK_ANALYTICS_KPI_SEQUENCE,
  type StockAnalyticsDateRange,
  type StockAnalyticsKpi,
  type StockAnalyticsKpiId,
} from '../lib/stockAnalyticsApi';

type OverviewAlert = { id: string; severity: string; message: string };

/**
 * Una sola petición al servidor (overview). El panel sigue montándose solo al abrir/ver.
 */
export function useStockAnalyticsOverview(
  userId: string | null | undefined,
  options?: {
    enabled?: boolean;
    range?: StockAnalyticsDateRange;
    resetKey?: string;
  },
) {
  const enabled = Boolean(options?.enabled && userId);
  const range = options?.range ?? defaultStockAnalyticsRange(30);
  const [kpis, setKpis] = useState<Partial<Record<StockAnalyticsKpiId, StockAnalyticsKpi>>>({});
  const [alerts, setAlerts] = useState<OverviewAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    setReloadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      setKpis({});
      setAlerts([]);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const gen = reloadTick;

    setLoading(true);
    setError(null);

    void fetchStockAnalyticsOverview(userId, range, ctrl.signal)
      .then((overview) => {
        if (ctrl.signal.aborted || gen !== reloadTick) return;
        const map: Partial<Record<StockAnalyticsKpiId, StockAnalyticsKpi>> = {};
        for (const kpi of overview.kpis || []) {
          map[kpi.id] = kpi;
        }
        setKpis(map);
        setAlerts(overview.alerts || []);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Error cargando analytics');
        setKpis({});
        setAlerts([]);
      })
      .finally(() => {
        if (gen === reloadTick) setLoading(false);
      });

    return () => {
      ctrl.abort();
    };
  }, [
    enabled,
    userId,
    range.dateFrom,
    range.dateTo,
    range.businessId,
    options?.resetKey,
    reloadTick,
  ]);

  return {
    kpis,
    alerts,
    loading,
    error,
    reload,
    sequence: STOCK_ANALYTICS_KPI_SEQUENCE,
  };
}
