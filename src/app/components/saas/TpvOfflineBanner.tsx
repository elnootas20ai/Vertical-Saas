import { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import { isBrowserOnline, listTpvOfflineQueue } from '../../lib/tpvTabletOffline';
import { flushTpvOfflineQueue } from '../../lib/tpvOfflineSync';
import { isTpvTabletBound } from '../../lib/tpvTabletSession';

/**
 * Indicador discreto de modo local / cola.
 * Al volver la red: sync silencioso (sin toasts de éxito/error).
 */
export function TpvOfflineBanner() {
  const [online, setOnline] = useState(isBrowserOnline());
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setOnline(isBrowserOnline());
    setQueued(listTpvOfflineQueue().length);
  }, []);

  const runSync = useCallback(async () => {
    if (!isBrowserOnline() || syncing) return;
    setSyncing(true);
    try {
      await flushTpvOfflineQueue();
      refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh, syncing]);

  useEffect(() => {
    refresh();
    const onOnline = () => {
      refresh();
      void runSync();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', refresh);
    const timer = window.setInterval(refresh, 4000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', refresh);
      window.clearInterval(timer);
    };
  }, [refresh, runSync]);

  const hasDiningQueue = listTpvOfflineQueue().some((i) => String(i.type || '').startsWith('dining_'));
  const showBanner = !online || queued > 0;
  if (!showBanner) return null;
  if (!isTpvTabletBound() && !hasDiningQueue && online) return null;

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium shadow-md ${
      online ? 'bg-zinc-700 text-white' : 'bg-amber-500 text-white'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        {online ? <RefreshCw className={`w-4 h-4 shrink-0 ${syncing ? 'animate-spin' : ''}`} /> : <WifiOff className="w-4 h-4 shrink-0" />}
        <span className="truncate">
          {online
            ? (syncing ? 'Sincronizando…' : `${queued} pendiente${queued !== 1 ? 's' : ''}`)
            : `Modo local${queued > 0 ? ` · ${queued} en cola` : ''}`}
        </span>
      </div>
      {online && queued > 0 && (
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing}
          className="shrink-0 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold flex items-center gap-1"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Sync
        </button>
      )}
    </div>
  );
}
