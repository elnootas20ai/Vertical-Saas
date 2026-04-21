import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useSSE } from './useSSE';
import { fetchCompraventaData, type CompraventaData, type CompraventaFilters } from '../lib/compraventaApi';

interface UseCompraventaHubResult {
  data: CompraventaData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  isManager: boolean;
}

const DEBOUNCE_MS = 2_000;

export function useCompraventaHub(filters: CompraventaFilters): UseCompraventaHubResult {
  const { user, token } = useAuth();
  const { currentBusiness } = useBusiness();
  const [data, setData] = useState<CompraventaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const userId = user?.userId || user?._id || '';
  const businessId = currentBusiness?.business_id || '';

  const role = useMemo(() => {
    if (!currentBusiness || !userId) return '';
    const member = currentBusiness.members?.find(
      (m: { user_id: string; role?: string }) => m.user_id === userId,
    );
    return member?.role || user?.role || '';
  }, [currentBusiness, userId, user]);

  const isManager = role === 'Admin' || role === 'Gerente';

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await fetchCompraventaData(userId, filters);
      if (mountedRef.current) {
        setData(result);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Error cargando datos');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, filters.branchId, filters.responsibleId, filters.vehicleStatus, filters.salesChannel]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load();
    }, DEBOUNCE_MS);
  }, [load]);

  const sseHandlers = useMemo(() => ({
    vehicle_update: () => debouncedRefresh(),
    sale_update: () => debouncedRefresh(),
    lead_update: () => debouncedRefresh(),
    alert: () => debouncedRefresh(),
    notification: () => debouncedRefresh(),
  }), [debouncedRefresh]);

  useSSE({
    userId,
    token: token || null,
    businessId,
    handlers: sseHandlers,
    enabled: !!userId && !!token,
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { data, loading, error, lastUpdated, refresh: load, isManager };
}
