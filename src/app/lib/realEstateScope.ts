import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { resolveBusinessDataUserId } from './tenantUserId';
import { resolveBusinessScopeId } from './businessStoreScope';
import type { VerticalListOptions } from './verticalApiFactory';

/**
 * Scope inmobiliaria: empresa activa.
 * La cartera (pisos/visitas) es de la empresa — no se fragmenta por PDV/oficina
 * (un PDV de delivery residual no debe vaciar la lista).
 */
export function useRealEstateScope(): {
  userId: string;
  businessId: string;
  salesPointId: string;
  listOptions: VerticalListOptions;
  ready: boolean;
} {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();

  const userId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = useMemo(
    () => resolveBusinessScopeId(currentBusiness),
    [currentBusiness],
  );

  const listOptions = useMemo<VerticalListOptions>(
    () => ({
      businessId: businessId || undefined,
      // Sin salesPointId: listar/crear a nivel empresa.
      salesPointId: undefined,
    }),
    [businessId],
  );

  return {
    userId,
    businessId,
    salesPointId: '',
    listOptions,
    ready: Boolean(userId && businessId),
  };
}
