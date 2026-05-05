import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAuthHeaders } from './authApi';

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

function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCouchHeaders() {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

const API_BASE = getApiBase();
export const STAFF_EXPENSES_DB_NAME = normalizeDbName(
  env.VITE_STAFF_EXPENSES_DB || `${env.VITE_COUCHDB_DB || 'vertial'}-staff-expenses`,
);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    details?: { reason?: string; error?: string };
  };
  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }
  if (!response.ok) {
    throw new Error(
      payload?.error ||
        (payload?.details as { reason?: string } | undefined)?.reason ||
        (payload?.details as { error?: string } | undefined)?.error ||
        'Error inesperado en gastos del personal API',
    );
  }
  return payload;
}

export type StaffExpenseCategory =
  | 'dietas'
  | 'transporte'
  | 'material'
  | 'formacion'
  | 'anticipo'
  | 'bonus'
  | 'otros';

export type StaffExpenseStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'pagado';

export interface StaffExpense {
  _id: string;
  _rev?: string;
  type: 'staff-expense';
  id: string;
  worker_id: string;
  worker_name: string;
  category: StaffExpenseCategory;
  status: StaffExpenseStatus;
  concept: string;
  amount: number;
  date: string;
  notes?: string;
  fileData?: string;
  mimeType?: string;
  fileName?: string;
  size?: number;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const STAFF_EXPENSE_CATEGORY_LABELS: Record<StaffExpenseCategory, string> = {
  dietas: 'Dietas',
  transporte: 'Transporte',
  material: 'Material',
  formacion: 'Formación',
  anticipo: 'Anticipo',
  bonus: 'Bonus / Extra',
  otros: 'Otros',
};

export const STAFF_EXPENSE_STATUS_LABELS: Record<StaffExpenseStatus, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  pagado: 'Pagado',
};

async function ensureDatabase() {
  await request(`/api/couch/db/${encodeURIComponent(STAFF_EXPENSES_DB_NAME)}`, { method: 'PUT' });
}

export async function listStaffExpensesRequest(workerId?: string): Promise<StaffExpense[]> {
  await ensureDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(STAFF_EXPENSES_DB_NAME)}`,
  );
  return (payload.docs || [])
    .filter((d): d is StaffExpense => {
      const doc = d as Partial<StaffExpense>;
      return doc.type === 'staff-expense' && (!workerId || doc.worker_id === workerId);
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createStaffExpenseRequest(
  data: Omit<StaffExpense, '_id' | '_rev' | 'type' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<StaffExpense> {
  await ensureDatabase();
  const id = `staff-expense-${uuidv4()}`;
  const now = new Date().toISOString();
  const document: StaffExpense = {
    _id: id,
    type: 'staff-expense',
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(STAFF_EXPENSES_DB_NAME)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(document) },
  );
  return { ...document, _rev: result.rev };
}

export async function updateStaffExpenseRequest(expense: StaffExpense): Promise<StaffExpense> {
  const now = new Date().toISOString();
  const updated = { ...expense, updatedAt: now };
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(STAFF_EXPENSES_DB_NAME)}/${encodeURIComponent(expense._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

export async function deleteStaffExpenseRequest(expense: StaffExpense): Promise<void> {
  if (!expense._rev) return;
  const rev = encodeURIComponent(expense._rev);
  const docId = encodeURIComponent(expense._id);
  await request(
    `/api/couch/doc/${encodeURIComponent(STAFF_EXPENSES_DB_NAME)}/${docId}?rev=${rev}`,
    { method: 'DELETE' },
  );
}
