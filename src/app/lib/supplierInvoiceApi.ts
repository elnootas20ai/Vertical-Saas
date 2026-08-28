import { authFetch, extractApiErrorMessage, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

function supplierInvoiceApiErrorMessage(
  status: number,
  payload: Record<string, unknown>,
  rawText: string,
): string {
  const fromPayload = extractApiErrorMessage(payload);
  if (fromPayload) return fromPayload;
  const plain = rawText.replace(/\s+/g, ' ').trim();
  if (plain && !plain.startsWith('<')) return plain.slice(0, 240);
  if (status === 504 || status === 502) {
    return 'La operación tardó demasiado (correo con muchos mensajes). Espera un minuto y reintenta.';
  }
  if (status === 500) {
    return 'Error del servidor al conectar con el correo. Revisa la contraseña de aplicación del PDV.';
  }
  return `No se pudo completar la acción (${status})`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const rawText = await res.text();
  let data = {} as T & { ok?: boolean; error?: unknown; message?: string };
  if (rawText) {
    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      data = { ok: false, error: rawText.slice(0, 300) } as typeof data;
    }
  }
  if (res.status === 401) throw new Error('Sesión expirada');
  if (!res.ok) {
    throw new Error(
      supplierInvoiceApiErrorMessage(res.status, data as Record<string, unknown>, rawText),
    );
  }
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

export interface SupplierInvoicePdvEmailStatus {
  pdvId: string;
  name: string;
  code: string;
  workCenterId: string;
  businessId: string;
  connected: boolean;
  enabled: boolean;
  imapUser: string;
  imapHost: string;
}

export interface EmailPollSummary {
  processed: number;
  created: number;
  alerts: number;
  duplicates?: number;
  errors?: number;
  baselined?: boolean;
  message?: string;
}

export async function listSupplierInvoicePdvEmailConfigs(userId: string): Promise<{
  pdvs: SupplierInvoicePdvEmailStatus[];
  legacyAccount: { connected: boolean; config: SupplierInvoiceEmailConfig };
}> {
  const data = await apiRequest<{
    ok: boolean;
    pdvs: SupplierInvoicePdvEmailStatus[];
    legacyAccount: { connected: boolean; config: SupplierInvoiceEmailConfig };
  }>(`/api/supplier-invoices/config/${encodeURIComponent(userId)}/pdvs`);
  return {
    pdvs: Array.isArray(data.pdvs) ? data.pdvs : [],
    legacyAccount: data.legacyAccount || {
      connected: false,
      config: {} as SupplierInvoiceEmailConfig,
    },
  };
}

export async function getSupplierInvoiceEmailConfig(
  userId: string,
  pdvId?: string,
): Promise<SupplierInvoiceEmailConfig> {
  const qs = pdvId ? `?pdvId=${encodeURIComponent(pdvId)}` : '';
  const data = await apiRequest<{ ok: boolean; config: SupplierInvoiceEmailConfig }>(
    `/api/supplier-invoices/config/${encodeURIComponent(userId)}${qs}`,
  );
  return data.config;
}

export async function saveSupplierInvoiceEmailConfig(
  userId: string,
  config: Partial<SupplierInvoiceEmailConfig>,
  pdvId?: string,
): Promise<SupplierInvoiceEmailConfig & { warning?: string }> {
  const data = await apiRequest<{
    ok: boolean;
    config: SupplierInvoiceEmailConfig;
    warning?: string;
  }>(
    `/api/supplier-invoices/config/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ config, ...(pdvId ? { pdvId } : {}) }),
    },
  );
  return { ...data.config, warning: data.warning };
}

export async function testSupplierInvoiceImap(
  overrides: Partial<
    Pick<SupplierInvoiceEmailConfig, 'imapHost' | 'imapPort' | 'imapUser' | 'imapPassword' | 'imapTls'>
  > & {
    userId?: string;
    pdvId?: string;
  },
): Promise<{ ok: boolean; error?: string; folders?: string[]; totalMessages?: number }> {
  const passRaw = String(overrides.imapPassword || '');
  const pass =
    !passRaw || passRaw === '••••••••' ? undefined : passRaw.replace(/\s+/g, '').trim();
  return apiRequest('/api/supplier-invoices/test-imap', {
    method: 'POST',
    body: JSON.stringify({
      host: overrides.imapHost,
      port: overrides.imapPort,
      user: overrides.imapUser,
      pass,
      tls: overrides.imapTls,
      userId: overrides.userId || undefined,
      pdvId: overrides.pdvId || undefined,
    }),
  });
}

export async function pollSupplierInvoicesNow(
  userId: string,
  pdvId?: string,
): Promise<EmailPollSummary> {
  const data = await apiRequest<{ ok: boolean; summary: EmailPollSummary }>(
    `/api/supplier-invoices/poll/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify(pdvId ? { pdvId } : {}),
    },
  );
  return data.summary;
}
