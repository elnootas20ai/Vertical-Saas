import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import type { FiscalFormInput, FiscalResult } from './compraventaFiscalCalculator';

const BASE = `${getApiBase()}/api/fiscal-consultations`;

export type FiscalConsultationRecord = {
  id: string;
  _rev?: string;
  businessId?: string;
  vehicleId?: string;
  acquisitionId?: string;
  form: FiscalFormInput;
  result: FiscalResult;
  summary: {
    vehicleLabel: string;
    origin: string;
    seller: string;
    regimeLabel: string;
    invoiceTotal: number | null;
    vat303: number | null;
    rebuEligible: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Error de red');
  return json as T;
}

export async function listFiscalConsultationsRequest(
  userId: string,
  businessId?: string | null,
): Promise<FiscalConsultationRecord[]> {
  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
  const json = await request<{ ok: true; items: FiscalConsultationRecord[] }>(`${BASE}/${userId}${qs}`);
  return json.items || [];
}

export async function createFiscalConsultationRequest(
  userId: string,
  payload: {
    businessId?: string | null;
    vehicleId?: string;
    acquisitionId?: string;
    form: FiscalFormInput;
    result: FiscalResult;
    summary: FiscalConsultationRecord['summary'];
  },
): Promise<FiscalConsultationRecord> {
  const json = await request<{ ok: true; item: FiscalConsultationRecord }>(`${BASE}/${userId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return json.item;
}

export async function deleteFiscalConsultationRequest(userId: string, id: string): Promise<void> {
  await request(`${BASE}/${userId}/${id}`, { method: 'DELETE' });
}
