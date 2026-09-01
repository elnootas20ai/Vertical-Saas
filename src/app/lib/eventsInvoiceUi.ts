import {
  listClientInvoicesRequest,
  type ClientInvoiceRecord,
} from './clientInvoicesApi';
import { generateInvoicePdf, type InvoiceData } from './invoicePdfGenerator';
import type { EventRecord } from './eventsTypes';

export function clientInvoiceToPdfData(inv: ClientInvoiceRecord): InvoiceData {
  return {
    number: inv.number,
    date: inv.date,
    dueDate: inv.dueDate || undefined,
    issuer: {
      companyName: inv.issuerName || 'Empresa',
      nif: inv.issuerNif,
      address: inv.issuerAddress,
      city: inv.issuerCity,
      cp: inv.issuerPostalCode,
      email: inv.issuerEmail,
      phone: inv.issuerPhone,
    },
    recipient: {
      name: inv.clientName || 'Cliente',
      nif: inv.clientNif,
      address: inv.clientAddress,
      city: inv.clientCity,
    },
    lines: inv.lines.length > 0
      ? inv.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      }))
      : [{ description: 'Servicio', quantity: 1, unitPrice: inv.total, taxRate: 21 }],
    notes: inv.notes || undefined,
    payMethod: inv.paymentMethod || undefined,
  };
}

export function downloadClientInvoicePdf(inv: ClientInvoiceRecord): void {
  generateInvoicePdf(clientInvoiceToPdfData(inv));
}

export async function loadEventLinkedInvoices(
  userId: string,
  event: Pick<EventRecord, 'depositInvoiceId' | 'finalInvoiceId'>,
): Promise<{ deposit: ClientInvoiceRecord | null; final: ClientInvoiceRecord | null }> {
  const depositId = String(event.depositInvoiceId || '').trim();
  const finalId = String(event.finalInvoiceId || '').trim();
  if (!depositId && !finalId) {
    return { deposit: null, final: null };
  }
  const all = await listClientInvoicesRequest(userId);
  return {
    deposit: depositId ? all.find((i) => i.id === depositId) || null : null,
    final: finalId ? all.find((i) => i.id === finalId) || null : null,
  };
}
