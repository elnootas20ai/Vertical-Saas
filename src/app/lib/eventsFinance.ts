import {
  calcInvoiceLine,
  calcInvoiceTotals,
  createClientInvoiceRequest,
  getNextInvoiceNumber,
  linkClientInvoiceToFinanceRequest,
  registerInvoicePayment,
  sendInvoiceByEmail,
  type ClientInvoiceRecord,
} from './clientInvoicesApi';
import { generateInvoicePdf, type InvoiceData } from './invoicePdfGenerator';
import { createVerticalApi } from './verticalApiFactory';
import { updateEventRecord, parseQuoteLines, loadEventQuotes } from './eventsFlow';
import type { EventRecord, QuoteLine } from './eventsTypes';

export type EventFinancialSummary = {
  presupuesto: number;
  depositoAcordado: number;
  depositoCobrado: number;
  facturaFinalTotal: number;
  cobradoFinal: number;
  cobradoTotal: number;
  pendiente: number;
  depositoCompleto: boolean;
  facturaFinalCreada: boolean;
  cierreEconomicoOk: boolean;
};

export function summarizeEventFinancials(event: EventRecord): EventFinancialSummary {
  const presupuesto = Number(event.presupuesto) || 0;
  const depositoAcordado = Number(event.deposito) || 0;
  const depositoCobrado = Number(event.depositPaidAmount) || 0;
  const cobradoFinal = Number(event.finalPaidAmount) || 0;
  const cobradoTotal = depositoCobrado + cobradoFinal;
  const facturaFinalTotal = Math.max(0, presupuesto - depositoCobrado);
  const pendiente = Math.max(0, presupuesto - cobradoTotal);

  return {
    presupuesto,
    depositoAcordado,
    depositoCobrado,
    facturaFinalTotal,
    cobradoFinal,
    cobradoTotal,
    pendiente,
    depositoCompleto: depositoAcordado <= 0 || depositoCobrado >= depositoAcordado,
    facturaFinalCreada: Boolean(event.finalInvoiceId),
    cierreEconomicoOk: pendiente <= 0.01 && event.estado === 'finalizado',
  };
}

async function stampFullyPaidIfCrossed(
  userId: string,
  before: EventRecord,
  after: EventRecord,
): Promise<EventRecord> {
  const prev = summarizeEventFinancials(before);
  const next = summarizeEventFinancials(after);
  if (!(prev.pendiente > 0.01 && next.pendiente <= 0.01)) return after;
  if (next.presupuesto <= 0) return after;
  if (after.fullyPaidAt) return after;
  return updateEventRecord(userId, after, { fullyPaidAt: new Date().toISOString() });
}

type BusinessIssuer = {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
};

function quoteLinesToInvoiceLines(lines: QuoteLine[]) {
  return lines
    .filter((l) => l.concepto.trim())
    .map((l) => calcInvoiceLine(l.concepto, l.cantidad, l.precioUnitario, 0, 21));
}

function buildEventQuotePdfData(event: EventRecord, business?: BusinessIssuer | null): InvoiceData {
  const lines = parseQuoteLines(event.lineasPresupuesto);
  const today = new Date().toISOString().slice(0, 10);
  return {
    number: `PRES-${event._id.slice(-6).toUpperCase()}`,
    date: today,
    dueDate: event.fecha || today,
    issuer: {
      companyName: business?.name || 'Empresa',
      nif: business?.taxId,
      address: business?.address,
      phone: business?.phone,
      email: business?.email,
    },
    recipient: {
      name: event.cliente,
    },
    lines: lines.map((l) => ({
      description: l.concepto,
      quantity: l.cantidad,
      unitPrice: l.precioUnitario,
      taxRate: 21,
    })),
    notes: event.notas || `Presupuesto evento: ${event.nombre}`,
  };
}

export function downloadEventQuotePdf(event: EventRecord, business?: BusinessIssuer | null): void {
  generateInvoicePdf(buildEventQuotePdfData(event, business));
}

export async function sendEventQuoteByEmailRequest(
  userId: string,
  eventId: string,
  business?: BusinessIssuer | null,
  options?: { clientEmail?: string },
): Promise<{ event: EventRecord; sentTo?: string; acceptUrl?: string; rejectUrl?: string }> {
  const { authFetch, getAuthHeaders } = await import('./authApi');
  const { getApiBase } = await import('./apiBase');
  const res = await authFetch(
    `${getApiBase()}/api/events-quotes/${encodeURIComponent(userId)}/${encodeURIComponent(eventId)}/send`,
    {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientEmail: options?.clientEmail || undefined,
        issuer: {
          name: business?.name || '',
          taxId: business?.taxId || '',
          address: business?.address || '',
          phone: business?.phone || '',
          email: business?.email || '',
          logo: business?.logo || '',
        },
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'No se pudo enviar el presupuesto por email');
  }
  const ev = data.event as EventRecord;
  return {
    event: {
      ...ev,
      estado: normalizeEventStageSafe(ev?.estado) || 'enviado',
    },
    sentTo: data.sentTo,
    acceptUrl: data.acceptUrl,
    rejectUrl: data.rejectUrl,
  };
}

function normalizeEventStageSafe(value: unknown): EventRecord['estado'] | null {
  const raw = String(value || '').trim();
  const allowed: EventRecord['estado'][] = [
    'presupuesto', 'enviado', 'aceptado', 'contratado',
    'planificacion', 'en_curso', 'finalizado', 'cancelado',
  ];
  return allowed.includes(raw as EventRecord['estado']) ? (raw as EventRecord['estado']) : null;
}

/** @deprecated Prefer sendEventQuoteByEmailRequest — solo descarga PDF local. */
export async function markEventQuoteSent(
  userId: string,
  event: EventRecord,
  business?: BusinessIssuer | null,
): Promise<EventRecord> {
  downloadEventQuotePdf(event, business);
  const quotes = await loadEventQuotes(userId, event._id);
  const sent = quotes.find((q) => q.estado === 'enviado' || q.estado === 'aceptado');
  if (sent) {
    const quotesApi = createVerticalApi('events', 'quotes');
    await quotesApi.update(userId, sent._id, { ...sent, estado: 'enviado' });
  }
  return updateEventRecord(userId, event, {
    quotePdfSentAt: new Date().toISOString(),
  });
}

export async function registerEventDepositPayment(
  userId: string,
  event: EventRecord,
  amount: number,
  method: string,
  business?: BusinessIssuer | null,
): Promise<{ event: EventRecord; invoice: ClientInvoiceRecord | null }> {
  const depositAmount = Number(amount) || Number(event.deposito) || 0;
  if (depositAmount <= 0) {
    throw new Error('Indica un importe de señal mayor que 0');
  }

  const { number, sequenceNumber } = await getNextInvoiceNumber(userId, 'EVT');
  const line = calcInvoiceLine(`Señal — ${event.nombre}`, 1, depositAmount, 0, 21);
  const totals = calcInvoiceTotals([line]);
  const today = new Date().toISOString().slice(0, 10);

  const invoice = await createClientInvoiceRequest(userId, {
    clientId: event.clientId || '',
    clientName: event.cliente,
    clientNif: '',
    clientAddress: '',
    clientCity: '',
    clientPostalCode: '',
    clientEmail: event.clientEmail || '',
    issuerName: business?.name || '',
    issuerNif: business?.taxId || '',
    issuerAddress: business?.address || '',
    issuerCity: '',
    issuerPostalCode: '',
    issuerEmail: business?.email || '',
    issuerPhone: business?.phone || '',
    number,
    series: 'EVT',
    sequenceNumber,
    vehicleName: event.nombre,
    vehiclePlate: '',
    date: today,
    dueDate: today,
    lines: [line],
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxAmount: totals.taxAmount,
    amountBase: totals.subtotal,
    total: totals.total,
    paid: depositAmount,
    status: 'paid',
    paymentMethod: method,
    notes: `Señal del evento ${event.nombre}`,
    sourceType: 'service',
    sourceQuoteId: event._id,
    sourceSaleId: null,
    financeMovementId: null,
    sentAt: null,
    sentTo: null,
    payments: [{
      id: `pay-${Date.now()}`,
      amount: depositAmount,
      date: today,
      method,
      notes: 'Señal evento',
    }],
  });

  if (invoice?.id) {
    await linkClientInvoiceToFinanceRequest(userId, invoice.id).catch(() => null);
  }

  const updated = await updateEventRecord(userId, event, {
    depositPaidAt: new Date().toISOString(),
    depositPaidAmount: depositAmount,
    depositInvoiceId: invoice?.id || '',
  });

  const stamped = await stampFullyPaidIfCrossed(userId, event, updated);
  const { maybeNotifyEventFullyPaid } = await import('./eventsNotifications');
  void maybeNotifyEventFullyPaid(userId, event, stamped);

  return { event: stamped, invoice };
}

export async function createEventFinalInvoice(
  userId: string,
  event: EventRecord,
  business?: BusinessIssuer | null,
): Promise<{ event: EventRecord; invoice: ClientInvoiceRecord | null }> {
  if (event.finalInvoiceId) {
    throw new Error('Ya existe una factura final para este evento');
  }

  const quoteLines = parseQuoteLines(event.lineasPresupuesto);
  const invoiceLines = quoteLinesToInvoiceLines(quoteLines);
  if (invoiceLines.length === 0) {
    invoiceLines.push(calcInvoiceLine(event.nombre, 1, Number(event.presupuesto) || 0, 0, 21));
  }

  const depositPaid = Number(event.depositPaidAmount) || 0;
  const totals = calcInvoiceTotals(invoiceLines);
  const { number, sequenceNumber } = await getNextInvoiceNumber(userId, 'FAC');
  const today = new Date().toISOString().slice(0, 10);
  const due = event.fecha || today;

  const invoice = await createClientInvoiceRequest(userId, {
    clientId: event.clientId || '',
    clientName: event.cliente,
    clientNif: '',
    clientAddress: '',
    clientCity: '',
    clientPostalCode: '',
    clientEmail: event.clientEmail || '',
    issuerName: business?.name || '',
    issuerNif: business?.taxId || '',
    issuerAddress: business?.address || '',
    issuerCity: '',
    issuerPostalCode: '',
    issuerEmail: business?.email || '',
    issuerPhone: business?.phone || '',
    number,
    series: 'FAC',
    sequenceNumber,
    vehicleName: event.nombre,
    vehiclePlate: '',
    date: today,
    dueDate: due,
    lines: invoiceLines,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxAmount: totals.taxAmount,
    amountBase: totals.subtotal,
    total: totals.total,
    paid: 0,
    status: depositPaid >= totals.total ? 'paid' : 'pending',
    paymentMethod: '',
    notes: depositPaid > 0
      ? `Factura evento ${event.nombre}. Señal ya cobrada: ${depositPaid.toLocaleString('es-ES')} €`
      : `Factura evento ${event.nombre}`,
    sourceType: 'service',
    sourceQuoteId: event._id,
    sourceSaleId: null,
    financeMovementId: null,
    sentAt: null,
    sentTo: null,
    payments: [],
  });

  const updated = await updateEventRecord(userId, event, {
    finalInvoiceId: invoice?.id || '',
  });

  return { event: updated, invoice };
}

export async function registerEventFinalPayment(
  userId: string,
  event: EventRecord,
  amount: number,
  method: string,
): Promise<EventRecord> {
  if (!event.finalInvoiceId) {
    throw new Error('Crea primero la factura final');
  }

  const today = new Date().toISOString().slice(0, 10);
  const invoice = await registerInvoicePayment(userId, event.finalInvoiceId, {
    amount,
    date: today,
    method,
    notes: 'Cobro final evento',
  });

  await linkClientInvoiceToFinanceRequest(userId, event.finalInvoiceId).catch(() => null);

  const paid = Number(invoice?.paid ?? amount);
  const updated = await updateEventRecord(userId, event, {
    finalPaidAmount: paid,
    finalPaidAt: new Date().toISOString(),
  });

  const stamped = await stampFullyPaidIfCrossed(userId, event, updated);
  const { maybeNotifyEventFullyPaid } = await import('./eventsNotifications');
  void maybeNotifyEventFullyPaid(userId, event, stamped);

  return stamped;
}

/**
 * Operativa en un paso: crea factura final si falta y registra el cobro del resto.
 */
export async function collectEventFinalBalance(
  userId: string,
  event: EventRecord,
  amount: number,
  method: string,
  business?: BusinessIssuer | null,
): Promise<EventRecord> {
  const payAmount = Number(amount) || 0;
  if (payAmount <= 0) {
    throw new Error('Indica un importe de pago final mayor que 0');
  }

  let current = event;
  if (!current.finalInvoiceId) {
    const created = await createEventFinalInvoice(userId, current, business);
    current = created.event;
  }

  return registerEventFinalPayment(userId, current, payAmount, method);
}

export async function sendEventFinalInvoiceEmail(
  userId: string,
  event: EventRecord,
): Promise<void> {
  if (!event.finalInvoiceId) throw new Error('No hay factura final');
  if (!event.clientEmail) throw new Error('El cliente no tiene email');
  await sendInvoiceByEmail(userId, event.finalInvoiceId);
}

export async function sendEventReviewInviteRequest(
  userId: string,
  eventId: string,
  options: {
    reviewUrl: string;
    message?: string;
    clientEmail?: string;
    companyName?: string;
  },
): Promise<{ event: EventRecord; sentTo?: string; alreadySent?: boolean }> {
  const { authFetch, getAuthHeaders } = await import('./authApi');
  const { getApiBase } = await import('./apiBase');
  const res = await authFetch(
    `${getApiBase()}/api/events-quotes/${encodeURIComponent(userId)}/${encodeURIComponent(eventId)}/send-review`,
    {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewUrl: options.reviewUrl,
        message: options.message || '',
        clientEmail: options.clientEmail || undefined,
        companyName: options.companyName || '',
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'No se pudo enviar la reseña');
  }
  return {
    event: data.event as EventRecord,
    sentTo: data.sentTo,
    alreadySent: Boolean(data.alreadySent),
  };
}
