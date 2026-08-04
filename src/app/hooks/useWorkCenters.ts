import { useState, useEffect, useRef } from 'react';
import { listWorkCentersForDelivery, type WorkCenter } from '../lib/workCentersApi';
import { loadInviteWorkCenters } from '../lib/inviteWorkCenters';
import { isDeliveryOpsBusinessType } from '../lib/deliveryOpsTypes';
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
  const { currentBusiness, businesses } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = currentBusiness?.business_id;
  const businessType = currentBusiness?.businessType;
  const cacheId = buildCacheKey(dataUserId, businessId);

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>(
    cacheKey === cacheId && cachedCenters ? cachedCenters : [],
  );
  const [loading, setLoading] = useState(!cachedCenters || cacheKey !== cacheId);
  const mounted = useRef(true);
  const userRef = useRef(user);
  const businessRef = useRef(currentBusiness);
  const businessesRef = useRef(businesses);
  userRef.current = user;
  businessRef.current = currentBusiness;
  businessesRef.current = businesses;

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

    let cancelled = false;

    async function load(force = false) {
      if (!force && cacheKey === cacheId && cachedCenters) {
        if (!cancelled) {
          setWorkCenters(cachedCenters);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        if (force) {
          cachedCenters = null;
          cacheKey = null;
          pendingPromise = null;
          pendingPromiseKey = null;
        }
        if (pendingPromiseKey !== cacheId || !pendingPromise) {
          pendingPromiseKey = cacheId;
          const biz = businessRef.current;
          const authUser = userRef.current;
          const allBiz = businessesRef.current;
          pendingPromise = isDeliveryOpsBusinessType(biz?.businessType)
            ? loadInviteWorkCenters(authUser, biz, {
                allBusinesses: allBiz,
                accountBusinessCount: allBiz.length,
              })
            : listWorkCentersForDelivery(dataUserId, biz);
        }
        const result = await pendingPromise;
        cachedCenters = result;
        cacheKey = cacheId;
        if (!cancelled && mounted.current) setWorkCenters(result);
      } catch {
        if (!cancelled && mounted.current) setWorkCenters([]);
      } finally {
        pendingPromise = null;
        pendingPromiseKey = null;
        if (!cancelled && mounted.current) setLoading(false);
      }
    }

    void load(false);

    const onChanged = () => {
      void load(true);
    };
    window.addEventListener('work-centers:changed', onChanged);

    // Solo ids/tipo estables: `user` / `currentBusiness` / `businesses` cambian de
    // referencia a menudo y dejaban «Mi tienda» / fichar en bucle de Cargando…
    return () => {
      cancelled = true;
      window.removeEventListener('work-centers:changed', onChanged);
    };
  }, [dataUserId, cacheId, businessType]);

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
