import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { normalizeBusinessScopeId } from '../../lib/deliverySetup';
import {
  readBusinessIdFromSearch,
  shouldSyncBusinessScopeInUrl,
  withBusinessScopeSearch,
} from '../../lib/businessScopeUrl';

/**
 * Mantiene `?empresa=` en la URL alineado con la empresa activa.
 * Así el botón Atrás del navegador restaura pantalla + empresa juntos.
 *
 * Regla: el contexto manda al cambiar empresa en UI; la URL solo manda en
 * carga inicial con ?empresa= o navegación atrás/adelante (popstate).
 */
export function BusinessScopeUrlSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const businessCtx = useBusinessOptional();
  const pendingUrlApplyRef = useRef<string | null>(null);
  const initialUrlAppliedRef = useRef(false);
  const isPopNavigationRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      isPopNavigationRef.current = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useLayoutEffect(() => {
    if (!businessCtx) return;
    if (!shouldSyncBusinessScopeInUrl(location.pathname)) return;

    const { businesses, businessesFetchSettled, currentBusiness, switchBusiness } = businessCtx;
    if (!businessesFetchSettled || businesses.length === 0) return;

    const urlBusinessId = readBusinessIdFromSearch(location.search);
    const contextBusinessId = normalizeBusinessScopeId(currentBusiness?.business_id);
    const isPopNavigation = isPopNavigationRef.current;
    isPopNavigationRef.current = false;

    const applyUrlToContext = (targetId: string) => {
      const exists = businesses.some(
        (b) => normalizeBusinessScopeId(b.business_id) === targetId,
      );
      if (!exists) return false;
      pendingUrlApplyRef.current = targetId;
      switchBusiness(targetId);
      return true;
    };

    // Primera hidratación: deep-link / refresh con ?empresa=
    if (!initialUrlAppliedRef.current) {
      initialUrlAppliedRef.current = true;
      if (urlBusinessId && urlBusinessId !== contextBusinessId) {
        if (applyUrlToContext(urlBusinessId)) return;
      }
    }

    // Atrás/adelante del navegador: la URL restaura la empresa activa.
    if (isPopNavigation && urlBusinessId && urlBusinessId !== contextBusinessId) {
      if (applyUrlToContext(urlBusinessId)) return;
    }

    if (pendingUrlApplyRef.current) {
      if (contextBusinessId === pendingUrlApplyRef.current) {
        pendingUrlApplyRef.current = null;
      } else {
        return;
      }
    }

    if (!contextBusinessId) return;

    // Cambio manual en UI: empujar contexto → URL (no revertir al ?empresa= viejo).
    const nextSearch = withBusinessScopeSearch(location.search, contextBusinessId);
    if (location.search !== nextSearch) {
      navigate(
        { pathname: location.pathname, search: nextSearch },
        { replace: true, preventScrollReset: true },
      );
    }
  }, [
    businessCtx?.businessesFetchSettled,
    businessCtx?.businesses,
    businessCtx?.currentBusiness?.business_id,
    businessCtx?.switchBusiness,
    location.pathname,
    location.search,
    navigate,
  ]);

  return null;
}
