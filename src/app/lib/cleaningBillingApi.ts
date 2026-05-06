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
    throw new Error(payload?.error || 'Error inesperado en cleaning billing API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingRecurrence = 'weekly' | 'monthly' | 'one_time';
export type InvoiceOrigin = 'manual' | 'auto_service' | 'auto_contract';
export type CleaningBillingStatus = 'unbilled' | 'billed' | 'paid';
export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'partial';

export interface CleaningInvoiceLine {
  id: string;
  description: string;
  serviceId?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate: number;
  lineTotal: number;
}

export interface CleaningInvoice {
  id: string;
  _rev?: string;
  type: 'client_invoice';
  user_id: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  clientCity: string;
  clientPostalCode: string;
  clientEmail: string;
  issuerName: string;
  issuerNif: string;
  issuerAddress: string;
  issuerCity: string;
  issuerPostalCode: string;
  issuerEmail: string;
  issuerPhone: string;
  number: string;
  series: string;
  sequenceNumber: number;
  date: string;
  dueDate: string;
  lines: CleaningInvoiceLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  amountBase: number;
  total: number;
  paid: number;
  status: InvoiceStatus;
  paymentMethod: string;
  notes: string;
  serviceIds: string[];
  contractId: string;
  recurrence: BillingRecurrence;
  periodStart: string;
  periodEnd: string;
  pdfUrl: string;
  sentAt: string | null;
  sentTo: string | null;
  paidAt: string;
  linkedFinanceId: string;
  origin: InvoiceOrigin;
  vertical: string;
  payments: Array<{ date: string; amount: number; method: string; note?: string }>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BillingCycleResult {
  invoicesFromServices: CleaningInvoice[];
  invoicesFromContracts: CleaningInvoice[];
  financeEntries: number;
  overdueMarked: number;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function listCleaningInvoices(userId: string): Promise<CleaningInvoice[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; invoices: CleaningInvoice[] }>(
    `/api/invoices/${encodeURIComponent(id)}`,
  );
  return (payload.invoices || []).filter(
    (inv) => inv.vertical === 'cleaning' || inv.serviceIds?.length > 0 || inv.contractId,
  );
}

export async function createCleaningInvoice(
  userId: string,
  data: Partial<CleaningInvoice>,
): Promise<CleaningInvoice> {
  const id = normalizeUserId(userId);
  const invoice = { ...data, vertical: 'cleaning' };
  const result = await request<{ ok: boolean; invoice: CleaningInvoice }>(
    `/api/invoices/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ invoice }) },
  );
  if (!result.invoice) throw new Error('Respuesta inválida del servidor');
  return result.invoice;
}

export async function updateCleaningInvoice(
  userId: string,
  invoice: CleaningInvoice,
): Promise<CleaningInvoice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoice: CleaningInvoice }>(
    `/api/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoice.id)}`,
    { method: 'PUT', body: JSON.stringify({ invoice }) },
  );
  if (!result.invoice) throw new Error('Respuesta inválida del servidor');
  return result.invoice;
}

export async function deleteCleaningInvoice(userId: string, invoiceId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoiceId)}`,
    { method: 'DELETE' },
  );
}

export async function generateBillingCycle(userId: string): Promise<BillingCycleResult> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean } & BillingCycleResult>(
    `/api/cleaning/billing/${encodeURIComponent(id)}/generate`,
    { method: 'POST' },
  );
  return {
    invoicesFromServices: result.invoicesFromServices || [],
    invoicesFromContracts: result.invoicesFromContracts || [],
    financeEntries: result.financeEntries || 0,
    overdueMarked: result.overdueMarked || 0,
  };
}

export async function generateFromServices(userId: string): Promise<CleaningInvoice[]> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoices: CleaningInvoice[] }>(
    `/api/cleaning/billing/${encodeURIComponent(id)}/generate-services`,
    { method: 'POST' },
  );
  return result.invoices || [];
}

export async function generateFromContracts(userId: string): Promise<CleaningInvoice[]> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoices: CleaningInvoice[] }>(
    `/api/cleaning/billing/${encodeURIComponent(id)}/generate-contracts`,
    { method: 'POST' },
  );
  return result.invoices || [];
}

export async function markOverdueInvoices(userId: string): Promise<CleaningInvoice[]> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoices: CleaningInvoice[] }>(
    `/api/cleaning/billing/${encodeURIComponent(id)}/mark-overdue`,
    { method: 'POST' },
  );
  return result.invoices || [];
}

export async function sendInvoiceEmail(
  userId: string,
  invoiceId: string,
): Promise<{ sentTo: string }> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; sentTo: string }>(
    `/api/email/send-invoice`,
    { method: 'POST', body: JSON.stringify({ userId: id, invoiceId }) },
  );
  return { sentTo: result.sentTo || '' };
}
