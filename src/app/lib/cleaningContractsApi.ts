import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
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
    throw new Error(payload?.error || 'Error inesperado en cleaning contracts API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContractStatus = 'active' | 'paused' | 'cancelled' | 'expired';
export type ContractBillingFrequency = 'weekly' | 'monthly';
export type ServiceFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface ContractService {
  id: string;
  serviceTemplateId: string;
  description: string;
  cleaningType: string;
  frequency: ServiceFrequency;
  daysOfWeek: number[];
  unitPrice: number;
  quantity: number;
}

export interface PriceRevision {
  date: string;
  previousTotal: number;
  newTotal: number;
  reason: string;
  appliedBy: string;
}

export interface CleaningContract {
  _id: string;
  _rev?: string;
  type: 'cleaning_contract';
  id: string;
  user_id: string;
  contractNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientNif: string;
  clientAddress: string;
  services: ContractService[];
  billingFrequency: ContractBillingFrequency;
  billingDay: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  totalMonthly: number;
  taxRate: number;
  paymentMethod: string;
  autoSendInvoice: boolean;
  notes: string;
  status: ContractStatus;
  priceRevisions: PriceRevision[];
  lastInvoiceDate: string;
  nextInvoiceDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function listCleaningContracts(userId: string): Promise<CleaningContract[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; contracts: CleaningContract[] }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}`,
  );
  return payload.contracts || [];
}

export async function createCleaningContract(
  userId: string,
  data: Partial<CleaningContract>,
): Promise<CleaningContract> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; contract: CleaningContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ contract: data }) },
  );
  if (!result.contract) throw new Error('Respuesta inválida del servidor');
  return result.contract;
}

export async function updateCleaningContract(
  userId: string,
  contract: CleaningContract,
): Promise<CleaningContract> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; contract: CleaningContract }>(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contract._id)}`,
    { method: 'PUT', body: JSON.stringify({ contract }) },
  );
  if (!result.contract) throw new Error('Respuesta inválida del servidor');
  return result.contract;
}

export async function deleteCleaningContract(
  userId: string,
  contractId: string,
): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/cleaning/contracts/${encodeURIComponent(id)}/${encodeURIComponent(contractId)}`,
    { method: 'DELETE' },
  );
}
