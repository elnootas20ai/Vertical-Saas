/**
 * Costes de infraestructura opcionales del escandallo (alquiler, luz…).
 * Por defecto desactivados: no afectan food cost hasta que el cliente lo active.
 */

export type EscandalloInfraLine = {
  id: string;
  name: string;
  /** Importe mensual en €. */
  amountMonthly: number;
};

export type EscandalloInfrastructureSettings = {
  /** Si false (default), los costes no entran en food cost / margen. */
  applyToFoodCost: boolean;
  /** Ventas estimadas €/mes para repartir el total. */
  estimatedMonthlySales: number;
  lines: EscandalloInfraLine[];
};

export const EMPTY_ESCANDALLO_INFRASTRUCTURE: EscandalloInfrastructureSettings = {
  applyToFoodCost: false,
  estimatedMonthlySales: 0,
  lines: [],
};

const DEFAULT_LINE_NAMES = ['Alquiler', 'Luz', 'Gas', 'Agua', 'Otros'] as const;

export function defaultEscandalloInfraLines(): EscandalloInfraLine[] {
  return DEFAULT_LINE_NAMES.map((name, i) => ({
    id: `infra-${i + 1}`,
    name,
    amountMonthly: 0,
  }));
}

export function normalizeEscandalloInfrastructure(raw: unknown): EscandalloInfrastructureSettings {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ESCANDALLO_INFRASTRUCTURE };
  const rec = raw as Record<string, unknown>;
  const linesRaw = Array.isArray(rec.lines) ? rec.lines : [];
  const lines: EscandalloInfraLine[] = [];
  for (const entry of linesRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = String(row.name || '').trim();
    const amountMonthly = Number(row.amountMonthly);
    if (!name || !Number.isFinite(amountMonthly) || amountMonthly < 0) continue;
    const id = String(row.id || '').trim() || `infra-${lines.length + 1}`;
    lines.push({
      id,
      name,
      amountMonthly: Math.round(amountMonthly * 100) / 100,
    });
  }
  const sales = Number(rec.estimatedMonthlySales);
  return {
    applyToFoodCost: Boolean(rec.applyToFoodCost),
    estimatedMonthlySales:
      Number.isFinite(sales) && sales > 0 ? Math.round(sales * 100) / 100 : 0,
    lines,
  };
}

export function escandalloInfrastructureMonthlyTotal(
  settings: Pick<EscandalloInfrastructureSettings, 'lines'>,
): number {
  return Math.round(
    settings.lines.reduce((sum, line) => sum + (Number(line.amountMonthly) || 0), 0) * 100,
  ) / 100;
}

/**
 * % de las ventas estimado que representan los gastos de estructura.
 * null si no se puede calcular (sin ventas o sin importes).
 */
export function escandalloInfrastructureSalesPercent(
  settings: EscandalloInfrastructureSettings,
): number | null {
  const total = escandalloInfrastructureMonthlyTotal(settings);
  const sales = Number(settings.estimatedMonthlySales) || 0;
  if (!(total > 0) || !(sales > 0)) return null;
  return Math.round((total / sales) * 1000) / 10;
}

/**
 * Coste por venta con infraestructura (opcional).
 * Solo si applyToFoodCost y hay %: coste ingredientes + (PVP × % estructura / 100).
 */
export function applyInfrastructureToUnitCost(
  ingredientUnitCost: number,
  salePrice: number,
  settings: EscandalloInfrastructureSettings | null | undefined,
): number {
  const base = Number(ingredientUnitCost) || 0;
  if (!settings?.applyToFoodCost) return Math.round(base * 100) / 100;
  const pct = escandalloInfrastructureSalesPercent(settings);
  if (pct == null || !(pct > 0)) return Math.round(base * 100) / 100;
  const sale = Number(salePrice) || 0;
  if (!(sale > 0)) return Math.round(base * 100) / 100;
  return Math.round((base + sale * (pct / 100)) * 100) / 100;
}
