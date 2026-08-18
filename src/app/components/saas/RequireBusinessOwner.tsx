import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { userOwnsAnyBusiness, WORKER_DEFAULT_LANDING_PATH } from '../../lib/workerProfileCompletion';
import { canUseCeoAdminPanel } from '../../lib/teamManagerAccess';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Restringe el acceso a páginas "de negocio" (Centro Operativo, listas
 * completas, finanzas, ajustes globales…).
 * - Titular / dueño → pasa.
 * - Admin (nivel creador) y Administrador (lleva el SaaS) → pasan.
 * - Worker operativo → Mi trabajo.
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
  const hasCeoPanel = canUseCeoAdminPanel(user, businessCtx?.businesses);
  const blocked = isWorker && !ownsBusiness && !hasCeoPanel;

  useEffect(() => {
    if (isInitializing) return;
    if (!user) return;
    if (businessesPending) return;
    if (blocked) {
      navigate(WORKER_DEFAULT_LANDING_PATH, { replace: true });
    }
  }, [isInitializing, user, blocked, businessesPending, navigate]);

  if (isInitializing || businessesPending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }
  if (blocked) {
    return <AuthRouteLoading label="Redirigiendo…" />;
  }
  return <>{children}</>;
}
