import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

export type ReconciliationStatus = 'unmatched' | 'matched' | 'ignored' | 'manual';

export interface BankTransaction {
  _id: string;
  _rev?: string;
  id: string;
  type: 'bank_transaction';
  user_id: string;
  date: string;
  valueDate?: string;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
  category?: string;
  bankName?: string;
  status: ReconciliationStatus;
  matchType?: 'movement' | 'client_invoice' | 'purchase_invoice';
  matchedMovementId?: string;
  matchedMovementRef?: string;
  matchedEntityId?: string;
  matchedEntityRef?: string;
  source: 'csv' | 'ofx' | 'manual';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationMatch {
  bankTransactionId: string;
  suggestions: Array<{
    entityType: 'movement' | 'client_invoice' | 'purchase_invoice';
    entityId: string;
    entityRef: string;
    score: number;
    reasons: string[];
  }>;
}

export interface ReconciliationAlert {
  id: string;
  type: 'unmatched_movement' | 'pending_collection' | 'unidentified_expense';
  severity: 'warning' | 'error' | 'info';
  title: string;
  description: string;
  relatedEntityId: string;
  amount: number;
  date: string;
  createdAt: string;
}

export interface ReconciliationStats {
  total: number;
  matched: number;
  unmatched: number;
  ignored: number;
  conciliationPct: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en conciliación bancaria');
  return data;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listBankTransactions(
  userId: string,
): Promise<BankTransaction[]> {
  const payload = await request<{ ok: boolean; transactions: BankTransaction[] }>(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}`,
  );
  return payload.transactions || [];
}

export async function importBankFile(
  userId: string,
  fileContent: string,
  filename: string,
): Promise<{ imported: number; duplicates: number; bankName: string; transactions: BankTransaction[] }> {
  const format = /\.(ofx|qfx)$/i.test(filename) ? 'ofx' : 'csv';
  const payload = await request<{
    ok: boolean;
    imported: number;
    duplicates: number;
    bankName: string;
    transactions: BankTransaction[];
  }>(`/api/bank-reconciliation/${encodeURIComponent(userId)}/import`, {
    method: 'POST',
    body: JSON.stringify({ content: fileContent, filename, format }),
  });
  return payload;
}

export async function triggerAutoMatch(
  userId: string,
): Promise<{ matches: ReconciliationMatch[]; totalMatches: number; totalProcessed: number }> {
  const payload = await request<{
    ok: boolean;
    matches: ReconciliationMatch[];
    totalMatches: number;
    totalProcessed: number;
  }>(`/api/bank-reconciliation/${encodeURIComponent(userId)}/auto-match`, {
    method: 'POST',
  });
  return payload;
}

export async function updateBankTransaction(
  userId: string,
  tx: Partial<BankTransaction> & { _id: string },
): Promise<BankTransaction> {
  const payload = await request<{ ok: boolean; transaction: BankTransaction }>(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}/${encodeURIComponent(tx._id)}`,
    { method: 'PUT', body: JSON.stringify({ transaction: tx }) },
  );
  return payload.transaction;
}

export async function reconcileTransaction(
  userId: string,
  txId: string,
  body: {
    action: 'link_existing' | 'create_movement' | 'link_invoice';
    targetId?: string;
    createPayload?: Record<string, unknown>;
  },
): Promise<BankTransaction> {
  const payload = await request<{ ok: boolean; transaction: BankTransaction }>(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}/${encodeURIComponent(txId)}/reconcile`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return payload.transaction;
}

export async function unlinkTransaction(
  userId: string,
  txId: string,
): Promise<BankTransaction> {
  const payload = await request<{ ok: boolean; transaction: BankTransaction }>(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}/${encodeURIComponent(txId)}/link`,
    { method: 'DELETE' },
  );
  return payload.transaction;
}

export async function deleteBankTransaction(
  userId: string,
  txId: string,
): Promise<void> {
  await request(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}/${encodeURIComponent(txId)}`,
    { method: 'DELETE' },
  );
}

export async function fetchReconciliationStats(
  userId: string,
): Promise<ReconciliationStats> {
  const payload = await request<{ ok: boolean; stats: ReconciliationStats }>(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}/stats`,
  );
  return payload.stats;
}

export async function fetchReconciliationAlerts(
  userId: string,
): Promise<ReconciliationAlert[]> {
  const payload = await request<{ ok: boolean; alerts: ReconciliationAlert[]; total: number }>(
    `/api/bank-reconciliation/${encodeURIComponent(userId)}/alerts`,
  );
  return payload.alerts || [];
}
