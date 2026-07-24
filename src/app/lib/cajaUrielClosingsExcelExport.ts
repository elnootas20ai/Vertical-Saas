/**
 * Core — Excel de cierre de caja en layout Uriel (por PDV / mes).
 *
 * Columnas: Día | EFECTIVO | VISA | JUST EAT | UBER | GLOVO | VERTIAL | TOTAL | TOTAL PIZZAS
 * (sin Bizum / columna "B").
 *
 * Mapeo de importes (modelo mental Uriel):
 * - EFECTIVO / VISA = cobros TPV locales (`summary.salesByMethod.efectivo` / `tarjeta`).
 * - JUST EAT ← `aggregatorClosingTotals.justeat`
 * - UBER ← `aggregatorClosingTotals.ubereats`
 * - GLOVO ← `aggregatorClosingTotals.glovo`
 * - VERTIAL ← canal propio: `aggregatorClosingTotals.flipdish` (editor de cierre)
 *   + `app` si aparece en totals/salesByChannel (app Vertial / online propia).
 *   No se mete Flipdish en las columnas de aggregators externos.
 * - TOTAL = suma de columnas de dinero de la fila.
 * - TOTAL PIZZAS = `productClosingCounts.pizza` (suma de cierres del día).
 *
 * Varios cierres el mismo día → se suman en una sola fila.
 */
import * as XLSX from 'xlsx';
import type { TpvRegisterSession } from './deliveryApi';
import { localCalendarDayKey } from './tpvCajaScope';

const MONTH_NAMES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;

/** Canales que van a la columna VERTIAL (app propia / Flipdish). */
const VERTIAL_CHANNELS = ['flipdish', 'app'] as const;

export const URIEL_CAJA_HEADERS = [
  'Día',
  'EFECTIVO',
  'VISA',
  'JUST EAT',
  'UBER',
  'GLOVO',
  'VERTIAL',
  'TOTAL',
  'TOTAL PIZZAS',
] as const;

export type UrielCajaDayAmounts = {
  day: number;
  efectivo: number;
  visa: number;
  justEat: number;
  uber: number;
  glovo: number;
  vertial: number;
  total: number;
  totalPizzas: number;
};

export type UrielCajaMonthSheet = {
  year: number;
  month: number; // 1–12
  monthLabel: string;
  daysInMonth: number;
  rows: UrielCajaDayAmounts[];
  monthTotal: number;
  monthTotalPizzas: number;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sessionDayKey(session: TpvRegisterSession): string {
  // Día del turno: apertura (turno nocturno que cierra a las 2h sigue en el día de trabajo).
  return fmtDay(session.openedAt) || fmtDay(session.closedAt) || '';
}

function fmtDay(iso: string | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return localCalendarDayKey(d);
}

function channelTotal(session: TpvRegisterSession, channel: string): number {
  const fromAgg = Number(session.aggregatorClosingTotals?.[channel] || 0);
  if (fromAgg > 0) return round2(fromAgg);
  const fromSummary = Number(session.summary?.salesByChannel?.[channel] || 0);
  const fromSession = Number(session.salesByChannel?.[channel] || 0);
  return round2(fromAgg || fromSummary || fromSession);
}

/**
 * Importes de un cierre en columnas Uriel (sin día).
 * EFECTIVO/VISA = solo TPV; plataformas = totals de cierre agregador.
 */
export function sessionToUrielAmounts(session: TpvRegisterSession): Omit<UrielCajaDayAmounts, 'day'> {
  const method = session.summary?.salesByMethod || {
    efectivo: 0,
    tarjeta: 0,
    bizum: 0,
    online: 0,
    otro: 0,
  };
  const efectivo = round2(Number(method.efectivo || 0));
  const visa = round2(Number(method.tarjeta || 0));
  const justEat = channelTotal(session, 'justeat');
  const uber = channelTotal(session, 'ubereats');
  const glovo = channelTotal(session, 'glovo');
  // VERTIAL = Flipdish (cierre) + canal app propia si existe.
  let vertial = 0;
  for (const ch of VERTIAL_CHANNELS) {
    vertial += channelTotal(session, ch);
  }
  vertial = round2(vertial);
  const total = round2(efectivo + visa + justEat + uber + glovo + vertial);
  const totalPizzas = Math.max(0, Math.floor(Number(session.productClosingCounts?.pizza || 0)));
  return { efectivo, visa, justEat, uber, glovo, vertial, total, totalPizzas };
}

function emptyDay(day: number): UrielCajaDayAmounts {
  return {
    day,
    efectivo: 0,
    visa: 0,
    justEat: 0,
    uber: 0,
    glovo: 0,
    vertial: 0,
    total: 0,
    totalPizzas: 0,
  };
}

function addAmounts(a: UrielCajaDayAmounts, b: Omit<UrielCajaDayAmounts, 'day'>): UrielCajaDayAmounts {
  return {
    day: a.day,
    efectivo: round2(a.efectivo + b.efectivo),
    visa: round2(a.visa + b.visa),
    justEat: round2(a.justEat + b.justEat),
    uber: round2(a.uber + b.uber),
    glovo: round2(a.glovo + b.glovo),
    vertial: round2(a.vertial + b.vertial),
    total: round2(a.total + b.total),
    totalPizzas: a.totalPizzas + b.totalPizzas,
  };
}

export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = String(ym || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function yearMonthFromSession(session: TpvRegisterSession): string {
  const day = sessionDayKey(session);
  return day.slice(0, 7);
}

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isClosedSession(session: TpvRegisterSession): boolean {
  return String(session.status || '').toLowerCase() !== 'open';
}

function matchesPdv(session: TpvRegisterSession, pointOfSaleId: string): boolean {
  const want = String(pointOfSaleId || '').trim();
  if (!want) return false;
  return String(session.pointOfSaleId || '').trim() === want;
}

/**
 * Agrupa cierres cerrados del PDV en el mes: una fila por día 1..N (días sin cierre = 0).
 */
export function buildUrielCajaMonthSheet(
  sessions: TpvRegisterSession[],
  opts: { pointOfSaleId: string; yearMonth: string },
): UrielCajaMonthSheet | null {
  const parsed = parseYearMonth(opts.yearMonth);
  if (!parsed) return null;
  const { year, month } = parsed;
  const daysInMonth = daysInCalendarMonth(year, month);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  const byDay = new Map<number, UrielCajaDayAmounts>();
  for (let d = 1; d <= daysInMonth; d += 1) {
    byDay.set(d, emptyDay(d));
  }

  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    if (!matchesPdv(s, opts.pointOfSaleId)) continue;
    const dayKey = sessionDayKey(s);
    if (!dayKey.startsWith(prefix)) continue;
    const dayNum = Number(dayKey.slice(8, 10));
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > daysInMonth) continue;
    const cur = byDay.get(dayNum) || emptyDay(dayNum);
    byDay.set(dayNum, addAmounts(cur, sessionToUrielAmounts(s)));
  }

  const rows: UrielCajaDayAmounts[] = [];
  let monthTotal = 0;
  let monthTotalPizzas = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const row = byDay.get(d) || emptyDay(d);
    rows.push(row);
    monthTotal = round2(monthTotal + row.total);
    monthTotalPizzas += row.totalPizzas;
  }

  return {
    year,
    month,
    monthLabel: `${MONTH_NAMES_ES[month - 1]} ${year}`,
    daysInMonth,
    rows,
    monthTotal,
    monthTotalPizzas,
  };
}

/** Construye la matriz AOA (cabecera mensual + columnas + filas) sin escribir archivo. */
export function buildUrielCajaSheetAoa(sheet: UrielCajaMonthSheet): unknown[][] {
  const aoa: unknown[][] = [
    [sheet.monthLabel, '', '', '', '', '', '', 'TOTAL', sheet.monthTotal],
    ['', '', '', '', '', '', '', 'TOTAL PIZZAS', sheet.monthTotalPizzas],
    [],
    [...URIEL_CAJA_HEADERS],
  ];
  for (const row of sheet.rows) {
    aoa.push([
      row.day,
      row.efectivo,
      row.visa,
      row.justEat,
      row.uber,
      row.glovo,
      row.vertial,
      row.total,
      row.totalPizzas,
    ]);
  }
  return aoa;
}

function sanitizeFilePart(raw: string): string {
  const s = String(raw || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return s || 'pdv';
}

export type DownloadUrielCajaExcelOptions = {
  pointOfSaleId: string;
  pointOfSaleName?: string;
  yearMonth?: string;
  /** Sesión recién cerrada: si no hay yearMonth, se toma de aquí. */
  closedSession?: TpvRegisterSession;
  fileName?: string;
};

/**
 * Descarga Excel Uriel del mes para un PDV.
 * Incluye todos los cierres del mes (sessions) + closedSession si se pasa.
 */
export function downloadUrielCajaClosingsExcel(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions,
): { rows: number; fileName: string; yearMonth: string } {
  const closed = opts.closedSession;
  const yearMonth =
    opts.yearMonth
    || (closed ? yearMonthFromSession(closed) : '')
    || localCalendarDayKey(new Date()).slice(0, 7);

  const pdvId = String(opts.pointOfSaleId || closed?.pointOfSaleId || '').trim();
  if (!pdvId) {
    throw new Error('Falta el PDV para el Excel de cierre');
  }

  const merged = closed
    ? [
        ...sessions.filter((s) => String(s._id || '').trim() !== String(closed._id || '').trim()),
        closed,
      ]
    : sessions;

  const sheet = buildUrielCajaMonthSheet(merged, { pointOfSaleId: pdvId, yearMonth });
  if (!sheet) {
    throw new Error('Mes inválido para el Excel de cierre');
  }

  const aoa = buildUrielCajaSheetAoa(sheet);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = URIEL_CAJA_HEADERS.map((h) => ({
    wch: Math.min(16, Math.max(10, String(h).length + 2)),
  }));
  const sheetName = sheet.monthLabel.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const pdvSlug = sanitizeFilePart(opts.pointOfSaleName || closed?.pointOfSaleName || pdvId);
  const fileName = opts.fileName || `cierre-${pdvSlug}-${yearMonth}.xlsx`;
  XLSX.writeFile(wb, fileName);

  const activeDays = sheet.rows.filter((r) =>
    r.total > 0 || r.totalPizzas > 0 || r.efectivo > 0 || r.visa > 0
    || r.justEat > 0 || r.uber > 0 || r.glovo > 0 || r.vertial > 0,
  ).length;
  return { rows: activeDays, fileName, yearMonth };
}
