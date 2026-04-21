export interface TeamAlert {
  id: string;
  type: 'document_expired' | 'document_expiring' | 'no_assignment' | 'cost_review_pending';
  severity: 'critical' | 'warning' | 'info';
  workerId: string;
  workerName: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TeamAlertsSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  byType: {
    document_expired: number;
    document_expiring: number;
    no_assignment: number;
    cost_review_pending: number;
  };
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

export async function fetchTeamAlerts(businessId: string): Promise<TeamAlert[]> {
  const token = getToken();
  const res = await fetch(`/api/team-alerts/${encodeURIComponent(businessId)}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts || [];
}

export async function fetchTeamAlertsSummary(businessId: string): Promise<TeamAlertsSummary | null> {
  const token = getToken();
  const res = await fetch(`/api/team-alerts/${encodeURIComponent(businessId)}/summary`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) return null;
  return res.json();
}
