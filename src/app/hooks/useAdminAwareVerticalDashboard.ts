import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../lib/verticalApiFactory';

function looksLikeAdminDemo(data: VerticalDashboardData | null | undefined): boolean {
  return (data?.recentActivity || []).some((a) => String(a.id || '').startsWith('admin-demo-'));
}

/** Carga dashboard vertical. El mock (si aplica) ya lo inyecta createVerticalDashboardApi solo para uriel@admin.com. */
export function useAdminAwareVerticalDashboard(verticalKey: string) {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const dashApi = useMemo(() => createVerticalDashboardApi(verticalKey), [verticalKey]);

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setDashData(null);
      setUsingDemo(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const raw = await dashApi.load(userId);
      setDashData(raw);
      setUsingDemo(looksLikeAdminDemo(raw));
    } catch {
      setDashData(null);
      setUsingDemo(false);
    } finally {
      setLoading(false);
    }
  }, [dashApi, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return { dashData, loading, usingDemo, userId, reload: loadData };
}
