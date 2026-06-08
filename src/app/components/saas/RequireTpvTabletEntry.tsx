import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { isTpvTabletBound } from '../../lib/tpvTabletSession';

/**
 * El TPV operativo del trabajador solo se abre tras activar la tablet con el
 * código de tienda (landing → /auth/tpv-tablet). Evita atajos por URL o sidebar.
 */
export function RequireTpvTabletEntry({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();
  const navigate = useNavigate();

  const needsTablet = Boolean(user && isWorkerAccount(user) && !isTpvTabletBound());

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
