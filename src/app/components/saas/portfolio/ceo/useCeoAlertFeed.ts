import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAlertSummary,
  fetchAlerts,
  normalizeAlertSummary,
  type AlertRecord,
  type AlertSource,
} from '../../../../lib/alertCenterApi';

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
      const summaries = await Promise.all(
        snapshot.map(async (r) => {
          try {
            const res = await fetchAlertSummary(r.businessId);
            const s = normalizeAlertSummary(res.summary);
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              stats: {
                unresolved: s.unresolved,
                high: s.byPriority.high,
                newest: s.byStatus.new,
              } satisfies CeoBizAlertStats,
            };
          } catch {
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              stats: { unresolved: 0, high: 0, newest: 0 } satisfies CeoBizAlertStats,
            };
          }
        }),
      );

      const nextStats: Record<string, CeoBizAlertStats> = {};
      for (const s of summaries) nextStats[s.businessId] = s.stats;
      setStatsByBiz(nextStats);

      const hot = [...summaries]
        .filter((s) => s.stats.unresolved > 0)
        .sort(
          (a, b) =>
            b.stats.high - a.stats.high
            || b.stats.unresolved - a.stats.unresolved,
        )
        .slice(0, 8);

      const items = (
        await Promise.all(
          hot.map(async (biz) => {
            try {
              const res = await fetchAlerts(biz.businessId, {
                status: 'new,seen',
                limit: 4,
                sort: 'createdAt',
                order: 'desc',
                priority: biz.stats.high > 0 ? 'high' : undefined,
              });
              return (res.alerts || []).map((a) => ({
                id: a.id,
                businessId: biz.businessId,
                businessName: biz.businessName,
                title: a.title || a.message || 'Alerta',
                message: a.message || '',
                priority: a.priority,
                source: a.source,
                route: a.route,
                createdAt: a.createdAt,
              }));
            } catch {
              return [];
            }
          }),
        )
      )
        .flat()
        .sort((a, b) => {
          const rank = (p: string) => (p === 'high' ? 0 : p === 'medium' ? 1 : 2);
          return rank(a.priority) - rank(b.priority)
            || String(b.createdAt).localeCompare(String(a.createdAt));
        })
        .slice(0, 12);

      // Si priority=high no trajo nada pero hay unresolved, segundo pase sin filtro
      if (items.length === 0 && hot.length > 0) {
        const fallback = (
          await Promise.all(
            hot.slice(0, 5).map(async (biz) => {
              try {
                const res = await fetchAlerts(biz.businessId, {
                  status: 'new,seen',
                  limit: 3,
                  sort: 'createdAt',
                  order: 'desc',
                });
                return (res.alerts || []).map((a) => ({
                  id: a.id,
                  businessId: biz.businessId,
                  businessName: biz.businessName,
                  title: a.title || a.message || 'Alerta',
                  message: a.message || '',
                  priority: a.priority,
                  source: a.source,
                  route: a.route,
                  createdAt: a.createdAt,
                }));
              } catch {
                return [];
              }
            }),
          )
        )
          .flat()
          .slice(0, 12);
        setFeed(fallback);
      } else {
        setFeed(items);
      }
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
