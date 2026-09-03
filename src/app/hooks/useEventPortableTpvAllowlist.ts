import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { useTpvRegisterIfOpen } from '../components/saas/TpvRegisterGate';
import { isTpvRegisterSessionOpen } from '../lib/deliveryApi';
import {
  isTpvTabletBindingAllowedForAuth,
  readTpvTabletBinding,
} from '../lib/tpvTabletSession';
import { getWorkCenterById } from '../lib/workCentersApi';
import { loadEventById, resolveEventsUserId } from '../lib/eventsFlow';
import { eventTpvCatalogAllowlist } from '../lib/eventsPortableTpv';
import {
  eventsPdvLoadAllowlist,
  eventsPdvLoadPriceMap,
  type EventsPdvLoadLine,
} from '../lib/eventsPdvLoad';

export type EventPortableTpvScope = {
  /** null = TPV normal sin filtro. [] = sin productos. */
  allowlist: string[] | null;
  /** Precios de la carga del PDV (evento fijo). */
  priceByItemId: Record<string, number> | null;
};

/**
 * Scope de carta para TPV de eventos:
 * - PDV temporal con evento ligado → productos del evento
 * - PDV fijo/temporal con `eventsTpvLoad` → esa carga
 * - resto → null (carta completa)
 */
export function useEventPortableTpvAllowlist(): string[] | null {
  return useEventPortableTpvScope().allowlist;
}

export function useEventPortableTpvScope(): EventPortableTpvScope {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();
  const register = useTpvRegisterIfOpen();

  const [scope, setScope] = useState<EventPortableTpvScope>({
    allowlist: null,
    priceByItemId: null,
  });

  const pdvId = useMemo(() => {
    const rawBinding = readTpvTabletBinding();
    const bindingAllowed = isTpvTabletBindingAllowedForAuth({
      binding: rawBinding,
      authUser: user,
      businesses,
      businessesSettled: businessesFetchSettled,
    });
    if (bindingAllowed && rawBinding?.pdvId) return String(rawBinding.pdvId).trim();

    if (register && isTpvRegisterSessionOpen(register.session)) {
      const fromSession = String(register.session?.pointOfSaleId || '').trim();
      if (fromSession) return fromSession;
    }
    return String(activeStore.activeSalesPointId || '').trim();
  }, [
    user,
    businesses,
    businessesFetchSettled,
    register,
    register?.session?.pointOfSaleId,
    activeStore.activeSalesPointId,
  ]);

  const workCenterId = useMemo(() => {
    const rawBinding = readTpvTabletBinding();
    const bindingAllowed = isTpvTabletBindingAllowedForAuth({
      binding: rawBinding,
      authUser: user,
      businesses,
      businessesSettled: businessesFetchSettled,
    });
    if (bindingAllowed && rawBinding?.workCenterId) {
      return String(rawBinding.workCenterId).trim();
    }
    const pdv = activeStore.pointsOfSale.find((p) => p._id === pdvId);
    return String(pdv?.workCenterId || '').trim();
  }, [
    user,
    businesses,
    businessesFetchSettled,
    pdvId,
    activeStore.pointsOfSale,
  ]);

  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  useEffect(() => {
    let cancelled = false;
    setScope({ allowlist: null, priceByItemId: null });

    const run = async () => {
      if (!dataUserId || !workCenterId) {
        if (!cancelled) setScope({ allowlist: null, priceByItemId: null });
        return;
      }
      try {
        const wc = await getWorkCenterById(workCenterId);
        const eventId = String(wc?.linkedEventId || '').trim();
        if (eventId) {
          const event = await loadEventById(dataUserId, eventId);
          if (cancelled) return;
          setScope({
            allowlist: eventTpvCatalogAllowlist(event),
            priceByItemId: null,
          });
          return;
        }

        const load: EventsPdvLoadLine[] | undefined = wc?.eventsTpvLoad;
        if (load != null) {
          if (cancelled) return;
          setScope({
            allowlist: eventsPdvLoadAllowlist(load),
            priceByItemId: eventsPdvLoadPriceMap(load),
          });
          return;
        }

        if (!cancelled) setScope({ allowlist: null, priceByItemId: null });
      } catch {
        if (!cancelled) setScope({ allowlist: null, priceByItemId: null });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dataUserId, workCenterId, pdvId]);

  return scope;
}
