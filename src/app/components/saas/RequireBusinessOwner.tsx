import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { userOwnsAnyBusiness, WORKER_DEFAULT_LANDING_PATH } from '../../lib/workerProfileCompletion';

/**
 * Restringe el acceso a páginas "de negocio" (Centro Operativo, listas
 * completas, finanzas, ajustes globales…). Si el usuario es un team member
 * invitado (`accountType === 'user'` o tiene `invitedBy`), lo manda a su home
 * de trabajador para no exponer ingresos, históricos ni datos sensibles.
 *
 * Es defensa en frontend: el backend bloquea también los endpoints más
 * sensibles (p. ej. `/api/delivery/ops-center/...` devuelve 403 para workers).
 */
export function RequireBusinessOwner({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();

  const isWorker = Boolean(
    user && (user.accountType === 'user' || (user as { invitedBy?: string }).invitedBy),
  );
  const businessesPending =
    !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const ownsBusiness = userOwnsAnyBusiness(user?.user_id, businessCtx?.businesses);

  useEffect(() => {
    if (isInitializing) return;
    if (!user) return;
    if (businessesPending) return;
    if (isWorker && !ownsBusiness) {
      navigate(WORKER_DEFAULT_LANDING_PATH, { replace: true });
    }
  }, [isInitializing, user, isWorker, ownsBusiness, businessesPending, navigate]);

  if (isInitializing || businessesPending) return null;
  if (isWorker && !ownsBusiness) return null;
  return <>{children}</>;
}
