import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en contracts API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceFrequency =
  | 'daily' | 'daily_all'
  | 'weekly_1' | 'weekly_2' | 'weekly_3' | 'weekly_4' | 'weekly_5'
  | 'biweekly' | 'monthly' | 'on_demand' | 'custom';

export type ServiceContractStatus =
  | 'draft' | 'active' | 'paused' | 'pending_renewal' | 'expired' | 'cancelled';

export type PricingModel = 'monthly' | 'per_service' | 'per_hour';

export type ServiceClientType =
  | 'office' | 'community' | 'shop' | 'warehouse' | 'gym' | 'home'
  | 'post_construction' | 'restaurant' | 'clinic' | 'hotel' | 'school' | 'other';

export interface ServiceScheduleSlot {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  startTime: string;
  endTime: string;
}

export interface ServiceContract {
  _id: string;
  _rev?: string;
  type: 'service_contract';
  id: string;
  contractNumber: string;
  user_id: string;

  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientType: ServiceClientType;

  address: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  coordinates: { lat: number; lng: number } | null;
  zone: string;

  cleaningType: string;
  frequency: ServiceFrequency;
  customFrequencyDays: number[];
  scheduleDays: ServiceScheduleSlot[];
  contractedHoursPerVisit: number;
  contractedVisitsPerMonth: number | null;

  pricingModel: PricingModel;
  monthlyPrice: number;
  pricePerService: number;
  pricePerHour: number;
  taxRate: number;
  taxIncluded: boolean;

  assignedWorkerId: string;
  assignedWorkerName: string;
  backupWorkerId: string;
  backupWorkerName: string;

  materials: string[];
  materialsIncluded: boolean;

  contractStatus: ServiceContractStatus;
  startDate: string;
  endDate: string;
  renewalDate: string;
  autoRenew: boolean;
  renewalNoticeDays: number;

  observations: string;
  clientInstructions: string;

  billingEnabled: boolean;
  billingDay: number;
  linkedInvoiceIds: string[];

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ServiceContractStats {
  total: number;
  active: number;
  paused: number;
  pendingRenewal: number;
  expired: number;
  estimatedMonthlyRevenue: number;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const FREQUENCY_LABELS: Record<string, Record<ServiceFrequency, string>> = {
  es: {
    daily: 'Diario (L-V)', daily_all: 'Diario (L-D)',
    weekly_1: '1×/semana', weekly_2: '2×/semana', weekly_3: '3×/semana',
    weekly_4: '4×/semana', weekly_5: '5×/semana',
    biweekly: 'Quincenal', monthly: 'Mensual', on_demand: 'Bajo demanda', custom: 'Personalizada',
  },
  en: {
    daily: 'Daily (Mon-Fri)', daily_all: 'Daily (Mon-Sun)',
    weekly_1: '1×/week', weekly_2: '2×/week', weekly_3: '3×/week',
    weekly_4: '4×/week', weekly_5: '5×/week',
    biweekly: 'Biweekly', monthly: 'Monthly', on_demand: 'On demand', custom: 'Custom',
  },
  pt: {
    daily: 'Diário (Seg-Sex)', daily_all: 'Diário (Seg-Dom)',
    weekly_1: '1×/semana', weekly_2: '2×/semana', weekly_3: '3×/semana',
    weekly_4: '4×/semana', weekly_5: '5×/semana',
    biweekly: 'Quinzenal', monthly: 'Mensal', on_demand: 'Sob demanda', custom: 'Personalizado',
  },
  fr: {
    daily: 'Quotidien (Lun-Ven)', daily_all: 'Quotidien (Lun-Dim)',
    weekly_1: '1×/semaine', weekly_2: '2×/semaine', weekly_3: '3×/semaine',
    weekly_4: '4×/semaine', weekly_5: '5×/semaine',
    biweekly: 'Bimensuel', monthly: 'Mensuel', on_demand: 'À la demande', custom: 'Personnalisé',
  },
};

export const CLIENT_TYPE_LABELS: Record<string, Record<ServiceClientType, string>> = {
  es: {
    office: 'Oficina', community: 'Comunidad', shop: 'Tienda', warehouse: 'Nave',
    gym: 'Gimnasio', home: 'Domicilio', post_construction: 'Final de obra',
    restaurant: 'Restaurante', clinic: 'Clínica', hotel: 'Hotel', school: 'Centro educativo', other: 'Otro',
  },
  en: {
    office: 'Office', community: 'Community', shop: 'Shop', warehouse: 'Warehouse',
    gym: 'Gym', home: 'Home', post_construction: 'Post-construction',
    restaurant: 'Restaurant', clinic: 'Clinic', hotel: 'Hotel', school: 'School', other: 'Other',
  },
  pt: {
    office: 'Escritório', community: 'Comunidade', shop: 'Loja', warehouse: 'Armazém',
    gym: 'Ginásio', home: 'Domicílio', post_construction: 'Pós-obra',
    restaurant: 'Restaurante', clinic: 'Clínica', hotel: 'Hotel', school: 'Escola', other: 'Outro',
  },
  fr: {
    office: 'Bureau', community: 'Copropriété', shop: 'Magasin', warehouse: 'Entrepôt',
    gym: 'Salle de sport', home: 'Domicile', post_construction: 'Fin de chantier',
    restaurant: 'Restaurant', clinic: 'Clinique', hotel: 'Hôtel', school: 'École', other: 'Autre',
  },
};

export const CONTRACT_STATUS_LABELS: Record<string, Record<ServiceContractStatus, string>> = {
  es: {
    draft: 'Borrador', active: 'Activo', paused: 'Pausado',
    pending_renewal: 'Por renovar', expired: 'Vencido', cancelled: 'Cancelado',
  },
  en: {
    draft: 'Draft', active: 'Active', paused: 'Paused',
    pending_renewal: 'Pending renewal', expired: 'Expired', cancelled: 'Cancelled',
  },
  pt: {
    draft: 'Rascunho', active: 'Ativo', paused: 'Pausado',
    pending_renewal: 'A renovar', expired: 'Expirado', cancelled: 'Cancelado',
  },
  fr: {
    draft: 'Brouillon', active: 'Actif', paused: 'En pause',
    pending_renewal: 'À renouveler', expired: 'Expiré', cancelled: 'Annulé',
  },
};

export const PRICING_MODEL_LABELS: Record<string, Record<PricingModel, string>> = {
  es: { monthly: 'Precio mensual', per_service: 'Por servicio', per_hour: 'Por hora' },
  en: { monthly: 'Monthly price', per_service: 'Per service', per_hour: 'Per hour' },
  pt: { monthly: 'Preço mensal', per_service: 'Por serviço', per_hour: 'Por hora' },
  fr: { monthly: 'Prix mensuel', per_service: 'Par service', per_hour: 'Par heure' },
};

export const DAY_LABELS: Record<string, Record<string, string>> = {
  es: { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo' },
  en: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
  pt: { mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta', fri: 'Sexta', sat: 'Sábado', sun: 'Domingo' },
  fr: { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatScheduleSummary(slots: ServiceScheduleSlot[], lang = 'es'): string {
  if (!slots.length) return lang === 'es' ? 'Sin horario' : 'No schedule';
  const dayLabelsShort: Record<string, Record<string, string>> = {
    es: { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' },
    en: { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' },
    pt: { mon: 'S', tue: 'T', wed: 'Q', thu: 'Q', fri: 'S', sat: 'S', sun: 'D' },
    fr: { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' },
  };
  const labels = dayLabelsShort[lang] || dayLabelsShort.es;
  const days = slots.map(s => labels[s.day] || s.day).join('-');
  const times = slots[0] ? `${slots[0].startTime}-${slots[0].endTime}` : '';
  return `${days} ${times}`.trim();
}

export function formatPrice(contract: ServiceContract, lang = 'es'): string {
  const fmt = (n: number) => n.toLocaleString(lang === 'es' ? 'es-ES' : lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (contract.pricingModel === 'monthly') return `${fmt(contract.monthlyPrice)} €/mes`;
  if (contract.pricingModel === 'per_service') return `${fmt(contract.pricePerService)} €/servicio`;
  if (contract.pricingModel === 'per_hour') return `${fmt(contract.pricePerHour)} €/hora`;
  return '';
}

// ─── API requests ─────────────────────────────────────────────────────────────

export async function listServiceContractsRequest(
  userId: string,
  filters?: { status?: string; clientId?: string; workerId?: string; zone?: string },
): Promise<ServiceContract[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.clientId) params.set('clientId', filters.clientId);
  if (filters?.workerId) params.set('workerId', filters.workerId);
  if (filters?.zone) params.set('zone', filters.zone);
  const qs = params.toString();
  const path = `/api/cleaning/contracts/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
  const payload = await request<{ ok: boolean; contracts: ServiceContract[] }>(path);
  return payload.contracts || [];
}

export async function getServiceContractRequest(userId: string, contractId: string): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}`,
  );
  if (!payload.contract) throw new Error('Contrato no encontrado');
  return payload.contract;
}

export async function createServiceContractRequest(userId: string, data: Partial<ServiceContract>): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ contract: data }) },
  );
  if (!payload.contract) throw new Error('Respuesta inválida del servidor');
  return payload.contract;
}

export async function updateServiceContractRequest(userId: string, contract: ServiceContract): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contract._id)}`,
    { method: 'PUT', body: JSON.stringify({ contract }) },
  );
  if (!payload.contract) throw new Error('Respuesta inválida del servidor');
  return payload.contract;
}

export async function deleteServiceContractRequest(userId: string, contractId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}`,
    { method: 'DELETE' },
  );
}

export async function activateContractRequest(userId: string, contractId: string): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}/activate`,
    { method: 'POST' },
  );
  if (!payload.contract) throw new Error('Respuesta inválida del servidor');
  return payload.contract;
}

export async function pauseContractRequest(userId: string, contractId: string): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}/pause`,
    { method: 'POST' },
  );
  if (!payload.contract) throw new Error('Respuesta inválida del servidor');
  return payload.contract;
}

export async function cancelContractRequest(userId: string, contractId: string, reason?: string): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  if (!payload.contract) throw new Error('Respuesta inválida del servidor');
  return payload.contract;
}

export async function renewContractRequest(userId: string, contractId: string, newEndDate?: string): Promise<ServiceContract> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contract: ServiceContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}/renew`,
    { method: 'POST', body: JSON.stringify({ newEndDate }) },
  );
  if (!payload.contract) throw new Error('Respuesta inválida del servidor');
  return payload.contract;
}

export async function getContractStatsRequest(userId: string): Promise<ServiceContractStats> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; stats: ServiceContractStats }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/stats`,
  );
  return payload.stats;
}
