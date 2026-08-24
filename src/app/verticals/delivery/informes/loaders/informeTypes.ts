export type InformeKpi = {
  id: string;
  label: string;
  value: string;
  /** Variación % vs periodo anterior (null = no disponible). */
  deltaPct?: number | null;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
  hint?: string;
};

export type InformeChartSeries = {
  key: string;
  label: string;
  color?: string;
};

export type InformeChartPoint = {
  label: string;
  [key: string]: string | number | null | undefined;
};

export type InformeChart = {
  type: 'line' | 'bar' | 'stackedBar' | 'composed' | 'waterfall';
  title: string;
  points: InformeChartPoint[];
  series: InformeChartSeries[];
};

export type InformeTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: 'money' | 'pct' | 'number' | 'text';
};

export type InformeTable = {
  id: string;
  title: string;
  columns: InformeTableColumn[];
  rows: Record<string, unknown>[];
  sortable?: boolean;
};

export type InformeAlert = {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
};

export type InformeCenterOption = { id: string; name: string };

export type InformeDashboard = {
  kpis: InformeKpi[];
  chart?: InformeChart;
  tables: InformeTable[];
  alerts?: InformeAlert[];
  filterOptions?: {
    centers?: InformeCenterOption[];
    categories?: string[];
    employees?: string[];
    providers?: string[];
  };
};

export type InformeBuildResult = {
  rows: Record<string, unknown>[];
  summary: string;
  reportTitle?: string;
  dashboard?: InformeDashboard;
  /** Informe no activable (ej. sin presupuestos). */
  unavailable?: boolean;
  unavailableReason?: string;
};

/** Periodo mensual elegido antes de generar el informe. */
export type InformePeriod = {
  year: number;
  /** 1–12 */
  month: number;
};

/** Filtros comunes + extras del informe. */
export type InformeFilters = {
  /** Override del rango (yyyy-mm-dd). Por defecto = mes del period. */
  dateFrom?: string;
  dateTo?: string;
  centerId?: string;
  comparePrevious?: boolean;
  category?: string;
  employee?: string;
  provider?: string;
};

export type InformeLoadCtx = {
  userId: string;
  businessId?: string;
  businessName?: string;
  businessType?: string;
  period?: InformePeriod;
  filters?: InformeFilters;
  signal?: AbortSignal;
  onProgress?: (pct: number, label: string) => void;
};

export const INFORME_MONTH_LABELS_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const INFORME_MONTH_LABELS_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

/** Umbral por defecto de descuadre de caja (€). */
export const CAJA_DIFF_THRESHOLD_EUR = 5;

export function informePeriodKey(period: InformePeriod) {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

export function informePeriodLabel(period: InformePeriod) {
  const name = INFORME_MONTH_LABELS_FULL[period.month - 1] || String(period.month);
  return `${name} ${period.year}`;
}

export function informePeriodRange(period: InformePeriod) {
  const key = informePeriodKey(period);
  const lastDay = new Date(period.year, period.month, 0).getDate();
  return {
    from: `${key}-01`,
    to: `${key}-${String(lastDay).padStart(2, '0')}`,
    monthKey: key,
  };
}

export function shiftInformePeriod(period: InformePeriod, deltaMonths: number): InformePeriod {
  const d = new Date(period.year, period.month - 1 + deltaMonths, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function resolveInformeDateRange(ctx: InformeLoadCtx) {
  if (ctx.filters?.dateFrom && ctx.filters?.dateTo) {
    return { from: ctx.filters.dateFrom, to: ctx.filters.dateTo };
  }
  if (ctx.period) return informePeriodRange(ctx.period);
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` };
}

export function previousRangeSameLength(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(prevStart), to: iso(prevEnd) };
}

export function yearAgoRange(from: string, to: string) {
  const shift = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  };
  return { from: shift(from), to: shift(to) };
}

export function dateInRange(isoDate: string, from: string, to: string) {
  const d = String(isoDate || '').slice(0, 10);
  if (!d) return false;
  return d >= from && d <= to;
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) {
    if (!Number.isFinite(current) || current === 0) return 0;
    return null;
  }
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function currentInformePeriod(): InformePeriod {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function isFutureInformePeriod(period: InformePeriod) {
  const now = currentInformePeriod();
  if (period.year > now.year) return true;
  if (period.year < now.year) return false;
  return period.month > now.month;
}

export function euro(n: number) {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function yearNow() {
  return new Date().getFullYear();
}

export function monthKeyNow() {
  return new Date().toISOString().slice(0, 7);
}

export function lastDaysRange(days: number) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export function emptyResult(summary: string): InformeBuildResult {
  return { rows: [], summary };
}

export function unavailableResult(reason: string): InformeBuildResult {
  return {
    rows: [],
    summary: reason,
    unavailable: true,
    unavailableReason: reason,
  };
}

/** Aplana tablas del dashboard a filas exportables. */
export function flattenDashboardRows(dashboard: InformeDashboard): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let orden = 0;
  for (const kpi of dashboard.kpis) {
    orden += 1;
    out.push({
      Orden: orden,
      Seccion: '00 · KPIs',
      Concepto: kpi.label,
      Valor: kpi.value,
      VariacionPct: kpi.deltaPct ?? '',
      Notas: kpi.hint || '',
    });
  }
  for (const table of dashboard.tables) {
    for (const row of table.rows) {
      orden += 1;
      out.push({ Orden: orden, Seccion: table.title, ...row });
    }
  }
  return out;
}
