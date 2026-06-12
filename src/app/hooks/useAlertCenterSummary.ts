import { useCallback, useEffect, useState } from 'react';
import { fetchAlertSummary, normalizeAlertSummary, type AlertSummary } from '../lib/alertCenterApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeDocumentAlertsIntoSummary,
} from '../lib/documentAlertsApi';

export function useAlertCenterSummary(
  businessId: string | undefined,
  options?: { pollMs?: number; dataUserId?: string },
) {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(businessId));

  const reload = useCallback(async () => {
    if (!businessId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const [res, docAlerts] = await Promise.all([
        fetchAlertSummary(businessId),
        options?.dataUserId
          ? fetchDocumentAlertsAsRecords(options.dataUserId, businessId)
          : Promise.resolve([]),
      ]);
      const base = normalizeAlertSummary(res.summary);
      setSummary(docAlerts.length > 0 ? mergeDocumentAlertsIntoSummary(base, docAlerts) : base);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [businessId, options?.dataUserId]);

  useEffect(() => {
    setLoading(Boolean(businessId));
    void reload();
    const pollMs = options?.pollMs ?? 300_000;
    if (!businessId || pollMs <= 0) return undefined;
    const id = window.setInterval(() => { void reload(); }, pollMs);
    return () => window.clearInterval(id);
  }, [businessId, reload, options?.pollMs]);

  return { summary, loading, reload, unresolved: summary?.unresolved ?? 0 };
}
