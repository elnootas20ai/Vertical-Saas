// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandingConfig {
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customDomain: string;
  businessName: string;
  tagline: string;
  favicon: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  isSystem: boolean;
  updatedAt?: string;
}

export interface DaySchedule {
  open: boolean;
  from: string;
  to: string;
}

export interface WeekSchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface Holiday {
  date: string;
  name: string;
  recurring: boolean;
}

export interface LunchBreak {
  enabled: boolean;
  from: string;
  to: string;
}

export interface BusinessHoursConfig {
  timezone: string;
  schedule: WeekSchedule;
  holidays: Holiday[];
  lunchBreak: LunchBreak;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  tag: 'nuevo' | 'mejora' | 'fix' | 'deprecado';
  title: string;
  description: string;
  items: string[];
}

// ─── API base ─────────────────────────────────────────────────────────────────

import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({})) as T & { ok?: boolean; error?: string };
  if (res.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data;
}

// ─── ADM-02: Branding ─────────────────────────────────────────────────────────

export async function getBranding(businessId: string): Promise<BrandingConfig> {
  const data = await apiRequest<{ ok: boolean; branding: BrandingConfig }>(`/api/settings/branding/${encodeURIComponent(businessId)}`);
  return data.branding;
}

export async function saveBranding(businessId: string, branding: Partial<BrandingConfig>): Promise<void> {
  await apiRequest(`/api/settings/branding/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(branding),
  });
}

// ─── ADM-03: Pipeline config ──────────────────────────────────────────────────

export async function getPipelineConfig(userId: string): Promise<PipelineStage[]> {
  const data = await apiRequest<{ ok: boolean; stages: PipelineStage[] }>(`/api/settings/pipeline/${encodeURIComponent(userId)}`);
  return data.stages;
}

export async function savePipelineConfig(userId: string, stages: PipelineStage[]): Promise<PipelineStage[]> {
  const data = await apiRequest<{ ok: boolean; stages: PipelineStage[] }>(`/api/settings/pipeline/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ stages }),
  });
  return data.stages;
}

// ─── ADM-05: Email templates ──────────────────────────────────────────────────

export async function getEmailTemplates(userId: string): Promise<EmailTemplate[]> {
  const data = await apiRequest<{ ok: boolean; templates: EmailTemplate[] }>(`/api/settings/email-templates/${encodeURIComponent(userId)}`);
  return data.templates;
}

export async function saveEmailTemplates(userId: string, templates: EmailTemplate[]): Promise<EmailTemplate[]> {
  const data = await apiRequest<{ ok: boolean; templates: EmailTemplate[] }>(`/api/settings/email-templates/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ templates }),
  });
  return data.templates;
}

// ─── ADM-07: Business hours ───────────────────────────────────────────────────

export async function getBusinessHours(userId: string): Promise<BusinessHoursConfig> {
  const data = await apiRequest<{ ok: boolean; hours: BusinessHoursConfig }>(`/api/settings/business-hours/${encodeURIComponent(userId)}`);
  return data.hours;
}

export async function saveBusinessHours(userId: string, hours: BusinessHoursConfig): Promise<void> {
  await apiRequest(`/api/settings/business-hours/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(hours),
  });
}

// ─── ADM-06: Data portability ─────────────────────────────────────────────────

export async function exportTenantData(userId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings/export/${encodeURIComponent(userId)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Error exportando datos');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importTenantData(
  userId: string,
  file: File,
): Promise<{ ok: boolean; totalImported: number; results: Record<string, { imported: number; total: number; error?: string }> }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as { collections?: unknown };
  if (!parsed.collections) throw new Error('Formato de archivo inválido. Se espera un archivo exportado por Vertial.');
  return apiRequest(`/api/settings/import/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ collections: parsed.collections }),
  });
}

// ─── ADM-09: Alerts config ─────────────────────────────────────────────────────

export type AlertChannel = 'push' | 'email' | 'sms' | 'inApp';
export type AlertUrgency = 'low' | 'medium' | 'high' | 'critical';
export type AlertRuleDepartment =
  | 'delivery' | 'finanzas' | 'rrhh' | 'operaciones'
  | 'limpieza' | 'construccion' | 'verticales' | 'sistema';

const CATEGORY_TO_DEPARTMENT: Record<string, AlertRuleDepartment> = {
  stock: 'operaciones',
  ventas: 'operaciones',
  crm: 'operaciones',
  citas: 'operaciones',
  taller: 'operaciones',
  vehicle_entry: 'operaciones',
  finanzas: 'finanzas',
  conciliacion: 'finanzas',
  ocr: 'finanzas',
  compras: 'finanzas',
  equipo: 'rrhh',
  documentos: 'rrhh',
  documentacion: 'rrhh',
  seguridad: 'sistema',
  sistema: 'sistema',
  delivery: 'delivery',
  limpieza: 'limpieza',
  construccion: 'construccion',
  carniceria: 'verticales',
  desguaces: 'verticales',
  compraventa: 'verticales',
  adquisiciones: 'verticales',
  verticales: 'operaciones',
};

export function ruleDepartment(rule: Pick<AlertRule, 'department' | 'category'>): AlertRuleDepartment {
  if (rule.department) return rule.department;
  return CATEGORY_TO_DEPARTMENT[rule.category] || 'operaciones';
}

export type AlertPlanTier = 'basic' | 'normal' | 'pro';

export interface AlertRule {
  id: string;
  category: string;
  department?: AlertRuleDepartment;
  planTier?: AlertPlanTier;
  label: string;
  description: string;
  enabled: boolean;
  channels: AlertChannel[];
  urgency: AlertUrgency;
  schedule: 'instant' | 'digest_daily' | 'digest_weekly';
  recipientRoles: string[];
  customRecipients: string[];
}

export interface AlertsGlobalConfig {
  muteAll: boolean;
  quietHoursEnabled: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
  digestTime: string;
  defaultChannels: AlertChannel[];
}

/** Umbrales operativos de caja (cuándo dispara cada alerta). */
export interface CashRegisterOperationalConfig {
  registerNotOpenedEnabled: boolean;
  registerNotOpenedCheckHour: number;
  registerNotClosedEnabled: boolean;
  cashCloseDeadline: string;
  cashWarningMinutes: number;
  cashMaxOpenHours: number;
  discrepancyEnabled: boolean;
  discrepancyThreshold: number;
  highReturnEnabled: boolean;
  highReturnThreshold: number;
}

export interface AlertsOperationalConfig {
  cashRegister: CashRegisterOperationalConfig;
}

export const DEFAULT_CASH_REGISTER_OPERATIONAL: CashRegisterOperationalConfig = {
  registerNotOpenedEnabled: true,
  registerNotOpenedCheckHour: 10,
  registerNotClosedEnabled: true,
  cashCloseDeadline: '23:30',
  cashWarningMinutes: 30,
  cashMaxOpenHours: 12,
  discrepancyEnabled: true,
  discrepancyThreshold: 20,
  highReturnEnabled: true,
  highReturnThreshold: 50,
};

export interface AlertsConfig {
  global: AlertsGlobalConfig;
  rules: AlertRule[];
  operational?: AlertsOperationalConfig;
}

export async function getAlertsConfig(businessId: string): Promise<AlertsConfig> {
  const data = await apiRequest<{ ok: boolean; alerts: AlertsConfig }>(`/api/settings/alerts/${encodeURIComponent(businessId)}`);
  return data.alerts;
}

export async function saveAlertsConfig(businessId: string, alerts: AlertsConfig): Promise<void> {
  await apiRequest(`/api/settings/alerts/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(alerts),
  });
}

// ─── ADM-01: Impersonation ────────────────────────────────────────────────────

export async function impersonateUser(targetUserId: string): Promise<{ accessToken: string; user: { fullName: string; email: string } }> {
  return apiRequest(`/api/settings/impersonate/${encodeURIComponent(targetUserId)}`, {
    method: 'POST',
  });
}

// ─── ADM-08: Platform changelog ───────────────────────────────────────────────

export async function getPlatformChangelog(limit = 20): Promise<{ changelog: ChangelogEntry[]; total: number }> {
  return apiRequest<{ ok: boolean; changelog: ChangelogEntry[]; total: number }>(`/api/settings/platform/changelog?limit=${limit}`);
}

// ─── CFG: Configuracion General APIs ─────────────────────────────────────────

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

export async function getModulesConfigApi(businessId: string): Promise<ModulesConfig> {
  const data = await apiRequest<{ ok: boolean; modules: ModulesConfig }>(
    `/api/settings/modules/${encodeURIComponent(businessId)}`,
  );
  return data.modules;
}

export async function saveModulesConfigApi(businessId: string, activeModules: string[]): Promise<void> {
  await apiRequest(`/api/settings/modules/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify({ activeModules }),
  });
}

export async function getInvoiceEmailConfigApi(businessId: string): Promise<InvoiceEmailConfig> {
  const data = await apiRequest<{ ok: boolean; invoiceEmail: InvoiceEmailConfig }>(
    `/api/settings/invoice-email/${encodeURIComponent(businessId)}`,
  );
  return data.invoiceEmail;
}

export async function saveInvoiceEmailConfigApi(
  businessId: string,
  config: Partial<InvoiceEmailConfig>,
): Promise<void> {
  await apiRequest(`/api/settings/invoice-email/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getImportConfigApi(businessId: string): Promise<ImportConfigData> {
  const data = await apiRequest<{ ok: boolean; importConfig: ImportConfigData }>(
    `/api/settings/import-config/${encodeURIComponent(businessId)}`,
  );
  return data.importConfig;
}

export async function saveImportConfigApi(
  businessId: string,
  config: Partial<ImportConfigData>,
): Promise<void> {
  await apiRequest(`/api/settings/import-config/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getInitialImportStatusApi(businessId: string): Promise<InitialImportData> {
  const data = await apiRequest<{ ok: boolean; initialImport: InitialImportData }>(
    `/api/settings/initial-import/${encodeURIComponent(businessId)}`,
  );
  return data.initialImport;
}

export async function saveInitialImportStatusApi(
  businessId: string,
  status: Pick<InitialImportData, 'stock' | 'clients' | 'catalog'>,
): Promise<{ onboardingImportPending: boolean }> {
  return apiRequest(`/api/settings/initial-import/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(status),
  });
}
