import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { isWorkerAccount } from '../../lib/authApi';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import {
  isTpvTabletBindingAllowedForAuth,
  readTpvTabletBinding,
  sanitizeTpvTabletBindingForAuth,
} from '../../lib/tpvTabletSession';

/**
 * El TPV operativo del trabajador solo se abre tras activar la tablet con el
 * código de tienda (landing → /auth/tpv-tablet). Evita atajos por URL o sidebar.
 * Además invalida bindings de otra cuenta (p. ej. Pau) para no saltar de datos.
 */
export function RequireTpvTabletEntry({
  children,
  requireForAll = false,
}: {
  children: React.ReactNode;
  /** Si true, cualquier usuario (también gerente) debe activar tablet con código. */
  requireForAll?: boolean;
}) {
  const { user, isInitializing } = useAuth();
  const { businesses, businessesFetchSettled } = useBusiness();
  const navigate = useNavigate();

  const binding = readTpvTabletBinding();
  const bindingAllowed = isTpvTabletBindingAllowedForAuth({
    binding,
    authUser: user,
    businesses,
    businessesSettled: businessesFetchSettled,
  });
  const needsTablet = Boolean(
    user
    && !bindingAllowed
    && (requireForAll || isWorkerAccount(user)),
  );

  useEffect(() => {
    if (isInitializing || !user) return;
    if (businessesFetchSettled) {
      sanitizeTpvTabletBindingForAuth({
        authUser: user,
        businesses,
        businessesSettled: true,
      });
    }
  }, [isInitializing, user, businesses, businessesFetchSettled]);

  useEffect(() => {
    if (isInitializing || !user) return;
    if (needsTablet) {
      navigate(AUTH_PATHS.tpvTabletLogin, { replace: true });
    }
  }, [isInitializing, user, needsTablet, navigate]);

  if (isInitializing) return null;
  if (needsTablet) return null;
  return <>{children}</>;
}
