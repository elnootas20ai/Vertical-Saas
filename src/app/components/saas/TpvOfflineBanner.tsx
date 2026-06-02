import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { isBrowserOnline, listTpvOfflineQueue } from '../../lib/tpvTabletOffline';
import { isTpvTabletBound } from '../../lib/tpvTabletSession';

export function TpvOfflineBanner() {
  const [online, setOnline] = useState(isBrowserOnline());
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setOnline(isBrowserOnline());
      setQueued(listTpvOfflineQueue().length);
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  if (online || !isTpvTabletBound()) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium shadow-md">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Sin conexión — modo local
        {queued > 0 ? ` · ${queued} pendiente${queued !== 1 ? 's' : ''} de sincronizar` : ''}
      </span>
    </div>
  );
}
