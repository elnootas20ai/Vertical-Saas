import { useLayoutEffect, useRef } from 'react';
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
 */
export function BusinessScopeUrlSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const businessCtx = useBusinessOptional();
  const pendingUrlApplyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!businessCtx) return;
    if (!shouldSyncBusinessScopeInUrl(location.pathname)) return;

    const { businesses, businessesFetchSettled, currentBusiness, switchBusiness } = businessCtx;
    if (!businessesFetchSettled || businesses.length === 0) return;

    const urlBusinessId = readBusinessIdFromSearch(location.search);
    const contextBusinessId = normalizeBusinessScopeId(currentBusiness?.business_id);

    if (urlBusinessId && urlBusinessId !== contextBusinessId) {
      const exists = businesses.some(
        (b) => normalizeBusinessScopeId(b.business_id) === urlBusinessId,
      );
      if (exists) {
        pendingUrlApplyRef.current = urlBusinessId;
        switchBusiness(urlBusinessId);
        return;
      }
    }

    if (pendingUrlApplyRef.current) {
      if (contextBusinessId === pendingUrlApplyRef.current) {
        pendingUrlApplyRef.current = null;
      } else {
        return;
      }
    }

    if (!contextBusinessId) return;

    const nextSearch = withBusinessScopeSearch(location.search, contextBusinessId);
    if (location.search !== nextSearch) {
      navigate(
        { pathname: location.pathname, search: nextSearch },
        { replace: true, preventScrollReset: true },
      );
    }
  }, [
    businessCtx,
    businessCtx?.currentBusiness?.business_id,
    location.pathname,
    location.search,
    navigate,
  ]);

  return null;
}
