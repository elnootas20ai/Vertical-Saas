import { useCallback, useEffect, useRef } from 'react';
import { useDeliveryOrdersLive } from './useDeliveryOrdersLive';

/** Refresco en portfolio solo mientras el CEO está en Visión general (montado + pestaña visible). */
const PORTFOLIO_POLL_MS = 90_000;
const PORTFOLIO_DEBOUNCE_MS = 900;

export type PortfolioReloadOptions = {
  /** Sin spinner de carga completa (actualización en segundo plano). */
  silent?: boolean;
  /** Cancela recarga en curso y vuelve a pedir datos (botón Actualizar). */
  force?: boolean;
};

export function usePortfolioDashboardLive(options: {
  enabled: boolean;
  authUserId: string | null;
  onRefresh: (opts?: PortfolioReloadOptions) => void | Promise<void>;
}) {
  const onRefreshRef = useRef(options.onRefresh);
  onRefreshRef.current = options.onRefresh;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSilentRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void onRefreshRef.current({ silent: true });
    }, PORTFOLIO_DEBOUNCE_MS);
  }, []);

  const { sseOk } = useDeliveryOrdersLive({
    authUserId: options.authUserId,
    businessId: null,
    onRefresh: scheduleSilentRefresh,
    enabled: options.enabled && !!options.authUserId,
    fallbackPollMs: PORTFOLIO_POLL_MS,
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { sseOk, scheduleSilentRefresh };
}
