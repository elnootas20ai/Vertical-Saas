import { getBankAccount, saveBankAccount } from './bankAccountsApi';
import type { BankAccount } from './bankAccountTypes';
import type { FinanceMovementRecord } from './financeTypes';

export async function onMovementCreated(userId: string, mov: FinanceMovementRecord): Promise<void> {
  if (!mov.bankAccountId) return;
  const acc = await getBankAccount(userId, mov.bankAccountId);
  if (!acc) return;
  const d = mov.type === 'cobro' ? mov.totalAmount : -mov.totalAmount;
  await saveBankAccount(userId, { ...acc, currentBalance: Number((acc.currentBalance + d).toFixed(2)), updatedAt: new Date().toISOString() }, acc);
}

export async function onMovementDeleted(userId: string, mov: FinanceMovementRecord): Promise<void> {
  if (!mov.bankAccountId) return;
  const acc = await getBankAccount(userId, mov.bankAccountId);
  if (!acc) return;
  const d = mov.type === 'cobro' ? -mov.totalAmount : mov.totalAmount;
  await saveBankAccount(userId, { ...acc, currentBalance: Number((acc.currentBalance + d).toFixed(2)), updatedAt: new Date().toISOString() }, acc);
}

export async function onMovementUpdated(userId: string, oldMov: FinanceMovementRecord, newMov: FinanceMovementRecord): Promise<void> {
  if (oldMov.bankAccountId === newMov.bankAccountId) {
    if (!newMov.bankAccountId) return;
    const acc = await getBankAccount(userId, newMov.bankAccountId);
    if (!acc) return;
    const oldD = oldMov.type === 'cobro' ? oldMov.totalAmount : -oldMov.totalAmount;
    const newD = newMov.type === 'cobro' ? newMov.totalAmount : -newMov.totalAmount;
    const net = newD - oldD;
    if (Math.abs(net) < 0.005) return;
    await saveBankAccount(userId, { ...acc, currentBalance: Number((acc.currentBalance + net).toFixed(2)), updatedAt: new Date().toISOString() }, acc);
    return;
  }
  if (oldMov.bankAccountId) await onMovementDeleted(userId, oldMov);
  if (newMov.bankAccountId) await onMovementCreated(userId, newMov);
}
