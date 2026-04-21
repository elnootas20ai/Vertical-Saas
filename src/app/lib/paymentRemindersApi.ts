import { v4 as uuidv4 } from 'uuid';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReminderLevel = 1 | 2 | 3;
export type ReminderStatus = 'pending' | 'sent' | 'resolved' | 'cancelled';

export interface PaymentReminder {
  _id: string;
  _rev?: string;
  id: string;
  type: 'payment_reminder';
  user_id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  invoiceTotal: number;
  invoiceDueDate: string;
  daysOverdue: number;
  level: ReminderLevel;
  status: ReminderStatus;
  sentAt?: string;
  resolvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateReminderPayload = Omit<
  PaymentReminder,
  '_id' | '_rev' | 'id' | 'type' | 'createdAt' | 'updatedAt'
>;

export const REMINDER_LEVELS: Record<
  ReminderLevel,
  { label: string; daysThreshold: number; tone: string; color: string }
> = {
  1: { label: 'Recordatorio amistoso', daysThreshold: 7,  tone: 'Estimado cliente, le recordamos que tiene una factura pendiente de pago.', color: '#f59e0b' },
  2: { label: 'Segundo aviso',         daysThreshold: 15, tone: 'Le comunicamos que su factura sigue pendiente de pago. Por favor, regularice la situación.', color: '#ef4444' },
  3: { label: 'Aviso urgente',         daysThreshold: 30, tone: 'URGENTE: Su factura lleva más de 30 días vencida. Si no regulariza el pago, se procederá a acciones legales.', color: '#7f1d1d' },
};

export function buildReminderEmailBody(reminder: PaymentReminder, companyName: string): string {
  const cfg = REMINDER_LEVELS[reminder.level];
  const due = new Date(reminder.invoiceDueDate).toLocaleDateString('es-ES');
  return `${cfg.tone}\n\nFactura: ${reminder.invoiceNumber}\nImporte: ${reminder.invoiceTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\nFecha vencimiento: ${due}\nDías de retraso: ${reminder.daysOverdue}\n\nPor favor, proceda al pago lo antes posible.\n\nAtentamente,\n${companyName}`;
}

export function detectReminderLevel(daysOverdue: number): ReminderLevel {
  if (daysOverdue >= 30) return 3;
  if (daysOverdue >= 15) return 2;
  return 1;
}

// ── CouchDB persistence ───────────────────────────────────────────────────────

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
}

function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('udar_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

const REMINDERS_DB = (env.VITE_COUCHDB_DB || 'udar') + '-payment-reminders';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en recordatorios de pago');
  return data;
}

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(REMINDERS_DB)}`, { method: 'PUT' });
}

function normalizeReminder(value: unknown): PaymentReminder | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<PaymentReminder> & { _id?: string };
  if (doc.type !== 'payment_reminder') return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;
  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    id,
    type: 'payment_reminder',
    user_id: String(doc.user_id || ''),
    invoiceId: String(doc.invoiceId || ''),
    invoiceNumber: String(doc.invoiceNumber || ''),
    clientId: String(doc.clientId || ''),
    clientName: String(doc.clientName || ''),
    clientEmail: String(doc.clientEmail || ''),
    invoiceTotal: Number(doc.invoiceTotal || 0),
    invoiceDueDate: String(doc.invoiceDueDate || ''),
    daysOverdue: Number(doc.daysOverdue || 0),
    level: (Number(doc.level) as ReminderLevel) || 1,
    status: (doc.status as ReminderStatus) || 'pending',
    sentAt: doc.sentAt ? String(doc.sentAt) : undefined,
    resolvedAt: doc.resolvedAt ? String(doc.resolvedAt) : undefined,
    notes: doc.notes ? String(doc.notes) : undefined,
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
  };
}

export async function listPaymentReminders(userId: string): Promise<PaymentReminder[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(REMINDERS_DB)}`);
  return ((payload.docs || []) as unknown[])
    .map(normalizeReminder)
    .filter((r): r is PaymentReminder => r !== null && r.user_id === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePaymentReminder(reminder: PaymentReminder): Promise<PaymentReminder> {
  await ensureDb();
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(REMINDERS_DB)}/${encodeURIComponent(reminder._id)}`,
    { method: 'PUT', body: JSON.stringify(reminder) },
  );
  return { ...reminder, _rev: result.rev };
}

export async function createPaymentReminder(
  payload: CreateReminderPayload,
): Promise<PaymentReminder> {
  const id = `reminder-${uuidv4()}`;
  const now = new Date().toISOString();
  const reminder: PaymentReminder = {
    ...payload,
    _id: id,
    id,
    type: 'payment_reminder',
    createdAt: now,
    updatedAt: now,
  };
  return savePaymentReminder(reminder);
}

export async function markReminderSent(reminder: PaymentReminder): Promise<PaymentReminder> {
  return savePaymentReminder({
    ...reminder,
    status: 'sent',
    sentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function markReminderResolved(reminder: PaymentReminder): Promise<PaymentReminder> {
  return savePaymentReminder({
    ...reminder,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function deletePaymentReminder(reminderId: string): Promise<void> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(REMINDERS_DB)}`);
  const doc = (payload.docs as PaymentReminder[]).find((d) => d._id === reminderId);
  if (!doc) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(REMINDERS_DB)}/${encodeURIComponent(reminderId)}?rev=${doc._rev}`,
    { method: 'DELETE' },
  );
}
