/**
 * ¿Hay mapa de sala (zonas/mesas) para esta empresa delivery?
 * El interruptor Mesas del TPV solo aparece si es true.
 */
import { useEffect, useState } from 'react';
import { getFloorConfigRequest, listDiningTablesRequest } from '../../lib/salaApi';

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

export function useDeliverySalaMapReady(
  userId: string | null | undefined,
  businessId: string | null | undefined,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const uid = String(userId || '').trim();
    const bid = normalizeBusinessId(businessId);
    if (!uid || !bid) {
      setReady(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [config, listed] = await Promise.all([
          getFloorConfigRequest(uid, { businessId: bid }).catch(() => null),
          listDiningTablesRequest(uid).catch(() => []),
        ]);
        if (cancelled) return;
        const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
        const tablesHere = (listed || []).filter((t) => {
          const tBid = normalizeBusinessId(
            (t as { businessId?: string }).businessId || '',
          );
          return !tBid || tBid === bid;
        });
        setReady(rooms.length > 0 || tablesHere.length > 0);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, businessId]);

  return ready;
}
