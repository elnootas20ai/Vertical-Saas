import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (res.status === 401) throw new Error('Sesion expirada');
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data;
}

export interface ModulesConfig {
  activeModules: string[];
  contractedModules: string[];
}

export interface InvoiceEmailConfig {
  email: string;
  enabled: boolean;
  customEmail: string;
}

export interface ImportConfigData {
  duplicateRule: 'ignore' | 'overwrite' | 'create_new';
  dateFormat: string;
  csvSeparator: string;
  encoding: string;
}

export type CfgImportItemStatus = 'pending' | 'completed' | 'skipped';

export interface InitialImportData {
  stock: CfgImportItemStatus;
  clients: CfgImportItemStatus;
  catalog: CfgImportItemStatus;
  onboardingImportPending: boolean;
}

export async function getModulesConfig(businessId: string): Promise<ModulesConfig> {
  const data = await apiRequest<{ ok: boolean; modules: ModulesConfig }>(
    `/api/settings/modules/${encodeURIComponent(businessId)}`,
  );
  return data.modules;
}

export async function saveModulesConfig(businessId: string, activeModules: string[]): Promise<void> {
  await apiRequest(`/api/settings/modules/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify({ activeModules }),
  });
}

export async function getInvoiceEmailConfig(businessId: string): Promise<InvoiceEmailConfig> {
  const data = await apiRequest<{ ok: boolean; invoiceEmail: InvoiceEmailConfig }>(
    `/api/settings/invoice-email/${encodeURIComponent(businessId)}`,
  );
  return data.invoiceEmail;
}

export async function saveInvoiceEmailConfig(businessId: string, config: Partial<InvoiceEmailConfig>): Promise<void> {
  await apiRequest(`/api/settings/invoice-email/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getImportConfig(businessId: string): Promise<ImportConfigData> {
  const data = await apiRequest<{ ok: boolean; importConfig: ImportConfigData }>(
    `/api/settings/import-config/${encodeURIComponent(businessId)}`,
  );
  return data.importConfig;
}

export async function saveImportConfig(businessId: string, config: Partial<ImportConfigData>): Promise<void> {
  await apiRequest(`/api/settings/import-config/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getInitialImportStatus(businessId: string): Promise<InitialImportData> {
  const data = await apiRequest<{ ok: boolean; initialImport: InitialImportData }>(
    `/api/settings/initial-import/${encodeURIComponent(businessId)}`,
  );
  return data.initialImport;
}

export async function saveInitialImportStatus(
  businessId: string,
  status: Pick<InitialImportData, 'stock' | 'clients' | 'catalog'>,
): Promise<{ onboardingImportPending: boolean }> {
  return apiRequest(`/api/settings/initial-import/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(status),
  });
}
