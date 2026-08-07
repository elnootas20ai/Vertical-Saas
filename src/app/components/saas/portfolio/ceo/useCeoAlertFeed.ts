import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAlerts,
  type AlertRecord,
  type AlertSource,
} from '../../../../lib/alertCenterApi';
import { isPortfolioCeoAlert } from '../../../../lib/portfolioCeoAlerts';

export type CeoAlertFeedItem = {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  message: string;
  priority: AlertRecord['priority'];
  source: AlertSource;
  route?: string;
  createdAt: string;
};

export type CeoBizAlertStats = {
  unresolved: number;
  high: number;
  newest: number;
};

function toFeedItem(
  a: AlertRecord,
  businessId: string,
  businessName: string,
): CeoAlertFeedItem {
  return {
    id: a.id,
    businessId,
    businessName,
    title: a.title || a.message || 'Alerta',
    message: a.message || '',
    priority: a.priority,
    source: a.source,
    route: a.route,
    createdAt: a.createdAt,
  };
}

/**
 * Feed CEO de Visión general: solo alertas de dirección
 * (docs / finanzas / descuadre). Sin retrasos ni ruido de tienda.
 */
export function useCeoAlertFeed(
  rows: Array<{ businessId: string; business: { name: string } }>,
) {
  const [statsByBiz, setStatsByBiz] = useState<Record<string, CeoBizAlertStats>>({});
  const [feed, setFeed] = useState<CeoAlertFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const rowIdsKey = useMemo(
    () => rows.map((r) => r.businessId).filter(Boolean).sort().join('|'),
    [rows],
  );

  const reload = useCallback(async () => {
    const snapshot = rowsRef.current;
    if (!snapshot.length) {
      setStatsByBiz({});
      setFeed([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const perBiz = await Promise.all(
        snapshot.map(async (r) => {
          try {
            const res = await fetchAlerts(r.businessId, {
              status: 'new,seen',
              limit: 80,
              sort: 'createdAt',
              order: 'desc',
            });
            const ceoAlerts = (res.alerts || []).filter(isPortfolioCeoAlert);
            const high = ceoAlerts.filter((a) => a.priority === 'high').length;
            const newest = ceoAlerts.filter((a) => a.status === 'new').length;
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              stats: {
                unresolved: ceoAlerts.length,
                high,
                newest,
              } satisfies CeoBizAlertStats,
              items: ceoAlerts.slice(0, 6).map((a) => toFeedItem(a, r.businessId, r.business.name)),
            };
          } catch {
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              stats: { unresolved: 0, high: 0, newest: 0 } satisfies CeoBizAlertStats,
              items: [] as CeoAlertFeedItem[],
            };
          }
        }),
      );

      const nextStats: Record<string, CeoBizAlertStats> = {};
      for (const row of perBiz) nextStats[row.businessId] = row.stats;
      setStatsByBiz(nextStats);

      const items = perBiz
        .flatMap((row) => row.items)
        .sort((a, b) => {
          const rank = (p: string) => (p === 'high' ? 0 : p === 'medium' ? 1 : 2);
          return (
            rank(a.priority) - rank(b.priority)
            || String(b.createdAt).localeCompare(String(a.createdAt))
          );
        })
        .slice(0, 16);

      setFeed(items);
    } finally {
      setLoading(false);
    }
  }, [rowIdsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totals = useMemo(() => {
    let critical = 0;
    let attention = 0;
    let unresolved = 0;
    for (const s of Object.values(statsByBiz)) {
      critical += s.high;
      unresolved += s.unresolved;
      attention += Math.max(0, s.unresolved - s.high);
    }
    return { critical, attention, unresolved };
  }, [statsByBiz]);

  return { feed, statsByBiz, totals, loading, reload };
}
