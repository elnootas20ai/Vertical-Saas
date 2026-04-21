import type { FinanceMovementRecord } from './financeTypes';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VatQuarter = 1 | 2 | 3 | 4;

export interface VatEntry {
  movementId: string;
  date: string;
  concept: string;
  reference: string;
  counterparty: string;
  baseAmount: number;
  taxRate: number;
  taxAmount: number;
  type: 'repercutido' | 'soportado';
}

export interface VatQuarterSummary {
  year: number;
  quarter: VatQuarter;
  label: string;
  startDate: string;
  endDate: string;
  repercutido: {
    entries: VatEntry[];
    base: number;
    tax: number;
    byRate: Record<number, { base: number; tax: number }>;
  };
  soportado: {
    entries: VatEntry[];
    base: number;
    tax: number;
    byRate: Record<number, { base: number; tax: number }>;
  };
  netVat: number;
  result: 'a_ingresar' | 'a_devolver' | 'cero';
}

export interface VatBookSummary {
  quarters: VatQuarterSummary[];
  annualRepercutido: number;
  annualSoportado: number;
  annualNet: number;
}

// ── Quarter helpers ───────────────────────────────────────────────────────────

export function getQuarterBounds(year: number, quarter: VatQuarter): { start: string; end: string } {
  const quarters: Record<VatQuarter, { start: string; end: string }> = {
    1: { start: `${year}-01-01`, end: `${year}-03-31` },
    2: { start: `${year}-04-01`, end: `${year}-06-30` },
    3: { start: `${year}-07-01`, end: `${year}-09-30` },
    4: { start: `${year}-10-01`, end: `${year}-12-31` },
  };
  return quarters[quarter];
}

export function dateToQuarter(date: string): { year: number; quarter: VatQuarter } {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const quarter = (Math.ceil(month / 3)) as VatQuarter;
  return { year, quarter };
}

export function getQuarterLabel(quarter: VatQuarter): string {
  return { 1: '1T', 2: '2T', 3: '3T', 4: '4T' }[quarter];
}

// ── Build VAT book from finance movements ─────────────────────────────────────

export function buildVatBook(
  movements: FinanceMovementRecord[],
  year: number,
): VatBookSummary {
  const quarters: VatQuarterSummary[] = ([1, 2, 3, 4] as VatQuarter[]).map((q) => {
    const { start, end } = getQuarterBounds(year, q);
    const inRange = movements.filter((m) => {
      const d = m.date.slice(0, 10);
      return d >= start && d <= end && m.taxRate > 0;
    });

    const repEntries: VatEntry[] = inRange
      .filter((m) => m.type === 'cobro')
      .map((m) => ({
        movementId: m.id,
        date: m.date,
        concept: m.concept,
        reference: m.reference,
        counterparty: m.companyName || '',
        baseAmount: m.amountBase,
        taxRate: m.taxRate,
        taxAmount: m.taxAmount,
        type: 'repercutido' as const,
      }));

    const sopEntries: VatEntry[] = inRange
      .filter((m) => m.type === 'pago')
      .map((m) => ({
        movementId: m.id,
        date: m.date,
        concept: m.concept,
        reference: m.reference,
        counterparty: m.companyName || '',
        baseAmount: m.amountBase,
        taxRate: m.taxRate,
        taxAmount: m.taxAmount,
        type: 'soportado' as const,
      }));

    const repByRate = groupByRate(repEntries);
    const sopByRate = groupByRate(sopEntries);
    const repBase = repEntries.reduce((s, e) => s + e.baseAmount, 0);
    const repTax  = repEntries.reduce((s, e) => s + e.taxAmount, 0);
    const sopBase = sopEntries.reduce((s, e) => s + e.baseAmount, 0);
    const sopTax  = sopEntries.reduce((s, e) => s + e.taxAmount, 0);
    const netVat  = Math.round((repTax - sopTax) * 100) / 100;

    return {
      year,
      quarter: q,
      label: `${getQuarterLabel(q)} ${year}`,
      startDate: start,
      endDate: end,
      repercutido: { entries: repEntries, base: Math.round(repBase * 100) / 100, tax: Math.round(repTax * 100) / 100, byRate: repByRate },
      soportado:   { entries: sopEntries, base: Math.round(sopBase * 100) / 100, tax: Math.round(sopTax * 100) / 100, byRate: sopByRate },
      netVat,
      result: netVat > 0 ? 'a_ingresar' : netVat < 0 ? 'a_devolver' : 'cero',
    };
  });

  const annualRepercutido = quarters.reduce((s, q) => s + q.repercutido.tax, 0);
  const annualSoportado   = quarters.reduce((s, q) => s + q.soportado.tax, 0);
  return {
    quarters,
    annualRepercutido: Math.round(annualRepercutido * 100) / 100,
    annualSoportado:   Math.round(annualSoportado * 100) / 100,
    annualNet:         Math.round((annualRepercutido - annualSoportado) * 100) / 100,
  };
}

function groupByRate(entries: VatEntry[]): Record<number, { base: number; tax: number }> {
  return entries.reduce<Record<number, { base: number; tax: number }>>((acc, e) => {
    if (!acc[e.taxRate]) acc[e.taxRate] = { base: 0, tax: 0 };
    acc[e.taxRate].base += e.baseAmount;
    acc[e.taxRate].tax  += e.taxAmount;
    return acc;
  }, {});
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function buildVatCsv(summary: VatQuarterSummary): string {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [
    `"LIBRO DE IVA - ${summary.label}"`,
    '',
    '"--- IVA REPERCUTIDO (cobros) ---"',
    '"Fecha","Concepto","Referencia","Contraparte","Base","Tipo %","Cuota IVA"',
    ...summary.repercutido.entries.map((e) =>
      [e.date, e.concept, e.reference, e.counterparty, e.baseAmount.toFixed(2), e.taxRate, e.taxAmount.toFixed(2)]
        .map(esc).join(','),
    ),
    esc(`TOTAL REPERCUTIDO`) + `,,,,"${summary.repercutido.base.toFixed(2)}",,` + esc(summary.repercutido.tax.toFixed(2)),
    '',
    '"--- IVA SOPORTADO (pagos) ---"',
    '"Fecha","Concepto","Referencia","Contraparte","Base","Tipo %","Cuota IVA"',
    ...summary.soportado.entries.map((e) =>
      [e.date, e.concept, e.reference, e.counterparty, e.baseAmount.toFixed(2), e.taxRate, e.taxAmount.toFixed(2)]
        .map(esc).join(','),
    ),
    esc(`TOTAL SOPORTADO`) + `,,,,"${summary.soportado.base.toFixed(2)}",,` + esc(summary.soportado.tax.toFixed(2)),
    '',
    `"RESULTADO IVA NETO",,,,,,${esc(summary.netVat.toFixed(2))}`,
    `"ESTADO",,,,,,"${summary.result === 'a_ingresar' ? 'A INGRESAR' : summary.result === 'a_devolver' ? 'A DEVOLVER' : 'CERO'}"`,
  ];
  return lines.join('\n');
}

export function downloadVatCsv(summary: VatQuarterSummary) {
  const csv = buildVatCsv(summary);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libro-iva-${summary.label.replace(' ', '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getAvailableYears(movements: FinanceMovementRecord[]): number[] {
  const years = new Set<number>();
  const current = new Date().getFullYear();
  years.add(current);
  for (const m of movements) {
    const y = parseInt(m.date.slice(0, 4), 10);
    if (y >= 2020 && y <= current + 1) years.add(y);
  }
  return Array.from(years).sort((a, b) => b - a);
}
