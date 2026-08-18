import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { listClientsRequest } from '../lib/crmApi';
import { loadEvents, loadEventServices, resolveEventsUserId } from '../lib/eventsFlow';
import type { EventsSidebarLockFlags } from '../lib/eventsActivationGates';
import { resolveBusinessScopeId } from '../lib/deliverySetup';

export function useEventsActivationNav() {
  const user = useAuthOptional()?.user ?? null;
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const isEvents = String(currentBusiness?.businessType || '').trim() === 'events';
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [flags, setFlags] = useState<EventsSidebarLockFlags>({
    hasPricedService: false,
    hasClient: false,
    hasEvent: false,
  });
  const [loading, setLoading] = useState(isEvents);

  const reload = useCallback(async () => {
    if (!isEvents) {
      setFlags({ hasPricedService: false, hasClient: false, hasEvent: false });
      setLoading(false);
      return;
    }
    if (!dataUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [services, clients, events] = await Promise.all([
        loadEventServices(dataUserId, false).catch(() => null),
        listClientsRequest(dataUserId, { businessId }).catch(() => null),
        loadEvents(dataUserId).catch(() => null),
      ]);
      const activeServices = (services || []).filter((svc) => svc.activo !== false);
      const pricedServices = activeServices.filter((svc) => Number(svc.precio ?? 0) > 0);
      setFlags((prev) => ({
        hasPricedService: services ? pricedServices.length > 0 : prev.hasPricedService,
        hasClient: clients ? clients.length > 0 : prev.hasClient,
        hasEvent: events ? events.length > 0 : prev.hasEvent,
      }));
    } catch {
      /* Conservar flags: un fallo de red no puede ocultar contrataciones. */
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
