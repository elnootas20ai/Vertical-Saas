import { useCallback, useEffect, useState } from 'react';
import { fetchAlertSummary, normalizeAlertSummary, type AlertSummary } from '../lib/alertCenterApi';

export function useAlertCenterSummary(businessId: string | undefined, options?: { pollMs?: number }) {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(businessId));

  const reload = useCallback(async () => {
    if (!businessId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetchAlertSummary(businessId);
      setSummary(normalizeAlertSummary(res.summary));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    setLoading(Boolean(businessId));
    void reload();
    const pollMs = options?.pollMs ?? 60_000;
    if (!businessId || pollMs <= 0) return undefined;
    const id = window.setInterval(() => { void reload(); }, pollMs);
    return () => window.clearInterval(id);
  }, [businessId, reload, options?.pollMs]);

  return { summary, loading, reload, unresolved: summary?.unresolved ?? 0 };
}
