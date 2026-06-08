import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';

/** ID para listado/resumen del centro de alertas (notifications). */
export function useAlertCenterBusinessId(): string {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  return (
    currentBusiness?._id?.replace('business:', '')
    || currentBusiness?.id
    || currentBusiness?.business_id?.replace('business:', '')
    || user?.userId
    || ''
  );
}

/** ID para guardar preferencias en /api/settings/alerts (mismo que Ajustes → Alertas). */
export function useAlertSettingsBusinessId(): string {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  return (
    currentBusiness?.business_id
    || currentBusiness?._id?.replace('business:', '')
    || currentBusiness?.id
    || user?.userId
    || ''
  );
}
