import { v4 as uuidv4 } from 'uuid';

export interface BankAccount {
  _id: string;
  _rev?: string;
  id: string;
  type: 'bank_account';
  user_id: string;
  name: string;
  bankName: string;
  iban: string;
  swift?: string;
  accountNumber?: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  isDefault: boolean;
  color: string;
  icon: string;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateBankAccountPayload {
  user_id: string;
  name: string;
  bankName: string;
  iban?: string;
  swift?: string;
  accountNumber?: string;
  currency?: string;
  initialBalance?: number;
  isDefault?: boolean;
  color?: string;
  icon?: string;
  notes?: string;
}

const BANK_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#ec4899', '#64748b',
];

function str(value: unknown, fallback = ''): string {
  return String(value ?? '').trim() || fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function createBankAccountRecord(
  payload: CreateBankAccountPayload,
  colorIndex = 0,
): BankAccount {
  const now = new Date().toISOString();
  const id = `bank_account-${uuidv4()}`;
  const initial = num(payload.initialBalance);

  return {
    _id: id,
    id,
    type: 'bank_account',
    user_id: str(payload.user_id),
    name: str(payload.name, 'Cuenta principal'),
    bankName: str(payload.bankName),
    iban: str(payload.iban),
    swift: str(payload.swift) || undefined,
    accountNumber: str(payload.accountNumber) || undefined,
    currency: str(payload.currency, 'EUR'),
    initialBalance: initial,
    currentBalance: initial,
    isDefault: Boolean(payload.isDefault),
    color: str(payload.color) || BANK_COLORS[colorIndex % BANK_COLORS.length],
    icon: str(payload.icon, '🏦'),
    active: true,
    notes: str(payload.notes),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeBankAccount(value: unknown): BankAccount | null {
  if (!value || typeof value !== 'object') return null;

  const doc = value as Partial<BankAccount> & { _id?: string; type?: string };
  if (doc.type !== 'bank_account') return null;

  const id = str(doc.id || doc._id);
  const userId = str(doc.user_id);
  if (!id || !userId) return null;

  return {
    _id: str(doc._id) || id,
    _rev: str(doc._rev) || undefined,
    id,
    type: 'bank_account',
    user_id: userId,
    name: str(doc.name, 'Sin nombre'),
    bankName: str(doc.bankName),
    iban: str(doc.iban),
    swift: str(doc.swift) || undefined,
    accountNumber: str(doc.accountNumber) || undefined,
    currency: str(doc.currency, 'EUR'),
    initialBalance: num(doc.initialBalance),
    currentBalance: num(doc.currentBalance),
    isDefault: Boolean(doc.isDefault),
    color: str(doc.color, '#3b82f6'),
    icon: str(doc.icon, '🏦'),
    active: doc.active !== false,
    notes: str(doc.notes),
    createdAt: str(doc.createdAt) || new Date().toISOString(),
    updatedAt: str(doc.updatedAt || doc.createdAt) || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export function formatIban(iban: string): string {
  return iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function maskIban(iban: string): string {
  const clean = iban.replace(/\s/g, '');
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
}

export function getTotalBalance(accounts: BankAccount[]): number {
  return Number(
    accounts
      .filter((a) => a.active && !a.deletedAt)
      .reduce((sum, a) => sum + a.currentBalance, 0)
      .toFixed(2),
  );
}
