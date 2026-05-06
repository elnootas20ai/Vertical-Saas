import type { PreparationExpense } from '../context/AppContext';
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

interface ExpenseEnvelope {
  ok: boolean;
  error?: string;
  expense?: PreparationExpense;
  expenses?: PreparationExpense[];
  meta?: { total: number; limit: number; skip: number };
  summary?: ExpenseSummary;
  payment?: Record<string, unknown>;
}

export interface ExpenseSummary {
  grandTotal: number;
  pendingReview: number;
  withoutDocument: number;
  totalExpenses: number;
  vehiclesWithExpenses: number;
  totalByVehicle: { vehicleId: string; plate: string; label: string; total: number; count: number }[];
  totalByType: { expenseType: string; total: number; count: number }[];
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit): Promise<ExpenseEnvelope> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as ExpenseEnvelope;

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de gastos de preparación');
  }
  return payload;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listPreparationExpenses(
  userId: string,
  params?: Record<string, string>,
) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}${qs}`);
}

export async function listVehiclePreparationExpenses(
  userId: string,
  vehicleId: string,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/vehicle/${encodeURIComponent(vehicleId)}`);
}

export async function getPreparationExpenseSummary(
  userId: string,
  businessId?: string | null,
) {
  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/summary${qs}`);
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createPreparationExpense(
  userId: string,
  expense: Partial<PreparationExpense>,
  businessId?: string | null,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ expense, businessId: businessId || undefined }),
  });
}

export async function updatePreparationExpense(
  userId: string,
  expenseId: string,
  expense: Partial<PreparationExpense>,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/${encodeURIComponent(expenseId)}`, {
    method: 'PUT',
    body: JSON.stringify({ expense }),
  });
}

export async function validatePreparationExpense(
  userId: string,
  expenseId: string,
  status: 'validado' | 'rechazado',
  reason?: string,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/${encodeURIComponent(expenseId)}/validate`, {
    method: 'PUT',
    body: JSON.stringify({ status, reason }),
  });
}

export async function deletePreparationExpense(
  userId: string,
  expenseId: string,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/${encodeURIComponent(expenseId)}`, {
    method: 'DELETE',
  });
}

// ─── Document ────────────────────────────────────────────────────────────────

export async function attachExpenseDocument(
  userId: string,
  expenseId: string,
  documentId: string,
  documentName?: string,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/${encodeURIComponent(expenseId)}/attach-document`, {
    method: 'POST',
    body: JSON.stringify({ documentId, documentName }),
  });
}

export async function detachExpenseDocument(
  userId: string,
  expenseId: string,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/${encodeURIComponent(expenseId)}/detach-document`, {
    method: 'DELETE',
  });
}

// ─── Payment ─────────────────────────────────────────────────────────────────

export async function registerExpensePayment(
  userId: string,
  expenseId: string,
) {
  return request(`/api/preparation-expenses/${encodeURIComponent(userId)}/${encodeURIComponent(expenseId)}/register-payment`, {
    method: 'POST',
  });
}
