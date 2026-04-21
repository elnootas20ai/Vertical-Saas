const API = import.meta.env.VITE_API_URL || '';

function headers() {
  const token = localStorage.getItem('token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type WasteType = 'hueso' | 'grasa' | 'recortes' | 'caducado' | 'rotura' | 'perdida_manual';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  hueso: 'Hueso', grasa: 'Grasa', recortes: 'Recortes',
  caducado: 'Caducado', rotura: 'Rotura', perdida_manual: 'Pérdida manual',
};

export const WASTE_TYPE_COLORS: Record<WasteType, string> = {
  hueso: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  grasa: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  recortes: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  caducado: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  rotura: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  perdida_manual: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  approved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

export interface ButcherWasteRecord {
  _id: string;
  id: string;
  user_id: string;
  business_id: string;
  productId: string;
  productName: string;
  catalogItemId: string;
  catalogItemName: string;
  batchId: string;
  date: string;
  wasteKg: number;
  wasteType: WasteType;
  reason: string;
  category: string;
  estimatedCost: number;
  costPriceAtTime: number;
  notes: string;
  registeredBy: string;
  registeredByName: string;
  reviewStatus: ReviewStatus;
  reviewedBy: string;
  reviewedByName: string;
  reviewNotes: string;
  reviewedAt: string;
  stockMovementId: string;
  financeMovementId: string;
  severity: string;
  createdAt: string;
  updatedAt: string;
}

export interface WasteSummary {
  dateFrom: string;
  dateTo: string;
  totalWasteKg: number;
  totalCost: number;
  totalReceptionKg: number;
  wastePct: number;
  recordCount: number;
  byWasteType: Record<string, { kg: number; cost: number; count: number }>;
  byProduct: { productId: string; productName: string; totalKg: number; totalCost: number; count: number }[];
  byWorker: { registeredBy: string; registeredByName: string; totalKg: number; count: number }[];
  dailyTrend: { date: string; kg: number; cost: number; count: number }[];
}

export interface WasteReporting {
  period: string;
  summary: WasteSummary;
  previousPeriodComparison: { kgChange: number; costChange: number; pctChange: number };
}

// ─── Waste API ──────────────────────────────────────────────────────────────

export async function listButcherWasteRequest(userId: string, params?: { wasteType?: string; reviewStatus?: string; dateFrom?: string; dateTo?: string }) {
  const qs = new URLSearchParams();
  if (params?.wasteType) qs.set('wasteType', params.wasteType);
  if (params?.reviewStatus) qs.set('reviewStatus', params.reviewStatus);
  if (params?.dateFrom) qs.set('from', params.dateFrom);
  if (params?.dateTo) qs.set('to', params.dateTo);
  const r = await fetch(`${API}/api/butcher/waste/${userId}?${qs}`, { headers: headers() });
  return r.json();
}

export async function createButcherWasteRequest(userId: string, waste: Partial<ButcherWasteRecord>) {
  const r = await fetch(`${API}/api/butcher/waste/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(waste),
  });
  return r.json();
}

export async function reviewButcherWasteRequest(userId: string, wasteId: string, review: { reviewStatus: ReviewStatus; reviewNotes?: string; reviewedBy?: string; reviewedByName?: string }) {
  const r = await fetch(`${API}/api/butcher/waste/${userId}/${wasteId}/review`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(review),
  });
  return r.json();
}

export async function getButcherWasteSummaryRequest(userId: string, dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('from', dateFrom);
  if (dateTo) qs.set('to', dateTo);
  const r = await fetch(`${API}/api/butcher/waste/${userId}/summary?${qs}`, { headers: headers() });
  return r.json();
}

export async function getButcherWasteRateRequest(userId: string, catalogItemId: string, dateFrom?: string, dateTo?: string) {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('from', dateFrom);
  if (dateTo) qs.set('to', dateTo);
  const r = await fetch(`${API}/api/butcher/waste/${userId}/rate/${catalogItemId}?${qs}`, { headers: headers() });
  return r.json();
}

export async function getButcherWasteReportingRequest(userId: string, period?: string) {
  const qs = period ? `?period=${period}` : '';
  const r = await fetch(`${API}/api/butcher/waste/${userId}/reporting${qs}`, { headers: headers() });
  return r.json();
}
