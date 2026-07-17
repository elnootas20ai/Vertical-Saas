import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { WORKER_DEFAULT_LANDING_PATH } from '../../lib/workerProfileCompletion';
import { canManageTeam } from '../../lib/teamManagerAccess';
import { AuthRouteLoading } from '../AuthRouteLoading';

export { canManageTeam, canManagePayroll, TEAM_MANAGER_ROLES } from '../../lib/teamManagerAccess';

/** Owner o administrador/encargado/gestor con permiso de equipo. */
export function RequireTeamManager({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();

  const businessesPending =
    !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = canManageTeam(user, businessCtx?.businesses);

  useEffect(() => {
    if (isInitializing || businessesPending || !user) return;
    if (!allowed) {
      navigate(WORKER_DEFAULT_LANDING_PATH, { replace: true });
    }
  }, [isInitializing, businessesPending, user, allowed, navigate]);

  if (isInitializing || businessesPending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }
  if (!allowed) {
    return <AuthRouteLoading label="Redirigiendo…" />;
  }
  return <>{children}</>;
}
