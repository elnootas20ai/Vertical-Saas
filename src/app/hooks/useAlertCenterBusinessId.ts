import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';

function stripBusinessPrefix(id: string | undefined | null): string {
  return String(id || '').replace(/^business:/, '').trim();
}

function accountUserId(user: { user_id?: string; id?: string } | null | undefined): string {
  return String(user?.user_id || user?.id || '').trim();
}

/** ID para listado/resumen del centro de alertas (notifications). */
export function useAlertCenterBusinessId(): string {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessScope =
    stripBusinessPrefix(currentBusiness?.business_id)
    || stripBusinessPrefix(currentBusiness?.id);
  return businessScope || accountUserId(user);
}

/** ID para guardar preferencias en /api/settings/alerts (mismo que Ajustes → Alertas). */
export function useAlertSettingsBusinessId(): string {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  return (
    stripBusinessPrefix(currentBusiness?.business_id)
    || stripBusinessPrefix(currentBusiness?.id)
    || accountUserId(user)
  );
}
