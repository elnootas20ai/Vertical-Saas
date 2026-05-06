import {
  normalizeTaxObligation,
  type TaxObligation,
  type CreateTaxObligationPayload,
} from './taxCalendarTypes';
import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

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
  if (!response.ok) throw new Error(payload?.error || 'Error en calendario fiscal');
  return payload;
}

export async function listTaxObligations(userId: string, year?: number): Promise<TaxObligation[]> {
  const q = year ? `?year=${year}` : '';
  const payload = await request<{ ok: boolean; obligations: unknown[] }>(
    `/api/finance/${encodeURIComponent(userId)}/tax-obligations${q}`,
  );
  return (payload.obligations || [])
    .map(normalizeTaxObligation)
    .filter((o): o is TaxObligation => Boolean(o) && !o.deletedAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function saveTaxObligation(
  userId: string,
  data: CreateTaxObligationPayload | TaxObligation,
  existing?: TaxObligation,
): Promise<TaxObligation> {
  const isUpdate = existing?._id;
  const path = isUpdate
    ? `/api/finance/${encodeURIComponent(userId)}/tax-obligations/${encodeURIComponent(existing._id)}`
    : `/api/finance/${encodeURIComponent(userId)}/tax-obligations`;

  const result = await request<{ ok: boolean; obligation: unknown }>(path, {
    method: isUpdate ? 'PUT' : 'POST',
    body: JSON.stringify({ obligation: { ...data, user_id: userId } }),
  });

  const normalized = normalizeTaxObligation(result.obligation);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function deleteTaxObligation(userId: string, obligationId: string): Promise<void> {
  await request(
    `/api/finance/${encodeURIComponent(userId)}/tax-obligations/${encodeURIComponent(obligationId)}`,
    { method: 'DELETE' },
  );
}

export async function markFiled(
  userId: string,
  obligationId: string,
  filingDate: string,
  actualAmount?: number,
): Promise<TaxObligation> {
  const result = await request<{ ok: boolean; obligation: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/tax-obligations/${encodeURIComponent(obligationId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        obligation: { status: 'filed', filingDate, actualAmount },
      }),
    },
  );
  const normalized = normalizeTaxObligation(result.obligation);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function markPaid(userId: string, obligationId: string): Promise<TaxObligation> {
  const result = await request<{ ok: boolean; obligation: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/tax-obligations/${encodeURIComponent(obligationId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ obligation: { status: 'paid' } }),
    },
  );
  const normalized = normalizeTaxObligation(result.obligation);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function generateCalendarFromPresets(
  userId: string,
  year: number,
  isAutonomo = true,
): Promise<TaxObligation[]> {
  const result = await request<{ ok: boolean; obligations: unknown[] }>(
    `/api/finance/${encodeURIComponent(userId)}/tax-obligations/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ year, isAutonomo }),
    },
  );
  return (result.obligations || [])
    .map(normalizeTaxObligation)
    .filter((o): o is TaxObligation => Boolean(o));
}
