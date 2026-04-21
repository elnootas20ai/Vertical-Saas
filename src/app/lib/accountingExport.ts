import * as XLSX from 'xlsx';
import type { FinanceMovementRecord } from './financeTypes';

// ─── Plan General Contable español ─────────────────────────────────────────
// Mapeo de categorías → cuentas PGC (debe / haber)
interface PgcEntry {
  debit: string;
  debitLabel: string;
  credit: string;
  creditLabel: string;
  taxDebit?: string;
  taxDebitLabel?: string;
  taxCredit?: string;
  taxCreditLabel?: string;
}

const INCOME_PGC: Record<string, PgcEntry> = {
  'Venta vehículo': {
    debit: '430',
    debitLabel: 'Clientes',
    credit: '700',
    creditLabel: 'Ventas de mercaderías',
    taxCredit: '477',
    taxCreditLabel: 'Hacienda Pública, IVA repercutido',
  },
  'Señal / Reserva': {
    debit: '430',
    debitLabel: 'Clientes',
    credit: '438',
    creditLabel: 'Anticipos de clientes',
    taxCredit: '477',
    taxCreditLabel: 'Hacienda Pública, IVA repercutido',
  },
  'Financiación': {
    debit: '430',
    debitLabel: 'Clientes',
    credit: '769',
    creditLabel: 'Otros ingresos financieros',
    taxCredit: '477',
    taxCreditLabel: 'Hacienda Pública, IVA repercutido',
  },
  'Garantía': {
    debit: '430',
    debitLabel: 'Clientes',
    credit: '705',
    creditLabel: 'Prestaciones de servicios',
    taxCredit: '477',
    taxCreditLabel: 'Hacienda Pública, IVA repercutido',
  },
  'Alquiler vehículo': {
    debit: '430',
    debitLabel: 'Clientes',
    credit: '752',
    creditLabel: 'Ingresos por arrendamientos',
    taxCredit: '477',
    taxCreditLabel: 'Hacienda Pública, IVA repercutido',
  },
  'Otros ingresos': {
    debit: '430',
    debitLabel: 'Clientes',
    credit: '759',
    creditLabel: 'Ingresos por servicios diversos',
    taxCredit: '477',
    taxCreditLabel: 'Hacienda Pública, IVA repercutido',
  },
};

const EXPENSE_PGC: Record<string, PgcEntry> = {
  'Compra stock': {
    debit: '600',
    debitLabel: 'Compras de mercaderías',
    credit: '400',
    creditLabel: 'Proveedores',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Reparaciones': {
    debit: '622',
    debitLabel: 'Reparaciones y conservación',
    credit: '400',
    creditLabel: 'Proveedores',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Gestoría / Trámites': {
    debit: '623',
    debitLabel: 'Servicios de profesionales independientes',
    credit: '400',
    creditLabel: 'Proveedores',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Seguros': {
    debit: '625',
    debitLabel: 'Primas de seguros',
    credit: '410',
    creditLabel: 'Acreedores por prestaciones de servicios',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Publicidad': {
    debit: '627',
    debitLabel: 'Publicidad, propaganda y relaciones públicas',
    credit: '400',
    creditLabel: 'Proveedores',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Suministros': {
    debit: '628',
    debitLabel: 'Suministros',
    credit: '410',
    creditLabel: 'Acreedores por prestaciones de servicios',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Alquiler local': {
    debit: '621',
    debitLabel: 'Arrendamientos y cánones',
    credit: '410',
    creditLabel: 'Acreedores por prestaciones de servicios',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Nóminas': {
    debit: '640',
    debitLabel: 'Sueldos y salarios',
    credit: '465',
    creditLabel: 'Remuneraciones pendientes de pago',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
  'Otros gastos': {
    debit: '629',
    debitLabel: 'Otros servicios',
    credit: '410',
    creditLabel: 'Acreedores por prestaciones de servicios',
    taxDebit: '472',
    taxDebitLabel: 'Hacienda Pública, IVA soportado',
  },
};

function getCashAccount(payMethod: string): { account: string; label: string } {
  const method = (payMethod || '').toLowerCase();
  if (method.includes('efectivo')) return { account: '570', label: 'Caja, euros' };
  if (method.includes('tarjeta')) return { account: '572', label: 'Bancos e instituciones de crédito' };
  if (method.includes('bizum') || method.includes('paypal')) return { account: '572', label: 'Bancos e instituciones de crédito' };
  return { account: '572', label: 'Bancos e instituciones de crédito' };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES');
}

function fmtNum(n: number): number {
  return Math.round(n * 100) / 100;
}

interface JournalRow {
  asiento: number;
  fecha: string;
  cuenta: string;
  descripcionCuenta: string;
  concepto: string;
  referencia: string;
  debe: number | '';
  haber: number | '';
  categoria: string;
  tipoMovimiento: string;
}

interface VatRow {
  periodo: string;
  referencia: string;
  concepto: string;
  baseImponible: number;
  tipoIVA: string;
  cuotaIVA: number;
  total: number;
  tipo: 'Repercutido' | 'Soportado';
}

interface SummaryRow {
  categoria: string;
  tipo: string;
  totalBase: number;
  totalIVA: number;
  totalImporte: number;
  numMovimientos: number;
}

function buildJournalRows(movements: FinanceMovementRecord[]): JournalRow[] {
  const rows: JournalRow[] = [];
  let asientoNum = 1;

  for (const mv of movements) {
    const isIncome = mv.type === 'cobro';
    const pgcMap = isIncome ? INCOME_PGC : EXPENSE_PGC;
    const pgc = pgcMap[mv.category];
    const cash = getCashAccount(mv.payMethod);
    const date = fmtDate(mv.date);
    const ref = mv.reference || '';
    const concept = mv.concept || '';
    const base = fmtNum(mv.amountBase);
    const tax = fmtNum(mv.taxAmount);
    const total = fmtNum(mv.totalAmount);

    if (isIncome) {
      // Cobro: DEBE 430/572 Clientes, HABER 700/70x Ventas + HABER 477 IVA repercutido
      if (pgc) {
        // 1. Registro de venta: Debe 430 Clientes / Haber 700 Ventas + 477 IVA
        rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.debit, descripcionCuenta: pgc.debitLabel, concepto: concept, referencia: ref, debe: total, haber: '', categoria: mv.category, tipoMovimiento: 'Cobro' });
        rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.credit, descripcionCuenta: pgc.creditLabel, concepto: concept, referencia: ref, debe: '', haber: base, categoria: mv.category, tipoMovimiento: 'Cobro' });
        if (tax > 0 && pgc.taxCredit) {
          rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.taxCredit, descripcionCuenta: pgc.taxCreditLabel || '', concepto: concept, referencia: ref, debe: '', haber: tax, categoria: mv.category, tipoMovimiento: 'Cobro' });
        }
        asientoNum++;

        // 2. Cobro efectivo: Debe 572/570 Banco / Haber 430 Clientes
        rows.push({ asiento: asientoNum, fecha: date, cuenta: cash.account, descripcionCuenta: cash.label, concepto: `Cobro: ${concept}`, referencia: ref, debe: total, haber: '', categoria: mv.category, tipoMovimiento: 'Cobro' });
        rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.debit, descripcionCuenta: pgc.debitLabel, concepto: `Cobro: ${concept}`, referencia: ref, debe: '', haber: total, categoria: mv.category, tipoMovimiento: 'Cobro' });
        asientoNum++;
      } else {
        // Fallback genérico
        rows.push({ asiento: asientoNum, fecha: date, cuenta: cash.account, descripcionCuenta: cash.label, concepto: concept, referencia: ref, debe: total, haber: '', categoria: mv.category, tipoMovimiento: 'Cobro' });
        rows.push({ asiento: asientoNum, fecha: date, cuenta: '700', descripcionCuenta: 'Ventas de mercaderías', concepto: concept, referencia: ref, debe: '', haber: base, categoria: mv.category, tipoMovimiento: 'Cobro' });
        if (tax > 0) {
          rows.push({ asiento: asientoNum, fecha: date, cuenta: '477', descripcionCuenta: 'H.P. IVA repercutido', concepto: concept, referencia: ref, debe: '', haber: tax, categoria: mv.category, tipoMovimiento: 'Cobro' });
        }
        asientoNum++;
      }
    } else {
      // Pago: DEBE 6xx Gasto + DEBE 472 IVA soportado, HABER 400/410/570/572 Prov/Banco
      if (pgc) {
        rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.debit, descripcionCuenta: pgc.debitLabel, concepto: concept, referencia: ref, debe: base, haber: '', categoria: mv.category, tipoMovimiento: 'Pago' });
        if (tax > 0 && pgc.taxDebit) {
          rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.taxDebit, descripcionCuenta: pgc.taxDebitLabel || '', concepto: concept, referencia: ref, debe: tax, haber: '', categoria: mv.category, tipoMovimiento: 'Pago' });
        }
        rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.credit, descripcionCuenta: pgc.creditLabel, concepto: concept, referencia: ref, debe: '', haber: total, categoria: mv.category, tipoMovimiento: 'Pago' });
        asientoNum++;

        // 2. Pago: Debe 400/410 Proveedor / Haber 572 Banco
        rows.push({ asiento: asientoNum, fecha: date, cuenta: pgc.credit, descripcionCuenta: pgc.creditLabel, concepto: `Pago: ${concept}`, referencia: ref, debe: total, haber: '', categoria: mv.category, tipoMovimiento: 'Pago' });
        rows.push({ asiento: asientoNum, fecha: date, cuenta: cash.account, descripcionCuenta: cash.label, concepto: `Pago: ${concept}`, referencia: ref, debe: '', haber: total, categoria: mv.category, tipoMovimiento: 'Pago' });
        asientoNum++;
      } else {
        rows.push({ asiento: asientoNum, fecha: date, cuenta: '629', descripcionCuenta: 'Otros servicios', concepto: concept, referencia: ref, debe: base, haber: '', categoria: mv.category, tipoMovimiento: 'Pago' });
        if (tax > 0) {
          rows.push({ asiento: asientoNum, fecha: date, cuenta: '472', descripcionCuenta: 'H.P. IVA soportado', concepto: concept, referencia: ref, debe: tax, haber: '', categoria: mv.category, tipoMovimiento: 'Pago' });
        }
        rows.push({ asiento: asientoNum, fecha: date, cuenta: cash.account, descripcionCuenta: cash.label, concepto: concept, referencia: ref, debe: '', haber: total, categoria: mv.category, tipoMovimiento: 'Pago' });
        asientoNum++;
      }
    }
  }

  return rows;
}

function buildVatRows(movements: FinanceMovementRecord[]): VatRow[] {
  return movements
    .filter((mv) => mv.taxAmount > 0)
    .map((mv) => ({
      periodo: mv.date.slice(0, 7).replace('-', '/'),
      referencia: mv.reference || '',
      concepto: mv.concept || '',
      baseImponible: fmtNum(mv.amountBase),
      tipoIVA: `${mv.taxRate}%`,
      cuotaIVA: fmtNum(mv.taxAmount),
      total: fmtNum(mv.totalAmount),
      tipo: (mv.type === 'cobro' ? 'Repercutido' : 'Soportado') as 'Repercutido' | 'Soportado',
    }));
}

function buildSummaryRows(movements: FinanceMovementRecord[]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const mv of movements) {
    const key = `${mv.category}__${mv.type}`;
    const prev = map.get(key) || { categoria: mv.category, tipo: mv.type === 'cobro' ? 'Cobro' : 'Pago', totalBase: 0, totalIVA: 0, totalImporte: 0, numMovimientos: 0 };
    map.set(key, { ...prev, totalBase: fmtNum(prev.totalBase + mv.amountBase), totalIVA: fmtNum(prev.totalIVA + mv.taxAmount), totalImporte: fmtNum(prev.totalImporte + mv.totalAmount), numMovimientos: prev.numMovimientos + 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.categoria.localeCompare(b.categoria));
}

function applyHeaderStyle(ws: XLSX.WorkSheet, range: string) {
  // XLSX doesn't support full styling in the free version, but we set column widths
  void ws;
  void range;
}

export function exportAccountingToExcel(movements: FinanceMovementRecord[], companyName?: string): void {
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Exportación Contable',
    Subject: 'Asientos Libro Diario - PGC España',
    Author: companyName || 'Udar Edge',
    CreatedDate: new Date(),
  };

  // ── Sheet 1: Libro Diario ───────────────────────────────────────────────
  const journalRows = buildJournalRows(movements);
  const journalData = [
    ['Nº Asiento', 'Fecha', 'Cuenta PGC', 'Descripción Cuenta', 'Concepto', 'Referencia', 'Debe (€)', 'Haber (€)', 'Categoría', 'Tipo'],
    ...journalRows.map((r) => [r.asiento, r.fecha, r.cuenta, r.descripcionCuenta, r.concepto, r.referencia, r.debe === '' ? '' : r.debe, r.haber === '' ? '' : r.haber, r.categoria, r.tipoMovimiento]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(journalData);
  ws1['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 36 }, { wch: 40 },
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 10 },
  ];
  applyHeaderStyle(ws1, 'A1:J1');
  XLSX.utils.book_append_sheet(wb, ws1, 'Libro Diario');

  // ── Sheet 2: Registro IVA ───────────────────────────────────────────────
  const vatRows = buildVatRows(movements);
  const vatData = [
    ['Período', 'Referencia', 'Concepto', 'Base Imponible (€)', 'Tipo IVA', 'Cuota IVA (€)', 'Total (€)', 'Tipo IVA'],
    ...vatRows.map((r) => [r.periodo, r.referencia, r.concepto, r.baseImponible, r.tipoIVA, r.cuotaIVA, r.total, r.tipo]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(vatData);
  ws2['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 40 }, { wch: 18 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];

  // Totals
  const vatRepTotal = vatRows.filter((r) => r.tipo === 'Repercutido').reduce((s, r) => s + r.cuotaIVA, 0);
  const vatSopTotal = vatRows.filter((r) => r.tipo === 'Soportado').reduce((s, r) => s + r.cuotaIVA, 0);
  const vatData2: unknown[][] = [
    [],
    ['', '', 'TOTAL IVA REPERCUTIDO', '', '', fmtNum(vatRepTotal)],
    ['', '', 'TOTAL IVA SOPORTADO', '', '', fmtNum(vatSopTotal)],
    ['', '', 'RESULTADO IVA (DIFF)', '', '', fmtNum(vatRepTotal - vatSopTotal)],
  ];
  XLSX.utils.sheet_add_aoa(ws2, vatData2, { origin: -1 });
  XLSX.utils.book_append_sheet(wb, ws2, 'Registro IVA');

  // ── Sheet 3: Resumen por Categoría ─────────────────────────────────────
  const summaryRows = buildSummaryRows(movements);
  const summaryData = [
    ['Categoría', 'Tipo', 'Base Imponible (€)', 'IVA Total (€)', 'Importe Total (€)', 'Nº Movimientos'],
    ...summaryRows.map((r) => [r.categoria, r.tipo, r.totalBase, r.totalIVA, r.totalImporte, r.numMovimientos]),
  ];

  const totalIncome = movements.filter((m) => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
  const totalExpense = movements.filter((m) => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
  const summaryData2: unknown[][] = [
    [],
    ['TOTAL COBROS', '', '', '', fmtNum(totalIncome), movements.filter((m) => m.type === 'cobro').length],
    ['TOTAL PAGOS', '', '', '', fmtNum(totalExpense), movements.filter((m) => m.type === 'pago').length],
    ['RESULTADO NETO', '', '', '', fmtNum(totalIncome - totalExpense), movements.length],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet([...summaryData, ...summaryData2]);
  ws3['!cols'] = [
    { wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Resumen Categorías');

  // ── Sheet 4: Movimientos raw ────────────────────────────────────────────
  const rawData = [
    ['Tipo', 'Concepto', 'Referencia', 'Categoría', 'Método Pago', 'Fecha', 'Base (€)', 'IVA %', 'IVA (€)', 'Total (€)', 'Notas'],
    ...movements.map((m) => [
      m.type === 'cobro' ? 'Cobro' : 'Pago',
      m.concept,
      m.reference,
      m.category,
      m.payMethod,
      fmtDate(m.date),
      fmtNum(m.amountBase),
      m.taxRate,
      fmtNum(m.taxAmount),
      fmtNum(m.totalAmount),
      m.notes,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(rawData);
  ws4['!cols'] = [
    { wch: 8 }, { wch: 40 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Movimientos');

  // ── Download ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `contabilidad-${today}.xlsx`);
}
