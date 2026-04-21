import { useEffect } from 'react';
import { useNavigate } from 'react-router';

/**
 * La página de Facturación se ha movido a Configuración → pestaña "Facturación Udar".
 * Este componente redirige automáticamente para no romper enlaces existentes
 * (banners de suscripción, ProfileModal, etc.).
 */
export function Billing() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/saas/settings/facturacion', { replace: true });
  }, [navigate]);

  return null;
}
