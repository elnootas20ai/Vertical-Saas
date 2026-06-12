import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { normalizeTenantUserId, resolveBusinessDataUserId } from '../lib/tenantUserId';

/** ID de datos financieros del negocio activo (titular si eres miembro del equipo). */
export function useFinanceUserId(): string {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  return normalizeTenantUserId(resolveBusinessDataUserId(user, currentBusiness));
}
