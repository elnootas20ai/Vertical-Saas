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

/**
 * Si el PDV activo es temporal de un evento, devuelve la allowlist de productos Carta.
 * null = TPV normal (sin filtro).
 */
export function useEventPortableTpvAllowlist(): string[] | null {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();
  const register = useTpvRegisterIfOpen();

  const [allowlist, setAllowlist] = useState<string[] | null>(null);

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
    setAllowlist(null);

    const run = async () => {
      if (!dataUserId || !workCenterId) {
        if (!cancelled) setAllowlist(null);
        return;
      }
      try {
        const wc = await getWorkCenterById(workCenterId);
        const eventId = String(wc?.linkedEventId || '').trim();
        if (!eventId) {
          if (!cancelled) setAllowlist(null);
          return;
        }
        const event = await loadEventById(dataUserId, eventId);
        if (cancelled) return;
        setAllowlist(eventTpvCatalogAllowlist(event));
      } catch {
        if (!cancelled) setAllowlist(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dataUserId, workCenterId, pdvId]);

  return allowlist;
}
