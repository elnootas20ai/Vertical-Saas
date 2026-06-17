import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';

function stripBusinessPrefix(id: string | undefined | null): string {
  return String(id || '').replace(/^business:/, '').trim();
}

function accountUserId(user: { user_id?: string; id?: string } | null | undefined): string {
  return String(user?.user_id || user?.id || '').trim();
}

/** ID para listado/resumen del centro de alertas (notifications). */
export function useAlertCenterBusinessId(): string {
  const user = useAuthOptional()?.user ?? null;
  const currentBusiness = useBusinessOptional()?.currentBusiness;
  const businessScope =
    stripBusinessPrefix(currentBusiness?.business_id)
    || stripBusinessPrefix(currentBusiness?.id);
  return businessScope || accountUserId(user);
}

/** ID para guardar preferencias en /api/settings/alerts (mismo que Ajustes → Alertas). */
export function useAlertSettingsBusinessId(): string {
  const user = useAuthOptional()?.user ?? null;
  const currentBusiness = useBusinessOptional()?.currentBusiness;
  return (
    stripBusinessPrefix(currentBusiness?.business_id)
    || stripBusinessPrefix(currentBusiness?.id)
    || accountUserId(user)
  );
}
