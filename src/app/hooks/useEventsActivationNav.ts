import { useCallback, useEffect, useState } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { listClientsRequest } from '../lib/crmApi';
import { loadEvents, loadEventServices } from '../lib/eventsFlow';
import type { EventsSidebarLockFlags } from '../lib/eventsActivationGates';
import { resolveBusinessScopeId } from '../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';

export function useEventsActivationNav() {
  const user = useAuthOptional()?.user ?? null;
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const isEvents = String(currentBusiness?.businessType || '').trim() === 'events';
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  const [flags, setFlags] = useState<EventsSidebarLockFlags>({
    hasPricedService: false,
    hasClient: false,
    hasEvent: false,
  });
  const [loading, setLoading] = useState(isEvents);

  const reload = useCallback(async () => {
    if (!isEvents || !dataUserId) {
      setFlags({ hasPricedService: false, hasClient: false, hasEvent: false });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [services, clients, events] = await Promise.all([
        loadEventServices(dataUserId, false).catch(() => []),
        listClientsRequest(dataUserId, { businessId }).catch(() => []),
        loadEvents(dataUserId).catch(() => []),
      ]);
      const activeServices = services.filter((svc) => svc.activo !== false);
      const pricedServices = activeServices.filter((svc) => Number(svc.precio ?? 0) > 0);
      setFlags({
        hasPricedService: pricedServices.length > 0,
        hasClient: clients.length > 0,
        hasEvent: events.length > 0,
      });
    } catch {
      setFlags({ hasPricedService: false, hasClient: false, hasEvent: false });
    } finally {
      setLoading(false);
    }
  }, [isEvents, dataUserId, businessId]);

  useEffect(() => {
    if (!isEvents || !businessesFetchSettled) {
      setLoading(false);
      return;
    }
    void reload();
  }, [isEvents, businessesFetchSettled, reload]);

  useEffect(() => {
    if (!isEvents) return;
    const onRefresh = () => {
      void reload();
    };
    window.addEventListener('focus', onRefresh);
    return () => window.removeEventListener('focus', onRefresh);
  }, [isEvents, reload]);

  return { isEvents, ...flags, loading, reload };
}
