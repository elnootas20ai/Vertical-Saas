import type { FinanceMovementRecord } from '../../../../lib/financeTypes';
import { getCategoryEbitdaBucket, normalizeCategorySlug } from '../../../../lib/financeCategoryCatalog';
import { round2 } from './informeTypes';

export type PnLLines = {
  ingresos: number;
  cogs: number;
  margenBruto: number;
  margenBrutoPct: number;
  opex: number;
  ebitda: number;
  ebitdaPct: number;
  /** Sin categoría de amortización en catálogo → 0 (no inventado). */
  amortizaciones: number;
  ebit: number;
  gastosFinancieros: number;
  resultadoAntesImpuestos: number;
  impuestos: number;
  resultadoNeto: number;
  margenNetoPct: number;
  opexByCategory: Array<{ categoria: string; total: number }>;
};

function isTaxCategory(category: string) {
  const s = normalizeCategorySlug(category);
  return s === 'impuestos' || /impuesto/.test(s);
}

function isFinanceCategory(category: string) {
  const s = normalizeCategorySlug(category);
  return s === 'intereses' || /interes|financ/.test(s);
}

/** Agrega líneas P&L reales desde movimientos (sin inventar amortizaciones). */
export function computePnLLines(movements: FinanceMovementRecord[]): PnLLines {
  let ingresos = 0;
  let cogs = 0;
  let opex = 0;
  let impuestos = 0;
  let gastosFinancieros = 0;
  let otherNonOp = 0;
  const opexMap = new Map<string, number>();

  for (const m of movements) {
    const amt = Number(m.totalAmount) || 0;
    if (!Number.isFinite(amt) || amt === 0) continue;
    const bucket = getCategoryEbitdaBucket(m.category, m.type);

    if (m.type === 'cobro') {
      if (bucket !== 'non_operating') ingresos += amt;
      continue;
    }

    if (bucket === 'cogs') {
      cogs += amt;
    } else if (bucket === 'opex') {
      opex += amt;
      const cat = m.category || 'Sin categoría';
      opexMap.set(cat, round2((opexMap.get(cat) || 0) + amt));
    } else if (bucket === 'non_operating') {
      if (isTaxCategory(m.category)) impuestos += amt;
      else if (isFinanceCategory(m.category)) gastosFinancieros += amt;
      else otherNonOp += amt;
    } else {
      opex += amt;
    }
  }

  // Otros non-op sin clasificar → gastos financieros (no inventar impuesto)
  gastosFinancieros += otherNonOp;

  const margenBruto = ingresos - cogs;
  const ebitda = margenBruto - opex;
  const amortizaciones = 0; // no hay dato de amortización en finanzas
  const ebit = ebitda - amortizaciones;
  const resultadoAntesImpuestos = ebit - gastosFinancieros;
  const resultadoNeto = resultadoAntesImpuestos - impuestos;

  return {
    ingresos: round2(ingresos),
    cogs: round2(cogs),
    margenBruto: round2(margenBruto),
    margenBrutoPct: ingresos > 0 ? round2((margenBruto / ingresos) * 100) : 0,
    opex: round2(opex),
    ebitda: round2(ebitda),
    ebitdaPct: ingresos > 0 ? round2((ebitda / ingresos) * 100) : 0,
    amortizaciones: round2(amortizaciones),
    ebit: round2(ebit),
    gastosFinancieros: round2(gastosFinancieros),
    resultadoAntesImpuestos: round2(resultadoAntesImpuestos),
    impuestos: round2(impuestos),
    resultadoNeto: round2(resultadoNeto),
    margenNetoPct: ingresos > 0 ? round2((resultadoNeto / ingresos) * 100) : 0,
    opexByCategory: [...opexMap.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
  };
}

export function pnlHierarchyRows(lines: PnLLines, extras?: {
  prev?: PnLLines;
  yoy?: PnLLines;
}) {
  const row = (
    concepto: string,
    actual: number,
    kind: 'sum' | 'sub' | 'result' = 'sum',
    prevVal?: number,
    yoyVal?: number,
  ) => {
    const prev = prevVal ?? null;
    const yoy = yoyVal ?? null;
    const varPct = prev != null && prev !== 0
      ? round2(((actual - prev) / Math.abs(prev)) * 100)
      : null;
    return {
      Concepto: concepto,
      Actual: actual,
      MesAnterior: prev ?? '',
      AnoAnterior: yoy ?? '',
      VarPct: varPct ?? '',
      Tipo: kind,
    };
  };

  const p = extras?.prev;
  const y = extras?.yoy;

  return [
    row('+ Ingresos', lines.ingresos, 'sum', p?.ingresos, y?.ingresos),
    row('− Coste de ventas (COGS)', lines.cogs, 'sub', p?.cogs, y?.cogs),
    row('= Margen bruto', lines.margenBruto, 'result', p?.margenBruto, y?.margenBruto),
    row('− Gastos operativos', lines.opex, 'sub', p?.opex, y?.opex),
    row('= EBITDA', lines.ebitda, 'result', p?.ebitda, y?.ebitda),
    row('− Amortizaciones', lines.amortizaciones, 'sub', p?.amortizaciones, y?.amortizaciones),
    row('= EBIT', lines.ebit, 'result', p?.ebit, y?.ebit),
    row('− Gastos financieros', lines.gastosFinancieros, 'sub', p?.gastosFinancieros, y?.gastosFinancieros),
    row('= Resultado antes de impuestos', lines.resultadoAntesImpuestos, 'result', p?.resultadoAntesImpuestos, y?.resultadoAntesImpuestos),
    row('− Impuestos', lines.impuestos, 'sub', p?.impuestos, y?.impuestos),
    row('= Resultado neto', lines.resultadoNeto, 'result', p?.resultadoNeto, y?.resultadoNeto),
  ];
}

export function filterMovementsByDate(
  movements: FinanceMovementRecord[],
  from: string,
  to: string,
  centerId?: string,
) {
  return movements.filter((m) => {
    const d = String(m.date || '').slice(0, 10);
    if (!d || d < from || d > to) return false;
    if (!centerId) return true;
    return m.pointOfSaleId === centerId || m.workCenterId === centerId;
  });
}
