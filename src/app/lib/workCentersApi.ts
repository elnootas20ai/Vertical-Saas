import { v4 as uuidv4 } from 'uuid';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkCenterType = 'oficina' | 'punto_de_venta' | 'almacen' | 'custom';
export type OwnershipType = 'propiedad' | 'alquiler';

export const WORK_CENTER_TYPE_LABELS: Record<WorkCenterType, string> = {
  oficina: 'Centro de trabajo (Oficinas)',
  punto_de_venta: 'Punto de venta (Establecimientos)',
  almacen: 'Almacén',
  custom: 'Personalizado',
};

export const WORK_CENTER_TYPE_SHORT: Record<WorkCenterType, string> = {
  oficina: 'Oficinas',
  punto_de_venta: 'Establecimientos',
  almacen: 'Almacén',
  custom: 'Personalizado',
};

export const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  propiedad: 'Propiedad',
  alquiler: 'Alquiler',
};

export interface ContractInfo {
  startDate?: string;
  endDate?: string;
  monthlyPrice?: number;
  deposit?: number;
  landlord?: string;
  landlordPhone?: string;
  landlordEmail?: string;
  contractNotes?: string;
}

export interface WorkCenter {
  _id: string;
  _rev?: string;
  type: 'sales_point';
  id: string;
  user_id: string;
  businessId?: string;
  name: string;
  centerType: WorkCenterType;
  customTypeName?: string;
  ownership: OwnershipType;
  contract?: ContractInfo;
  purchasePrice?: number;
  purchaseDate?: string;
  cadastralReference?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  phone?: string;
  email?: string;
  expectedStaffCount?: number;
  squareMeters?: number;
  notes?: string;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateWorkCenterPayload = Omit<WorkCenter, '_id' | '_rev' | 'id' | 'type' | 'createdAt' | 'updatedAt'>;

// ── Helpers ───────────────────────────────────────────────────────────────────


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

export const WORK_CENTERS_DB = (env.VITE_COUCHDB_DB || 'vertial') + '-sales-points';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en centros de trabajo');
  return data;
}

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(WORK_CENTERS_DB)}`, { method: 'PUT' });
}

function normalizeWorkCenter(value: unknown): WorkCenter | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<WorkCenter> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'sales_point') return null;
  if ((doc as { deletedAt?: string | null }).deletedAt) return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  const contract = doc.contract && typeof doc.contract === 'object' ? {
    startDate: doc.contract.startDate || undefined,
    endDate: doc.contract.endDate || undefined,
    monthlyPrice: doc.contract.monthlyPrice != null ? Number(doc.contract.monthlyPrice) : undefined,
    deposit: doc.contract.deposit != null ? Number(doc.contract.deposit) : undefined,
    landlord: doc.contract.landlord || undefined,
    landlordPhone: doc.contract.landlordPhone || undefined,
    landlordEmail: doc.contract.landlordEmail || undefined,
    contractNotes: doc.contract.contractNotes || undefined,
  } : undefined;

  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    id,
    type: 'sales_point',
    user_id: String(doc.user_id || ''),
    businessId: (doc as Record<string, unknown>).businessId ? String((doc as Record<string, unknown>).businessId) : undefined,
    name: String(doc.name || ''),
    centerType: (['oficina', 'punto_de_venta', 'almacen', 'custom'].includes(doc.centerType as string)
      ? doc.centerType!
      : 'punto_de_venta'),
    customTypeName: doc.customTypeName ? String(doc.customTypeName) : undefined,
    ownership: doc.ownership === 'propiedad' ? 'propiedad' : doc.ownership === 'alquiler' ? 'alquiler' : 'propiedad',
    contract,
    purchasePrice: doc.purchasePrice != null ? Number(doc.purchasePrice) : undefined,
    purchaseDate: doc.purchaseDate ? String(doc.purchaseDate) : undefined,
    cadastralReference: doc.cadastralReference ? String(doc.cadastralReference) : undefined,
    address: doc.address ? String(doc.address) : undefined,
    city: doc.city ? String(doc.city) : undefined,
    postalCode: doc.postalCode ? String(doc.postalCode) : undefined,
    province: doc.province ? String(doc.province) : undefined,
    phone: doc.phone ? String(doc.phone) : undefined,
    email: doc.email ? String(doc.email) : undefined,
    expectedStaffCount: doc.expectedStaffCount != null ? Math.max(1, Math.floor(Number(doc.expectedStaffCount))) : 3,
    squareMeters: doc.squareMeters != null ? Number(doc.squareMeters) : undefined,
    notes: doc.notes ? String(doc.notes) : undefined,
    active: doc.active !== false,
    deletedAt: (doc as { deletedAt?: string | null }).deletedAt || null,
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listWorkCenters(userId: string): Promise<WorkCenter[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(WORK_CENTERS_DB)}`);
  return ((payload.docs || []) as unknown[])
    .map(normalizeWorkCenter)
    .filter((wc): wc is WorkCenter => wc !== null && wc.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function createWorkCenter(
  userId: string,
  payload: Omit<CreateWorkCenterPayload, 'user_id'>,
): Promise<WorkCenter> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = `wc-${uuidv4()}`;
  const wc: WorkCenter = {
    ...payload,
    _id: id,
    id,
    type: 'sales_point',
    user_id: userId,
    businessId: payload.businessId || undefined,
    active: payload.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(wc) },
  );
  return { ...wc, _rev: result.rev };
}

export async function updateWorkCenter(wc: WorkCenter): Promise<WorkCenter> {
  await ensureDb();
  const updated = { ...wc, updatedAt: new Date().toISOString() };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(wc._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

export async function deleteWorkCenter(wcId: string): Promise<void> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(WORK_CENTERS_DB)}`);
  const doc = (payload.docs as Array<WorkCenter & { _id?: string; _rev?: string; deletedAt?: string | null }>).find((d) => d._id === wcId);
  if (!doc) return;
  if (doc._rev) {
    try {
      await req(
        `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(wcId)}?rev=${doc._rev}`,
        { method: 'DELETE' },
      );
      return;
    } catch {
      // fallback to soft-delete when rev mismatches
    }
  }
  await req(
    `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(wcId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        ...doc,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        active: false,
      }),
    },
  );
}

// ── Re-exports for backward compatibility ─────────────────────────────────────

export type SalesPoint = WorkCenter;
export const listSalesPoints = listWorkCenters;
export const createSalesPoint = createWorkCenter;
export const updateSalesPoint = updateWorkCenter;
export const deleteSalesPoint = deleteWorkCenter;
export const SALES_POINTS_DB = WORK_CENTERS_DB;
