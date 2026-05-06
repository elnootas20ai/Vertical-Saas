import { v4 as uuidv4 } from 'uuid';
import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

export type ClientInvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft' | 'partial';

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  notes: string;
}

export interface ClientInvoiceRecord {
  id: string;
  _rev?: string;
  type?: 'client_invoice';
  user_id?: string;

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

  vehicleName: string;
  vehiclePlate: string;
  date: string;
  dueDate: string;

  lines: InvoiceLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  amountBase: number;
  total: number;
  paid: number;

  status: ClientInvoiceStatus;
  paymentMethod: string;
  notes: string;

  sourceType: 'manual' | 'quote' | 'sale' | 'service' | null;
  sourceQuoteId: string | null;
  sourceSaleId: string | null;
  financeMovementId: string | null;

  sentAt: string | null;
  sentTo: string | null;

  payments: InvoicePayment[];

  createdAt: string;
  updatedAt?: string;
}

// ── Line calculations ─────────────────────────────────────────────────────────

export function calcInvoiceLine(
  description: string,
  quantity: number,
  unitPrice: number,
  discountPercent: number,
  taxRate: number,
): InvoiceLine {
  const discountFactor = 1 - discountPercent / 100;
  const lineTotal = Number((quantity * unitPrice * discountFactor).toFixed(2));
  return { id: uuidv4(), description, quantity, unitPrice, discountPercent, taxRate, lineTotal };
}

export function calcInvoiceTotals(lines: InvoiceLine[]): {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  amountBase: number;
  total: number;
} {
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;

  for (const line of lines) {
    const gross = line.quantity * line.unitPrice;
    const discount = gross * (line.discountPercent / 100);
    const net = gross - discount;
    subtotal += net;
    discountAmount += discount;
    taxAmount += net * (line.taxRate / 100);
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    amountBase: Number(subtotal.toFixed(2)),
    total: Number((subtotal + taxAmount).toFixed(2)),
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────


function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error inesperado en facturas de clientes');
  return payload;
}

function normalizeInvoiceRecord(value: unknown): ClientInvoiceRecord | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Record<string, unknown>;
  if (doc.type !== 'client_invoice') return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  return {
    _rev: doc._rev as string | undefined,
    type: 'client_invoice',
    user_id: doc.user_id ? String(doc.user_id) : '',
    id,
    clientId: String(doc.clientId || ''),
    clientName: String(doc.clientName || ''),
    clientNif: String(doc.clientNif || ''),
    clientAddress: String(doc.clientAddress || ''),
    clientCity: String(doc.clientCity || ''),
    clientPostalCode: String(doc.clientPostalCode || ''),
    clientEmail: String(doc.clientEmail || ''),

    issuerName: String(doc.issuerName || ''),
    issuerNif: String(doc.issuerNif || ''),
    issuerAddress: String(doc.issuerAddress || ''),
    issuerCity: String(doc.issuerCity || ''),
    issuerPostalCode: String(doc.issuerPostalCode || ''),
    issuerEmail: String(doc.issuerEmail || ''),
    issuerPhone: String(doc.issuerPhone || ''),

    number: String(doc.number || ''),
    series: String(doc.series || 'FAC'),
    sequenceNumber: Number(doc.sequenceNumber || 0),

    vehicleName: String(doc.vehicleName || ''),
    vehiclePlate: String(doc.vehiclePlate || ''),
    date: String(doc.date || new Date().toISOString()),
    dueDate: String(doc.dueDate || doc.date || new Date().toISOString()),

    lines: Array.isArray(doc.lines) ? (doc.lines as InvoiceLine[]) : [],
    subtotal: Number(doc.subtotal || 0),
    discountAmount: Number(doc.discountAmount || 0),
    taxAmount: Number(doc.taxAmount || 0),
    amountBase: Number(doc.amountBase || 0),
    total: Number(doc.total || 0),
    paid: Number(doc.paid || 0),

    status: (doc.status as ClientInvoiceStatus) || 'draft',
    paymentMethod: doc.paymentMethod ? String(doc.paymentMethod) : '',
    notes: doc.notes ? String(doc.notes) : '',

    sourceType: (doc.sourceType as ClientInvoiceRecord['sourceType']) || null,
    sourceQuoteId: doc.sourceQuoteId ? String(doc.sourceQuoteId) : null,
    sourceSaleId: doc.sourceSaleId ? String(doc.sourceSaleId) : null,
    financeMovementId: doc.financeMovementId ? String(doc.financeMovementId) : null,

    sentAt: doc.sentAt ? String(doc.sentAt) : null,
    sentTo: doc.sentTo ? String(doc.sentTo) : null,

    payments: Array.isArray(doc.payments) ? (doc.payments as InvoicePayment[]) : [],

    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function listClientInvoicesRequest(userId: string): Promise<ClientInvoiceRecord[]> {
  const payload = await request<{ ok: boolean; invoices: unknown[] }>(
    `/api/invoices/${encodeURIComponent(userId)}`,
  );
  return (payload.invoices || [])
    .map(normalizeInvoiceRecord)
    .filter((inv): inv is ClientInvoiceRecord => Boolean(inv))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function createClientInvoiceRequest(
  userId: string,
  invoice: Omit<ClientInvoiceRecord, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'user_id'>,
): Promise<ClientInvoiceRecord | null> {
  const now = new Date().toISOString();
  const nextInvoice = {
    ...invoice,
    id: `client-invoice-${uuidv4()}`,
    type: 'client_invoice' as const,
    user_id: userId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await request<{ ok: boolean; invoice: unknown }>(
    `/api/invoices/${encodeURIComponent(userId)}`,
    { method: 'POST', body: JSON.stringify({ invoice: nextInvoice }) },
  );
  return normalizeInvoiceRecord(result.invoice);
}

export async function updateClientInvoiceRequest(
  userId: string,
  invoice: ClientInvoiceRecord,
): Promise<ClientInvoiceRecord | null> {
  const result = await request<{ ok: boolean; invoice: unknown }>(
    `/api/invoices/${encodeURIComponent(userId)}/${encodeURIComponent(invoice.id)}`,
    { method: 'PUT', body: JSON.stringify({ invoice }) },
  );
  return normalizeInvoiceRecord(result.invoice);
}

export async function deleteClientInvoiceRequest(userId: string, invoiceId: string): Promise<void> {
  await request(
    `/api/invoices/${encodeURIComponent(userId)}/${encodeURIComponent(invoiceId)}`,
    { method: 'DELETE' },
  );
}

export async function getNextInvoiceNumber(userId: string, series = 'FAC'): Promise<{ number: string; sequenceNumber: number }> {
  const payload = await request<{ ok: boolean; number: string; sequenceNumber: number }>(
    `/api/invoices/${encodeURIComponent(userId)}/next-number?series=${encodeURIComponent(series)}`,
  );
  return { number: payload.number, sequenceNumber: payload.sequenceNumber };
}

export async function sendInvoiceByEmail(userId: string, invoiceId: string): Promise<{ sentAt: string; sentTo: string }> {
  const payload = await request<{ ok: boolean; sentAt: string; sentTo: string }>(
    `/api/invoices/${encodeURIComponent(userId)}/${encodeURIComponent(invoiceId)}/send`,
    { method: 'POST' },
  );
  return { sentAt: payload.sentAt, sentTo: payload.sentTo };
}

export async function registerInvoicePayment(
  userId: string,
  invoiceId: string,
  payment: Omit<InvoicePayment, 'id'>,
): Promise<ClientInvoiceRecord | null> {
  const result = await request<{ ok: boolean; invoice: unknown }>(
    `/api/invoices/${encodeURIComponent(userId)}/${encodeURIComponent(invoiceId)}/payment`,
    { method: 'POST', body: JSON.stringify({ payment }) },
  );
  return normalizeInvoiceRecord(result.invoice);
}
