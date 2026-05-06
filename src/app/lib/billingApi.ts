import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

export type BillingInvoiceStatus = 'paid' | 'pending';

export interface BillingInvoice {
  _id: string;
  _rev?: string;
  type: 'invoice';
  id: string;
  user_id: string;
  number: string;
  description: string;
  date: string;
  dueDate: string;
  amount: number;
  status: BillingInvoiceStatus;
  planId?: string;
  planName?: string;
  paidAt?: string;
  paymentMethod?: string;
  cardLastFourDigits?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateBillingInvoicePayload {
  userId: string;
  number: string;
  description: string;
  date: string;
  dueDate: string;
  amount: number;
  status: BillingInvoiceStatus;
  planId?: string;
  planName?: string;
  paidAt?: string;
  paymentMethod?: string;
  cardLastFourDigits?: string;
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

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    details?: { reason?: string; error?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.details?.reason ||
        payload?.details?.error ||
        'Error inesperado en facturacion',
    );
  }

  return payload;
}

function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeInvoice(value: unknown): BillingInvoice | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const doc = value as Partial<BillingInvoice> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'invoice') {
    return null;
  }

  const id = String(doc.id || doc._id || '');
  if (!id) {
    return null;
  }

  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    type: 'invoice',
    id,
    user_id: String(doc.user_id || ''),
    number: String(doc.number || ''),
    description: String(doc.description || ''),
    date: String(doc.date || new Date().toISOString()),
    dueDate: String(doc.dueDate || doc.date || new Date().toISOString()),
    amount: Number(doc.amount || 0),
    status: doc.status === 'paid' ? 'paid' : 'pending',
    planId: doc.planId ? String(doc.planId) : '',
    planName: doc.planName ? String(doc.planName) : '',
    paidAt: doc.paidAt ? String(doc.paidAt) : '',
    paymentMethod: doc.paymentMethod ? String(doc.paymentMethod) : '',
    cardLastFourDigits: doc.cardLastFourDigits ? String(doc.cardLastFourDigits) : '',
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
  };
}

function buildBillingInvoice(payload: CreateBillingInvoicePayload): BillingInvoice {
  const now = new Date().toISOString();
  const id = `invoice:${uuidv4()}`;

  return {
    _id: id,
    type: 'invoice',
    id,
    user_id: payload.userId,
    number: payload.number,
    description: payload.description.trim(),
    date: payload.date,
    dueDate: payload.dueDate,
    amount: Number(payload.amount),
    status: payload.status,
    planId: payload.planId || '',
    planName: payload.planName || '',
    paidAt: payload.paidAt || '',
    paymentMethod: payload.paymentMethod || '',
    cardLastFourDigits: payload.cardLastFourDigits || '',
    createdAt: now,
    updatedAt: now,
  };
}

export const INVOICES_DB_NAME = normalizeDbName(env.VITE_INVOICES_DB || 'invoice');

export async function ensureInvoicesDatabase() {
  await request(`/api/couch/db/${encodeURIComponent(INVOICES_DB_NAME)}`, {
    method: 'PUT',
  });
}

export async function listBillingInvoices(userId: string) {
  await ensureInvoicesDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(INVOICES_DB_NAME)}`,
  );

  return (payload.docs || [])
    .map(normalizeInvoice)
    .filter((invoice): invoice is BillingInvoice => Boolean(invoice) && invoice.user_id === userId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function createBillingInvoice(payload: CreateBillingInvoicePayload) {
  await ensureInvoicesDatabase();
  const document = buildBillingInvoice(payload);
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(INVOICES_DB_NAME)}/${encodeURIComponent(document._id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(document),
    },
  );

  return { ...document, _rev: result.rev };
}

export function buildInvoiceNumber(date = new Date()) {
  const year = date.getFullYear();
  const token = `${date.getMonth() + 1}`.padStart(2, '0') + `${date.getDate()}`.padStart(2, '0');
  return `INV-${year}-${token}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

export function downloadInvoicePdf(invoice: BillingInvoice, companyName?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 20;
  const contentW = pageW - margin * 2;

  const issueDate = new Date(invoice.date).toLocaleDateString('es-ES');
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('es-ES');
  const paidAt = invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString('es-ES') : null;
  const isPaid = invoice.status === 'paid';

  // ─── Cabecera negra ──────────────────────────────────────────────
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageW, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Vertial', margin, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Plataforma de gestión empresarial', margin, 26);
  doc.text('noreply@vertialapp.com', margin, 33);

  // Número de factura (derecha)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.number, pageW - margin, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('FACTURA', pageW - margin, 26, { align: 'right' });

  // Badge estado
  const badgeColor: [number, number, number] = isPaid ? [16, 185, 129] : [245, 158, 11];
  doc.setFillColor(...badgeColor);
  doc.roundedRect(pageW - margin - 28, 29, 28, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(isPaid ? 'PAGADA' : 'PENDIENTE', pageW - margin - 14, 34.5, { align: 'center' });

  // ─── Bloque de fechas ────────────────────────────────────────────
  let y = 55;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const colW = contentW / 3;
  const cols = [
    { label: 'FECHA DE EMISIÓN', value: issueDate },
    { label: 'FECHA DE VENCIMIENTO', value: dueDate },
    ...(paidAt ? [{ label: 'FECHA DE PAGO', value: paidAt }] : []),
  ];
  cols.forEach((col, i) => {
    const x = margin + colW * i;
    doc.text(col.label, x, y);
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text(col.value, x, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
  });

  // ─── Línea divisoria ─────────────────────────────────────────────
  y = 72;
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, y, pageW - margin, y);

  // ─── Empresa emisora ─────────────────────────────────────────────
  y = 82;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('EMITIDO POR', margin, y);
  y += 6;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  doc.text(companyName || 'Vertial', margin, y);
  doc.setFont('helvetica', 'normal');

  // ─── Tabla de conceptos ──────────────────────────────────────────
  y = 106;
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, y - 5, contentW, 10, 'F');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'bold');
  doc.text('CONCEPTO', margin + 2, y + 1);
  doc.text('IMPORTE', pageW - margin - 2, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  y += 14;
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const descLines = doc.splitTextToSize(invoice.description, contentW - 50);
  doc.text(descLines, margin + 2, y);

  const amountStr = `${invoice.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} EUR`;
  doc.setFont('helvetica', 'bold');
  doc.text(amountStr, pageW - margin - 2, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  y += descLines.length * 6 + 4;

  // Metadatos adicionales (plan, tarjeta)
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  if (invoice.planName) {
    doc.text(`Plan: ${invoice.planName}`, margin + 2, y);
    y += 5;
  }
  if (invoice.paymentMethod && invoice.cardLastFourDigits) {
    doc.text(`Método de pago: ${invoice.paymentMethod} · **** ${invoice.cardLastFourDigits}`, margin + 2, y);
    y += 5;
  } else if (invoice.paymentMethod) {
    doc.text(`Método de pago: ${invoice.paymentMethod}`, margin + 2, y);
    y += 5;
  }

  // ─── Línea + total ────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFillColor(0, 0, 0);
  doc.rect(pageW - margin - 60, y - 6, 60, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', pageW - margin - 4, y + 1, { align: 'right' });
  doc.setFontSize(12);
  doc.text(amountStr, pageW - margin - 4, y + 7, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // ─── Pie de página ────────────────────────────────────────────────
  const footerY = 282;
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4);
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text('Vertial · Plataforma de gestión · noreply@vertialapp.com', margin, footerY);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')}`, pageW - margin, footerY, { align: 'right' });

  doc.save(`${invoice.number}.pdf`);
}
