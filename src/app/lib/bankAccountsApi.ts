import {
  normalizeBankAccount,
  type BankAccount,
  type CreateBankAccountPayload,
} from './bankAccountTypes';
import type { FinanceMovementRecord } from './financeTypes';
import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

const API_BASE = getApiBase();

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
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
  if (!response.ok) throw new Error(payload?.error || 'Error en cuentas bancarias');
  return payload;
}

export async function listBankAccounts(userId: string): Promise<BankAccount[]> {
  const payload = await request<{ ok: boolean; accounts: unknown[] }>(
    `/api/finance/${encodeURIComponent(userId)}/accounts`,
  );
  return (payload.accounts || [])
    .map(normalizeBankAccount)
    .filter((a): a is BankAccount => Boolean(a) && !a.deletedAt)
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function getBankAccount(userId: string, accountId: string): Promise<BankAccount | null> {
  try {
    const payload = await request<{ ok: boolean; account: unknown }>(
      `/api/finance/${encodeURIComponent(userId)}/accounts/${encodeURIComponent(accountId)}`,
    );
    return normalizeBankAccount(payload.account);
  } catch {
    return null;
  }
}

export async function saveBankAccount(
  userId: string,
  data: CreateBankAccountPayload | BankAccount,
  existing?: BankAccount,
): Promise<BankAccount> {
  const isUpdate = existing?._id;
  const path = isUpdate
    ? `/api/finance/${encodeURIComponent(userId)}/accounts/${encodeURIComponent(existing._id)}`
    : `/api/finance/${encodeURIComponent(userId)}/accounts`;

  const result = await request<{ ok: boolean; account: unknown }>(path, {
    method: isUpdate ? 'PUT' : 'POST',
    body: JSON.stringify({ account: { ...data, user_id: userId } }),
  });

  const normalized = normalizeBankAccount(result.account);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function deleteBankAccount(userId: string, accountId: string): Promise<void> {
  await request(
    `/api/finance/${encodeURIComponent(userId)}/accounts/${encodeURIComponent(accountId)}`,
    { method: 'DELETE' },
  );
}

export async function recalculateBalance(
  userId: string,
  accountId: string,
): Promise<BankAccount> {
  const result = await request<{ ok: boolean; account: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/accounts/${encodeURIComponent(accountId)}/recalculate`,
    { method: 'POST' },
  );
  const normalized = normalizeBankAccount(result.account);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function getDefaultAccount(userId: string): Promise<BankAccount | null> {
  const accounts = await listBankAccounts(userId);
  return accounts.find((a) => a.isDefault) || accounts[0] || null;
}

export function calculateBalanceFromMovements(
  account: BankAccount,
  movements: FinanceMovementRecord[],
): number {
  const linked = movements.filter(
    (m) => (m as any).bankAccountId === account._id,
  );
  const income = linked
    .filter((m) => m.type === 'cobro')
    .reduce((s, m) => s + m.totalAmount, 0);
  const expense = linked
    .filter((m) => m.type === 'pago')
    .reduce((s, m) => s + m.totalAmount, 0);
  return Number((account.initialBalance + income - expense).toFixed(2));
}
