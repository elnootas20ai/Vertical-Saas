import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

export interface TeamAlert {
  id: string;
  type: 'document_expired' | 'document_expiring' | 'no_assignment' | 'cost_review_pending' | 'profile_incomplete';
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
    profile_incomplete: number;
  };
}

const API_BASE = getApiBase();

export async function fetchTeamAlerts(businessId: string): Promise<TeamAlert[]> {
  const res = await authFetch(
    `${API_BASE}/api/team-alerts/${encodeURIComponent(businessId)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts || [];
}

export async function fetchTeamAlertsSummary(businessId: string): Promise<TeamAlertsSummary | null> {
  const res = await authFetch(
    `${API_BASE}/api/team-alerts/${encodeURIComponent(businessId)}/summary`,
  );
  if (!res.ok) return null;
  return res.json();
}
