/**
 * Core — Excel de cierre de caja (layout Uriel), hojas según Facturación marcas.
 *
 * Orden del libro (mega Excel básico, sin pedidos línea a línea):
 *   1) Hojas marca (plantilla cliente), día a día del alcance · todas las tiendas
 *   2) Una hoja por tienda
 *   3) RESUMEN (totales por mes del alcance)
 *   4) COMPARATIVA (marcas; una hoja por año si el alcance es historial)
 *
 * Alcance (historyRange): all (por defecto) | year | month
 * En mes: columna DIA. En año/historial: columna FECHA (DD/MM/YYYY).
 *
 * Plantilla dinero:
 *   DIA | EFECTIVO | TPV | X | App | UBER | JUST EAT | GLOVO | TOTAL | [uds]
 *
 * Dinero por hoja marca: se reparte según unidades en Facturación.
 * TPV = tarjeta. X = Bizum + otro. App = Flipdish + app propia.
 *
 * Sin config → fallback 2 hojas: MODOMIO (pizza) + BLACK BURGER (burger + tacos).
 * Acceso: CEO / Admin (canDownloadUrielCajaExcel).
 */
import * as XLSX from 'xlsx';
import type { BrandBillingSheet } from './brandBillingConfig';
import {
  coalesceTacoIntoBurgerSheets,
  sheetMoneyShares,
  type UnitCounts,
} from './brandBillingConfig';
import type { TpvRegisterSession } from './deliveryApi';
import { formatDateEs } from './formatDateEs';
import { buildTpvRegisterSummary } from './tpvCajaMath';
import { localCalendarDayKey, sessionWorkDayKey } from './tpvCajaScope';
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
  'TPV',
  'X',
  'App',
  'UBER',
  'JUST EAT',
  'GLOVO',
  'TOTAL',
] as const;

export const URIEL_MODOMIO_HEADERS = [
  ...URIEL_CAJA_MONEY_HEADERS,
  'TOTAL PIZZA',
] as const;

export const URIEL_BLACKBURGER_HEADERS = [
  ...URIEL_CAJA_MONEY_HEADERS,
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** @deprecated Alias histórico. */
export const URIEL_CAJA_HEADERS = URIEL_MODOMIO_HEADERS;

/**
 * Fallback sin Facturación configurada: 2 hojas como el Excel manual.
 * MODOMIO = pizzas · BLACK BURGER = burgers + tacos (misma pestaña).
 */
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
    unitColumns: [
      { key: 'burger', header: 'TOTAL BURGUER' },
      { key: 'taco', header: 'TOTAL TACOS' },
    ],
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

/** Totales de dinero+unidades del mes (para UI portfolio / glance). */
export type CeoCajaChannelMix = {
  efectivo: number;
  tpv: number;
  x: number;
  app: number;
  uber: number;
  justEat: number;
  glovo: number;
  total: number;
  pizza: number;
  burger: number;
  taco: number;
};

export function emptyCeoCajaChannelMix(): CeoCajaChannelMix {
  return {
    efectivo: 0,
    tpv: 0,
    x: 0,
    app: 0,
    uber: 0,
    justEat: 0,
    glovo: 0,
    total: 0,
    pizza: 0,
    burger: 0,
    taco: 0,
  };
}

/** Suma filas día de un month sheet → mix del mes. */
export function ceoCajaMixFromMonthSheet(sheet: UrielCajaMonthSheet | null): CeoCajaChannelMix {
  const mix = emptyCeoCajaChannelMix();
  if (!sheet) return mix;
  for (const row of sheet.rows) {
    mix.efectivo = round2(mix.efectivo + row.efectivo);
    mix.tpv = round2(mix.tpv + row.tpv);
    mix.x = round2(mix.x + row.x);
    mix.app = round2(mix.app + row.app);
    mix.uber = round2(mix.uber + row.uber);
    mix.justEat = round2(mix.justEat + row.justEat);
    mix.glovo = round2(mix.glovo + row.glovo);
    mix.total = round2(mix.total + row.total);
    mix.pizza += row.totalPizza;
    mix.burger += row.totalBurger;
    mix.taco += row.totalTaco;
  }
  return mix;
}

/** Mix del mes desde sesiones cerradas (todas las tiendas del set). */
export function ceoCajaMixFromSessions(
  sessions: TpvRegisterSession[],
  yearMonth: string,
  pointOfSaleId?: string,
): CeoCajaChannelMix {
  const sheet = buildUrielCajaMonthSheet(sessions, { yearMonth, pointOfSaleId });
  return ceoCajaMixFromMonthSheet(sheet);
}

export function addCeoCajaChannelMix(a: CeoCajaChannelMix, b: CeoCajaChannelMix): CeoCajaChannelMix {
  return {
    efectivo: round2(a.efectivo + b.efectivo),
    tpv: round2(a.tpv + b.tpv),
    x: round2(a.x + b.x),
    app: round2(a.app + b.app),
    uber: round2(a.uber + b.uber),
    justEat: round2(a.justEat + b.justEat),
    glovo: round2(a.glovo + b.glovo),
    total: round2(a.total + b.total),
    pizza: a.pizza + b.pizza,
    burger: a.burger + b.burger,
    taco: a.taco + b.taco,
  };
}

/** Últimos N meses con TOTAL (para COMPARATIVA lite). */
export function ceoCajaMonthlyTotals(
  sessions: TpvRegisterSession[],
  monthsBack = 6,
): Array<{ yearMonth: string; label: string; total: number }> {
  const now = new Date();
  const out: Array<{ yearMonth: string; label: string; total: number }> = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mix = ceoCajaMixFromSessions(sessions, yearMonth);
    const label = MONTH_NAMES_ES[d.getMonth()]?.slice(0, 3) || yearMonth;
    out.push({ yearMonth, label, total: mix.total });
  }
  return out;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sessionDayKey(session: TpvRegisterSession): string {
  return sessionWorkDayKey(session) || fmtDay(session.openedAt) || fmtDay(session.closedAt) || '';
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
  let method = session.summary?.salesByMethod;
  const methodTotal = method
    ? Number(method.efectivo || 0)
      + Number(method.tarjeta || 0)
      + Number(method.bizum || 0)
      + Number(method.online || 0)
      + Number(method.otro || 0)
    : 0;
  // Si el resumen guardado viene vacío pero hay movimientos, recalcular (mismo criterio que la UI de Caja).
  if (methodTotal <= 0 && Array.isArray(session.transactions) && session.transactions.length > 0) {
    method = buildTpvRegisterSummary(session).salesByMethod;
  }
  method = method || {
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

function matchesPdv(session: TpvRegisterSession, pointOfSaleId?: string | null): boolean {
  const want = String(pointOfSaleId || '').trim();
  // Sin PDV → todas las tiendas (total marca / empresa).
  if (!want) return true;
  return String(session.pointOfSaleId || '').trim() === want;
}

export function buildUrielCajaMonthSheet(
  sessions: TpvRegisterSession[],
  opts: { pointOfSaleId?: string; yearMonth: string },
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

/** DIA | EFECTIVO | TPV | X | App | UBER | JUST EAT | GLOVO | TOTAL */
function moneyRowCells(row: UrielCajaDayAmounts): unknown[] {
  return [
    row.day,
    cellBlankZero(row.efectivo),
    cellBlankZero(row.tpv),
    cellBlankZero(row.x),
    cellBlankZero(row.app),
    cellBlankZero(row.uber),
    cellBlankZero(row.justEat),
    cellBlankZero(row.glovo),
    cellBlankZero(row.total),
  ];
}

export function resolveBillingSheetsForExcel(sheets?: BrandBillingSheet[] | null): BrandBillingSheet[] {
  if (Array.isArray(sheets) && sheets.length > 0) {
    // Burgers + tacos en la misma hoja (plantilla Uriel), aunque vengan 3 hojas guardadas.
    const merged = coalesceTacoIntoBurgerSheets(sheets);
    const withUnits = merged.filter((s) => (s.unitColumns || []).length > 0);
    if (withUnits.length > 0) return withUnits;
  }
  return LEGACY_URIEL_BILLING_SHEETS;
}

function sumMoneyField(
  rows: UrielCajaDayAmounts[],
  field: keyof Pick<
    UrielCajaDayAmounts,
    'efectivo' | 'tpv' | 'x' | 'app' | 'uber' | 'justEat' | 'glovo' | 'total'
  >,
): number {
  return round2(rows.reduce((s, r) => s + (Number(r[field]) || 0), 0));
}

/** AOA de una hoja de facturación: cabecera + días + fila TOTAL MES. */
export function buildUrielCajaBillingSheetAoa(
  monthSheet: UrielCajaMonthSheet,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
  opts?: { scopeLabel?: string },
): unknown[][] {
  const allRows = monthSheet.rows.map((row) => {
    const split = splitUrielAmountsByBillingSheet(row, billingSheet, allSheets);
    return withAliases({ day: row.day, ...split });
  });
  const rows = allRows.filter((r) => billingDayHasActivity(r, billingSheet));
  const headers = [
    ...URIEL_CAJA_MONEY_HEADERS,
    ...billingSheet.unitColumns.map((c) => c.header),
  ];

  const monthEfectivo = sumMoneyField(allRows, 'efectivo');
  const monthTpv = sumMoneyField(allRows, 'tpv');
  const monthX = sumMoneyField(allRows, 'x');
  const monthApp = sumMoneyField(allRows, 'app');
  const monthUber = sumMoneyField(allRows, 'uber');
  const monthJustEat = sumMoneyField(allRows, 'justEat');
  const monthGlovo = sumMoneyField(allRows, 'glovo');
  const monthMoney = sumMoneyField(allRows, 'total');
  const monthUnits = billingSheet.unitColumns.map((col) =>
    allRows.reduce((s, r) => s + unitValue(r, col.key), 0),
  );

  const scope = String(opts?.scopeLabel || '').trim();
  const title = scope
    ? `INGRESOS ${billingSheet.label} · ${monthSheet.monthLabel} · ${scope}`
    : `INGRESOS ${billingSheet.label} · ${monthSheet.monthLabel}`;

  const aoa: unknown[][] = [
    [title],
    [],
    [...headers],
  ];
  for (const row of rows) {
    aoa.push([
      ...moneyRowCells(row),
      ...billingSheet.unitColumns.map((c) => cellBlankZero(unitValue(row, c.key))),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL MES',
    cellBlankZero(monthEfectivo),
    cellBlankZero(monthTpv),
    cellBlankZero(monthX),
    cellBlankZero(monthApp),
    cellBlankZero(monthUber),
    cellBlankZero(monthJustEat),
    cellBlankZero(monthGlovo),
    cellBlankZero(monthMoney),
    ...monthUnits.map((n) => cellBlankZero(n)),
  ]);
  return aoa;
}

/**
 * Cabeceras hoja por tienda (detalle Vertial, sin partir marcas).
 */
export const URIEL_CAJA_STORE_HEADERS = [
  ...URIEL_CAJA_MONEY_HEADERS,
  'TOTAL PIZZA',
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** Cabeceras RESUMEN (datos básicos por mes). */
export const URIEL_CAJA_RESUMEN_HEADERS = [
  'MES',
  'EFECTIVO',
  'TPV',
  'X',
  'App',
  'UBER',
  'JUST EAT',
  'GLOVO',
  'TOTAL',
  'TOTAL PIZZA',
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** Cabeceras historial (año / todo): FECHA en lugar de DIA. */
export const URIEL_CAJA_HISTORY_MONEY_HEADERS = [
  'FECHA',
  'EFECTIVO',
  'TPV',
  'X',
  'App',
  'UBER',
  'JUST EAT',
  'GLOVO',
  'TOTAL',
] as const;

export const URIEL_CAJA_HISTORY_STORE_HEADERS = [
  ...URIEL_CAJA_HISTORY_MONEY_HEADERS,
  'TOTAL PIZZA',
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** Alcance del mega Excel. Por defecto: todo el historial. */
export type UrielCajaHistoryRange = 'month' | 'year' | 'all';

export function normalizeUrielCajaHistoryRange(raw?: string | null): UrielCajaHistoryRange {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'month' || v === 'mes') return 'month';
  if (v === 'year' || v === 'año' || v === 'ano') return 'year';
  return 'all';
}

export type UrielCajaHistoryDayRow = UrielCajaDayAmounts & { dateKey: string };

function historyMoneyRowCells(row: UrielCajaHistoryDayRow): unknown[] {
  return [
    formatDateEs(row.dateKey),
    cellBlankZero(row.efectivo),
    cellBlankZero(row.tpv),
    cellBlankZero(row.x),
    cellBlankZero(row.app),
    cellBlankZero(row.uber),
    cellBlankZero(row.justEat),
    cellBlankZero(row.glovo),
    cellBlankZero(row.total),
  ];
}

function storeDayHasActivity(row: UrielCajaDayAmounts): boolean {
  return row.total > 0 || row.efectivo > 0 || row.tpv > 0 || row.x > 0 || row.app > 0
    || row.uber > 0 || row.justEat > 0 || row.glovo > 0
    || row.totalPizza > 0 || row.totalBurger > 0 || row.totalTaco > 0;
}

/** AOA detalle tienda: misma plantilla dinero + unidades de las 3 familias. */
export function buildUrielCajaStoreSheetAoa(
  monthSheet: UrielCajaMonthSheet,
  storeLabel: string,
): unknown[][] {
  const rows = monthSheet.rows.filter(storeDayHasActivity);
  const monthEfectivo = sumMoneyField(monthSheet.rows, 'efectivo');
  const monthTpv = sumMoneyField(monthSheet.rows, 'tpv');
  const monthX = sumMoneyField(monthSheet.rows, 'x');
  const monthApp = sumMoneyField(monthSheet.rows, 'app');
  const monthUber = sumMoneyField(monthSheet.rows, 'uber');
  const monthJustEat = sumMoneyField(monthSheet.rows, 'justEat');
  const monthGlovo = sumMoneyField(monthSheet.rows, 'glovo');
  const monthMoney = sumMoneyField(monthSheet.rows, 'total');
  const monthPizza = monthSheet.rows.reduce((s, r) => s + (r.totalPizza || 0), 0);
  const monthBurger = monthSheet.rows.reduce((s, r) => s + (r.totalBurger || 0), 0);
  const monthTaco = monthSheet.rows.reduce((s, r) => s + (r.totalTaco || 0), 0);
  const label = String(storeLabel || 'TIENDA').trim() || 'TIENDA';

  const aoa: unknown[][] = [
    [`INGRESOS · ${label} · ${monthSheet.monthLabel}`],
    [],
    [...URIEL_CAJA_STORE_HEADERS],
  ];
  for (const row of rows) {
    aoa.push([
      ...moneyRowCells(row),
      cellBlankZero(row.totalPizza),
      cellBlankZero(row.totalBurger),
      cellBlankZero(row.totalTaco),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL MES',
    cellBlankZero(monthEfectivo),
    cellBlankZero(monthTpv),
    cellBlankZero(monthX),
    cellBlankZero(monthApp),
    cellBlankZero(monthUber),
    cellBlankZero(monthJustEat),
    cellBlankZero(monthGlovo),
    cellBlankZero(monthMoney),
    cellBlankZero(monthPizza),
    cellBlankZero(monthBurger),
    cellBlankZero(monthTaco),
  ]);
  return aoa;
}

/**
 * RESUMEN anual básico: un mes por fila, canales + unidades (sin partir marcas).
 * Ligero: solo agrega cierres ya cargados, sin pedidos.
 */
export function buildUrielCajaResumenYearSheetAoa(
  sessions: TpvRegisterSession[],
  opts: { year: number; pointOfSaleId?: string },
): unknown[][] {
  const year = Number(opts.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return [['RESUMEN'], ['Año inválido']];
  }

  type MonthAgg = {
    label: string;
    efectivo: number;
    tpv: number;
    x: number;
    app: number;
    uber: number;
    justEat: number;
    glovo: number;
    total: number;
    pizza: number;
    burger: number;
    taco: number;
  };

  const months: MonthAgg[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
    const sheet = buildUrielCajaMonthSheet(sessions, {
      pointOfSaleId: opts.pointOfSaleId,
      yearMonth,
    });
    if (!sheet) continue;
    const agg: MonthAgg = {
      label: MONTH_NAMES_ES[month - 1],
      efectivo: sumMoneyField(sheet.rows, 'efectivo'),
      tpv: sumMoneyField(sheet.rows, 'tpv'),
      x: sumMoneyField(sheet.rows, 'x'),
      app: sumMoneyField(sheet.rows, 'app'),
      uber: sumMoneyField(sheet.rows, 'uber'),
      justEat: sumMoneyField(sheet.rows, 'justEat'),
      glovo: sumMoneyField(sheet.rows, 'glovo'),
      total: sumMoneyField(sheet.rows, 'total'),
      pizza: sheet.rows.reduce((s, r) => s + (r.totalPizza || 0), 0),
      burger: sheet.rows.reduce((s, r) => s + (r.totalBurger || 0), 0),
      taco: sheet.rows.reduce((s, r) => s + (r.totalTaco || 0), 0),
    };
    if (
      agg.total > 0 || agg.efectivo > 0 || agg.tpv > 0 || agg.x > 0 || agg.app > 0
      || agg.uber > 0 || agg.justEat > 0 || agg.glovo > 0
      || agg.pizza > 0 || agg.burger > 0 || agg.taco > 0
    ) {
      months.push(agg);
    }
  }

  const yearTotal = (field: keyof Omit<MonthAgg, 'label'>) =>
    round2(months.reduce((s, m) => s + (Number(m[field]) || 0), 0));

  const aoa: unknown[][] = [
    [`RESUMEN · ${year} · TODAS LAS TIENDAS`],
    ['Datos básicos por mes (canales). Detalle día a día en las hojas de marca y tienda.'],
    [],
    [...URIEL_CAJA_RESUMEN_HEADERS],
  ];
  for (const m of months) {
    aoa.push([
      m.label,
      cellBlankZero(m.efectivo),
      cellBlankZero(m.tpv),
      cellBlankZero(m.x),
      cellBlankZero(m.app),
      cellBlankZero(m.uber),
      cellBlankZero(m.justEat),
      cellBlankZero(m.glovo),
      cellBlankZero(m.total),
      cellBlankZero(m.pizza),
      cellBlankZero(m.burger),
      cellBlankZero(m.taco),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL AÑO',
    cellBlankZero(yearTotal('efectivo')),
    cellBlankZero(yearTotal('tpv')),
    cellBlankZero(yearTotal('x')),
    cellBlankZero(yearTotal('app')),
    cellBlankZero(yearTotal('uber')),
    cellBlankZero(yearTotal('justEat')),
    cellBlankZero(yearTotal('glovo')),
    cellBlankZero(yearTotal('total')),
    cellBlankZero(yearTotal('pizza')),
    cellBlankZero(yearTotal('burger')),
    cellBlankZero(yearTotal('taco')),
  ]);
  return aoa;
}

/** Meses YYYY-MM incluidos según alcance (all | year | month). */
export function listYearMonthsForHistoryRange(
  sessions: TpvRegisterSession[],
  range: UrielCajaHistoryRange,
  preferredYearMonth: string,
): string[] {
  const months = new Set<string>();
  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    const ym = sessionDayKey(s).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) months.add(ym);
  }
  const preferred = resolveUrielCajaYearMonthWithData(sessions, preferredYearMonth, {});
  const year = preferred.slice(0, 4);
  let list = Array.from(months).sort((a, b) => a.localeCompare(b));
  if (range === 'month') {
    list = list.filter((m) => m === preferred);
  } else if (range === 'year') {
    list = list.filter((m) => m.startsWith(`${year}-`));
  }
  if (list.length === 0 && /^\d{4}-\d{2}$/.test(preferred)) list = [preferred];
  return list;
}

/** Filas día a día del historial (agrega varios cierres del mismo día). */
export function buildUrielCajaHistoryDayRows(
  sessions: TpvRegisterSession[],
  opts: { pointOfSaleId?: string; yearMonths: string[] },
): UrielCajaHistoryDayRow[] {
  const allow = new Set(opts.yearMonths || []);
  const byDay = new Map<string, UrielCajaHistoryDayRow>();
  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    if (!matchesPdv(s, opts.pointOfSaleId)) continue;
    const dateKey = sessionDayKey(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const ym = dateKey.slice(0, 7);
    if (allow.size > 0 && !allow.has(ym)) continue;
    const amounts = sessionToUrielAmounts(s);
    const dayNum = Number(dateKey.slice(8, 10)) || 0;
    const cur = byDay.get(dateKey);
    if (!cur) {
      byDay.set(dateKey, { dateKey, day: dayNum, ...amounts });
    } else {
      const summed = addAmounts(cur, amounts);
      byDay.set(dateKey, { ...summed, dateKey });
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Hoja marca en modo historial (FECHA en lugar de DIA). */
export function buildUrielCajaBillingHistorySheetAoa(
  rowsIn: UrielCajaHistoryDayRow[],
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
  opts?: { scopeLabel?: string; titleSuffix?: string },
): unknown[][] {
  const allRows = rowsIn.map((row) => {
    const split = splitUrielAmountsByBillingSheet(row, billingSheet, allSheets);
    return { dateKey: row.dateKey, ...withAliases({ day: row.day, ...split }) } as UrielCajaHistoryDayRow;
  });
  const rows = allRows.filter((r) => billingDayHasActivity(r, billingSheet));
  const headers = [
    ...URIEL_CAJA_HISTORY_MONEY_HEADERS,
    ...billingSheet.unitColumns.map((c) => c.header),
  ];
  const monthEfectivo = sumMoneyField(allRows, 'efectivo');
  const monthTpv = sumMoneyField(allRows, 'tpv');
  const monthX = sumMoneyField(allRows, 'x');
  const monthApp = sumMoneyField(allRows, 'app');
  const monthUber = sumMoneyField(allRows, 'uber');
  const monthJustEat = sumMoneyField(allRows, 'justEat');
  const monthGlovo = sumMoneyField(allRows, 'glovo');
  const monthMoney = sumMoneyField(allRows, 'total');
  const monthUnits = billingSheet.unitColumns.map((col) =>
    allRows.reduce((s, r) => s + unitValue(r, col.key), 0),
  );
  const scope = String(opts?.scopeLabel || '').trim();
  const suffix = String(opts?.titleSuffix || 'HISTORIAL').trim();
  const title = scope
    ? `INGRESOS ${billingSheet.label} · ${suffix} · ${scope}`
    : `INGRESOS ${billingSheet.label} · ${suffix}`;

  const aoa: unknown[][] = [[title], [], [...headers]];
  for (const row of rows) {
    aoa.push([
      ...historyMoneyRowCells(row),
      ...billingSheet.unitColumns.map((c) => cellBlankZero(unitValue(row, c.key))),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL',
    cellBlankZero(monthEfectivo),
    cellBlankZero(monthTpv),
    cellBlankZero(monthX),
    cellBlankZero(monthApp),
    cellBlankZero(monthUber),
    cellBlankZero(monthJustEat),
    cellBlankZero(monthGlovo),
    cellBlankZero(monthMoney),
    ...monthUnits.map((n) => cellBlankZero(n)),
  ]);
  return aoa;
}

/** Hoja tienda en modo historial. */
export function buildUrielCajaStoreHistorySheetAoa(
  rowsIn: UrielCajaHistoryDayRow[],
  storeLabel: string,
  opts?: { titleSuffix?: string },
): unknown[][] {
  const rows = rowsIn.filter(storeDayHasActivity);
  const monthEfectivo = sumMoneyField(rowsIn, 'efectivo');
  const monthTpv = sumMoneyField(rowsIn, 'tpv');
  const monthX = sumMoneyField(rowsIn, 'x');
  const monthApp = sumMoneyField(rowsIn, 'app');
  const monthUber = sumMoneyField(rowsIn, 'uber');
  const monthJustEat = sumMoneyField(rowsIn, 'justEat');
  const monthGlovo = sumMoneyField(rowsIn, 'glovo');
  const monthMoney = sumMoneyField(rowsIn, 'total');
  const monthPizza = rowsIn.reduce((s, r) => s + (r.totalPizza || 0), 0);
  const monthBurger = rowsIn.reduce((s, r) => s + (r.totalBurger || 0), 0);
  const monthTaco = rowsIn.reduce((s, r) => s + (r.totalTaco || 0), 0);
  const label = String(storeLabel || 'TIENDA').trim() || 'TIENDA';
  const suffix = String(opts?.titleSuffix || 'HISTORIAL').trim();

  const aoa: unknown[][] = [
    [`INGRESOS · ${label} · ${suffix}`],
    [],
    [...URIEL_CAJA_HISTORY_STORE_HEADERS],
  ];
  for (const row of rows) {
    aoa.push([
      ...historyMoneyRowCells(row),
      cellBlankZero(row.totalPizza),
      cellBlankZero(row.totalBurger),
      cellBlankZero(row.totalTaco),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL',
    cellBlankZero(monthEfectivo),
    cellBlankZero(monthTpv),
    cellBlankZero(monthX),
    cellBlankZero(monthApp),
    cellBlankZero(monthUber),
    cellBlankZero(monthJustEat),
    cellBlankZero(monthGlovo),
    cellBlankZero(monthMoney),
    cellBlankZero(monthPizza),
    cellBlankZero(monthBurger),
    cellBlankZero(monthTaco),
  ]);
  return aoa;
}

/** RESUMEN del alcance: una fila por mes (MES = «JULIO 2026»). */
export function buildUrielCajaResumenHistorySheetAoa(
  sessions: TpvRegisterSession[],
  opts: { yearMonths: string[]; pointOfSaleId?: string },
): unknown[][] {
  const yearMonths = [...(opts.yearMonths || [])].sort((a, b) => a.localeCompare(b));
  type MonthAgg = {
    label: string;
    efectivo: number;
    tpv: number;
    x: number;
    app: number;
    uber: number;
    justEat: number;
    glovo: number;
    total: number;
    pizza: number;
    burger: number;
    taco: number;
  };
  const months: MonthAgg[] = [];
  for (const ym of yearMonths) {
    const parsed = parseYearMonth(ym);
    if (!parsed) continue;
    const sheet = buildUrielCajaMonthSheet(sessions, {
      pointOfSaleId: opts.pointOfSaleId,
      yearMonth: ym,
    });
    if (!sheet) continue;
    const agg: MonthAgg = {
      label: `${MONTH_NAMES_ES[parsed.month - 1]} ${parsed.year}`,
      efectivo: sumMoneyField(sheet.rows, 'efectivo'),
      tpv: sumMoneyField(sheet.rows, 'tpv'),
      x: sumMoneyField(sheet.rows, 'x'),
      app: sumMoneyField(sheet.rows, 'app'),
      uber: sumMoneyField(sheet.rows, 'uber'),
      justEat: sumMoneyField(sheet.rows, 'justEat'),
      glovo: sumMoneyField(sheet.rows, 'glovo'),
      total: sumMoneyField(sheet.rows, 'total'),
      pizza: sheet.rows.reduce((s, r) => s + (r.totalPizza || 0), 0),
      burger: sheet.rows.reduce((s, r) => s + (r.totalBurger || 0), 0),
      taco: sheet.rows.reduce((s, r) => s + (r.totalTaco || 0), 0),
    };
    if (
      agg.total > 0 || agg.efectivo > 0 || agg.tpv > 0 || agg.x > 0 || agg.app > 0
      || agg.uber > 0 || agg.justEat > 0 || agg.glovo > 0
      || agg.pizza > 0 || agg.burger > 0 || agg.taco > 0
    ) {
      months.push(agg);
    }
  }
  const yearTotal = (field: keyof Omit<MonthAgg, 'label'>) =>
    round2(months.reduce((s, m) => s + (Number(m[field]) || 0), 0));

  const aoa: unknown[][] = [
    ['RESUMEN · HISTORIAL · TODAS LAS TIENDAS'],
    ['Totales por mes. Detalle día a día en las hojas de marca y tienda.'],
    [],
    [...URIEL_CAJA_RESUMEN_HEADERS],
  ];
  for (const m of months) {
    aoa.push([
      m.label,
      cellBlankZero(m.efectivo),
      cellBlankZero(m.tpv),
      cellBlankZero(m.x),
      cellBlankZero(m.app),
      cellBlankZero(m.uber),
      cellBlankZero(m.justEat),
      cellBlankZero(m.glovo),
      cellBlankZero(m.total),
      cellBlankZero(m.pizza),
      cellBlankZero(m.burger),
      cellBlankZero(m.taco),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL',
    cellBlankZero(yearTotal('efectivo')),
    cellBlankZero(yearTotal('tpv')),
    cellBlankZero(yearTotal('x')),
    cellBlankZero(yearTotal('app')),
    cellBlankZero(yearTotal('uber')),
    cellBlankZero(yearTotal('justEat')),
    cellBlankZero(yearTotal('glovo')),
    cellBlankZero(yearTotal('total')),
    cellBlankZero(yearTotal('pizza')),
    cellBlankZero(yearTotal('burger')),
    cellBlankZero(yearTotal('taco')),
  ]);
  return aoa;
}

/**
 * Pestaña COMPARATIVA: un mes por fila (vista rápida del año).
 * Las hojas de marca siguen con el detalle día a día del mes elegido.
 */
export function buildUrielCajaComparativaYearSheetAoa(
  sessions: TpvRegisterSession[],
  opts: {
    /** Vacío = todas las tiendas. */
    pointOfSaleId?: string;
    year: number;
    billingSheets?: BrandBillingSheet[] | null;
  },
): unknown[][] {
  const sheets = resolveBillingSheetsForExcel(opts.billingSheets);
  const year = Number(opts.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return [['COMPARATIVA'], ['Año inválido']];
  }

  const headers: string[] = ['MES'];
  for (const sheet of sheets) {
    headers.push(`${sheet.label} TOTAL`);
    for (const col of sheet.unitColumns) {
      headers.push(col.header);
    }
  }
  headers.push('TOTAL MES');

  type MonthSplit = {
    month: number;
    label: string;
    parts: Array<{ total: number; units: number[] }>;
    monthTotal: number;
  };

  const monthSplits: MonthSplit[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
    const monthSheet = buildUrielCajaMonthSheet(sessions, {
      pointOfSaleId: opts.pointOfSaleId,
      yearMonth,
    });
    if (!monthSheet) continue;

    const parts = sheets.map((billing) => {
      let total = 0;
      const units = billing.unitColumns.map(() => 0);
      for (const row of monthSheet.rows) {
        const split = splitUrielAmountsByBillingSheet(row, billing, sheets);
        total = round2(total + split.total);
        billing.unitColumns.forEach((col, uIdx) => {
          units[uIdx] += unitValue(split, col.key);
        });
      }
      return { total, units };
    });

    monthSplits.push({
      month,
      label: MONTH_NAMES_ES[month - 1],
      parts,
      monthTotal: round2(parts.reduce((s, p) => s + p.total, 0)),
    });
  }

  const active = monthSplits.filter((m) =>
    m.monthTotal > 0 || m.parts.some((p) => p.total > 0 || p.units.some((u) => u > 0)),
  );

  const yearBySheet = sheets.map((_, idx) =>
    round2(monthSplits.reduce((s, m) => s + m.parts[idx].total, 0)),
  );
  const yearUnitsBySheet = sheets.map((sheet, idx) =>
    sheet.unitColumns.map((_, uIdx) =>
      monthSplits.reduce((s, m) => s + (m.parts[idx].units[uIdx] || 0), 0),
    ),
  );
  const yearTotal = round2(yearBySheet.reduce((s, n) => s + n, 0));

  const scopeTitle = String(opts.pointOfSaleId || '').trim()
    ? ''
    : ' · TODAS LAS TIENDAS';
  const aoa: unknown[][] = [
    [`COMPARATIVA · ${year}${scopeTitle}`],
    ['Resumen por meses (más rápido). El detalle día a día está en las otras hojas.'],
    [],
    headers,
  ];

  for (const m of active) {
    const cells: unknown[] = [m.label];
    for (const part of m.parts) {
      cells.push(cellBlankZero(part.total));
      for (const u of part.units) cells.push(cellBlankZero(u));
    }
    cells.push(cellBlankZero(m.monthTotal));
    aoa.push(cells);
  }

  aoa.push([]);
  const totalRow: unknown[] = ['TOTAL AÑO'];
  for (let i = 0; i < sheets.length; i += 1) {
    totalRow.push(cellBlankZero(yearBySheet[i]));
    for (const u of yearUnitsBySheet[i]) totalRow.push(cellBlankZero(u));
  }
  totalRow.push(cellBlankZero(yearTotal));
  aoa.push(totalRow);

  return aoa;
}

/** Alias: comparativa por meses del año indicado en la hoja. */
export function buildUrielCajaComparativaSheetAoa(
  monthSheet: UrielCajaMonthSheet,
  billingSheets?: BrandBillingSheet[] | null,
  sessions: TpvRegisterSession[] = [],
  pointOfSaleId = '',
): unknown[][] {
  return buildUrielCajaComparativaYearSheetAoa(sessions, {
    pointOfSaleId,
    year: monthSheet.year,
    billingSheets,
  });
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
  /** Opcional: prioriza esa tienda en el orden de hojas detalle. Las marcas suman todas. */
  pointOfSaleId?: string;
  pointOfSaleName?: string;
  /** Nombres de tienda para las hojas detalle. */
  pointsOfSale?: Array<{ id: string; name?: string; workCenterId?: string }>;
  /** Nombre de la empresa que descarga → nombre del archivo .xlsx */
  businessName?: string;
  yearMonth?: string;
  /** Alcance: all (defecto) | year | month. */
  historyRange?: UrielCajaHistoryRange;
  closedSession?: TpvRegisterSession;
  fileName?: string;
  /** Hojas desde Empresa → Marca → Facturación. */
  billingSheets?: BrandBillingSheet[] | null;
};

/** Formatos de descarga del informe de caja. */
export type UrielCajaDownloadFormat = 'excel' | 'google-sheets' | 'csv';

export type UrielCajaWorkbookBuild = {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  rows: number;
  yearMonth: string;
  baseName: string;
  historyRange: UrielCajaHistoryRange;
};

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvFileSafeName(raw: string): string {
  return String(raw || 'hoja')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'hoja';
}

function appendSheetFromAoa(
  workbook: XLSX.WorkBook,
  usedNames: Set<string>,
  sheetNames: string[],
  rawName: string,
  aoa: unknown[][],
  colHeaders: string[],
) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = colHeaders.map((h) => ({
    wch: Math.min(18, Math.max(10, String(h).length + 2)),
  }));
  const name = sanitizeExcelSheetName(rawName, usedNames);
  sheetNames.push(name);
  XLSX.utils.book_append_sheet(workbook, ws, name);
}

function buildPdvAliasMaps(opts: DownloadUrielCajaExcelOptions): {
  allowedIds: Set<string> | null;
  canonicalByAlias: Map<string, string>;
  nameById: Map<string, string>;
} {
  const nameById = new Map<string, string>();
  const canonicalByAlias = new Map<string, string>();
  for (const p of opts.pointsOfSale || []) {
    const id = String(p.id || '').trim();
    if (!id) continue;
    nameById.set(id, String(p.name || id).trim() || id);
    canonicalByAlias.set(id, id);
    const wc = String(p.workCenterId || '').trim();
    if (wc) canonicalByAlias.set(wc, id);
  }
  const focus = String(opts.pointOfSaleId || opts.closedSession?.pointOfSaleId || '').trim();
  if (focus && opts.pointOfSaleName) {
    nameById.set(focus, String(opts.pointOfSaleName).trim() || focus);
    canonicalByAlias.set(focus, focus);
  }
  const allowedIds = canonicalByAlias.size > 0 ? new Set(canonicalByAlias.keys()) : null;
  return { allowedIds, canonicalByAlias, nameById };
}

function listStoreSheetsForMonth(
  sessions: TpvRegisterSession[],
  yearMonth: string,
  opts: DownloadUrielCajaExcelOptions,
): Array<{ id: string; name: string }> {
  const prefix = String(yearMonth || '').trim();
  const { allowedIds, canonicalByAlias, nameById } = buildPdvAliasMaps(opts);
  const focus = String(opts.pointOfSaleId || opts.closedSession?.pointOfSaleId || '').trim();

  const ids = new Set<string>();
  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    const dayKey = sessionDayKey(s);
    if (!dayKey.startsWith(prefix)) continue;
    const rawId = String(s.pointOfSaleId || '').trim();
    if (!rawId) continue;
    if (allowedIds && !allowedIds.has(rawId)) continue;
    const id = canonicalByAlias.get(rawId) || rawId;
    ids.add(id);
    if (!nameById.has(id)) {
      nameById.set(id, String(s.pointOfSaleName || id).trim() || id);
    }
  }

  const ordered = Array.from(ids);
  ordered.sort((a, b) => {
    if (a === focus) return -1;
    if (b === focus) return 1;
    return String(nameById.get(a) || a).localeCompare(String(nameById.get(b) || b), 'es');
  });
  return ordered.map((id) => ({ id, name: nameById.get(id) || id }));
}

/** Solo sesiones de la empresa / PDVs conocidos (evita mezclar negocios del mismo dueño). */
function filterSessionsForExcelExport(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions,
): TpvRegisterSession[] {
  const { allowedIds } = buildPdvAliasMaps(opts);
  if (!allowedIds || allowedIds.size === 0) return sessions;
  return sessions.filter((s) => {
    const pdvId = String(s.pointOfSaleId || '').trim();
    return !pdvId || allowedIds.has(pdvId);
  });
}

/** Unifica PDV id y workCenterId al id canónico del PDV. */
function canonicalizeSessionPointOfSaleIds(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions,
): TpvRegisterSession[] {
  const { canonicalByAlias } = buildPdvAliasMaps(opts);
  if (canonicalByAlias.size === 0) return sessions;
  return sessions.map((s) => {
    const raw = String(s.pointOfSaleId || '').trim();
    const canon = canonicalByAlias.get(raw);
    if (!canon || canon === raw) return s;
    return { ...s, pointOfSaleId: canon };
  });
}

/** Si el mes elegido no tiene cierres, usa el mes más reciente con datos. */
export function resolveUrielCajaYearMonthWithData(
  sessions: TpvRegisterSession[],
  preferredYearMonth: string,
  opts: DownloadUrielCajaExcelOptions = {},
): string {
  const preferred = String(preferredYearMonth || '').trim();
  const scoped = filterSessionsForExcelExport(sessions, opts);
  if (preferred) {
    const sheet = buildUrielCajaMonthSheet(scoped, { yearMonth: preferred });
    if (sheet && sheet.rows.some(storeDayHasActivity)) return preferred;
  }
  const months = new Set<string>();
  for (const s of scoped) {
    if (!isClosedSession(s)) continue;
    const ym = sessionDayKey(s).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) months.add(ym);
  }
  const sorted = Array.from(months).sort((a, b) => b.localeCompare(a));
  for (const ym of sorted) {
    const sheet = buildUrielCajaMonthSheet(scoped, { yearMonth: ym });
    if (sheet && sheet.rows.some(storeDayHasActivity)) return ym;
  }
  return preferred || localCalendarDayKey(new Date()).slice(0, 7);
}

function listStoreSheetsForHistory(
  sessions: TpvRegisterSession[],
  yearMonths: string[],
  opts: DownloadUrielCajaExcelOptions,
): Array<{ id: string; name: string }> {
  const allow = new Set(yearMonths);
  const { allowedIds, canonicalByAlias, nameById } = buildPdvAliasMaps(opts);
  const focus = String(opts.pointOfSaleId || opts.closedSession?.pointOfSaleId || '').trim();
  const ids = new Set<string>();
  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    const dayKey = sessionDayKey(s);
    const ym = dayKey.slice(0, 7);
    if (allow.size > 0 && !allow.has(ym)) continue;
    const rawId = String(s.pointOfSaleId || '').trim();
    if (!rawId) continue;
    if (allowedIds && !allowedIds.has(rawId)) continue;
    const id = canonicalByAlias.get(rawId) || rawId;
    ids.add(id);
    if (!nameById.has(id)) {
      nameById.set(id, String(s.pointOfSaleName || id).trim() || id);
    }
  }
  const ordered = Array.from(ids);
  ordered.sort((a, b) => {
    if (a === focus) return -1;
    if (b === focus) return 1;
    return String(nameById.get(a) || a).localeCompare(String(nameById.get(b) || b), 'es');
  });
  return ordered.map((id) => ({ id, name: nameById.get(id) || id }));
}

/**
 * Mega Excel básico (sin descargar).
 * historyRange all (defecto) | year | month.
 */
export function buildUrielCajaClosingsWorkbook(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions,
): UrielCajaWorkbookBuild {
  const closed = opts.closedSession;
  const historyRange = normalizeUrielCajaHistoryRange(opts.historyRange);
  const scopedSessions = canonicalizeSessionPointOfSaleIds(
    filterSessionsForExcelExport(sessions, opts),
    opts,
  );
  const preferredYearMonth =
    opts.yearMonth
    || (closed ? yearMonthFromSession(closed) : '')
    || localCalendarDayKey(new Date()).slice(0, 7);
  const yearMonth = resolveUrielCajaYearMonthWithData(scopedSessions, preferredYearMonth, opts);
  const yearMonths = listYearMonthsForHistoryRange(scopedSessions, historyRange, yearMonth);

  const merged = closed
    ? [
        ...scopedSessions.filter((s) => String(s._id || '').trim() !== String(closed._id || '').trim()),
        {
          ...closed,
          pointOfSaleId:
            buildPdvAliasMaps(opts).canonicalByAlias.get(String(closed.pointOfSaleId || '').trim())
            || closed.pointOfSaleId,
        },
      ]
    : scopedSessions;

  const billingSheets = resolveBillingSheetsForExcel(opts.billingSheets);
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const sheetNames: string[] = [];

  const useFechaColumns = historyRange !== 'month';
  const titleSuffix = historyRange === 'month'
    ? (parseYearMonth(yearMonth)
      ? `${MONTH_NAMES_ES[(parseYearMonth(yearMonth) as { month: number }).month - 1]} ${(parseYearMonth(yearMonth) as { year: number }).year}`
      : yearMonth)
    : historyRange === 'year'
      ? `AÑO ${yearMonth.slice(0, 4)}`
      : 'HISTORIAL';

  let rows = 0;

  if (useFechaColumns) {
    const companyRows = buildUrielCajaHistoryDayRows(merged, { yearMonths });
    rows = companyRows.filter(storeDayHasActivity).length;
    for (const billing of billingSheets) {
      const aoa = buildUrielCajaBillingHistorySheetAoa(companyRows, billing, billingSheets, {
        scopeLabel: 'TODAS LAS TIENDAS',
        titleSuffix,
      });
      appendSheetFromAoa(
        workbook,
        usedNames,
        sheetNames,
        billing.label,
        aoa,
        [
          ...URIEL_CAJA_HISTORY_MONEY_HEADERS,
          ...billing.unitColumns.map((c) => c.header),
        ],
      );
    }
    const stores = listStoreSheetsForHistory(merged, yearMonths, opts);
    for (const store of stores) {
      const storeRows = buildUrielCajaHistoryDayRows(merged, {
        pointOfSaleId: store.id,
        yearMonths,
      });
      if (!storeRows.some(storeDayHasActivity)) continue;
      const aoa = buildUrielCajaStoreHistorySheetAoa(storeRows, store.name, { titleSuffix });
      appendSheetFromAoa(
        workbook,
        usedNames,
        sheetNames,
        store.name,
        aoa,
        [...URIEL_CAJA_HISTORY_STORE_HEADERS],
      );
    }
  } else {
    const companyMonthSheet = buildUrielCajaMonthSheet(merged, { yearMonth });
    if (!companyMonthSheet) {
      throw new Error('Mes inválido para el Excel de cierre');
    }
    rows = companyMonthSheet.rows.filter(storeDayHasActivity).length;
    for (const billing of billingSheets) {
      const aoa = buildUrielCajaBillingSheetAoa(companyMonthSheet, billing, billingSheets, {
        scopeLabel: 'TODAS LAS TIENDAS',
      });
      appendSheetFromAoa(
        workbook,
        usedNames,
        sheetNames,
        billing.label,
        aoa,
        [
          ...URIEL_CAJA_MONEY_HEADERS,
          ...billing.unitColumns.map((c) => c.header),
        ],
      );
    }
    const stores = listStoreSheetsForMonth(merged, yearMonth, opts);
    for (const store of stores) {
      const storeMonth = buildUrielCajaMonthSheet(merged, {
        pointOfSaleId: store.id,
        yearMonth,
      });
      if (!storeMonth || !storeMonth.rows.some(storeDayHasActivity)) continue;
      const aoa = buildUrielCajaStoreSheetAoa(storeMonth, store.name);
      appendSheetFromAoa(
        workbook,
        usedNames,
        sheetNames,
        store.name,
        aoa,
        [...URIEL_CAJA_STORE_HEADERS],
      );
    }
  }

  const resumenAoa = buildUrielCajaResumenHistorySheetAoa(merged, { yearMonths });
  appendSheetFromAoa(
    workbook,
    usedNames,
    sheetNames,
    'RESUMEN',
    resumenAoa,
    [...URIEL_CAJA_RESUMEN_HEADERS],
  );

  const years = Array.from(new Set(yearMonths.map((ym) => Number(ym.slice(0, 4)))))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  for (const year of years) {
    const comparativaAoa = buildUrielCajaComparativaYearSheetAoa(merged, {
      year,
      billingSheets,
    });
    const comparativaHeaders = (comparativaAoa.find((r) => r[0] === 'MES') || []) as string[];
    const sheetLabel = years.length > 1 ? `COMPARATIVA ${year}` : 'COMPARATIVA';
    appendSheetFromAoa(
      workbook,
      usedNames,
      sheetNames,
      sheetLabel,
      comparativaAoa,
      comparativaHeaders.map(String),
    );
  }

  const rangeSlug = historyRange === 'all'
    ? 'historial'
    : historyRange === 'year'
      ? `ano-${yearMonth.slice(0, 4)}`
      : yearMonth;
  const companySlug = sanitizeFilePart(String(opts.businessName || '').trim());
  const defaultBase = companySlug
    ? `${companySlug}-facturacion-${rangeSlug}`
    : `facturacion-caja-${rangeSlug}`;
  const baseName = String(opts.fileName || defaultBase)
    .replace(/\.xlsx$/i, '')
    .replace(/\.zip$/i, '');

  return { workbook, sheetNames, rows, yearMonth, baseName, historyRange };
}

async function downloadUrielCajaAsCsvZip(built: UrielCajaWorkbookBuild): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set<string>();
  for (const name of built.workbook.SheetNames) {
    const ws = built.workbook.Sheets[name];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws);
    let file = `${csvFileSafeName(name)}.csv`;
    let n = 2;
    while (used.has(file.toLowerCase())) {
      file = `${csvFileSafeName(name)}-${n}.csv`;
      n += 1;
    }
    used.add(file.toLowerCase());
    zip.file(file, csv);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const fileName = `${built.baseName}-csv.zip`;
  triggerBrowserDownload(blob, fileName);
  return fileName;
}

/**
 * Descarga el informe de caja en Excel, CSV (ZIP) o listo para Google Sheets.
 */
export async function downloadUrielCajaClosings(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions & { format?: UrielCajaDownloadFormat },
): Promise<{ rows: number; fileName: string; yearMonth: string; sheetNames: string[]; format: UrielCajaDownloadFormat }> {
  const format: UrielCajaDownloadFormat = opts.format || 'excel';
  const built = buildUrielCajaClosingsWorkbook(sessions, opts);

  if (format === 'csv') {
    const fileName = await downloadUrielCajaAsCsvZip(built);
    return {
      rows: built.rows,
      fileName,
      yearMonth: built.yearMonth,
      sheetNames: built.sheetNames,
      format,
      historyRange: built.historyRange,
    };
  }

  // Excel y Google Sheets: mismo .xlsx (Sheets lo abre al subirlo a Drive).
  const fileName = `${built.baseName}.xlsx`;
  XLSX.writeFile(built.workbook, fileName);
  return {
    rows: built.rows,
    fileName,
    yearMonth: built.yearMonth,
    sheetNames: built.sheetNames,
    format,
    historyRange: built.historyRange,
  };
}

/**
 * Descarga Excel del mes para un PDV (atajo = formato excel).
 */
export function downloadUrielCajaClosingsExcel(
  sessions: TpvRegisterSession[],
  opts: DownloadUrielCajaExcelOptions,
): { rows: number; fileName: string; yearMonth: string; sheetNames: string[] } {
  const built = buildUrielCajaClosingsWorkbook(sessions, opts);
  const fileName = `${built.baseName}.xlsx`;
  XLSX.writeFile(built.workbook, fileName);
  return {
    rows: built.rows,
    fileName,
    yearMonth: built.yearMonth,
    sheetNames: built.sheetNames,
  };
}
