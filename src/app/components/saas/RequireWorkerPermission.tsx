import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  isManagerRole,
  WORKER_DEFAULT_LANDING_PATH,
} from '../../lib/workerProfileCompletion';

type PermissionEntry = { view?: boolean; edit?: boolean } | boolean | undefined;

/**
 * Restringe el acceso a una página operativa según el permiso asignado al
 * worker. El sistema central de permisos vive en `user.permissions` (matriz
 * `view`/`edit` por clave de módulo).
 *
 * Reglas:
 *  - Owner/Admin/Gerente (cuenta tipo 'company', sin `invitedBy`) → pasa siempre.
 *  - Gestor / Encargado / Administrador invitados (RRHH) → pasan (nóminas, contratos, docs).
 *  - Worker con `permissions[key].view === true` → pasa.
 *  - Worker sin ese permiso → redirige a Mi trabajo.
 *
 * Acepta una o varias keys: con varias, basta con tener UNA para pasar.
 *
 * Es defensa en frontend. Combinar con permission checks en el backend si la
 * página expone datos sensibles.
 */
export function RequireWorkerPermission({
  permission,
  children,
}: {
  permission: string | string[];
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const keys = useMemo(
    () => (Array.isArray(permission) ? permission : [permission]),
    [permission],
  );

  const isWorker = Boolean(
    user && (user.accountType === 'user' || (user as { invitedBy?: string }).invitedBy),
  );
  const isInvitedHrManager = Boolean(user && isManagerRole(user.role));

  const hasPermission = useMemo(() => {
    if (!user) return false;
    if (!isWorker) return true;
    if (isInvitedHrManager) return true;
    const perms = (user.permissions || {}) as Record<string, PermissionEntry>;
    return keys.some((key) => {
      const entry = perms[key];
      if (entry === true) return true;
      if (entry && typeof entry === 'object') return Boolean(entry.view);
      return false;
    });
  }, [user, isWorker, isInvitedHrManager, keys]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (isWorker && !hasPermission) {
      navigate(WORKER_DEFAULT_LANDING_PATH, { replace: true });
    }
  }, [isLoading, user, isWorker, hasPermission, navigate]);

  if (isLoading) return null;
  if (isWorker && !hasPermission) return null;
  return <>{children}</>;
}
