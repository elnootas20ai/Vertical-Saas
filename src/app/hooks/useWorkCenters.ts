import { useState, useEffect, useRef } from 'react';
import { listWorkCentersForDelivery, type WorkCenter } from '../lib/workCentersApi';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';

let cachedCenters: WorkCenter[] | null = null;
let cacheKey: string | null = null;
let pendingPromise: Promise<WorkCenter[]> | null = null;
let pendingPromiseKey: string | null = null;

function buildCacheKey(dataUserId: string, businessId: string | undefined): string {
  return `${dataUserId}::${businessId || ''}`;
}

export function useWorkCenters() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = currentBusiness?.business_id;
  const cacheId = buildCacheKey(dataUserId, businessId);

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>(
    cacheKey === cacheId && cachedCenters ? cachedCenters : [],
  );
  const [loading, setLoading] = useState(!cachedCenters || cacheKey !== cacheId);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dataUserId) {
      setWorkCenters([]);
      setLoading(false);
      return;
    }
    if (cacheKey === cacheId && cachedCenters) {
      setWorkCenters(cachedCenters);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        if (pendingPromiseKey !== cacheId || !pendingPromise) {
          pendingPromiseKey = cacheId;
          pendingPromise = listWorkCentersForDelivery(dataUserId, currentBusiness);
        }
        const result = await pendingPromise;
        cachedCenters = result;
        cacheKey = cacheId;
        if (mounted.current) setWorkCenters(result);
      } catch {
        if (mounted.current) setWorkCenters([]);
      } finally {
        pendingPromise = null;
        pendingPromiseKey = null;
        if (mounted.current) setLoading(false);
      }
    }

    void load();
  }, [dataUserId, cacheId, currentBusiness]);

  const activeWorkCenters = workCenters.filter((wc) => wc.active);

  const workCenterMap = new Map(workCenters.map((wc) => [wc.id, wc.name]));

  function getWorkCenterName(id?: string): string {
    if (!id) return '';
    return workCenterMap.get(id) || '';
  }

  function invalidateCache() {
    cachedCenters = null;
    cacheKey = null;
  }

  return {
    workCenters,
    activeWorkCenters,
    loading,
    getWorkCenterName,
    hasWorkCenters: workCenters.length > 0,
    invalidateCache,
  };
}
