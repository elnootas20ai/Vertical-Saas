import type { FinanceMovementRecord } from './financeTypes';

export interface VerticalRevenueSummary {
  vertical: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  movementCount: number;
  margin: number;
}

export interface VerticalMonthlyData {
  vertical: string;
  monthlyRevenue: number[];
  monthlyExpenses: number[];
}

const VERTICAL_CATEGORY_MAP: Record<string, string> = {
  ventas: 'General',
  servicios: 'Servicios',
  alquiler: 'Inmobiliaria',
  comisiones: 'Comercial',
  intereses: 'Financiero',
  delivery: 'Delivery',
  web: 'Web / eCommerce',
  taller: 'Taller',
  gimnasio: 'Gimnasio',
  clinica: 'Clínica',
  hotel: 'Hostelería',
  academia: 'Academia',
  farmacia: 'Farmacia',
  peluqueria: 'Peluquería',
  veterinaria: 'Veterinaria',
};

function resolveVertical(movement: FinanceMovementRecord): string {
  const src = (movement.source || '').toLowerCase();
  if (src === 'sale' || src === 'invoice') return 'Facturación';
  if (src === 'tpv_session') return 'TPV / Caja';
  if (src === 'realestate_contract' || src === 'realestate_appraisal') return 'Inmobiliaria';

  const cat = (movement.category || '').toLowerCase();
  for (const [key, label] of Object.entries(VERTICAL_CATEGORY_MAP)) {
    if (cat.includes(key)) return label;
  }

  const concept = (movement.concept || '').toLowerCase();
  if (concept.includes('delivery') || concept.includes('reparto')) return 'Delivery';
  if (concept.includes('web') || concept.includes('ecommerce')) return 'Web / eCommerce';
  if (concept.includes('taller') || concept.includes('reparación')) return 'Taller';
  if (concept.includes('inmobiliaria') || concept.includes('tasación') || concept.includes('tasacion')) {
    return 'Inmobiliaria';
  }

  return 'General';
}

export function getRevenueByVertical(
  movements: FinanceMovementRecord[],
  year?: number,
): VerticalRevenueSummary[] {
  const filtered = year
    ? movements.filter((m) => m.date.startsWith(String(year)))
    : movements;

  const map = new Map<string, { income: number; expenses: number; count: number }>();

  for (const m of filtered) {
    const vertical = resolveVertical(m);
    const entry = map.get(vertical) || { income: 0, expenses: 0, count: 0 };
    if (m.type === 'cobro') {
      entry.income += m.totalAmount;
    } else {
      entry.expenses += m.totalAmount;
    }
    entry.count++;
    map.set(vertical, entry);
  }

  return Array.from(map.entries())
    .map(([vertical, data]) => ({
      vertical,
      totalRevenue: Number(data.income.toFixed(2)),
      totalExpenses: Number(data.expenses.toFixed(2)),
      netProfit: Number((data.income - data.expenses).toFixed(2)),
      movementCount: data.count,
      margin: data.income > 0
        ? Number((((data.income - data.expenses) / data.income) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export function getVerticalMonthlyBreakdown(
  movements: FinanceMovementRecord[],
  year: number,
): VerticalMonthlyData[] {
  const filtered = movements.filter((m) => m.date.startsWith(String(year)));
  const map = new Map<string, { revenue: number[]; expenses: number[] }>();

  for (const m of filtered) {
    const vertical = resolveVertical(m);
    if (!map.has(vertical)) {
      map.set(vertical, {
        revenue: Array(12).fill(0) as number[],
        expenses: Array(12).fill(0) as number[],
      });
    }
    const entry = map.get(vertical)!;
    const monthIdx = new Date(m.date).getMonth();
    if (m.type === 'cobro') {
      entry.revenue[monthIdx] += m.totalAmount;
    } else {
      entry.expenses[monthIdx] += m.totalAmount;
    }
  }

  return Array.from(map.entries())
    .map(([vertical, data]) => ({
      vertical,
      monthlyRevenue: data.revenue.map((v) => Number(v.toFixed(2))),
      monthlyExpenses: data.expenses.map((v) => Number(v.toFixed(2))),
    }))
    .sort((a, b) => {
      const totalA = a.monthlyRevenue.reduce((s, v) => s + v, 0);
      const totalB = b.monthlyRevenue.reduce((s, v) => s + v, 0);
      return totalB - totalA;
    });
}

export function getMostProfitableVertical(
  movements: FinanceMovementRecord[],
  year?: number,
): VerticalRevenueSummary | null {
  const summaries = getRevenueByVertical(movements, year);
  if (summaries.length === 0) return null;
  return summaries.reduce((best, s) => (s.netProfit > best.netProfit ? s : best));
}

export function getVerticalComparison(
  movements: FinanceMovementRecord[],
  currentYear: number,
): Array<VerticalRevenueSummary & { prevYearRevenue: number; growth: number }> {
  const current = getRevenueByVertical(movements, currentYear);
  const prev = getRevenueByVertical(movements, currentYear - 1);
  const prevMap = new Map(prev.map((s) => [s.vertical, s]));

  return current.map((s) => {
    const prevData = prevMap.get(s.vertical);
    const prevRev = prevData?.totalRevenue || 0;
    const growth = prevRev > 0
      ? Number((((s.totalRevenue - prevRev) / prevRev) * 100).toFixed(1))
      : s.totalRevenue > 0 ? 100 : 0;
    return { ...s, prevYearRevenue: prevRev, growth };
  });
}
