const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
}

function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en alertas de fichajes');
  return data;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertType = 'no_clockin' | 'late' | 'excess_hours' | 'incomplete';
export type AlertSeverity = 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface ClockinAlert {
  _id: string;
  _rev?: string;
  type: 'clockin_alert';
  business_id: string;
  member_id: string;
  member_name: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  date: string;
  details: {
    scheduled_start?: string;
    scheduled_end?: string;
    actual_start?: string;
    delay_minutes?: number;
    worked_minutes?: number;
    max_minutes?: number;
    missing_entry?: string;
    clockin_id?: string;
  };
  status: AlertStatus;
  acknowledged_by?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertsSummary {
  total: number;
  no_clockin: number;
  late: number;
  excess_hours: number;
  incomplete: number;
  critical: number;
  warning: number;
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function generateAlerts(
  businessId: string,
  date?: string,
): Promise<{ generated: number; alerts: ClockinAlert[] }> {
  const qs = date ? `?date=${date}` : '';
  return req(`/api/clockin-alerts/${encodeURIComponent(businessId)}/generate${qs}`, {
    method: 'POST',
  });
}

export async function fetchAlerts(
  businessId: string,
  filters?: { date?: string; alert_type?: AlertType; status?: AlertStatus; from?: string; to?: string },
): Promise<ClockinAlert[]> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.alert_type) params.set('alert_type', filters.alert_type);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString() ? `?${params}` : '';
  const data = await req<{ alerts: ClockinAlert[] }>(
    `/api/clockin-alerts/${encodeURIComponent(businessId)}${qs}`,
  );
  return data.alerts || [];
}

export async function fetchAlertsSummary(
  businessId: string,
  date?: string,
): Promise<AlertsSummary> {
  const qs = date ? `?date=${date}` : '';
  const data = await req<{ summary: AlertsSummary }>(
    `/api/clockin-alerts/${encodeURIComponent(businessId)}/summary${qs}`,
  );
  return data.summary;
}

export async function acknowledgeAlert(
  businessId: string,
  alertId: string,
  action: 'acknowledge' | 'resolve' = 'acknowledge',
): Promise<ClockinAlert> {
  const data = await req<{ alert: ClockinAlert }>(
    `/api/clockin-alerts/${encodeURIComponent(businessId)}/acknowledge`,
    { method: 'PUT', body: JSON.stringify({ alertId, action }) },
  );
  return data.alert;
}

// ─── Business clockin config (stored on business document) ───────────────────

export interface ClockinConfig {
  late_tolerance_minutes: number;
  max_daily_minutes: number;
  overtime_weekly_minutes: number;
  require_geo: boolean;
  allowed_devices: ('mobile' | 'tablet' | 'desktop' | 'kiosk')[];
  max_continuous_hours: number;
}

export const DEFAULT_CLOCKIN_CONFIG: ClockinConfig = {
  late_tolerance_minutes: 10,
  max_daily_minutes: 600,
  overtime_weekly_minutes: 2400,
  require_geo: false,
  allowed_devices: ['mobile', 'tablet', 'desktop', 'kiosk'],
  max_continuous_hours: 4,
};

export const ALERT_TYPE_CONFIG: Record<AlertType, { label: string; icon: string; color: string; bgColor: string }> = {
  no_clockin:    { label: 'Sin fichar',        icon: 'UserX',       color: 'text-red-600 dark:text-red-400',    bgColor: 'bg-red-50 dark:bg-red-900/20' },
  late:          { label: 'Retraso',           icon: 'Clock',       color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20' },
  excess_hours:  { label: 'Exceso de horas',   icon: 'AlertTriangle', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20' },
  incomplete:    { label: 'Fichaje incompleto', icon: 'FileWarning', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/20' },
};
