import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import { IosCustomerAccessOnlyScreen } from '../../components/saas/IosCustomerAccessOnlyScreen';
import { useAuth } from '../../context/AuthContext';

/**
 * Facturación Vertial (suscripción SaaS).
 * En web redirige a Configuración → Facturación.
 * En iOS no hay cobro in-app (Guideline 3.1.1).
 */
export function Billing() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const iosAccessOnly = isIosCustomerAccessOnlyApp();

  useEffect(() => {
    if (iosAccessOnly) return;
    navigate('/saas/settings/facturacion', { replace: true });
  }, [navigate, iosAccessOnly]);

  if (iosAccessOnly) {
    return (
      <IosCustomerAccessOnlyScreen
        title="Suscripción no disponible en iOS"
        onLogout={() => void logout()}
      />
    );
  }

  return null;
}
