import { Outlet, useLocation } from 'react-router';
import { ScrollRestoration } from 'react-router-dom';
import { CookieConsentBanner } from './CookieConsentBanner';

export function RootLayout() {
  const location = useLocation();
  const isStandaloneMechanicView = location.pathname === '/mecanico';

  return (
    <>
      {/* Necesario para que navigate(..., { preventScrollReset: true }) evite subir el scroll al cambiar de ruta */}
      <ScrollRestoration />
      <Outlet />
      {!isStandaloneMechanicView && <CookieConsentBanner />}
    </>
  );
}
