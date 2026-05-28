import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ACTIVATION_FOCUS_PARAM,
  clearActivationFocusFromSearch,
} from '../lib/activationGuide';

/** Lee ?activar=… del URL y permite limpiarlo tras completar la acción. */
export function useActivationFocus() {
  const location = useLocation();
  const navigate = useNavigate();

  const focus = useMemo(
    () => new URLSearchParams(location.search).get(ACTIVATION_FOCUS_PARAM),
    [location.search],
  );

  const clearFocus = useCallback(() => {
    const nextSearch = clearActivationFocusFromSearch(location.search);
    navigate(
      { pathname: location.pathname, search: nextSearch },
      { replace: true, state: location.state },
    );
  }, [location.pathname, location.search, location.state, navigate]);

  const isFocused = useCallback((fieldKey: string) => focus === fieldKey, [focus]);

  return { focus, clearFocus, isFocused };
}
