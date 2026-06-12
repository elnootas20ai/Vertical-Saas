import {
  listClientInvoicesRequest,
  linkClientInvoiceToFinanceRequest,
  type ClientInvoiceRecord,
} from './clientInvoicesApi';
import {
  createPaymentReminder,
  detectReminderLevel,
  listPaymentReminders,
  type PaymentReminder,
} from './paymentRemindersApi';

export async function linkClientInvoiceToFinance(
  userId: string,
  invoiceId: string,
): Promise<ClientInvoiceRecord | null> {
  return linkClientInvoiceToFinanceRequest(userId, invoiceId);
}

/** Recordatorios desde facturas CRM vencidas (compraventa). */
export async function syncClientInvoicePaymentReminders(userId: string): Promise<PaymentReminder[]> {
  if (!userId) return [];

  const [invoices, existing] = await Promise.all([
    listClientInvoicesRequest(userId),
    listPaymentReminders(userId),
  ]);

  const activeKeys = new Set(
    existing
      .filter((r) => r.status !== 'resolved' && r.status !== 'cancelled')
      .map((r) => r.invoiceId),
  );

  const now = Date.now();

  for (const inv of invoices) {
    if (!['pending', 'partial', 'overdue'].includes(inv.status)) continue;
    if (!inv.dueDate) continue;
    const dueMs = Date.parse(inv.dueDate);
    if (Number.isNaN(dueMs) || dueMs >= now) continue;

    const daysOverdue = Math.max(1, Math.floor((now - dueMs) / 86_400_000));
    if (daysOverdue < 7) continue;

    const key = inv.financeMovementId || inv.id;
    if (activeKeys.has(key) || activeKeys.has(inv.id)) continue;

    await createPaymentReminder({
      user_id: userId,
      invoiceId: key,
      invoiceNumber: inv.number,
      clientId: inv.clientId,
      clientName: inv.clientName,
      clientEmail: inv.clientEmail,
      invoiceTotal: inv.total - inv.paid,
      invoiceDueDate: inv.dueDate,
      daysOverdue,
      level: detectReminderLevel(daysOverdue),
      status: 'pending',
    });
    activeKeys.add(key);
  }

  return listPaymentReminders(userId);
}

export function summarizeClientInvoiceCollections(invoices: ClientInvoiceRecord[]) {
  const open = invoices.filter((i) => ['pending', 'partial', 'overdue'].includes(i.status));
  return {
    pendingAmount: open.reduce((s, i) => s + (i.total - i.paid), 0),
    overdueCount: invoices.filter((i) => i.status === 'overdue').length,
    linkedCount: invoices.filter((i) => Boolean(i.financeMovementId)).length,
  };
}
