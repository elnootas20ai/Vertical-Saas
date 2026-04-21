import type { FinanceMovementRecord } from './financeTypes';

const COGS_CATEGORY_KEYS = new Set(['compras_proveedor', 'materiales', 'Compra stock']);

function trimEq(a: string, b: string): boolean {
  return String(a || '').trim() === String(b || '').trim();
}

function yearFromMovementDate(dateStr: string): number | null {
  const y = Number(String(dateStr || '').slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function monthIndex0(dateStr: string): number {
  const m = Number(String(dateStr || '').slice(5, 7));
  if (!Number.isFinite(m) || m < 1 || m > 12) return -1;
  return m - 1;
}

function emptyMonthTrend(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

export interface SupplierFinancialSummary {
  totalPurchases: number;
  totalPayments: number;
  pendingPayments: number;
  movementCount: number;
  lastPaymentDate: string | null;
  avgInvoiceAmount: number;
}

export function getSupplierFinancialSummary(
  movements: FinanceMovementRecord[],
  supplierName: string,
): SupplierFinancialSummary {
  const rows = movements.filter((m) => supplierMatches(m, supplierName));

  let totalPurchases = 0;
  let totalPayments = 0;
  let pendingPayments = 0;
  let lastPaymentDate: string | null = null;

  for (const m of rows) {
    const amt = Number(m.totalAmount) || 0;
    totalPurchases += amt;
    if (m.status === 'paid') {
      totalPayments += amt;
      const d = paymentDateForSort(m);
      if (d && (!lastPaymentDate || d > lastPaymentDate)) {
        lastPaymentDate = d;
      }
    } else {
      pendingPayments += amt;
    }
  }

  const movementCount = rows.length;
  const avgInvoiceAmount = movementCount > 0 ? totalPurchases / movementCount : 0;

  return {
    totalPurchases,
    totalPayments,
    pendingPayments,
    movementCount,
    lastPaymentDate,
    avgInvoiceAmount,
  };
}

function paymentDateForSort(m: FinanceMovementRecord): string | null {
  if (m.status !== 'paid') return null;
  const paid = String(m.paidAt || '').trim();
  if (paid.length >= 10) return paid.slice(0, 10);
  const d = String(m.date || '').trim();
  return d.length >= 10 ? d.slice(0, 10) : null;
}

function supplierMatches(m: FinanceMovementRecord, supplierName: string): boolean {
  return m.type === 'pago' && trimEq(m.companyName || '', supplierName);
}

export interface TopSupplierSpend {
  supplierName: string;
  totalSpend: number;
  movementCount: number;
  lastDate: string | null;
}

export function getTopSuppliersBySpend(
  movements: FinanceMovementRecord[],
  limit: number = 10,
): TopSupplierSpend[] {
  const map = new Map<
    string,
    { totalSpend: number; movementCount: number; lastDate: string | null }
  >();

  for (const m of movements) {
    if (m.type !== 'pago') continue;
    const name = String(m.companyName || '').trim();
    if (!name) continue;

    const cur = map.get(name) || { totalSpend: 0, movementCount: 0, lastDate: null };
    const amt = Number(m.totalAmount) || 0;
    cur.totalSpend += amt;
    cur.movementCount += 1;
    const d = String(m.date || '').slice(0, 10);
    if (d.length === 10) {
      if (!cur.lastDate || d > cur.lastDate) cur.lastDate = d;
    }
    map.set(name, cur);
  }

  const list: TopSupplierSpend[] = [...map.entries()].map(([supplierName, v]) => ({
    supplierName,
    totalSpend: v.totalSpend,
    movementCount: v.movementCount,
    lastDate: v.lastDate,
  }));

  list.sort((a, b) => b.totalSpend - a.totalSpend);
  const cap = Math.max(0, Math.floor(limit));
  return list.slice(0, cap);
}

export interface PurchaseCategoryBreakdown {
  category: string;
  total: number;
  count: number;
  avgAmount: number;
  monthlyTrend: number[];
}

export function getPurchasesByCategory(
  movements: FinanceMovementRecord[],
  year: number,
): PurchaseCategoryBreakdown[] {
  const byCat = new Map<
    string,
    { total: number; count: number; monthlyTrend: number[] }
  >();

  for (const m of movements) {
    if (m.type !== 'pago') continue;
    if (yearFromMovementDate(m.date) !== year) continue;

    const category = String(m.category || '').trim() || '(sin categoría)';
    const amt = Number(m.totalAmount) || 0;
    let entry = byCat.get(category);
    if (!entry) {
      entry = { total: 0, count: 0, monthlyTrend: emptyMonthTrend() };
      byCat.set(category, entry);
    }
    entry.total += amt;
    entry.count += 1;
    const mi = monthIndex0(m.date);
    if (mi >= 0) entry.monthlyTrend[mi] += amt;
  }

  const out: PurchaseCategoryBreakdown[] = [...byCat.entries()].map(([category, v]) => ({
    category,
    total: v.total,
    count: v.count,
    avgAmount: v.count > 0 ? v.total / v.count : 0,
    monthlyTrend: v.monthlyTrend,
  }));

  out.sort((a, b) => b.total - a.total);
  return out;
}

export interface SupplierPaymentTimelineEntry {
  date: string;
  amount: number;
  concept: string;
  status: FinanceMovementRecord['status'];
  isPaid: boolean;
}

export function getSupplierPaymentTimeline(
  movements: FinanceMovementRecord[],
  supplierName: string,
): SupplierPaymentTimelineEntry[] {
  const rows = movements
    .filter((m) => supplierMatches(m, supplierName))
    .map((m) => {
      const date = String(m.date || '').slice(0, 10);
      return {
        sortKey: date.length === 10 ? date : '',
        entry: {
          date: date.length === 10 ? date : String(m.date || ''),
          amount: Number(m.totalAmount) || 0,
          concept: String(m.concept || ''),
          status: m.status,
          isPaid: m.status === 'paid',
        } satisfies SupplierPaymentTimelineEntry,
      };
    });

  rows.sort((a, b) => {
    if (a.sortKey && b.sortKey) return a.sortKey.localeCompare(b.sortKey);
    if (a.sortKey) return -1;
    if (b.sortKey) return 1;
    return 0;
  });

  return rows.map((r) => r.entry);
}

export interface CostOfGoodsSoldResult {
  total: number;
  monthlyBreakdown: number[];
  percentageOfRevenue: number;
}

export function getCostOfGoodsSold(
  movements: FinanceMovementRecord[],
  year: number,
): CostOfGoodsSoldResult {
  const monthlyBreakdown = emptyMonthTrend();
  let total = 0;

  for (const m of movements) {
    if (m.type !== 'pago') continue;
    if (yearFromMovementDate(m.date) !== year) continue;
    const cat = String(m.category || '').trim();
    if (!COGS_CATEGORY_KEYS.has(cat)) continue;

    const amt = Number(m.totalAmount) || 0;
    total += amt;
    const mi = monthIndex0(m.date);
    if (mi >= 0) monthlyBreakdown[mi] += amt;
  }

  let revenue = 0;
  for (const m of movements) {
    if (m.type !== 'cobro') continue;
    if (yearFromMovementDate(m.date) !== year) continue;
    revenue += Number(m.totalAmount) || 0;
  }

  const percentageOfRevenue = revenue > 0 ? (total / revenue) * 100 : 0;

  return {
    total,
    monthlyBreakdown,
    percentageOfRevenue,
  };
}
