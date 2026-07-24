import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

export type VerifactuMode = 'verifactu' | 'no_verifactu';
export type VerifactuEnvironment = 'sandbox' | 'production';
export type VerifactuAeatStatus = 'pending_local' | 'queued' | 'sent' | 'accepted' | 'rejected';

export interface VerifactuSettings {
  id: string;
  _rev?: string;
  business_id: string;
  enabled: boolean;
  mode: VerifactuMode;
  environment: VerifactuEnvironment;
  series: string;
  nextNumber: number;
  issuerNif: string;
  issuerName: string;
  issuerAddress: string;
  issuerCity: string;
  issuerPostalCode: string;
  lastHuella: string | null;
  lastRecordId: string | null;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VerifactuLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
}

export interface VerifactuRecord {
  id: string;
  business_id: string;
  mode: VerifactuMode;
  status: string;
  aeatStatus: VerifactuAeatStatus;
  series: string;
  number: string;
  fullNumber: string;
  issueDate: string;
  issuer: {
    nif: string;
    name: string;
    address?: string;
    city?: string;
    postalCode?: string;
  };
  recipient: {
    nif: string | null;
    name: string;
    address?: string;
    city?: string;
    postalCode?: string;
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRate: number;
    lineBase: number;
    lineTax: number;
    lineTotal: number;
  }>;
  base: number;
  tax: number;
  total: number;
  huella: string;
  huellaAnterior: string | null;
  qrUrl: string;
  rectifiesId: string | null;
  notes: string;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error Verifactu');
  return payload;
}

export async function getVerifactuSettings(businessId: string): Promise<VerifactuSettings> {
  const data = await request<{ settings: VerifactuSettings }>(
    `/api/verifactu/${encodeURIComponent(businessId)}/settings`,
  );
  return data.settings;
}

export async function saveVerifactuSettings(
  businessId: string,
  settings: Partial<VerifactuSettings>,
): Promise<VerifactuSettings> {
  const data = await request<{ settings: VerifactuSettings }>(
    `/api/verifactu/${encodeURIComponent(businessId)}/settings`,
    { method: 'PUT', body: JSON.stringify({ settings }) },
  );
  return data.settings;
}

export async function listVerifactuRecords(
  businessId: string,
  opts?: { year?: number },
): Promise<VerifactuRecord[]> {
  const q = opts?.year ? `?year=${opts.year}` : '';
  const data = await request<{ records: VerifactuRecord[] }>(
    `/api/verifactu/${encodeURIComponent(businessId)}/records${q}`,
  );
  return data.records || [];
}

export async function issueVerifactuRecord(
  businessId: string,
  payload: {
    issueDate?: string;
    series?: string;
    recipientNif?: string;
    recipientName: string;
    recipientAddress?: string;
    recipientCity?: string;
    recipientPostalCode?: string;
    lines: VerifactuLineInput[];
    notes?: string;
  },
): Promise<{ record: VerifactuRecord; settings: VerifactuSettings }> {
  return request(`/api/verifactu/${encodeURIComponent(businessId)}/records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
