import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultStockAnalyticsRange,
  fetchStockAnalyticsInsights,
  type StockAnalyticsDateRange,
  type StockAnalyticsInsights,
} from '../lib/stockAnalyticsApi';

/**
 * Fase 3: evolución semanal, comparativa y P&L por tienda.
 * Solo debe activarse al expandir «Detalle gerencial» (lazy).
 */
export function useStockAnalyticsInsights(
  userId: string | null | undefined,
  options?: {
    enabled?: boolean;
    range?: StockAnalyticsDateRange;
    resetKey?: string;
  },
) {
  const enabled = Boolean(options?.enabled && userId);
  const range = options?.range ?? defaultStockAnalyticsRange(30);
  const [insights, setInsights] = useState<StockAnalyticsInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    setReloadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      setInsights(null);
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

    void fetchStockAnalyticsInsights(userId, range, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted || gen !== reloadTick) return;
        setInsights(data);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Error cargando detalle gerencial');
        setInsights(null);
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

  return { insights, loading, error, reload };
}
