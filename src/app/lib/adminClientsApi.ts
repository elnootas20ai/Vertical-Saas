import { authFetch } from './authApi';

export type ClientHealthStatus = 'active' | 'at_risk' | 'inactive';

export interface ClientUsageHealth {
  status: ClientHealthStatus;
  label: string;
  daysSince: number | null;
}

export interface ClientUsageKpis {
  daysSinceLastLogin: number | null;
  activeLoginDays30: number;
  loginCount30: number;
  activeSessionCount: number;
  totalSessionCount: number;
  clockedHours30: number;
  clockedDays30: number;
  tpvErrors7d: number;
  apiRequests7d: number;
  apiRequests30d: number;
}

export interface ClientUsageSession {
  sessionId: string;
  deviceInfo: Record<string, unknown>;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  active: boolean;
}

export interface ClientUsageBusiness {
  businessId: string;
  name: string;
  businessType: string;
  memberCount: number;
  clockedMinutes30: number;
  activeDays30: number;
  clockSessions30: number;
}

export interface ClientUsageSummary {
  health: ClientUsageHealth;
  account: {
    userId: string;
    email: string;
    fullName: string;
    companyName: string;
    createdAt: string;
    lastLoginAt: string;
    status: string;
    subscriptionStatus: string;
    onboardingCompleted: boolean;
  };
  kpis: ClientUsageKpis;
  sessions: ClientUsageSession[];
  loginsByWeek: Array<{ week: string; count: number }>;
  recentLogins: Array<{ at: string; ip: string; userAgent: string; provider: string }>;
  recentActivity: Array<Record<string, unknown>>;
  businesses: ClientUsageBusiness[];
  onboarding: {
    pixelOpened: boolean;
    pixelClicked: boolean;
    imports: { vehicles: boolean; clients: boolean; team: boolean; billing: boolean };
    ancoverAccess: boolean;
    verificationStatus: string;
    onboardingCompleted: boolean;
  };
  tpvErrors: Array<{ at: string; context: string; page: string; message: string }>;
  topApiActivity7d: Array<{ resource: string; count: number }>;
  recentApiActivity: Array<{
    timestamp: string;
    action: string;
    details: string;
    category: string;
    resource: string;
    method: string;
    path: string;
    level: string;
    ip: string;
  }>;
}

export function computeClientHealthFromLogin(
  lastLoginAt?: string | null,
  createdAt?: string | null,
): ClientUsageHealth {
  const ref = lastLoginAt || createdAt;
  if (!ref) return { status: 'inactive', label: 'Sin actividad', daysSince: null };
  const daysSince = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  if (daysSince <= 7) return { status: 'active', label: 'Activo', daysSince };
  if (daysSince <= 30) return { status: 'at_risk', label: 'En riesgo', daysSince };
  return { status: 'inactive', label: 'Inactivo', daysSince };
}

export function healthBadgeClasses(status: ClientHealthStatus): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'at_risk') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export async function fetchClientUsageRequest(userId: string): Promise<ClientUsageSummary> {
  const res = await authFetch(`/api/admin/clients/${encodeURIComponent(userId)}/usage`);
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'No se pudo cargar el uso del cliente');
  }
  return data.usage as ClientUsageSummary;
}
