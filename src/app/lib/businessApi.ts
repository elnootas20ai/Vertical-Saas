import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BusinessMember {
  user_id: string;
  fullName: string;
  email: string;
  role: string;
  /** null = acceso a todas las sedes; branch_id específico = solo esa sede */
  branch_id: string | null;
  permissions: Record<string, { view: boolean; edit: boolean }>;
  joinedAt: string;
}

export interface Branch {
  branch_id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  managerUserId: string;
  createdAt: string;
}

import type { RestaurantFormat } from '../verticals/restaurant/restaurantFormat';

export type { RestaurantFormat };

export type BusinessType = 'events' | 'carDealership' | 'workshop' | 'delivery' | 'restaurant' | 'cleaning' | 'hairSalon' | 'gym' | 'clinic' | 'hotel' | 'construction' | 'academy' | 'realEstate' | 'lawyer' | 'nightclub' | 'scrapyard' | 'spareParts' | 'taxi' | 'pharmacy' | 'carWash' | 'vet' | 'tobaccoShop' | 'butcherShop' | 'iceCreamShop';

export type ImportItemStatus = 'pending' | 'completed' | 'skipped';

export interface InitialImportStatus {
  stock: ImportItemStatus;
  clients: ImportItemStatus;
  catalog: ImportItemStatus;
}

export interface ImportConfig {
  duplicateRule: 'ignore' | 'overwrite' | 'create_new';
  dateFormat: string;
  csvSeparator: string;
  encoding: string;
}

export interface Business {
  id: string;
  _rev?: string;
  business_id: string;
  owner_user_id: string;
  /** Grupo empresarial al que pertenece (null = independiente) */
  group_id: string | null;
  businessType: BusinessType;
  /** Solo vertical restaurant: bar | restaurant | bar_restaurant */
  restaurantFormat?: RestaurantFormat | null;
  /** Carnicería: activar repartos a domicilio */
  ownDeliveryEnabled?: boolean;
  /** Margen objetivo % sugerencia precio €/kg */
  butcherTargetMarginPct?: number;
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  logo: string;
  branches: Branch[];
  members: BusinessMember[];
  activeModules: string[];
  contractedModules: string[];
  invoiceReceiptEmail: string;
  invoiceReceiptEnabled: boolean;
  initialImportStatus: InitialImportStatus;
  onboardingImportPending: boolean;
  importConfig: ImportConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBusinessPayload {
  name: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  logo?: string;
  businessType?: BusinessType;
  restaurantFormat?: RestaurantFormat | null;
  ownDeliveryEnabled?: boolean;
  butcherTargetMarginPct?: number;
}

export interface UpdateBusinessPayload extends Partial<CreateBusinessPayload> {}

interface BusinessEnvelope {
  ok: boolean;
  error?: string;
  business?: Business;
  businesses?: Business[];
}

// ─── API base ─────────────────────────────────────────────────────────────────

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit): Promise<BusinessEnvelope> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await authFetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(init?.headers || {}),
      },
      credentials: 'include',
      ...init,
    });
  } catch (err) {
    const hint = API_BASE
      ? `No se pudo conectar con el servidor (${url}).`
      : 'No se pudo conectar con el servidor. Comprueba que el backend esté en marcha (npm start, puerto 3001).';
    throw new Error(
      err instanceof Error && err.message.toLowerCase().includes('fetch') ? hint : (err instanceof Error ? err.message : hint),
    );
  }

  const payload = (await response.json().catch(() => ({}))) as BusinessEnvelope;

  if (response.status === 401) {
    throw new Error(payload.error || 'Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de empresas');
  }

  return payload;
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export async function listBusinessesRequest(userId: string) {
  return request(`/api/businesses/user/${encodeURIComponent(userId)}`);
}

export async function getBusinessRequest(businessId: string) {
  return request(`/api/businesses/${encodeURIComponent(businessId)}`);
}

export async function createBusinessRequest(userId: string, data: CreateBusinessPayload) {
  const response = await authFetch(`${API_BASE}/api/businesses/user/${encodeURIComponent(userId)}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    credentials: 'include',
    method: 'POST',
    body: JSON.stringify(data),
  });

  const payload = (await response.json().catch(() => ({}))) as BusinessEnvelope;

  if (response.status === 409 && payload.business) {
    return { ok: true, business: payload.business } as BusinessEnvelope;
  }

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de empresas');
  }

  return payload;
}

export async function updateBusinessRequest(businessId: string, data: UpdateBusinessPayload) {
  return request(`/api/businesses/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBusinessRequest(businessId: string, password: string) {
  return request(`/api/businesses/${encodeURIComponent(businessId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

export async function addBusinessMemberRequest(
  businessId: string,
  member: Omit<BusinessMember, 'joinedAt'>,
) {
  return request(`/api/businesses/${encodeURIComponent(businessId)}/members`, {
    method: 'POST',
    body: JSON.stringify(member),
  });
}

export async function updateBusinessMemberRequest(
  businessId: string,
  memberId: string,
  updates: Pick<BusinessMember, 'role' | 'permissions'>,
) {
  return request(
    `/api/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(updates),
    },
  );
}

export async function removeBusinessMemberRequest(businessId: string, memberId: string) {
  return request(
    `/api/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
  );
}
