import { useEffect, useState } from 'react';
import { useBusiness } from '../context/BusinessContext';
import { listFinanceMovements } from '../lib/financeApi';
import {
  computeCoreEbitdaForMonth,
  resolveCoreEbitdaBusinessScope,
  type CoreEbitdaSnapshot,
} from '../lib/ebitdaMetrics';
import { localCalendarDayKey } from '../lib/tpvCajaScope';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import { useAuth } from '../context/AuthContext';

/**
 * EBITDA mes (core) para la empresa activa.
 * Se alimenta de Finanzas: al registrar cobros/gastos (o sync TPV/pedidos) se actualiza.
 */
export function useCoreEbitdaMonth(enabled = true): {
  snapshot: CoreEbitdaSnapshot | null;
  loading: boolean;
  refresh: () => void;
} {
  const { authUser } = useAuth();
  const { businesses, currentBusiness } = useBusiness();
  const [snapshot, setSnapshot] = useState<CoreEbitdaSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '')
    .replace(/^business:/, '')
    .trim();
  const financeUserId = resolveBusinessDataUserId(authUser, currentBusiness);

  useEffect(() => {
    if (!enabled || !financeUserId || !businessId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const monthKey = localCalendarDayKey().slice(0, 7);
    const multiBusiness = (businesses || []).length > 1;
    const scope = resolveCoreEbitdaBusinessScope(businessId, { multiBusiness });

    void listFinanceMovements(financeUserId)
      .then((movs) => {
        if (cancelled) return;
        setSnapshot(computeCoreEbitdaForMonth(movs, monthKey, scope));
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, financeUserId, businessId, businesses, tick]);

  return {
    snapshot,
    loading,
    refresh: () => setTick((n) => n + 1),
  };
}
