/**
 * Core — Excel de cierre de caja (layout Uriel), hojas según Facturación marcas.
 *
 * Plantilla por hoja (genérica, sin hardcode de marcas):
 *   DIA | EFECTIVO | VISA | B | JUST EAT | UBER | GLOVVO | APP | TOTAL | [uds]
 *
 * + pestaña COMPARATIVA: un día por fila con el TOTAL € y unidades de cada hoja
 *   (p. ej. Modomio + Black Burger juntos para comparar).
 *
 * Dinero por hoja: se reparte según unidades configuradas en Facturación.
 * VISA = tarjeta local. B = Bizum + otro. APP = Flipdish + app propia.
 *
 * Sin config → fallback histórico MODOMIO / BLACK BURGER / TACOS.
 * Acceso: CEO / Admin (canDownloadUrielCajaExcel).
 */
import * as XLSX from 'xlsx';
import type { BrandBillingSheet } from './brandBillingConfig';
import { sheetMoneyShares, type UnitCounts } from './brandBillingConfig';
import type { TpvRegisterSession } from './deliveryApi';
import { localCalendarDayKey } from './tpvCajaScope';
import { userOwnsAnyBusiness } from './workerProfileCompletion';

const URIEL_CAJA_ADMIN_ROLES = new Set(['Admin', 'Administrador', 'Superadmin']);

type UrielCajaAccessUser = {
  user_id?: string;
  accountType?: string | null;
  invitedBy?: string | null;
  role?: string | null;
};

function isWorkerLikeAccount(user?: UrielCajaAccessUser | null): boolean {
  if (!user) return false;
  return user.accountType === 'user' || Boolean(String(user.invitedBy || '').trim());
}

export function canDownloadUrielCajaExcel(
  user?: UrielCajaAccessUser | null,
  businesses?: ReadonlyArray<{ owner_user_id?: string | null }> | null,
): boolean {
  if (!user) return false;
  if (!isWorkerLikeAccount(user)) return true;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return true;
  return URIEL_CAJA_ADMIN_ROLES.has(String(user.role || '').trim());
}

const MONTH_NAMES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;

const VERTIAL_CHANNELS = ['flipdish', 'app'] as const;

/** @deprecated Preferir hojas desde BrandBillingConfig. */
export type UrielBrandId = 'modomio' | 'blackburger' | 'tacos';

/** Cabeceras de dinero — misma plantilla que el Excel manual Uriel (foto). */
export const URIEL_CAJA_MONEY_HEADERS = [
  'DIA',
  'EFECTIVO',
  'VISA',
  'B',
  'JUST EAT',
  'UBER',
  'GLOVVO',
  'APP',
  'TOTAL',
] as const;

export const URIEL_MODOMIO_HEADERS = [
  ...URIEL_CAJA_MONEY_HEADERS,
  'TOTAL PIZZA',
] as const;

export const URIEL_BLACKBURGER_HEADERS = [
  ...URIEL_CAJA_MONEY_HEADERS,
  'TOTAL BURGUER',
] as const;

/** @deprecated Alias histórico. */
export const URIEL_CAJA_HEADERS = URIEL_MODOMIO_HEADERS;

/** Fallback si la empresa aún no configuró Facturación: 1 hoja por familia, sin mezclar tacos en burger. */
export const LEGACY_URIEL_BILLING_SHEETS: BrandBillingSheet[] = [
  {
    id: 'modomio',
    label: 'MODOMIO',
    brandIds: [],
    unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
  },
  {
    id: 'blackburger',
    label: 'BLACK BURGER',
    brandIds: [],
    unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
  },
  {
    id: 'tacos',
    label: 'TACOS',
    brandIds: [],
    unitColumns: [{ key: 'taco', header: 'TOTAL TACOS' }],
  },
];

export type UrielCajaDayAmounts = {
  day: number;
  efectivo: number;
  tpv: number;
  x: number;
  app: number;
  uber: number;
  justEat: number;
  glovo: number;
  total: number;
  totalPizza: number;
  totalBurger: number;
  totalTaco: number;
  visa: number;
  vertial: number;
  totalPizzas: number;
};

export type UrielCajaMonthSheet = {
  year: number;
  month: number;
  monthLabel: string;
  daysInMonth: number;
  rows: UrielCajaDayAmounts[];
  monthTotal: number;
  monthTotalPizzas: number;
  monthTotalBurgers: number;
  monthTotalTacos: number;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sessionDayKey(session: TpvRegisterSession): string {
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

function withAliases(row: Omit<UrielCajaDayAmounts, 'visa' | 'vertial' | 'totalPizzas'>): UrielCajaDayAmounts {
  return {
    ...row,
    visa: row.tpv,
    vertial: row.app,
    totalPizzas: row.totalPizza,
  };
}

function countsFromAmounts(amounts: Pick<UrielCajaDayAmounts, 'totalPizza' | 'totalBurger' | 'totalTaco'>): UnitCounts {
  return {
    pizza: amounts.totalPizza,
    burger: amounts.totalBurger,
    taco: amounts.totalTaco,
  };
}

export function sessionToUrielAmounts(session: TpvRegisterSession): Omit<UrielCajaDayAmounts, 'day'> {
  const method = session.summary?.salesByMethod || {
    efectivo: 0,
    tarjeta: 0,
    bizum: 0,
    online: 0,
    otro: 0,
  };
  const efectivo = round2(Number(method.efectivo || 0));
  const tpv = round2(Number(method.tarjeta || 0));
  /** Columna B de la plantilla Uriel: Bizum + otros pagos locales. */
  const b = round2(Number(method.bizum || 0) + Number(method.otro || 0));
  const justEat = channelTotal(session, 'justeat');
  const uber = channelTotal(session, 'ubereats');
  const glovo = channelTotal(session, 'glovo');
  let app = 0;
  for (const ch of VERTIAL_CHANNELS) {
    app += channelTotal(session, ch);
  }
  app = round2(app);
  const total = round2(efectivo + tpv + b + app + uber + justEat + glovo);
  const totalPizza = Math.max(0, Math.floor(Number(session.productClosingCounts?.pizza || 0)));
  const totalBurger = Math.max(0, Math.floor(Number(session.productClosingCounts?.burger || 0)));
  const totalTaco = Math.max(0, Math.floor(Number(session.productClosingCounts?.taco || 0)));
  return withAliases({
    efectivo,
    tpv,
    x: b,
    app,
    uber,
    justEat,
    glovo,
    total,
    totalPizza,
    totalBurger,
    totalTaco,
  });
}

/** @deprecated Usar sheetMoneyShares + LEGACY_URIEL_BILLING_SHEETS. */
export function brandMoneyShares(pizza: number, burger: number, taco: number): {
  modomio: number;
  blackburger: number;
} {
  const shares = sheetMoneyShares(
    { pizza, burger, taco },
    LEGACY_URIEL_BILLING_SHEETS,
  );
  return {
    modomio: shares.modomio ?? 0,
    blackburger: shares.blackburger ?? 0,
  };
}

export function splitUrielAmountsByBillingSheet(
  amounts: Omit<UrielCajaDayAmounts, 'day'>,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
): Omit<UrielCajaDayAmounts, 'day'> {
  const shares = sheetMoneyShares(countsFromAmounts(amounts), allSheets);
  const share = shares[billingSheet.id] ?? 0;
  const scale = (n: number) => round2(n * share);
  const keys = new Set(billingSheet.unitColumns.map((c) => c.key));
  return withAliases({
    efectivo: scale(amounts.efectivo),
    tpv: scale(amounts.tpv),
    x: scale(amounts.x),
    app: scale(amounts.app),
    uber: scale(amounts.uber),
    justEat: scale(amounts.justEat),
    glovo: scale(amounts.glovo),
    total: round2(
      scale(amounts.efectivo)
      + scale(amounts.tpv)
      + scale(amounts.x)
      + scale(amounts.app)
      + scale(amounts.uber)
      + scale(amounts.justEat)
      + scale(amounts.glovo),
    ),
    totalPizza: keys.has('pizza') ? amounts.totalPizza : 0,
    totalBurger: keys.has('burger') ? amounts.totalBurger : 0,
    totalTaco: keys.has('taco') ? amounts.totalTaco : 0,
  });
}

export function splitUrielAmountsByBrand(
  amounts: Omit<UrielCajaDayAmounts, 'day'>,
  brand: UrielBrandId,
): Omit<UrielCajaDayAmounts, 'day'> {
  const billingSheet = LEGACY_URIEL_BILLING_SHEETS.find((s) => s.id === brand)
    || LEGACY_URIEL_BILLING_SHEETS[0];
  return splitUrielAmountsByBillingSheet(amounts, billingSheet, LEGACY_URIEL_BILLING_SHEETS);
}

function emptyDay(day: number): UrielCajaDayAmounts {
  return withAliases({
    day,
    efectivo: 0,
    tpv: 0,
    x: 0,
    app: 0,
    uber: 0,
    justEat: 0,
    glovo: 0,
    total: 0,
    totalPizza: 0,
    totalBurger: 0,
    totalTaco: 0,
  });
}

function addAmounts(a: UrielCajaDayAmounts, b: Omit<UrielCajaDayAmounts, 'day'>): UrielCajaDayAmounts {
  return withAliases({
    day: a.day,
    efectivo: round2(a.efectivo + b.efectivo),
    tpv: round2(a.tpv + b.tpv),
    x: round2(a.x + b.x),
    app: round2(a.app + b.app),
    uber: round2(a.uber + b.uber),
    justEat: round2(a.justEat + b.justEat),
    glovo: round2(a.glovo + b.glovo),
    total: round2(a.total + b.total),
    totalPizza: a.totalPizza + b.totalPizza,
    totalBurger: a.totalBurger + b.totalBurger,
    totalTaco: a.totalTaco + b.totalTaco,
  });
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
  let monthTotalBurgers = 0;
  let monthTotalTacos = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const row = byDay.get(d) || emptyDay(d);
    rows.push(row);
    monthTotal = round2(monthTotal + row.total);
    monthTotalPizzas += row.totalPizza;
    monthTotalBurgers += row.totalBurger;
    monthTotalTacos += row.totalTaco;
  }

  return {
    year,
    month,
    monthLabel: `${MONTH_NAMES_ES[month - 1]} ${year}`,
    daysInMonth,
    rows,
    monthTotal,
    monthTotalPizzas,
    monthTotalBurgers,
    monthTotalTacos,
  };
}

export function buildUrielBrandMonthRows(
  sheet: UrielCajaMonthSheet,
  brand: UrielBrandId,
): UrielCajaDayAmounts[] {
  return sheet.rows.map((row) => {
    const split = splitUrielAmountsByBrand(row, brand);
    return withAliases({ day: row.day, ...split });
  });
}

function cellBlankZero(n: number): number | '' {
  const v = Number(n) || 0;
  return v === 0 ? '' : v;
}

function unitValue(row: UrielCajaDayAmounts, key: string): number {
  if (key === 'pizza') return row.totalPizza;
  if (key === 'burger') return row.totalBurger;
  if (key === 'taco') return row.totalTaco;
  return 0;
}

function billingDayHasActivity(row: UrielCajaDayAmounts, billingSheet: BrandBillingSheet): boolean {
  if (row.total > 0 || row.efectivo > 0 || row.tpv > 0 || row.x > 0 || row.app > 0
    || row.uber > 0 || row.justEat > 0 || row.glovo > 0) {
    return true;
  }
  return billingSheet.unitColumns.some((c) => unitValue(row, c.key) > 0);
}

/** DIA | EFECTIVO | VISA | B | JUST EAT | UBER | GLOVVO | APP | TOTAL */
function moneyRowCells(row: UrielCajaDayAmounts): unknown[] {
  return [
    row.day,
    cellBlankZero(row.efectivo),
    cellBlankZero(row.tpv),
    cellBlankZero(row.x),
    cellBlankZero(row.justEat),
    cellBlankZero(row.uber),
    cellBlankZero(row.glovo),
    cellBlankZero(row.app),
    cellBlankZero(row.total),
  ];
}

export function resolveBillingSheetsForExcel(sheets?: BrandBillingSheet[] | null): BrandBillingSheet[] {
  if (Array.isArray(sheets) && sheets.length > 0) return sheets;
  return LEGACY_URIEL_BILLING_SHEETS;
}

/** AOA de una hoja de facturación (cabecera + días con movimiento). */
export function buildUrielCajaBillingSheetAoa(
  monthSheet: UrielCajaMonthSheet,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
): unknown[][] {
  const allRows = monthSheet.rows.map((row) => {
    const split = splitUrielAmountsByBillingSheet(row, billingSheet, allSheets);
    return withAliases({ day: row.day, ...split });
  });
  const rows = allRows.filter((r) => billingDayHasActivity(r, billingSheet));
  const monthMoney = round2(allRows.reduce((s, r) => s + r.total, 0));
  const headers = [
    ...URIEL_CAJA_MONEY_HEADERS,
    ...billingSheet.unitColumns.map((c) => c.header),
  ];

  const aoa: unknown[][] = [
    [`INGRESOS ${billingSheet.label} · ${monthSheet.monthLabel}`, '', '', '', '', '', '', '', 'TOTAL', monthMoney || ''],
  ];
  for (const col of billingSheet.unitColumns) {
    const monthUnits = allRows.reduce((s, r) => s + unitValue(r, col.key), 0);
    aoa.push(['', '', '', '', '', '', '', '', col.header, monthUnits || '']);
  }
  aoa.push([]);
  aoa.push([...headers]);
  for (const row of rows) {
    aoa.push([
      ...moneyRowCells(row),
      ...billingSheet.unitColumns.map((c) => cellBlankZero(unitValue(row, c.key))),
    ]);
  }
  return aoa;
}

/**
 * Pestaña COMPARATIVA genérica: un día por fila con TOTAL € + unidades
 * de cada hoja de Facturación (p. ej. Modomio y Black Burger juntos).
 */
export function buildUrielCajaComparativaSheetAoa(
  monthSheet: UrielCajaMonthSheet,
  billingSheets?: BrandBillingSheet[] | null,
): unknown[][] {
  const sheets = resolveBillingSheetsForExcel(billingSheets);

  const headers: string[] = ['DIA'];
  for (const sheet of sheets) {
    headers.push(`${sheet.label} TOTAL`);
    for (const col of sheet.unitColumns) {
      headers.push(col.header);
    }
  }
  headers.push('TOTAL DÍA');

  type DaySplit = {
    day: number;
    parts: Array<{ total: number; units: number[] }>;
    dayTotal: number;
  };

  const daySplits: DaySplit[] = monthSheet.rows.map((row) => {
    const parts = sheets.map((billing) => {
      const split = splitUrielAmountsByBillingSheet(row, billing, sheets);
      return {
        total: split.total,
        units: billing.unitColumns.map((c) => unitValue(split, c.key)),
      };
    });
    return {
      day: row.day,
      parts,
      dayTotal: round2(parts.reduce((s, p) => s + p.total, 0)),
    };
  });

  const active = daySplits.filter((d) =>
    d.dayTotal > 0 || d.parts.some((p) => p.total > 0 || p.units.some((u) => u > 0)),
  );

  const monthBySheet = sheets.map((_, idx) =>
    round2(daySplits.reduce((s, d) => s + d.parts[idx].total, 0)),
  );
  const monthUnitsBySheet = sheets.map((sheet, idx) =>
    sheet.unitColumns.map((_, uIdx) =>
      daySplits.reduce((s, d) => s + (d.parts[idx].units[uIdx] || 0), 0),
    ),
  );
  const monthDayTotal = round2(monthBySheet.reduce((s, n) => s + n, 0));

  const aoa: unknown[][] = [
    [`COMPARATIVA · ${monthSheet.monthLabel}`],
    ['Días del mes con TOTAL € y unidades de cada marca/hoja (Facturación).'],
    [],
    headers,
  ];

  for (const d of active) {
    const cells: unknown[] = [d.day];
    for (const part of d.parts) {
      cells.push(cellBlankZero(part.total));
      for (const u of part.units) cells.push(cellBlankZero(u));
    }
    cells.push(cellBlankZero(d.dayTotal));
    aoa.push(cells);
  }

  aoa.push([]);
  const totalRow: unknown[] = ['TOTAL MES'];
  for (let i = 0; i < sheets.length; i += 1) {
    totalRow.push(cellBlankZero(monthBySheet[i]));
    for (const u of monthUnitsBySheet[i]) totalRow.push(cellBlankZero(u));
  }
  totalRow.push(cellBlankZero(monthDayTotal));
  aoa.push(totalRow);

  return aoa;
}

export function buildUrielCajaSheetAoa(
  sheet: UrielCajaMonthSheet,
  brand: UrielBrandId = 'modomio',
): unknown[][] {
  const billingSheet = LEGACY_URIEL_BILLING_SHEETS.find((s) => s.id === brand)
    || LEGACY_URIEL_BILLING_SHEETS[0];
  return buildUrielCajaBillingSheetAoa(sheet, billingSheet, LEGACY_URIEL_BILLING_SHEETS);
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

function sanitizeExcelSheetName(raw: string, used: Set<string>): string {
  let base = String(raw || 'HOJA')
    .replace(/[\\/*?:\[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'HOJA';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${i}`;
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export type DownloadUrielCajaExcelOptions = {
  pointOfSaleId: string;
  pointOfSaleName?: string;
  yearMonth?: string;
  closedSession?: TpvRegisterSession;
  fileName?: string;
  /** Hojas desde Empresa → Marca → Facturación. */
  billingSheets?: BrandBillingSheet[] | null;
};

/**
 * Descarga Excel del mes para un PDV:
 * 1) COMPARATIVA (todas las hojas/marcas juntas, días + uds)
 * 2) Una hoja por cubo de Facturación (plantilla Uriel).
 */
export function downloadUrielCajaClosingsExcel(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions,
): { rows: number; fileName: string; yearMonth: string; sheetNames: string[] } {
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

  const monthSheet = buildUrielCajaMonthSheet(merged, { pointOfSaleId: pdvId, yearMonth });
  if (!monthSheet) {
    throw new Error('Mes inválido para el Excel de cierre');
  }

  const billingSheets = resolveBillingSheetsForExcel(opts.billingSheets);
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const sheetNames: string[] = [];

  const comparativaAoa = buildUrielCajaComparativaSheetAoa(monthSheet, billingSheets);
  const comparativaWs = XLSX.utils.aoa_to_sheet(comparativaAoa);
  const comparativaHeaders = (comparativaAoa.find((r) => r[0] === 'DIA') || []) as string[];
  comparativaWs['!cols'] = comparativaHeaders.map((h) => ({
    wch: Math.min(18, Math.max(10, String(h).length + 2)),
  }));
  const comparativaName = sanitizeExcelSheetName('COMPARATIVA', usedNames);
  sheetNames.push(comparativaName);
  XLSX.utils.book_append_sheet(wb, comparativaWs, comparativaName);

  for (const billing of billingSheets) {
    const aoa = buildUrielCajaBillingSheetAoa(monthSheet, billing, billingSheets);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const headers = [
      ...URIEL_CAJA_MONEY_HEADERS,
      ...billing.unitColumns.map((c) => c.header),
    ];
    ws['!cols'] = headers.map((h) => ({
      wch: Math.min(16, Math.max(10, String(h).length + 2)),
    }));
    const name = sanitizeExcelSheetName(billing.label, usedNames);
    sheetNames.push(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const pdvSlug = sanitizeFilePart(opts.pointOfSaleName || closed?.pointOfSaleName || pdvId);
  const fileName = opts.fileName || `ingresos-${pdvSlug}-${yearMonth}.xlsx`;
  XLSX.writeFile(wb, fileName);

  const activeDays = monthSheet.rows.filter((r) =>
    r.total > 0 || r.totalPizza > 0 || r.totalBurger > 0 || r.totalTaco > 0
    || r.efectivo > 0 || r.tpv > 0 || r.x > 0
    || r.justEat > 0 || r.uber > 0 || r.glovo > 0 || r.app > 0,
  ).length;
  return { rows: activeDays, fileName, yearMonth, sheetNames };
}
