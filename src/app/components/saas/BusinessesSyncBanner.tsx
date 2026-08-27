import { useEffect, useReducer } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  dismissBannerForRestOfLocalDay,
  isBannerDismissedForLocalToday,
} from '../../lib/dayBannerDismiss';

/**
 * Antes avisaba «conexión lenta». Desactivado: alarmaba sin aportar y parecía
 * que la app estaba pillada. El panel sigue usable con datos locales.
 */
export function BusinessesSyncBanner() {
  const { user } = useAuth();
  const { businessesLoadError, reloadBusinesses } = useBusiness();
  const location = useLocation();
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const dismissKey = user?.user_id ? `vertial.banner.dismissDay.${user.user_id}.businessesSync` : '';
  const dismissedToday = dismissKey && isBannerDismissedForLocalToday(dismissKey);

  useEffect(() => {
    rerender();
  }, [location.pathname, businessesLoadError]);

  // Silenciado a petición: no mostrar banner de servidor lento.
  void reloadBusinesses;
  void dismissedToday;
  return null;
}
