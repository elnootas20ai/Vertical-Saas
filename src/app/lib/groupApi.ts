import { getAuthHeaders } from './authApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupAdmin {
  user_id: string;
  fullName: string;
  email: string;
  role: 'GerenteGrupo' | string;
  joinedAt: string;
}

export interface BusinessGroup {
  id: string;
  _rev?: string;
  group_id: string;
  owner_user_id: string;
  name: string;
  description: string;
  logo: string;
  business_ids: string[];
  admins: GroupAdmin[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateGroupPayload {
  name: string;
  description?: string;
  logo?: string;
}

export interface UpdateGroupPayload extends Partial<CreateGroupPayload> {}

export interface KpisByBusiness {
  business_id: string;
  stockCount: number;
  totalVehicles: number;
  soldThisMonthCount: number;
  salesVolume: number;
  marginTotal: number;
}

export interface GroupKpis {
  stockCount: number;
  reservedCount: number;
  totalVehicles: number;
  enPreparacion: number;
  soldThisMonthCount: number;
  salesVolume: number;
  marginTotal: number;
  marginPct: number;
  cobrosPendientes: number;
  cobrosCount: number;
  oportunidades: number;
}

export interface GroupFunnel {
  new: number;
  contacted: number;
  appointment: number;
  reserved: number;
  negotiation: number;
  won: number;
  lost: number;
}

export interface GroupKpisData {
  group: BusinessGroup;
  kpis: GroupKpis;
  funnel: GroupFunnel;
  kpisByBusiness: KpisByBusiness[];
  updatedAt: string;
}

interface GroupEnvelope {
  ok: boolean;
  error?: string;
  group?: BusinessGroup;
  groups?: BusinessGroup[];
  kpis?: GroupKpis;
  funnel?: GroupFunnel;
  kpisByBusiness?: KpisByBusiness[];
  updatedAt?: string;
}

// ─── API base ─────────────────────────────────────────────────────────────────

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

async function request(path: string, init?: RequestInit): Promise<GroupEnvelope> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as GroupEnvelope;

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de grupos');
  }

  return payload;
}

// ─── Groups CRUD ──────────────────────────────────────────────────────────────

export async function listGroupsRequest(userId: string) {
  return request(`/api/groups/user/${encodeURIComponent(userId)}`);
}

export async function getGroupRequest(groupId: string) {
  return request(`/api/groups/${encodeURIComponent(groupId)}`);
}

export async function createGroupRequest(userId: string, data: CreateGroupPayload) {
  return request(`/api/groups/user/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGroupRequest(groupId: string, data: UpdateGroupPayload) {
  return request(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGroupRequest(groupId: string) {
  return request(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
}

// ─── KPIs consolidados ────────────────────────────────────────────────────────

export async function getGroupKpisRequest(groupId: string): Promise<GroupKpisData> {
  const payload = await request(`/api/groups/${encodeURIComponent(groupId)}/kpis`);
  return payload as unknown as GroupKpisData;
}

// ─── Businesses en el grupo ───────────────────────────────────────────────────

export async function addBusinessToGroupRequest(groupId: string, businessId: string) {
  return request(`/api/groups/${encodeURIComponent(groupId)}/businesses`, {
    method: 'POST',
    body: JSON.stringify({ businessId }),
  });
}

export async function removeBusinessFromGroupRequest(groupId: string, businessId: string) {
  return request(
    `/api/groups/${encodeURIComponent(groupId)}/businesses/${encodeURIComponent(businessId)}`,
    { method: 'DELETE' },
  );
}

// ─── Admins del grupo ─────────────────────────────────────────────────────────

export async function addGroupAdminRequest(
  groupId: string,
  admin: Omit<GroupAdmin, 'joinedAt'>,
) {
  return request(`/api/groups/${encodeURIComponent(groupId)}/admins`, {
    method: 'POST',
    body: JSON.stringify(admin),
  });
}

export async function removeGroupAdminRequest(groupId: string, adminId: string) {
  return request(
    `/api/groups/${encodeURIComponent(groupId)}/admins/${encodeURIComponent(adminId)}`,
    { method: 'DELETE' },
  );
}

// ─── Branches (sedes) ────────────────────────────────────────────────────────

export interface CreateBranchPayload {
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  managerUserId?: string;
}

export interface UpdateBranchPayload extends Partial<CreateBranchPayload> {}

export async function addBranchRequest(businessId: string, data: CreateBranchPayload) {
  return request(`/api/groups/businesses/${encodeURIComponent(businessId)}/branches`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBranchRequest(
  businessId: string,
  branchId: string,
  data: UpdateBranchPayload,
) {
  return request(
    `/api/groups/businesses/${encodeURIComponent(businessId)}/branches/${encodeURIComponent(branchId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteBranchRequest(businessId: string, branchId: string) {
  return request(
    `/api/groups/businesses/${encodeURIComponent(businessId)}/branches/${encodeURIComponent(branchId)}`,
    { method: 'DELETE' },
  );
}
