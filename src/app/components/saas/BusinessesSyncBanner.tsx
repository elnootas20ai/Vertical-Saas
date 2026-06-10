import { useEffect, useReducer } from 'react';
import { useLocation } from 'react-router';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  dismissBannerForRestOfLocalDay,
  isBannerDismissedForLocalToday,
} from '../../lib/dayBannerDismiss';

/**
 * Aviso no alarmante cuando la lista de empresas no se sincronizó con el servidor
 * pero el panel sigue usable con datos guardados en el dispositivo.
 */
export function BusinessesSyncBanner() {
  const { user } = useAuth();
  const { businessesLoadError, reloadBusinesses, isLoading } = useBusiness();
  const location = useLocation();
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const dismissKey = user?.user_id ? `vertial.banner.dismissDay.${user.user_id}.businessesSync` : '';
  const dismissedToday = dismissKey && isBannerDismissedForLocalToday(dismissKey);

  useEffect(() => {
    rerender();
  }, [location.pathname, businessesLoadError]);

  useEffect(() => {
    const id = window.setInterval(() => rerender(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!businessesLoadError || dismissedToday) return null;

  const handleDismiss = () => {
    if (dismissKey) dismissBannerForRestOfLocalDay(dismissKey);
    rerender();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b text-sm bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800">
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <span className="leading-snug">
          <strong className="font-semibold">Conexión lenta con el servidor.</strong>{' '}
          Tus datos no se han borrado. Puedes seguir trabajando; estamos mostrando lo guardado en este dispositivo.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void reloadBusinesses()}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Reintentar
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-0.5 rounded hover:opacity-80 transition-opacity"
          aria-label="Ocultar hasta mañana"
          title="No mostrar hoy (se restablece a las 00:00)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
