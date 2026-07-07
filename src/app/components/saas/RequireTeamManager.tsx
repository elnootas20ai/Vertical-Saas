import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { userOwnsAnyBusiness, WORKER_DEFAULT_LANDING_PATH } from '../../lib/workerProfileCompletion';
import { AuthRouteLoading } from '../AuthRouteLoading';

const TEAM_MANAGER_ROLES = new Set(['Admin', 'Gerente', 'GerenteGrupo', 'Administrador', 'Encargado']);

export function canManageTeam(
  user?: { user_id?: string; role?: string; permissions?: Record<string, { view?: boolean; edit?: boolean }> } | null,
  businesses?: { owner_user_id?: string }[] | null,
): boolean {
  if (!user?.user_id) return false;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return true;
  if (user.permissions?.team?.edit) return true;
  if (TEAM_MANAGER_ROLES.has(String(user.role || '').trim())) return true;
  return false;
}

/** Owner o administrador/encargado con permiso de equipo. */
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
