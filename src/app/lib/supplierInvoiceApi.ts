import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (res.status === 401) throw new Error('Sesión expirada');
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data;
}

export interface SupplierInvoiceEmailConfig {
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  pollIntervalMinutes: number;
  autoCreateFinance: boolean;
  defaultCategory: string;
  defaultPaymentTermsDays: number;
  maxAttachmentSizeMb: number;
  alertConfig: {
    duplicateEnabled: boolean;
    noAttachmentEnabled: boolean;
    unknownSupplierEnabled: boolean;
    ocrFailedEnabled: boolean;
    overdueEnabled: boolean;
  };
}

export interface EmailPollSummary {
  processed: number;
  created: number;
  alerts: number;
  errors: number;
}

export async function getSupplierInvoiceEmailConfig(userId: string): Promise<SupplierInvoiceEmailConfig> {
  const data = await apiRequest<{ ok: boolean; config: SupplierInvoiceEmailConfig }>(
    `/api/supplier-invoices/config/${encodeURIComponent(userId)}`,
  );
  return data.config;
}

export async function saveSupplierInvoiceEmailConfig(
  userId: string,
  config: Partial<SupplierInvoiceEmailConfig>,
): Promise<SupplierInvoiceEmailConfig> {
  const data = await apiRequest<{ ok: boolean; config: SupplierInvoiceEmailConfig }>(
    `/api/supplier-invoices/config/${encodeURIComponent(userId)}`,
    { method: 'PUT', body: JSON.stringify({ config }) },
  );
  return data.config;
}

export async function testSupplierInvoiceImap(
  overrides: Partial<Pick<SupplierInvoiceEmailConfig, 'imapHost' | 'imapPort' | 'imapUser' | 'imapPassword' | 'imapTls'>> & {
    userId?: string;
  },
): Promise<{ ok: boolean; error?: string; folders?: string[]; totalMessages?: number }> {
  const passRaw = String(overrides.imapPassword || '');
  const pass =
    !passRaw || passRaw === '••••••••'
      ? undefined
      : passRaw.replace(/\s+/g, '').trim();
  return apiRequest('/api/supplier-invoices/test-imap', {
    method: 'POST',
    body: JSON.stringify({
      host: overrides.imapHost,
      port: overrides.imapPort,
      user: overrides.imapUser,
      pass,
      tls: overrides.imapTls,
      userId: overrides.userId || undefined,
    }),
  });
}

export async function pollSupplierInvoicesNow(userId: string): Promise<EmailPollSummary> {
  const data = await apiRequest<{ ok: boolean; summary: EmailPollSummary }>(
    `/api/supplier-invoices/poll/${encodeURIComponent(userId)}`,
    { method: 'POST' },
  );
  return data.summary;
}
