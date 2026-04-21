import { useState, useEffect, useRef } from 'react';
import { listWorkCenters, type WorkCenter } from '../lib/workCentersApi';
import { useAuth } from '../context/AuthContext';

let cachedCenters: WorkCenter[] | null = null;
let cacheUserId: string | null = null;
let pendingPromise: Promise<WorkCenter[]> | null = null;

export function useWorkCenters() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>(
    cacheUserId === userId && cachedCenters ? cachedCenters : [],
  );
  const [loading, setLoading] = useState(!cachedCenters || cacheUserId !== userId);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (cacheUserId === userId && cachedCenters) {
      setWorkCenters(cachedCenters);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        if (!pendingPromise) {
          pendingPromise = listWorkCenters(userId);
        }
        const result = await pendingPromise;
        cachedCenters = result;
        cacheUserId = userId;
        if (mounted.current) setWorkCenters(result);
      } catch {
        if (mounted.current) setWorkCenters([]);
      } finally {
        pendingPromise = null;
        if (mounted.current) setLoading(false);
      }
    }

    load();
  }, [userId]);

  const activeWorkCenters = workCenters.filter((wc) => wc.active);

  const workCenterMap = new Map(workCenters.map((wc) => [wc.id, wc.name]));

  function getWorkCenterName(id?: string): string {
    if (!id) return '';
    return workCenterMap.get(id) || '';
  }

  function invalidateCache() {
    cachedCenters = null;
    cacheUserId = null;
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
