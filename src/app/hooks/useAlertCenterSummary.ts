import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { fetchAlertSummary, normalizeAlertSummary, type AlertSummary } from '../lib/alertCenterApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeDocumentAlertsIntoSummary,
} from '../lib/documentAlertsApi';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';

export function useAlertCenterSummary(
  businessId: string | undefined,
  options?: { pollMs?: number; dataUserId?: string; includeDocumentAlerts?: boolean },
) {
  const auth = useAuthOptional();
  const currentBusiness = useBusinessOptional()?.currentBusiness;
  const resolvedDataUserId =
    options?.dataUserId ?? resolveBusinessDataUserId(auth?.user ?? null, currentBusiness);
  const includeDocumentAlerts = options?.includeDocumentAlerts !== false;

  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(businessId));
  const loadInflightRef = useRef<Promise<void> | null>(null);
  const loadSeqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!businessId) {
      setSummary(null);
      setLoading(false);
      return;
    }

    if (loadInflightRef.current) {
      return loadInflightRef.current;
    }

    const seq = ++loadSeqRef.current;

    const run = async () => {
      try {
        const summaryRes = await fetchAlertSummary(businessId);
        if (seq !== loadSeqRef.current) return;

        const base = normalizeAlertSummary(summaryRes.summary);

        if (!includeDocumentAlerts || !resolvedDataUserId) {
          setSummary(base);
          return;
        }

        const docAlerts = await fetchDocumentAlertsAsRecords(resolvedDataUserId, businessId);
        if (seq !== loadSeqRef.current) return;

        setSummary(
          docAlerts.length > 0 ? mergeDocumentAlertsIntoSummary(base, docAlerts) : base,
        );
      } catch {
        /* silent */
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    };

    const promise = run().finally(() => {
      if (loadInflightRef.current === promise) {
        loadInflightRef.current = null;
      }
    });
    loadInflightRef.current = promise;
    return promise;
  }, [businessId, includeDocumentAlerts, resolvedDataUserId]);

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
