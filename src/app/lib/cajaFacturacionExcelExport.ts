/**
 * Core — Excel de cierre de caja (plantilla facturación), hojas según Facturación marcas.
 * El nombre del archivo y los títulos llevan el de la empresa.
 *
 * Orden del libro (hub cliente marca × plaza):
 *   1–4) MM TIANA · BB TIANA · MM BADALONA · BB BDN
 *   5) RESUMEN (totales por mes del alcance)
 *   6+) COMPARATIVA (una hoja por año si el alcance es historial)
 *
 * Alcance (historyRange): all (por defecto) | year | month
 * En mes: columna DIA. En año/historial: columna FECHA (DD/MM/YYYY).
 *
 * Plantilla dinero (foto Excel cliente):
 *   DIA | EFECTIVO | VISA | FLIPDISH | JUST EAT | UBER | GLOVO | TOTAL | [uds]
 *
 * Dinero por hoja marca:
 *   · Integradores (Flipdish/Just Eat/Uber/Glovo) = Caja 2 por marca. Flipdish incluye canal `app`.
 *   · EFECTIVO / VISA = Caja 1 (`closingBrandTpvTotals`). Bizum/otro → EFECTIVO.
 *
 * Sin config → fallback 2 marcas: MODOMIO (pizza) + BLACK BURGER (burger + tacos).
 * Acceso: CEO / Admin (canDownloadCajaExcel).
 */
import * as XLSX from 'xlsx';
import type { BrandBillingSheet } from './brandBillingConfig';
import {
  coalesceTacoIntoBurgerSheets,
  sheetMoneyShares,
  type UnitCounts,
} from './brandBillingConfig';
import type { TpvRegisterSession } from './deliveryApi';
import { brandIdAliases } from './brandLabels';
import { formatDateEs } from './formatDateEs';
import { buildTpvRegisterSummary } from './tpvCajaMath';
import { localCalendarDayKey, sessionWorkDayKey } from './tpvCajaScope';
import { userOwnsAnyBusiness } from './workerProfileCompletion';

const CAJA_ADMIN_ROLES = new Set(['Admin', 'Administrador', 'Superadmin']);

type CajaAccessUser = {
  user_id?: string;
  accountType?: string | null;
  invitedBy?: string | null;
  role?: string | null;
};

function isWorkerLikeAccount(user?: CajaAccessUser | null): boolean {
  if (!user) return false;
  return user.accountType === 'user' || Boolean(String(user.invitedBy || '').trim());
}

export function canDownloadCajaExcel(
  user?: CajaAccessUser | null,
  businesses?: ReadonlyArray<{ owner_user_id?: string | null }> | null,
): boolean {
  if (!user) return false;
  if (!isWorkerLikeAccount(user)) return true;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return true;
  return CAJA_ADMIN_ROLES.has(String(user.role || '').trim());
}

const MONTH_NAMES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;

const VERTIAL_APP_CHANNEL = 'app' as const;
const FLIPDISH_CHANNEL = 'flipdish' as const;

/** @deprecated Preferir hojas desde BrandBillingConfig. */
export type CajaBrandId = 'modomio' | 'blackburger' | 'tacos';

/** Cabeceras de dinero — misma plantilla que el Excel manual original (foto). */
export const CAJA_MONEY_HEADERS = [
  'DIA',
  'EFECTIVO',
  'VISA',
  'FLIPDISH',
  'JUST EAT',
  'UBER',
  'GLOVO',
  'TOTAL',
] as const;

/** Dinero sin columna DIA/FECHA (RESUMEN por mes). */
export const CAJA_MONEY_HEADERS_NO_DAY = [
  'EFECTIVO',
  'VISA',
  'FLIPDISH',
  'JUST EAT',
  'UBER',
  'GLOVO',
  'TOTAL',
] as const;

export const MODOMIO_HEADERS = [
  ...CAJA_MONEY_HEADERS,
  'TOTAL PIZZA',
] as const;

export const BLACKBURGER_HEADERS = [
  ...CAJA_MONEY_HEADERS,
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** @deprecated Alias histórico. */
export const CAJA_HEADERS = MODOMIO_HEADERS;

/**
 * Fallback sin Facturación configurada: 2 hojas como el Excel manual.
 * MODOMIO = pizzas · BLACK BURGER = burgers + tacos (misma pestaña).
 */
export const LEGACY_BILLING_SHEETS: BrandBillingSheet[] = [
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

export type CajaDayAmounts = {
  day: number;
  efectivo: number;
  tpv: number;
  x: number;
  /** App propia Vertial (`app`). */
  vertial: number;
  /** Canal Flipdish. */
  flipdish: number;
  /** @deprecated Suma vertial + flipdish (CEO / compat). */
  app: number;
  uber: number;
  justEat: number;
  glovo: number;
  total: number;
  totalPizza: number;
  totalBurger: number;
  totalTaco: number;
  visa: number;
  totalPizzas: number;
};

export type CajaMonthSheet = {
  year: number;
  month: number;
  monthLabel: string;
  daysInMonth: number;
  rows: CajaDayAmounts[];
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
export function ceoCajaMixFromMonthSheet(sheet: CajaMonthSheet | null): CeoCajaChannelMix {
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
  const sheet = buildCajaMonthSheet(sessions, { yearMonth, pointOfSaleId });
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

function sumClosingBrandTotalsForChannel(session: TpvRegisterSession, channel: string): number {
  const map = session.aggregatorClosingBrandTotals?.[channel];
  if (!map || typeof map !== 'object') return 0;
  let sum = 0;
  for (const v of Object.values(map)) sum += Number(v) || 0;
  return round2(sum);
}

function channelTotal(session: TpvRegisterSession, channel: string): number {
  const fromAgg = Number(session.aggregatorClosingTotals?.[channel] || 0);
  if (fromAgg > 0) return round2(fromAgg);
  const fromBrands = sumClosingBrandTotalsForChannel(session, channel);
  if (fromBrands > 0) return fromBrands;
  const fromSummary = Number(session.summary?.salesByChannel?.[channel] || 0);
  const fromSession = Number(session.salesByChannel?.[channel] || 0);
  return round2(fromAgg || fromSummary || fromSession);
}

function withAliases(row: Omit<CajaDayAmounts, 'visa' | 'app' | 'totalPizzas'>): CajaDayAmounts {
  const vertial = round2(Number(row.vertial) || 0);
  const flipdish = round2(Number(row.flipdish) || 0);
  return {
    ...row,
    vertial,
    flipdish,
    app: round2(vertial + flipdish),
    visa: row.tpv,
    totalPizzas: row.totalPizza,
  };
}

function countsFromAmounts(amounts: Pick<CajaDayAmounts, 'totalPizza' | 'totalBurger' | 'totalTaco'>): UnitCounts {
  return {
    pizza: amounts.totalPizza,
    burger: amounts.totalBurger,
    taco: amounts.totalTaco,
  };
}

/** Suma € declarados en Caja 2 (Glovo/Uber/Just/Flipdish/app) al cierre. */
export function sumSessionAggregatorClosingTotals(session: TpvRegisterSession): number {
  const t = session.aggregatorClosingTotals;
  if (!t || typeof t !== 'object') return 0;
  let sum = 0;
  for (const v of Object.values(t)) sum += Number(v) || 0;
  return round2(sum);
}

/**
 * Total del turno para listados Caja: TPV del día + integradores declarados al cierre.
 * Misma lógica que «Total facturación» del cierre (Caja 1 + Caja 2).
 */
export function sessionCajaListMoney(
  session: TpvRegisterSession,
  dayKey: string,
  tpvSalesForDay: number,
): { tpv: number; apps: number; total: number } {
  const tpv = round2(Number(tpvSalesForDay) || 0);
  const apps = sumSessionAggregatorClosingTotals(session);
  return { tpv, apps, total: round2(tpv + apps) };
}

export function sessionToCajaAmounts(session: TpvRegisterSession): Omit<CajaDayAmounts, 'day'> {
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
  /** Columna B de la plantilla clasica de cierres: Bizum + otros pagos locales. */
  const b = round2(Number(method.bizum || 0) + Number(method.otro || 0));
  const justEat = channelTotal(session, 'justeat');
  const uber = channelTotal(session, 'ubereats');
  const glovo = channelTotal(session, 'glovo');
  const flipdish = channelTotal(session, FLIPDISH_CHANNEL);
  const vertial = channelTotal(session, VERTIAL_APP_CHANNEL);
  const total = round2(efectivo + tpv + b + vertial + flipdish + uber + justEat + glovo);
  const totalPizza = Math.max(0, Math.floor(Number(session.productClosingCounts?.pizza || 0)));
  const totalBurger = Math.max(0, Math.floor(Number(session.productClosingCounts?.burger || 0)));
  const totalTaco = Math.max(0, Math.floor(Number(session.productClosingCounts?.taco || 0)));
  return withAliases({
    efectivo,
    tpv,
    x: b,
    vertial,
    flipdish,
    uber,
    justEat,
    glovo,
    total,
    totalPizza,
    totalBurger,
    totalTaco,
  });
}

/** @deprecated Usar sheetMoneyShares + LEGACY_BILLING_SHEETS. */
export function brandMoneyShares(pizza: number, burger: number, taco: number): {
  modomio: number;
  blackburger: number;
} {
  const shares = sheetMoneyShares(
    { pizza, burger, taco },
    LEGACY_BILLING_SHEETS,
  );
  return {
    modomio: shares.modomio ?? 0,
    blackburger: shares.blackburger ?? 0,
  };
}

export function splitCajaAmountsByBillingSheet(
  amounts: Omit<CajaDayAmounts, 'day'>,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
): Omit<CajaDayAmounts, 'day'> {
  const shares = sheetMoneyShares(countsFromAmounts(amounts), allSheets);
  const share = shares[billingSheet.id] ?? 0;
  const scale = (n: number) => round2(n * share);
  const keys = new Set(billingSheet.unitColumns.map((c) => c.key));
  return withAliases({
    efectivo: scale(amounts.efectivo),
    tpv: scale(amounts.tpv),
    x: scale(amounts.x),
    vertial: scale(amounts.vertial),
    flipdish: scale(amounts.flipdish),
    uber: scale(amounts.uber),
    justEat: scale(amounts.justEat),
    glovo: scale(amounts.glovo),
    total: round2(
      scale(amounts.efectivo)
      + scale(amounts.tpv)
      + scale(amounts.x)
      + scale(amounts.vertial)
      + scale(amounts.flipdish)
      + scale(amounts.uber)
      + scale(amounts.justEat)
      + scale(amounts.glovo),
    ),
    totalPizza: keys.has('pizza') ? amounts.totalPizza : 0,
    totalBurger: keys.has('burger') ? amounts.totalBurger : 0,
    totalTaco: keys.has('taco') ? amounts.totalTaco : 0,
  });
}

export function splitCajaAmountsByBrand(
  amounts: Omit<CajaDayAmounts, 'day'>,
  brand: CajaBrandId,
): Omit<CajaDayAmounts, 'day'> {
  const billingSheet = LEGACY_BILLING_SHEETS.find((s) => s.id === brand)
    || LEGACY_BILLING_SHEETS[0];
  return splitCajaAmountsByBillingSheet(amounts, billingSheet, LEGACY_BILLING_SHEETS);
}

const EXCEL_CHANNEL_GROUPS: Record<'flipdish' | 'uber' | 'justEat' | 'glovo', string[]> = {
  flipdish: [FLIPDISH_CHANNEL, VERTIAL_APP_CHANNEL],
  uber: ['ubereats'],
  justEat: ['justeat'],
  glovo: ['glovo'],
};

function sessionHasDeclaredBrandTotals(session: TpvRegisterSession): boolean {
  const maps = session.aggregatorClosingBrandTotals;
  if (!maps || typeof maps !== 'object') return false;
  for (const perBrand of Object.values(maps)) {
    if (!perBrand || typeof perBrand !== 'object') continue;
    for (const v of Object.values(perBrand)) {
      if (Number(v) > 0) return true;
    }
  }
  return false;
}

function compactExcelName(raw: string): string {
  return foldExcelLabel(raw).replace(/[^a-z0-9]+/g, '');
}

function closingBrandLabel(
  brandId: string,
  labels: Record<string, string> | null | undefined,
): string {
  if (!labels) return '';
  for (const key of brandIdAliases(brandId)) {
    const name = String(labels[key] || '').trim();
    if (name) return name;
  }
  return '';
}

/** Pista de comida desde nombre de marca → hoja con esa columna de uds. */
function foodUnitHintFromBrandName(nameFold: string): 'pizza' | 'burger' | 'taco' | null {
  if (!nameFold) return null;
  if (/taco/.test(nameFold)) return 'taco';
  if (/burger|hamburg|black/.test(nameFold)) return 'burger';
  if (/pizza|modomio|calzone/.test(nameFold)) return 'pizza';
  return null;
}

function sheetIdByFoodUnit(
  unit: 'pizza' | 'burger' | 'taco',
  sheets: BrandBillingSheet[],
): string | null {
  for (const sheet of sheets) {
    const keys = new Set((sheet.unitColumns || []).map((c) => c.key));
    if (keys.has(unit)) return sheet.id;
    // Tacos viven en la hoja burger (legacy BLACK BURGER).
    if (unit === 'taco' && keys.has('burger')) return sheet.id;
  }
  return null;
}

/**
 * Marca del cierre → hoja Excel.
 * 1) closingBrandSheetIds (Total MM → hoja MM, Total BB → hoja BB)
 * 2) brandIds / id / nombre / pista comida
 */
function sheetIdForClosingBrand(
  brandId: string,
  sheets: BrandBillingSheet[],
  labels?: Record<string, string> | null,
  sheetIds?: Record<string, string> | null,
): string | null {
  const aliases = new Set(brandIdAliases(brandId).map((a) => a.toLowerCase()));
  if (aliases.size === 0) return null;
  const sheetIdSet = new Set(sheets.map((s) => String(s.id || '').trim()).filter(Boolean));
  if (sheetIds && typeof sheetIds === 'object') {
    for (const key of brandIdAliases(brandId)) {
      const mapped = String(sheetIds[key] || '').trim();
      if (mapped && sheetIdSet.has(mapped)) return mapped;
    }
    for (const [rawId, rawSheet] of Object.entries(sheetIds)) {
      const mapped = String(rawSheet || '').trim();
      if (!mapped || !sheetIdSet.has(mapped)) continue;
      for (const alias of brandIdAliases(rawId)) {
        if (aliases.has(alias.toLowerCase())) return mapped;
      }
    }
  }
  for (const sheet of sheets) {
    const ids = [
      ...(sheet.brandIds || []),
      sheet.id,
    ].map((id) => String(id || '').trim()).filter(Boolean);
    for (const id of ids) {
      for (const alias of brandIdAliases(id)) {
        if (aliases.has(alias.toLowerCase())) return sheet.id;
      }
    }
  }
  const nameFold = compactExcelName(closingBrandLabel(brandId, labels));
  if (nameFold) {
    for (const sheet of sheets) {
      const sheetFold = compactExcelName(sheet.label || sheet.id);
      if (!sheetFold) continue;
      if (sheetFold === nameFold) return sheet.id;
      // "Modomio Pizza" ↔ hoja MODOMIO
      if (sheetFold.length >= 4 && (nameFold.includes(sheetFold) || sheetFold.includes(nameFold))) {
        return sheet.id;
      }
    }
    const food = foodUnitHintFromBrandName(nameFold);
    if (food) {
      const byFood = sheetIdByFoodUnit(food, sheets);
      if (byFood) return byFood;
    }
  }
  return null;
}

function canMapClosingBrandsToSheets(
  session: TpvRegisterSession,
  sheets: BrandBillingSheet[],
): boolean {
  if (!sessionHasDeclaredBrandTotals(session) || sheets.length === 0) return false;
  const labels = session.closingBrandLabels || {};
  const sheetIds = session.closingBrandSheetIds || {};
  for (const perBrand of Object.values(session.aggregatorClosingBrandTotals || {})) {
    if (!perBrand || typeof perBrand !== 'object') continue;
    for (const [brandId, raw] of Object.entries(perBrand)) {
      if (Number(raw) <= 0) continue;
      if (sheetIdForClosingBrand(brandId, sheets, labels, sheetIds)) return true;
    }
  }
  return false;
}

function brandTotalsForChannels(
  session: TpvRegisterSession,
  channels: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of channels) {
    const map = session.aggregatorClosingBrandTotals?.[ch];
    if (!map || typeof map !== 'object') continue;
    for (const [brandId, raw] of Object.entries(map)) {
      const id = String(brandId || '').trim();
      const amt = round2(raw);
      if (!id || amt <= 0) continue;
      out[id] = round2((out[id] || 0) + amt);
    }
  }
  return out;
}

/**
 * Apps del cierre → hoja de marca.
 * Si pusieron total por marca en Caja 2, eso cuenta (no el reparto por pizzas).
 * Sin declaración por marca → misma proporción de unidades que TPV.
 */
function appsAmountsForBillingSheet(
  session: TpvRegisterSession,
  amounts: Omit<CajaDayAmounts, 'day'>,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
): Pick<CajaDayAmounts, 'flipdish' | 'uber' | 'justEat' | 'glovo'> | null {
  if (!canMapClosingBrandsToSheets(session, allSheets)) {
    return null;
  }
  const labels = session.closingBrandLabels || {};
  const sheetIds = session.closingBrandSheetIds || {};
  const shares = sheetMoneyShares(countsFromAmounts(amounts), allSheets);
  const share = shares[billingSheet.id] ?? 0;
  const out = { flipdish: 0, uber: 0, justEat: 0, glovo: 0 };
  for (const key of ['flipdish', 'uber', 'justEat', 'glovo'] as const) {
    const channels = EXCEL_CHANNEL_GROUPS[key];
    const channelAmt = round2(channels.reduce((s, ch) => s + channelTotal(session, ch), 0));
    const byBrand = brandTotalsForChannels(session, channels);
    const attributed: Record<string, number> = {};
    let attributedSum = 0;
    for (const [brandId, amt] of Object.entries(byBrand)) {
      const sheetId = sheetIdForClosingBrand(brandId, allSheets, labels, sheetIds);
      if (!sheetId) continue;
      attributed[sheetId] = round2((attributed[sheetId] || 0) + amt);
      attributedSum = round2(attributedSum + amt);
    }
    // Solo Total MM/BB del cierre por canal; sin repartir un «total canal» inventado.
    let value = attributed[billingSheet.id] || 0;
    if (attributedSum <= 0 && channelAmt > 0) {
      value = round2(channelAmt * share);
    }
    out[key] = value;
  }
  return out;
}

function sessionHasDeclaredBrandTpvTotals(session: TpvRegisterSession): boolean {
  const map = session.closingBrandTpvTotals;
  if (!map || typeof map !== 'object') return false;
  for (const pay of Object.values(map)) {
    if (!pay || typeof pay !== 'object') continue;
    if (Number(pay.efectivo) > 0 || Number(pay.tarjeta) > 0) return true;
  }
  return false;
}

/**
 * Efectivo/tarjeta/X del cierre → hoja de marca.
 * Fuente: Caja 1 del cierre (`closingBrandTpvTotals`). Sin % de pizzas.
 * Sin declaración → null (solo entonces el caller reparte por uds).
 */
function tpvAmountsForBillingSheet(
  session: TpvRegisterSession,
  amounts: Omit<CajaDayAmounts, 'day'>,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
): Pick<CajaDayAmounts, 'efectivo' | 'tpv' | 'x'> | null {
  if (!sessionHasDeclaredBrandTpvTotals(session) || allSheets.length === 0) return null;
  const labels = session.closingBrandLabels || {};
  const brandSheetMap = session.closingBrandSheetIds || {};
  const attributedEf: Record<string, number> = {};
  const attributedTj: Record<string, number> = {};
  let sumEf = 0;
  let sumTj = 0;
  for (const [brandId, pay] of Object.entries(session.closingBrandTpvTotals || {})) {
    if (!pay || typeof pay !== 'object') continue;
    const ef = round2(pay.efectivo);
    const tj = round2(pay.tarjeta);
    if (ef <= 0 && tj <= 0) continue;
    const sheetId = sheetIdForClosingBrand(brandId, allSheets, labels, brandSheetMap);
    if (!sheetId) continue;
    if (ef > 0) {
      attributedEf[sheetId] = round2((attributedEf[sheetId] || 0) + ef);
      sumEf = round2(sumEf + ef);
    }
    if (tj > 0) {
      attributedTj[sheetId] = round2((attributedTj[sheetId] || 0) + tj);
      sumTj = round2(sumTj + tj);
    }
  }
  if (sumEf <= 0 && sumTj <= 0) return null;

  const efectivo = attributedEf[billingSheet.id] || 0;
  const tpv = attributedTj[billingSheet.id] || 0;
  const brandMoney = round2(efectivo + tpv);
  const declaredBrandMoney = round2(
    allSheets.reduce((s, sheet) => {
      const id = sheet.id;
      return s + (attributedEf[id] || 0) + (attributedTj[id] || 0);
    }, 0),
  );
  const shares = sheetMoneyShares(countsFromAmounts(amounts), allSheets);
  const xShare = declaredBrandMoney > 0
    ? brandMoney / declaredBrandMoney
    : (shares[billingSheet.id] ?? 0);
  const x = round2(amounts.x * xShare);

  return { efectivo: round2(efectivo), tpv: round2(tpv), x };
}

/** Parte un cierre a una hoja: dinero = Caja 1 del cierre; uds = conteo del cierre. */
export function splitSessionCajaAmountsByBillingSheet(
  session: TpvRegisterSession,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
): Omit<CajaDayAmounts, 'day'> {
  const amounts = sessionToCajaAmounts(session);
  const unitSplit = splitCajaAmountsByBillingSheet(amounts, billingSheet, allSheets);
  const tpvBrand = tpvAmountsForBillingSheet(session, amounts, billingSheet, allSheets);
  const apps = appsAmountsForBillingSheet(session, amounts, billingSheet, allSheets);

  // Caja 1 por marca → lo declarado. Cierres viejos sin Caja 1 → % uds (solo Vertial, no apps).
  const efectivo = tpvBrand ? tpvBrand.efectivo : unitSplit.efectivo;
  const tpv = tpvBrand ? tpvBrand.tpv : unitSplit.tpv;
  const x = tpvBrand ? tpvBrand.x : unitSplit.x;

  const flipdish = apps
    ? apps.flipdish
    : round2(unitSplit.flipdish + unitSplit.vertial);
  const uber = apps ? apps.uber : unitSplit.uber;
  const justEat = apps ? apps.justEat : unitSplit.justEat;
  const glovo = apps ? apps.glovo : unitSplit.glovo;
  const total = round2(efectivo + tpv + x + flipdish + uber + justEat + glovo);
  return withAliases({
    efectivo,
    tpv,
    x,
    vertial: 0,
    flipdish,
    uber,
    justEat,
    glovo,
    total,
    totalPizza: unitSplit.totalPizza,
    totalBurger: unitSplit.totalBurger,
    totalTaco: unitSplit.totalTaco,
  });
}

function emptyDay(day: number): CajaDayAmounts {
  return withAliases({
    day,
    efectivo: 0,
    tpv: 0,
    x: 0,
    vertial: 0,
    flipdish: 0,
    uber: 0,
    justEat: 0,
    glovo: 0,
    total: 0,
    totalPizza: 0,
    totalBurger: 0,
    totalTaco: 0,
  });
}

function addAmounts(a: CajaDayAmounts, b: Omit<CajaDayAmounts, 'day'>): CajaDayAmounts {
  return withAliases({
    day: a.day,
    efectivo: round2(a.efectivo + b.efectivo),
    tpv: round2(a.tpv + b.tpv),
    x: round2(a.x + b.x),
    vertial: round2(a.vertial + b.vertial),
    flipdish: round2(a.flipdish + b.flipdish),
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

export function buildCajaMonthSheet(
  sessions: TpvRegisterSession[],
  opts: {
    pointOfSaleId?: string;
    yearMonth: string;
    billingSheet?: BrandBillingSheet;
    allSheets?: BrandBillingSheet[];
  },
): CajaMonthSheet | null {
  const parsed = parseYearMonth(opts.yearMonth);
  if (!parsed) return null;
  const { year, month } = parsed;
  const daysInMonth = daysInCalendarMonth(year, month);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const billingSheet = opts.billingSheet;
  const allSheets = opts.allSheets;

  const byDay = new Map<number, CajaDayAmounts>();
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
    const amounts = billingSheet && allSheets && allSheets.length > 0
      ? splitSessionCajaAmountsByBillingSheet(s, billingSheet, allSheets)
      : sessionToCajaAmounts(s);
    byDay.set(dayNum, addAmounts(cur, amounts));
  }

  const rows: CajaDayAmounts[] = [];
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

export function buildCajaBrandMonthRows(
  sheet: CajaMonthSheet,
  brand: CajaBrandId,
): CajaDayAmounts[] {
  return sheet.rows.map((row) => {
    const split = splitCajaAmountsByBrand(row, brand);
    return withAliases({ day: row.day, ...split });
  });
}

function cellBlankZero(n: number): number | '' {
  const v = Number(n) || 0;
  return v === 0 ? '' : v;
}

/** Prefijo de título con el nombre de la empresa (visible en la 1ª celda de cada hoja). */
function withCompanyTitle(companyName: string | null | undefined, rest: string): string {
  const company = String(companyName || '').trim();
  const body = String(rest || '').trim();
  if (!company) return body;
  if (!body) return company;
  return `${company} · ${body}`;
}

function unitValue(row: CajaDayAmounts, key: string): number {
  if (key === 'pizza') return row.totalPizza;
  if (key === 'burger') return row.totalBurger;
  if (key === 'taco') return row.totalTaco;
  return 0;
}

/** Bizum/otro (x interno) se suma a EFECTIVO en el Excel (sin columna B). */
type CajaMoneyFields = Pick<
  CajaDayAmounts,
  'efectivo' | 'tpv' | 'x' | 'justEat' | 'uber' | 'glovo' | 'vertial' | 'flipdish' | 'total'
>;

function excelEfectivoWithB(amounts: Pick<CajaMoneyFields, 'efectivo' | 'x'>): number {
  return round2((Number(amounts.efectivo) || 0) + (Number(amounts.x) || 0));
}

function sumCajaMoneyFields(rows: CajaDayAmounts[]): CajaMoneyFields {
  return {
    efectivo: sumMoneyField(rows, 'efectivo'),
    tpv: sumMoneyField(rows, 'tpv'),
    x: sumMoneyField(rows, 'x'),
    justEat: sumMoneyField(rows, 'justEat'),
    uber: sumMoneyField(rows, 'uber'),
    glovo: sumMoneyField(rows, 'glovo'),
    vertial: sumMoneyField(rows, 'vertial'),
    flipdish: sumMoneyField(rows, 'flipdish'),
    total: sumMoneyField(rows, 'total'),
  };
}

function excelFlipdishDisplay(amounts: Pick<CajaMoneyFields, 'flipdish' | 'vertial'>): number {
  return round2((Number(amounts.flipdish) || 0) + (Number(amounts.vertial) || 0));
}

function cajaMoneyValueCells(amounts: CajaMoneyFields): unknown[] {
  return [
    cellBlankZero(excelEfectivoWithB(amounts)),
    cellBlankZero(amounts.tpv),
    cellBlankZero(excelFlipdishDisplay(amounts)),
    cellBlankZero(amounts.justEat),
    cellBlankZero(amounts.uber),
    cellBlankZero(amounts.glovo),
    cellBlankZero(amounts.total),
  ];
}

function billingDayHasActivity(row: CajaDayAmounts, billingSheet: BrandBillingSheet): boolean {
  if (row.total > 0 || row.efectivo > 0 || row.tpv > 0 || row.x > 0 || row.app > 0
    || row.uber > 0 || row.justEat > 0 || row.glovo > 0) {
    return true;
  }
  return billingSheet.unitColumns.some((c) => unitValue(row, c.key) > 0);
}

/** DIA | EFECTIVO | VISA | FLIPDISH | JUST EAT | UBER | GLOVO | TOTAL */
function moneyRowCells(row: CajaDayAmounts): unknown[] {
  return [row.day, ...cajaMoneyValueCells(row)];
}

export function resolveBillingSheetsForExcel(sheets?: BrandBillingSheet[] | null): BrandBillingSheet[] {
  if (Array.isArray(sheets) && sheets.length > 0) {
    // Burgers + tacos en la misma hoja (plantilla clasica de cierres), aunque vengan 3 hojas guardadas.
    const merged = coalesceTacoIntoBurgerSheets(sheets);
    const withUnits = merged.filter((s) => (s.unitColumns || []).length > 0);
    if (withUnits.length > 0) return withUnits;
  }
  return LEGACY_BILLING_SHEETS;
}

function sumMoneyField(
  rows: CajaDayAmounts[],
  field: keyof Pick<
    CajaDayAmounts,
    'efectivo' | 'tpv' | 'x' | 'vertial' | 'flipdish' | 'uber' | 'justEat' | 'glovo' | 'total'
  >,
): number {
  return round2(rows.reduce((s, r) => s + (Number(r[field]) || 0), 0));
}

/** AOA de una hoja de facturación: cabecera + días + fila TOTAL MES. */
export function buildCajaBillingSheetAoa(
  monthSheet: CajaMonthSheet,
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
  opts?: { scopeLabel?: string; companyName?: string; alreadySplit?: boolean },
): unknown[][] {
  const allRows = monthSheet.rows.map((row) => {
    const split = opts?.alreadySplit
      ? row
      : splitCajaAmountsByBillingSheet(row, billingSheet, allSheets);
    return withAliases({ day: row.day, ...split });
  });
  const rows = allRows.filter((r) => billingDayHasActivity(r, billingSheet));
  const headers = [
    ...CAJA_MONEY_HEADERS,
    ...billingSheet.unitColumns.map((c) => c.header),
  ];

  const monthMoneyFields = sumCajaMoneyFields(allRows);
  const monthUnits = billingSheet.unitColumns.map((col) =>
    allRows.reduce((s, r) => s + unitValue(r, col.key), 0),
  );

  const scope = String(opts?.scopeLabel || '').trim();
  const title = withCompanyTitle(
    opts?.companyName,
    scope
      ? `INGRESOS ${billingSheet.label} · ${monthSheet.monthLabel} · ${scope}`
      : `INGRESOS ${billingSheet.label} · ${monthSheet.monthLabel}`,
  );

  const aoa: unknown[][] = [
    [title],
    [],
    ...buildCajaMoneyGroupHeaderBlock(headers),
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
    ...cajaMoneyValueCells(monthMoneyFields),
    ...monthUnits.map((n) => cellBlankZero(n)),
  ]);
  return aoa;
}

/**
 * Cabeceras hoja por tienda (detalle Vertial, sin partir marcas).
 */
export const CAJA_STORE_HEADERS = [
  ...CAJA_MONEY_HEADERS,
  'TOTAL PIZZA',
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** Cabeceras RESUMEN (datos básicos por mes). */
export const CAJA_RESUMEN_HEADERS = [
  'MES',
  ...CAJA_MONEY_HEADERS_NO_DAY,
  'TOTAL PIZZAS',
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** Cabeceras historial (año / todo): FECHA en lugar de DIA. */
export const CAJA_HISTORY_MONEY_HEADERS = [
  'FECHA',
  ...CAJA_MONEY_HEADERS_NO_DAY,
] as const;

export const CAJA_HISTORY_STORE_HEADERS = [
  ...CAJA_HISTORY_MONEY_HEADERS,
  'TOTAL PIZZA',
  'TOTAL BURGUER',
  'TOTAL TACOS',
] as const;

/** Alcance del mega Excel. Por defecto: todo el historial. */
export type CajaHistoryRange = 'month' | 'year' | 'all';

export function normalizeCajaHistoryRange(raw?: string | null): CajaHistoryRange {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'month' || v === 'mes') return 'month';
  if (v === 'year' || v === 'año' || v === 'ano') return 'year';
  return 'all';
}

export type CajaHistoryDayRow = CajaDayAmounts & { dateKey: string };

function historyMoneyRowCells(row: CajaHistoryDayRow): unknown[] {
  return [formatDateEs(row.dateKey), ...cajaMoneyValueCells(row)];
}

function storeDayHasActivity(row: CajaDayAmounts): boolean {
  return row.total > 0 || row.efectivo > 0 || row.tpv > 0 || row.x > 0 || row.app > 0
    || row.uber > 0 || row.justEat > 0 || row.glovo > 0
    || row.totalPizza > 0 || row.totalBurger > 0 || row.totalTaco > 0;
}

/** AOA detalle tienda: misma plantilla dinero + unidades de las 3 familias. */
export function buildCajaStoreSheetAoa(
  monthSheet: CajaMonthSheet,
  storeLabel: string,
  opts?: { companyName?: string },
): unknown[][] {
  const rows = monthSheet.rows.filter(storeDayHasActivity);
  const monthMoneyFields = sumCajaMoneyFields(monthSheet.rows);
  const monthPizza = monthSheet.rows.reduce((s, r) => s + (r.totalPizza || 0), 0);
  const monthBurger = monthSheet.rows.reduce((s, r) => s + (r.totalBurger || 0), 0);
  const monthTaco = monthSheet.rows.reduce((s, r) => s + (r.totalTaco || 0), 0);
  const label = String(storeLabel || 'TIENDA').trim() || 'TIENDA';

  const aoa: unknown[][] = [
    [withCompanyTitle(opts?.companyName, `INGRESOS · ${label} · ${monthSheet.monthLabel}`)],
    [],
    ...buildCajaMoneyGroupHeaderBlock([...CAJA_STORE_HEADERS]),
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
    ...cajaMoneyValueCells(monthMoneyFields),
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
export function buildCajaResumenYearSheetAoa(
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
    vertial: number;
    flipdish: number;
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
    const sheet = buildCajaMonthSheet(sessions, {
      pointOfSaleId: opts.pointOfSaleId,
      yearMonth,
    });
    if (!sheet) continue;
    const agg: MonthAgg = {
      label: MONTH_NAMES_ES[month - 1],
      efectivo: sumMoneyField(sheet.rows, 'efectivo'),
      tpv: sumMoneyField(sheet.rows, 'tpv'),
      x: sumMoneyField(sheet.rows, 'x'),
      vertial: sumMoneyField(sheet.rows, 'vertial'),
      flipdish: sumMoneyField(sheet.rows, 'flipdish'),
      uber: sumMoneyField(sheet.rows, 'uber'),
      justEat: sumMoneyField(sheet.rows, 'justEat'),
      glovo: sumMoneyField(sheet.rows, 'glovo'),
      total: sumMoneyField(sheet.rows, 'total'),
      pizza: sheet.rows.reduce((s, r) => s + (r.totalPizza || 0), 0),
      burger: sheet.rows.reduce((s, r) => s + (r.totalBurger || 0), 0),
      taco: sheet.rows.reduce((s, r) => s + (r.totalTaco || 0), 0),
    };
    if (
      agg.total > 0 || agg.efectivo > 0 || agg.tpv > 0 || agg.x > 0 || agg.vertial > 0 || agg.flipdish > 0
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
    ...buildCajaMoneyGroupHeaderBlock([...CAJA_RESUMEN_HEADERS]),
  ];
  for (const m of months) {
    aoa.push([
      m.label,
      ...cajaMoneyValueCells(m),
      cellBlankZero(m.pizza),
      cellBlankZero(m.burger),
      cellBlankZero(m.taco),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL AÑO',
    ...cajaMoneyValueCells({
      efectivo: yearTotal('efectivo'),
      tpv: yearTotal('tpv'),
      x: yearTotal('x'),
      justEat: yearTotal('justEat'),
      uber: yearTotal('uber'),
      glovo: yearTotal('glovo'),
      vertial: yearTotal('vertial'),
      flipdish: yearTotal('flipdish'),
      total: yearTotal('total'),
    }),
    cellBlankZero(yearTotal('pizza')),
    cellBlankZero(yearTotal('burger')),
    cellBlankZero(yearTotal('taco')),
  ]);
  return aoa;
}

/** Meses YYYY-MM incluidos según alcance (all | year | month). */
export function listYearMonthsForHistoryRange(
  sessions: TpvRegisterSession[],
  range: CajaHistoryRange,
  preferredYearMonth: string,
): string[] {
  const months = new Set<string>();
  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    const ym = sessionDayKey(s).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) months.add(ym);
  }
  const preferred = resolveCajaYearMonthWithData(sessions, preferredYearMonth, {});
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
export function buildCajaHistoryDayRows(
  sessions: TpvRegisterSession[],
  opts: {
    pointOfSaleId?: string;
    yearMonths: string[];
    billingSheet?: BrandBillingSheet;
    allSheets?: BrandBillingSheet[];
  },
): CajaHistoryDayRow[] {
  const allow = new Set(opts.yearMonths || []);
  const billingSheet = opts.billingSheet;
  const allSheets = opts.allSheets;
  const byDay = new Map<string, CajaHistoryDayRow>();
  for (const s of sessions) {
    if (!isClosedSession(s)) continue;
    if (!matchesPdv(s, opts.pointOfSaleId)) continue;
    const dateKey = sessionDayKey(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const ym = dateKey.slice(0, 7);
    if (allow.size > 0 && !allow.has(ym)) continue;
    const amounts = billingSheet && allSheets && allSheets.length > 0
      ? splitSessionCajaAmountsByBillingSheet(s, billingSheet, allSheets)
      : sessionToCajaAmounts(s);
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
export function buildCajaBillingHistorySheetAoa(
  rowsIn: CajaHistoryDayRow[],
  billingSheet: BrandBillingSheet,
  allSheets: BrandBillingSheet[],
  opts?: { scopeLabel?: string; titleSuffix?: string; companyName?: string; alreadySplit?: boolean },
): unknown[][] {
  const allRows = rowsIn.map((row) => {
    const split = opts?.alreadySplit
      ? row
      : splitCajaAmountsByBillingSheet(row, billingSheet, allSheets);
    return { dateKey: row.dateKey, ...withAliases({ day: row.day, ...split }) } as CajaHistoryDayRow;
  });
  const rows = allRows.filter((r) => billingDayHasActivity(r, billingSheet));
  const headers = [
    ...CAJA_HISTORY_MONEY_HEADERS,
    ...billingSheet.unitColumns.map((c) => c.header),
  ];
  const monthMoneyFields = sumCajaMoneyFields(allRows);
  const monthUnits = billingSheet.unitColumns.map((col) =>
    allRows.reduce((s, r) => s + unitValue(r, col.key), 0),
  );
  const scope = String(opts?.scopeLabel || '').trim();
  const suffix = String(opts?.titleSuffix || 'HISTORIAL').trim();
  const title = withCompanyTitle(
    opts?.companyName,
    scope
      ? `INGRESOS ${billingSheet.label} · ${suffix} · ${scope}`
      : `INGRESOS ${billingSheet.label} · ${suffix}`,
  );

  const aoa: unknown[][] = [[title], [], ...buildCajaMoneyGroupHeaderBlock(headers)];
  for (const row of rows) {
    aoa.push([
      ...historyMoneyRowCells(row),
      ...billingSheet.unitColumns.map((c) => cellBlankZero(unitValue(row, c.key))),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL',
    ...cajaMoneyValueCells(monthMoneyFields),
    ...monthUnits.map((n) => cellBlankZero(n)),
  ]);
  return aoa;
}

/** Hoja tienda en modo historial. */
export function buildCajaStoreHistorySheetAoa(
  rowsIn: CajaHistoryDayRow[],
  storeLabel: string,
  opts?: { titleSuffix?: string; companyName?: string },
): unknown[][] {
  const rows = rowsIn.filter(storeDayHasActivity);
  const monthMoneyFields = sumCajaMoneyFields(rowsIn);
  const monthPizza = rowsIn.reduce((s, r) => s + (r.totalPizza || 0), 0);
  const monthBurger = rowsIn.reduce((s, r) => s + (r.totalBurger || 0), 0);
  const monthTaco = rowsIn.reduce((s, r) => s + (r.totalTaco || 0), 0);
  const label = String(storeLabel || 'TIENDA').trim() || 'TIENDA';
  const suffix = String(opts?.titleSuffix || 'HISTORIAL').trim();

  const aoa: unknown[][] = [
    [withCompanyTitle(opts?.companyName, `INGRESOS · ${label} · ${suffix}`)],
    [],
    ...buildCajaMoneyGroupHeaderBlock([...CAJA_HISTORY_STORE_HEADERS]),
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
    ...cajaMoneyValueCells(monthMoneyFields),
    cellBlankZero(monthPizza),
    cellBlankZero(monthBurger),
    cellBlankZero(monthTaco),
  ]);
  return aoa;
}

/** RESUMEN del alcance: una fila por mes (MES = «JULIO 2026»). */
export function buildCajaResumenHistorySheetAoa(
  sessions: TpvRegisterSession[],
  opts: { yearMonths: string[]; pointOfSaleId?: string; companyName?: string },
): unknown[][] {
  const yearMonths = [...(opts.yearMonths || [])].sort((a, b) => a.localeCompare(b));
  type MonthAgg = {
    label: string;
    efectivo: number;
    tpv: number;
    x: number;
    vertial: number;
    flipdish: number;
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
    const sheet = buildCajaMonthSheet(sessions, {
      pointOfSaleId: opts.pointOfSaleId,
      yearMonth: ym,
    });
    if (!sheet) continue;
    const agg: MonthAgg = {
      label: `${MONTH_NAMES_ES[parsed.month - 1]} ${parsed.year}`,
      efectivo: sumMoneyField(sheet.rows, 'efectivo'),
      tpv: sumMoneyField(sheet.rows, 'tpv'),
      x: sumMoneyField(sheet.rows, 'x'),
      vertial: sumMoneyField(sheet.rows, 'vertial'),
      flipdish: sumMoneyField(sheet.rows, 'flipdish'),
      uber: sumMoneyField(sheet.rows, 'uber'),
      justEat: sumMoneyField(sheet.rows, 'justEat'),
      glovo: sumMoneyField(sheet.rows, 'glovo'),
      total: sumMoneyField(sheet.rows, 'total'),
      pizza: sheet.rows.reduce((s, r) => s + (r.totalPizza || 0), 0),
      burger: sheet.rows.reduce((s, r) => s + (r.totalBurger || 0), 0),
      taco: sheet.rows.reduce((s, r) => s + (r.totalTaco || 0), 0),
    };
    if (
      agg.total > 0 || agg.efectivo > 0 || agg.tpv > 0 || agg.x > 0 || agg.vertial > 0 || agg.flipdish > 0
      || agg.uber > 0 || agg.justEat > 0 || agg.glovo > 0
      || agg.pizza > 0 || agg.burger > 0 || agg.taco > 0
    ) {
      months.push(agg);
    }
  }
  const yearTotal = (field: keyof Omit<MonthAgg, 'label'>) =>
    round2(months.reduce((s, m) => s + (Number(m[field]) || 0), 0));

  const aoa: unknown[][] = [
    [withCompanyTitle(opts.companyName, 'RESUMEN · HISTORIAL · TODAS LAS TIENDAS')],
    ['Totales por mes. Detalle día a día en las hojas de marca y tienda.'],
    [],
    ...buildCajaMoneyGroupHeaderBlock([...CAJA_RESUMEN_HEADERS]),
  ];
  for (const m of months) {
    aoa.push([
      m.label,
      ...cajaMoneyValueCells(m),
      cellBlankZero(m.pizza),
      cellBlankZero(m.burger),
      cellBlankZero(m.taco),
    ]);
  }
  aoa.push([]);
  aoa.push([
    'TOTAL',
    ...cajaMoneyValueCells({
      efectivo: yearTotal('efectivo'),
      tpv: yearTotal('tpv'),
      x: yearTotal('x'),
      justEat: yearTotal('justEat'),
      uber: yearTotal('uber'),
      glovo: yearTotal('glovo'),
      vertial: yearTotal('vertial'),
      flipdish: yearTotal('flipdish'),
      total: yearTotal('total'),
    }),
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
export function buildCajaComparativaYearSheetAoa(
  sessions: TpvRegisterSession[],
  opts: {
    /** Vacío = todas las tiendas. */
    pointOfSaleId?: string;
    year: number;
    billingSheets?: BrandBillingSheet[] | null;
    companyName?: string;
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

    const parts = sheets.map((billing) => {
      const billed = buildCajaMonthSheet(sessions, {
        pointOfSaleId: opts.pointOfSaleId,
        yearMonth,
        billingSheet: billing,
        allSheets: sheets,
      });
      let total = 0;
      const units = billing.unitColumns.map(() => 0);
      for (const row of billed?.rows || []) {
        total = round2(total + row.total);
        billing.unitColumns.forEach((col, uIdx) => {
          units[uIdx] += unitValue(row, col.key);
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
    [withCompanyTitle(opts.companyName, `COMPARATIVA · ${year}${scopeTitle}`)],
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
export function buildCajaComparativaSheetAoa(
  monthSheet: CajaMonthSheet,
  billingSheets?: BrandBillingSheet[] | null,
  sessions: TpvRegisterSession[] = [],
  pointOfSaleId = '',
): unknown[][] {
  return buildCajaComparativaYearSheetAoa(sessions, {
    pointOfSaleId,
    year: monthSheet.year,
    billingSheets,
  });
}

export function buildCajaSheetAoa(
  sheet: CajaMonthSheet,
  brand: CajaBrandId = 'modomio',
): unknown[][] {
  const billingSheet = LEGACY_BILLING_SHEETS.find((s) => s.id === brand)
    || LEGACY_BILLING_SHEETS[0];
  return buildCajaBillingSheetAoa(sheet, billingSheet, LEGACY_BILLING_SHEETS);
}

function sanitizeFilePart(raw: string): string {
  return String(raw || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
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

export type DownloadCajaExcelOptions = {
  /** Opcional: prioriza esa tienda en el orden de hojas detalle. Las marcas suman todas. */
  pointOfSaleId?: string;
  pointOfSaleName?: string;
  /** Nombres de tienda para las hojas detalle. */
  pointsOfSale?: Array<{ id: string; name?: string; workCenterId?: string }>;
  /** Nombre de la empresa → archivo .xlsx y títulos de cada hoja. */
  businessName?: string;
  yearMonth?: string;
  /** Alcance: all (defecto) | year | month. */
  historyRange?: CajaHistoryRange;
  closedSession?: TpvRegisterSession;
  fileName?: string;
  /** Hojas desde Empresa → Marca → Facturación. */
  billingSheets?: BrandBillingSheet[] | null;
};

/** Formatos de descarga del informe de caja. */
export type CajaDownloadFormat = 'excel' | 'google-sheets' | 'csv';

export type CajaWorkbookBuild = {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  rows: number;
  yearMonth: string;
  baseName: string;
  historyRange: CajaHistoryRange;
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

const CAJA_MONEY_TIENDA_GROUP_START = 1;
const CAJA_MONEY_TIENDA_GROUP_END = 2;
const CAJA_MONEY_INTEGRADOR_GROUP_START = 3;
const CAJA_MONEY_INTEGRADOR_GROUP_END = 6;
const CAJA_MONEY_TOTAL_COL = 7;

function buildCajaMoneyGroupHeaderRow(columnCount: number): unknown[] {
  const row = Array.from({ length: columnCount }, () => '');
  if (columnCount > CAJA_MONEY_INTEGRADOR_GROUP_END) {
    row[CAJA_MONEY_TIENDA_GROUP_START] = 'VERTIAL';
    row[CAJA_MONEY_INTEGRADOR_GROUP_START] = 'INTEGRADORES';
    if (columnCount > CAJA_MONEY_TOTAL_COL) {
      row[CAJA_MONEY_TOTAL_COL] = 'TOTAL';
    }
  }
  return row;
}

/** Fila agrupada + cabeceras de columnas (plantilla foto). */
function buildCajaMoneyGroupHeaderBlock(headers: readonly string[]): unknown[][] {
  return [
    buildCajaMoneyGroupHeaderRow(headers.length),
    [...headers],
  ];
}

function findMoneyHeaderRowIndex(aoa: unknown[][], colHeaders: string[]): number {
  for (let i = 0; i < aoa.length; i += 1) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    if (colHeaders.every((h, idx) => String(row[idx] || '') === String(h))) return i;
  }
  return -1;
}

function applyCajaMoneyHeaderMerges(ws: XLSX.WorkSheet, headerRowIndex: number): void {
  const groupRowIndex = headerRowIndex - 1;
  if (groupRowIndex < 0) return;
  const merges: XLSX.Range[] = [
    { s: { r: groupRowIndex, c: 0 }, e: { r: headerRowIndex, c: 0 } },
    {
      s: { r: groupRowIndex, c: CAJA_MONEY_TIENDA_GROUP_START },
      e: { r: groupRowIndex, c: CAJA_MONEY_TIENDA_GROUP_END },
    },
    {
      s: { r: groupRowIndex, c: CAJA_MONEY_INTEGRADOR_GROUP_START },
      e: { r: groupRowIndex, c: CAJA_MONEY_INTEGRADOR_GROUP_END },
    },
    {
      s: { r: groupRowIndex, c: CAJA_MONEY_TOTAL_COL },
      e: { r: groupRowIndex, c: CAJA_MONEY_TOTAL_COL },
    },
  ];
  ws['!merges'] = [...(ws['!merges'] || []), ...merges];
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
  if (colHeaders.includes('EFECTIVO') && colHeaders.includes('VISA')) {
    const headerRowIndex = findMoneyHeaderRowIndex(aoa, colHeaders);
    if (headerRowIndex > 0) applyCajaMoneyHeaderMerges(ws, headerRowIndex);
  }
  const name = sanitizeExcelSheetName(rawName, usedNames);
  sheetNames.push(name);
  XLSX.utils.book_append_sheet(workbook, ws, name);
}

function buildPdvAliasMaps(opts: DownloadCajaExcelOptions): {
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
  opts: DownloadCajaExcelOptions,
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
  opts: DownloadCajaExcelOptions,
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
  opts: DownloadCajaExcelOptions,
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
export function resolveCajaYearMonthWithData(
  sessions: TpvRegisterSession[],
  preferredYearMonth: string,
  opts: DownloadCajaExcelOptions = {},
): string {
  const preferred = String(preferredYearMonth || '').trim();
  const scoped = filterSessionsForExcelExport(sessions, opts);
  if (preferred) {
    const sheet = buildCajaMonthSheet(scoped, { yearMonth: preferred });
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
    const sheet = buildCajaMonthSheet(scoped, { yearMonth: ym });
    if (sheet && sheet.rows.some(storeDayHasActivity)) return ym;
  }
  return preferred || localCalendarDayKey(new Date()).slice(0, 7);
}

function listStoreSheetsForHistory(
  sessions: TpvRegisterSession[],
  yearMonths: string[],
  opts: DownloadCajaExcelOptions,
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

function foldExcelLabel(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Código corto de marca para el título de hoja (plantilla cliente):
 * MODOMIO → MM · BLACK BURGER → BB.
 */
export function brandExcelSheetCode(label: string): string {
  const raw = String(label || '').trim();
  const fold = foldExcelLabel(raw);
  if (/^mm\b/.test(fold) || fold.includes('modomio')) return 'MM';
  if (/^bb\b/.test(fold) || fold.includes('black') || fold.includes('burger')) return 'BB';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w.charAt(0).toUpperCase()).join('').slice(0, 4);
  }
  return raw.slice(0, 2).toUpperCase() || 'XX';
}

/**
 * Agrupa PDVs de la misma plaza (Tiana, Badalona…) para un Excel por plaza.
 */
export function storeExcelGroupKey(storeName: string): string {
  const n = foldExcelLabel(storeName);
  if (/tiana/.test(n)) return 'tiana';
  if (/badalona|\bbdn\b/.test(n)) return 'badalona';
  const cleaned = n
    .replace(/modomio|black\s*burger|vb\d+.*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .find((t) => t.length >= 3);
  return cleaned || n.slice(0, 12) || 'tienda';
}

/**
 * Título real del Excel por marca×tienda (definición cliente):
 * MM TIANA · BB TIANA · MM BADALONA · BB BDN.
 */
export function brandStoreExcelSheetTitle(brandLabel: string, storeGroupKey: string): string {
  const brand = brandExcelSheetCode(brandLabel);
  const key = String(storeGroupKey || '').trim().toLowerCase();
  if (key === 'tiana') return `${brand} TIANA`;
  if (key === 'badalona') {
    // Misma plantilla que el hub Google Sheets del cliente.
    return brand === 'BB' ? 'BB BDN' : `${brand} BADALONA`;
  }
  return `${brand} ${key.toUpperCase().slice(0, 12)}`;
}

type ExcelStoreGroup = {
  key: string;
  /** PDVs que suman en ese Excel (p. ej. varios Badalona). */
  pdvIds: string[];
  sampleName: string;
};

function groupStoresForBrandExcels(
  stores: Array<{ id: string; name: string }>,
): ExcelStoreGroup[] {
  const byKey = new Map<string, ExcelStoreGroup>();
  const order: string[] = [];
  for (const store of stores) {
    const key = storeExcelGroupKey(store.name);
    let g = byKey.get(key);
    if (!g) {
      g = { key, pdvIds: [], sampleName: store.name };
      byKey.set(key, g);
      order.push(key);
    }
    if (!g.pdvIds.includes(store.id)) g.pdvIds.push(store.id);
  }
  // Tiana → Badalona → resto (orden del hub EXCEL 1…4).
  order.sort((a, b) => {
    const rank = (k: string) => (k === 'tiana' ? 0 : k === 'badalona' ? 1 : 2);
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.localeCompare(b, 'es');
  });
  return order.map((k) => byKey.get(k)!).filter(Boolean);
}

function sessionsForPdvIds(
  sessions: TpvRegisterSession[],
  pdvIds: string[],
): TpvRegisterSession[] {
  const set = new Set(pdvIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (set.size === 0) return [];
  return sessions.filter((s) => set.has(String(s.pointOfSaleId || '').trim()));
}

/**
 * Mega Excel: una hoja por Excel del hub cliente (marca × tienda).
 * Definición: MM TIANA · BB TIANA · MM BADALONA · BB BDN (+ RESUMEN / COMPARATIVA).
 * historyRange all (defecto) | year | month.
 */
export function buildCajaClosingsWorkbook(
  sessions: TpvRegisterSession[],
  opts: DownloadCajaExcelOptions,
): CajaWorkbookBuild {
  const closed = opts.closedSession;
  const historyRange = normalizeCajaHistoryRange(opts.historyRange);
  const scopedSessions = canonicalizeSessionPointOfSaleIds(
    filterSessionsForExcelExport(sessions, opts),
    opts,
  );
  const preferredYearMonth =
    opts.yearMonth
    || (closed ? yearMonthFromSession(closed) : '')
    || localCalendarDayKey(new Date()).slice(0, 7);
  const yearMonth = resolveCajaYearMonthWithData(scopedSessions, preferredYearMonth, opts);
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
  const companyName = String(opts.businessName || '').trim() || undefined;
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

  const storeList = useFechaColumns
    ? listStoreSheetsForHistory(merged, yearMonths, opts)
    : listStoreSheetsForMonth(merged, yearMonth, opts);
  const storeGroups = groupStoresForBrandExcels(storeList);

  let rows = 0;
  const companyWide = useFechaColumns
    ? buildCajaHistoryDayRows(merged, { yearMonths })
    : buildCajaMonthSheet(merged, { yearMonth });
  if (!companyWide) {
    throw new Error('Mes inválido para el Excel de cierre');
  }
  rows = useFechaColumns
    ? (companyWide as ReturnType<typeof buildCajaHistoryDayRows>).filter(storeDayHasActivity).length
    : (companyWide as CajaMonthSheet).rows.filter(storeDayHasActivity).length;

  // Orden hub: por plaza (Tiana → Badalona) y dentro por marca (MM → BB).
  // Siempre las 4 hojas de definición (aunque un mes vaya a 0).
  for (const store of storeGroups) {
    const storeSessions = sessionsForPdvIds(merged, store.pdvIds);

    for (const billing of billingSheets) {
      const sheetTitle = brandStoreExcelSheetTitle(billing.label, store.key);
      if (useFechaColumns) {
        const storeRows = buildCajaHistoryDayRows(storeSessions, {
          yearMonths,
          billingSheet: billing,
          allSheets: billingSheets,
        });
        const aoa = buildCajaBillingHistorySheetAoa(storeRows, billing, billingSheets, {
          scopeLabel: sheetTitle,
          titleSuffix,
          companyName,
          alreadySplit: true,
        });
        appendSheetFromAoa(
          workbook,
          usedNames,
          sheetNames,
          sheetTitle,
          aoa,
          [
            ...CAJA_HISTORY_MONEY_HEADERS,
            ...billing.unitColumns.map((c) => c.header),
          ],
        );
      } else {
        const storeMonth = buildCajaMonthSheet(storeSessions, {
          yearMonth,
          billingSheet: billing,
          allSheets: billingSheets,
        })
          || buildCajaMonthSheet([], { yearMonth });
        if (!storeMonth) continue;
        const aoa = buildCajaBillingSheetAoa(storeMonth, billing, billingSheets, {
          scopeLabel: sheetTitle,
          companyName,
          alreadySplit: true,
        });
        appendSheetFromAoa(
          workbook,
          usedNames,
          sheetNames,
          sheetTitle,
          aoa,
          [
            ...CAJA_MONEY_HEADERS,
            ...billing.unitColumns.map((c) => c.header),
          ],
        );
      }
    }
  }

  const resumenAoa = buildCajaResumenHistorySheetAoa(merged, { yearMonths, companyName });
  appendSheetFromAoa(
    workbook,
    usedNames,
    sheetNames,
    'RESUMEN',
    resumenAoa,
    [...CAJA_RESUMEN_HEADERS],
  );

  const years = Array.from(new Set(yearMonths.map((ym) => Number(ym.slice(0, 4)))))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  for (const year of years) {
    const comparativaAoa = buildCajaComparativaYearSheetAoa(merged, {
      year,
      billingSheets,
      companyName,
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
  // Solo slug de empresa si hay nombre real (evitar “pdv-facturacion-…” / “uriel-…”).
  const companySlug = companyName ? sanitizeFilePart(companyName) : '';
  const defaultBase = companySlug
    ? `${companySlug}-facturacion-${rangeSlug}`
    : `facturacion-caja-${rangeSlug}`;
  const baseName = String(opts.fileName || defaultBase)
    .replace(/\.xlsx$/i, '')
    .replace(/\.zip$/i, '');

  return { workbook, sheetNames, rows, yearMonth, baseName, historyRange };
}

async function downloadCajaAsCsvZip(built: CajaWorkbookBuild): Promise<string> {
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
export async function downloadCajaClosings(
  sessions: TpvRegisterSession[],
  opts: DownloadCajaExcelOptions & { format?: CajaDownloadFormat },
): Promise<{ rows: number; fileName: string; yearMonth: string; sheetNames: string[]; format: CajaDownloadFormat }> {
  const format: CajaDownloadFormat = opts.format || 'excel';
  const built = buildCajaClosingsWorkbook(sessions, opts);

  if (format === 'csv') {
    const fileName = await downloadCajaAsCsvZip(built);
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
export function downloadCajaClosingsExcel(
  sessions: TpvRegisterSession[],
  opts: DownloadCajaExcelOptions,
): { rows: number; fileName: string; yearMonth: string; sheetNames: string[] } {
  const built = buildCajaClosingsWorkbook(sessions, opts);
  const fileName = `${built.baseName}.xlsx`;
  XLSX.writeFile(built.workbook, fileName);
  return {
    rows: built.rows,
    fileName,
    yearMonth: built.yearMonth,
    sheetNames: built.sheetNames,
  };
}
