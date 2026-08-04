import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  consumePendingPushDeepLink,
  PUSH_DEEP_LINK_EVENT,
  queuePushDeepLink,
} from '../lib/pushDeepLink';

/**
 * Al tocar una push: abre la ruta dentro del SaaS (sin recargar).
 */
export function usePushDeepLinkNavigate(enabled = true) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;

    const go = (route: string) => {
      if (!route.startsWith('/')) return;
      navigate(route, { replace: false });
    };

    const pending = consumePendingPushDeepLink();
    let pendingTimer: number | undefined;
    if (pending) {
      pendingTimer = window.setTimeout(() => go(pending), 80);
    }

    const onNavigate = (event: Event) => {
      const route = (event as CustomEvent<{ route?: string }>).detail?.route;
      if (typeof route === 'string') go(route);
    };

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'vertial:push-navigate' && typeof data.route === 'string') {
        queuePushDeepLink(data.route);
      }
    };

    window.addEventListener(PUSH_DEEP_LINK_EVENT, onNavigate);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    return () => {
      if (pendingTimer) window.clearTimeout(pendingTimer);
      window.removeEventListener(PUSH_DEEP_LINK_EVENT, onNavigate);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, [enabled, navigate]);
}
