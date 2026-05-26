import { v4 as uuidv4 } from 'uuid';
import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted';

export interface QuoteLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

export interface QuoteRecord {
  _id: string;
  _rev?: string;
  id: string;
  type: 'quote';
  user_id: string;
  number: string;
  status: QuoteStatus;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientDni?: string;
  vehicleId?: string;
  vehicleName?: string;
  vehiclePlate?: string;
  entityLabel?: string;
  entityPlateLabel?: string;
  lines: QuoteLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  validUntil: string;
  notes?: string;
  internalNotes?: string;
  reference?: string;
  quoteDate?: string;
  paymentMethod?: string;
  responsible?: string;
  companyName?: string;
  companyCif?: string;
  companyAddress?: string;
  approvalToken?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  convertedToSaleId?: string;
  convertedToInvoiceId?: string;
  sentAt?: string;
  salesPointId?: string;
  salesPointName?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateQuotePayload = Omit<
  QuoteRecord,
  '_id' | '_rev' | 'id' | 'type' | 'number' | 'createdAt' | 'updatedAt' | 'approvalToken'
>;

// ── Line calculations ─────────────────────────────────────────────────────────

export function calcQuoteLine(
  description: string,
  quantity: number,
  unitPrice: number,
  discountPercent: number,
  taxRate: number,
): QuoteLine {
  const discountFactor = 1 - discountPercent / 100;
  const lineTotal = quantity * unitPrice * discountFactor;
  return {
    id: uuidv4(),
    description,
    quantity,
    unitPrice,
    discountPercent,
    taxRate,
    lineTotal,
  };
}

export function calcQuoteTotals(lines: QuoteLine[]): {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
} {
  const grossSubtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discountAmount = grossSubtotal - subtotal;
  const taxAmount = lines.reduce((s, l) => s + l.lineTotal * (l.taxRate / 100), 0);
  const total = subtotal + taxAmount;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export function buildQuoteNumber(sequence: number, year?: number): string {
  const y = year ?? new Date().getFullYear();
  return `PRES-${y}-${String(sequence).padStart(4, '0')}`;
}

export function generateApprovalToken(): string {
  return uuidv4().replace(/-/g, '').slice(0, 24);
}

function normalizeQuote(value: unknown): QuoteRecord | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<QuoteRecord> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'quote') return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  const lines = Array.isArray(doc.lines)
    ? doc.lines.map((l: QuoteLine) => ({
        id: l.id || uuidv4(),
        description: String(l.description || ''),
        quantity: Number(l.quantity || 1),
        unitPrice: Number(l.unitPrice || 0),
        discountPercent: Number(l.discountPercent || 0),
        taxRate: Number(l.taxRate ?? 21),
        lineTotal: Number(l.lineTotal || 0),
      }))
    : [];

  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    id,
    type: 'quote',
    user_id: String(doc.user_id || ''),
    number: String(doc.number || ''),
    status: (doc.status as QuoteStatus) || 'draft',
    clientName: String(doc.clientName || ''),
    clientEmail: String(doc.clientEmail || ''),
    clientPhone: doc.clientPhone ? String(doc.clientPhone) : undefined,
    clientDni: doc.clientDni ? String(doc.clientDni) : undefined,
    clientId: doc.clientId ? String(doc.clientId) : undefined,
    vehicleId: doc.vehicleId ? String(doc.vehicleId) : undefined,
    vehicleName: doc.vehicleName ? String(doc.vehicleName) : undefined,
    vehiclePlate: doc.vehiclePlate ? String(doc.vehiclePlate) : undefined,
    lines,
    subtotal: Number(doc.subtotal || 0),
    discountAmount: Number(doc.discountAmount || 0),
    taxAmount: Number(doc.taxAmount || 0),
    total: Number(doc.total || 0),
    validUntil: String(doc.validUntil || new Date().toISOString()),
    notes: doc.notes ? String(doc.notes) : undefined,
    internalNotes: doc.internalNotes ? String(doc.internalNotes) : undefined,
    reference: doc.reference ? String(doc.reference) : undefined,
    quoteDate: doc.quoteDate ? String(doc.quoteDate) : undefined,
    paymentMethod: doc.paymentMethod ? String(doc.paymentMethod) : undefined,
    responsible: doc.responsible ? String(doc.responsible) : undefined,
    companyName: doc.companyName ? String(doc.companyName) : undefined,
    companyCif: doc.companyCif ? String(doc.companyCif) : undefined,
    companyAddress: doc.companyAddress ? String(doc.companyAddress) : undefined,
    approvalToken: doc.approvalToken ? String(doc.approvalToken) : undefined,
    approvedAt: doc.approvedAt ? String(doc.approvedAt) : undefined,
    approvedBy: doc.approvedBy ? String(doc.approvedBy) : undefined,
    rejectedAt: doc.rejectedAt ? String(doc.rejectedAt) : undefined,
    rejectionReason: doc.rejectionReason ? String(doc.rejectionReason) : undefined,
    convertedToSaleId: doc.convertedToSaleId ? String(doc.convertedToSaleId) : undefined,
    convertedToInvoiceId: doc.convertedToInvoiceId ? String(doc.convertedToInvoiceId) : undefined,
    sentAt: doc.sentAt ? String(doc.sentAt) : undefined,
    salesPointId: doc.salesPointId ? String(doc.salesPointId) : undefined,
    salesPointName: doc.salesPointName ? String(doc.salesPointName) : undefined,
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
  };
}

// ── CouchDB persistence ───────────────────────────────────────────────────────


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export const QUOTES_DB = (env.VITE_COUCHDB_DB || 'vertial') + '-quotes';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en presupuestos');
  return data;
}

async function ensureDb() {
  await ensureCouchDb(QUOTES_DB, () => req(`/api/couch/db/${encodeURIComponent(QUOTES_DB)}`, { method: 'PUT' }));
}

export async function listQuotes(userId: string): Promise<QuoteRecord[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(QUOTES_DB)}`);
  return ((payload.docs || []) as unknown[])
    .map(normalizeQuote)
    .filter((q): q is QuoteRecord => q !== null && q.user_id === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getQuote(quoteId: string): Promise<QuoteRecord | null> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(QUOTES_DB)}`);
  const found = (payload.docs as unknown[])
    .map(normalizeQuote)
    .find((q) => q !== null && (q.id === quoteId || q._id === quoteId));
  return found ?? null;
}

export async function createQuote(
  userId: string,
  payload: CreateQuotePayload,
  sequenceNumber: number,
): Promise<QuoteRecord> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = `quote-${uuidv4()}`;
  const quote: QuoteRecord = {
    ...payload,
    _id: id,
    id,
    type: 'quote',
    user_id: userId,
    number: buildQuoteNumber(sequenceNumber),
    approvalToken: generateApprovalToken(),
    createdAt: now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(QUOTES_DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(quote) },
  );
  return { ...quote, _rev: result.rev };
}

export async function updateQuote(quote: QuoteRecord): Promise<QuoteRecord> {
  await ensureDb();
  const updated = { ...quote, updatedAt: new Date().toISOString() };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(QUOTES_DB)}/${encodeURIComponent(quote._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  return { ...updated, _rev: result.rev };
}

export async function deleteQuote(quoteId: string): Promise<void> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(QUOTES_DB)}`);
  const doc = (payload.docs as QuoteRecord[]).find((d) => d._id === quoteId);
  if (!doc) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(QUOTES_DB)}/${encodeURIComponent(quoteId)}?rev=${doc._rev}`,
    { method: 'DELETE' },
  );
}

export async function sendQuote(quote: QuoteRecord): Promise<QuoteRecord> {
  return updateQuote({ ...quote, status: 'sent', sentAt: new Date().toISOString() });
}

export async function approveQuote(
  quote: QuoteRecord,
  approvedBy: string,
): Promise<QuoteRecord> {
  return updateQuote({
    ...quote,
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy,
  });
}

export async function rejectQuote(
  quote: QuoteRecord,
  reason?: string,
): Promise<QuoteRecord> {
  return updateQuote({
    ...quote,
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    rejectionReason: reason,
  });
}

export async function expireOverdueQuotes(userId: string): Promise<number> {
  const quotes = await listQuotes(userId);
  const now = new Date();
  let count = 0;
  for (const q of quotes) {
    if (q.status === 'sent' && new Date(q.validUntil) < now) {
      await updateQuote({ ...q, status: 'expired' });
      count++;
    }
  }
  return count;
}

// ── Conversion flow: Presupuesto → Reserva → Contrato → Factura ──────────────

export type ConversionTarget = 'reservation' | 'contract' | 'invoice' | 'sale';

export interface ConversionResult {
  quote: QuoteRecord;
  targetId: string;
  targetType: ConversionTarget;
}

/**
 * Mark a quote as converted and record the target document ID.
 * The actual creation of the target document (sale/contract/invoice) is handled
 * by the caller so that it can pass full domain-specific data.
 */
export async function convertQuote(
  quote: QuoteRecord,
  targetType: ConversionTarget,
  targetId: string,
): Promise<ConversionResult> {
  const updated = await updateQuote({
    ...quote,
    status: 'converted',
    ...(targetType === 'sale' ? { convertedToSaleId: targetId } : {}),
    ...(targetType === 'invoice' ? { convertedToInvoiceId: targetId } : {}),
  });
  return { quote: updated, targetId, targetType };
}

/**
 * Build a CreateSalePayload pre-filled from a quote.
 * Import SaleRecord types separately in the UI layer.
 */
export function buildSalePayloadFromQuote(quote: QuoteRecord): Record<string, unknown> {
  return {
    clientId: quote.clientId ?? '',
    clientName: quote.clientName,
    clientPhone: quote.clientPhone ?? '',
    clientEmail: quote.clientEmail,
    vehicleId: quote.vehicleId ?? '',
    vehicleName: quote.vehicleName ?? '',
    vehiclePlate: quote.vehiclePlate ?? '',
    totalPrice: quote.total,
    depositPaid: 0,
    stage: 'reserved',
    responsible: quote.responsible ?? '',
    notes: `Generado desde presupuesto ${quote.number}`,
    paymentMethod: quote.paymentMethod ?? '',
    sourceQuoteId: quote.id,
  };
}

/**
 * Build a client invoice payload pre-filled from a quote.
 */
export function buildInvoicePayloadFromQuote(quote: QuoteRecord, invoiceNumber: string) {
  const now = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);
  return {
    clientId: quote.clientId ?? '',
    clientName: quote.clientName,
    number: invoiceNumber,
    vehicleName: quote.vehicleName ?? quote.lines[0]?.description ?? '',
    vehiclePlate: quote.vehiclePlate ?? '',
    date: now,
    dueDate: due.toISOString().slice(0, 10),
    total: quote.total,
    paid: 0,
    status: 'pending' as const,
    paymentMethod: quote.paymentMethod ?? '',
    notes: `Generada desde presupuesto ${quote.number}`,
  };
}

/**
 * Build a contract payload pre-filled from a quote.
 */
export function buildContractPayloadFromQuote(quote: QuoteRecord): Record<string, unknown> {
  return {
    contractType: 'reserva',
    clientId: quote.clientId ?? '',
    clientName: quote.clientName,
    clientDni: quote.clientDni ?? '',
    clientPhone: quote.clientPhone ?? '',
    clientEmail: quote.clientEmail,
    vehicleId: quote.vehicleId ?? '',
    vehicleName: quote.vehicleName ?? '',
    vehiclePlate: quote.vehiclePlate ?? '',
    vehicleBrand: '',
    vehicleModel: '',
    vehicleYear: new Date().getFullYear(),
    price: quote.total,
    paymentMethod: quote.paymentMethod ?? 'Transferencia',
    notes: `Generado desde presupuesto ${quote.number}`,
    templateId: '',
    renderedHtml: '',
    status: 'draft',
    responsible: quote.responsible ?? '',
    companyName: quote.companyName ?? '',
    companyCif: quote.companyCif ?? '',
    companyAddress: quote.companyAddress ?? '',
  };
}
