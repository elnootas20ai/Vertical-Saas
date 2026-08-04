import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp, type AppNotification } from '../../context/AppContext';

type Props = {
  onOpenInbox?: () => void;
};

const BANNER_MS = 8_000;
const MIN_GAP_MS = 4_000;

function resolveRoute(n: AppNotification): string {
  if (n.route?.startsWith('/saas/')) return n.route;
  return '';
}

/** Banner corto arriba cuando llega un aviso en vivo (máx. 1 cada unos segundos). */
export function NotificationLivePopup({ onOpenInbox }: Props) {
  const navigate = useNavigate();
  const { markNotificationAsRead } = useApp();
  const [banner, setBanner] = useState<AppNotification | null>(null);
  const shownIdsRef = useRef(new Set<string>());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownAtRef = useRef(0);
  const pendingRef = useRef<AppNotification | null>(null);

  useEffect(() => {
    const showOne = (n: AppNotification) => {
      setBanner(n);
      lastShownAtRef.current = Date.now();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setBanner(null), BANNER_MS);
    };

    const onArrive = (ev: Event) => {
      const n = (ev as CustomEvent<AppNotification>).detail;
      if (!n?.id || !n.title) return;
      // Alertas positivas (caja OK, etc.): solo campana Positivas, sin banner de problema.
      const meta = (n as AppNotification & {
        metadata?: Record<string, unknown>;
        kind?: string;
        polarity?: string;
        excludeFromAlertCenter?: boolean;
      });
      if (
        meta.excludeFromAlertCenter
        || meta.polarity === 'positive'
        || meta.kind === 'activity'
        || meta.kind === 'positive'
        || meta.metadata?.polarity === 'positive'
        || meta.metadata?.kind === 'activity'
        || meta.metadata?.kind === 'positive'
        || meta.metadata?.excludeFromAlertCenter === true
      ) {
        return;
      }
      if (shownIdsRef.current.has(n.id)) return;
      shownIdsRef.current.add(n.id);
      // No recortar agresivo: si no, el motor reabre popups de alertas ya vistas.
      if (shownIdsRef.current.size > 500) {
        shownIdsRef.current = new Set([...shownIdsRef.current].slice(-300));
      }

      const elapsed = Date.now() - lastShownAtRef.current;
      if (lastShownAtRef.current > 0 && elapsed < MIN_GAP_MS) {
        pendingRef.current = n;
        return;
      }
      pendingRef.current = null;
      showOne(n);
    };

    const drainId = window.setInterval(() => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (Date.now() - lastShownAtRef.current < MIN_GAP_MS) return;
      pendingRef.current = null;
      showOne(pending);
    }, 1_500);

    window.addEventListener('vertial:notification', onArrive);
    return () => {
      window.removeEventListener('vertial:notification', onArrive);
      window.clearInterval(drainId);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!banner) return null;

  const route = resolveRoute(banner);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] z-[70] flex justify-center px-3"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto relative w-full max-w-md animate-in fade-in slide-in-from-top-2 duration-300 rounded-2xl border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900">
        <button
          type="button"
          onClick={() => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            const id = banner.id;
            setBanner(null);
            void markNotificationAsRead(id, true);
            if (route) navigate(route);
            else onOpenInbox?.();
          }}
          className="flex w-full items-start gap-3 px-4 py-3 pr-10 text-left hover:bg-stone-50 dark:hover:bg-stone-800/80 rounded-2xl transition-colors"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--v-blue,#2563eb)] text-white">
            <Bell className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-900 dark:text-white line-clamp-2">
              {banner.title}
            </span>
            {banner.message ? (
              <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-300 line-clamp-2">
                {banner.message}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            setBanner(null);
          }}
          className="absolute right-2 top-2 p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
