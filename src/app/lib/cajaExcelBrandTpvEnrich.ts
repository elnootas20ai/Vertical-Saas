/**
 * Caja 1 por marca para Excel = misma foto que la pantalla de cierre.
 * - Filas con ef/tj por marca → esas cifras.
 * - Si no hay ef/tj pero sí € por marca → reparto del cobro tienda (ef+visa).
 * - Cierres sin snapshot guardado → recalcular desde pedidos (igual que al reabrir el cierre).
 */
import type { DeliveryOrder, TpvRegisterSession } from './deliveryApi';
import type { Brand } from './brandApi';
import type { BrandBillingConfig, BrandBillingSheet } from './brandBillingConfig';
import {
  closingSlotsFromBillingSheets,
  splitRulesFromBillingConfig,
  suggestBillingSheetsFromBrands,
} from './brandBillingConfig';
import { buildBrandLabelsMap } from './brandLabels';
import {
  buildShiftBrandRevenue,
  rollupBrandRevenueToClosingSlots,
  type ShiftBrandRevenueRow,
} from './registerShiftBrandBilling';
import { fetchShiftOrdersForSession } from './registerShiftOrders';
import {
  isTrustworthyClosingBrandTpvForExcel,
  sessionToCajaAmounts,
} from './cajaFacturacionExcelExport';

function roundMoney2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function closingBrandTpvTotalsFromRows(
  rows: Array<Pick<ShiftBrandRevenueRow, 'brandId' | 'revenueEfectivo' | 'revenueTarjeta'>>,
): Record<string, { efectivo: number; tarjeta: number }> {
  const out: Record<string, { efectivo: number; tarjeta: number }> = {};
  for (const row of rows || []) {
    const brandId = String(row.brandId || '').trim();
    if (!brandId) continue;
    const efectivo = roundMoney2(row.revenueEfectivo);
    const tarjeta = roundMoney2(row.revenueTarjeta);
    if (efectivo <= 0 && tarjeta <= 0) continue;
    const prev = out[brandId] || { efectivo: 0, tarjeta: 0 };
    out[brandId] = {
      efectivo: roundMoney2(prev.efectivo + efectivo),
      tarjeta: roundMoney2(prev.tarjeta + tarjeta),
    };
  }
  return out;
}

/** Misma lógica que la UI «Por marca» al cerrar (ef/tj o reparto tienda por € marca). */
export function closingBrandTpvTotalsFromBillingRows(
  rows: ShiftBrandRevenueRow[],
  storeEfectivo: number,
  storeTarjeta: number,
): Record<string, { efectivo: number; tarjeta: number }> {
  const fromPay = closingBrandTpvTotalsFromRows(rows);
  if (Object.keys(fromPay).length > 0) return fromPay;

  const revRows = (rows || []).filter(
    (r) => roundMoney2(r.revenue) > 0 && String(r.brandId || '').trim(),
  );
  const storeEf = roundMoney2(storeEfectivo);
  const storeTj = roundMoney2(storeTarjeta);
  const revTotal = revRows.reduce((s, r) => s + roundMoney2(r.revenue), 0);
  if (revTotal <= 0 || (storeEf + storeTj) <= 0) return {};

  const out: Record<string, { efectivo: number; tarjeta: number }> = {};
  let sumEf = 0;
  let sumTj = 0;
  for (let i = 0; i < revRows.length; i += 1) {
    const row = revRows[i];
    const brandId = String(row.brandId).trim();
    const isLast = i === revRows.length - 1;
    const share = roundMoney2(row.revenue) / revTotal;
    const ef = isLast ? roundMoney2(storeEf - sumEf) : roundMoney2(storeEf * share);
    const tj = isLast ? roundMoney2(storeTj - sumTj) : roundMoney2(storeTj * share);
    sumEf = roundMoney2(sumEf + ef);
    sumTj = roundMoney2(sumTj + tj);
    out[brandId] = { efectivo: ef, tarjeta: tj };
  }
  return out;
}

function sessionHasSavedBrandTpv(session: TpvRegisterSession): boolean {
  const map = session.closingBrandTpvTotals;
  if (!map || typeof map !== 'object') return false;
  return Object.values(map).some(
    (pay) => pay && (Number(pay.efectivo) > 0 || Number(pay.tarjeta) > 0),
  );
}

function withBrandLabels(
  session: TpvRegisterSession,
  brands: Brand[] | undefined,
): TpvRegisterSession {
  const labelsFromBrands = buildBrandLabelsMap(brands || []);
  if (Object.keys(labelsFromBrands).length === 0) return session;
  return {
    ...session,
    closingBrandLabels: {
      ...(session.closingBrandLabels || {}),
      ...labelsFromBrands,
    },
  };
}

export function computeClosingBrandTpvTotalsForSession(
  session: TpvRegisterSession,
  orders: DeliveryOrder[],
  opts: {
    brands?: Brand[];
    billingSheets?: BrandBillingSheet[] | null;
    billingConfig?: BrandBillingConfig | null;
  } = {},
): Record<string, { efectivo: number; tarjeta: number }> {
  const brands = opts.brands || [];
  const brandLabels = {
    ...(session.closingBrandLabels || {}),
    ...buildBrandLabelsMap(brands),
  };
  const rules = splitRulesFromBillingConfig(opts.billingConfig || null);
  const sheets = (opts.billingSheets && opts.billingSheets.length > 0)
    ? opts.billingSheets
    : suggestBillingSheetsFromBrands(brands);
  const slots = closingSlotsFromBillingSheets(sheets, brands);
  const raw = buildShiftBrandRevenue(session, orders, brandLabels, rules);
  const rolled = rollupBrandRevenueToClosingSlots(raw, slots, rules, brandLabels);
  const method = session.summary?.salesByMethod || {};
  return closingBrandTpvTotalsFromBillingRows(
    rolled.rows,
    Number(method.efectivo) || 0,
    Number(method.tarjeta) || 0,
  );
}

function isClosedSession(session: TpvRegisterSession): boolean {
  return String(session.status || '').toLowerCase() !== 'open';
}

export function resolveClosingBrandTpvForExcelExport(
  session: TpvRegisterSession,
  recomputed: Record<string, { efectivo: number; tarjeta: number }> | null | undefined,
): Record<string, { efectivo: number; tarjeta: number }> | undefined {
  const amounts = sessionToCajaAmounts(session);
  if (isTrustworthyClosingBrandTpvForExcel(session, amounts)) {
    return session.closingBrandTpvTotals;
  }

  const fromOrders = recomputed && Object.keys(recomputed).length > 0 ? recomputed : null;
  if (fromOrders) {
    const preview = { ...session, closingBrandTpvTotals: fromOrders };
    if (isTrustworthyClosingBrandTpvForExcel(preview, sessionToCajaAmounts(preview))) {
      return fromOrders;
    }
  }

  return undefined;
}

/**
 * Excel: rellena Caja 1 si falta (cierres viejos) o corrige solo el bug uds→€.
 * Misma fuente que la pantalla de cierre, no otro reparto.
 */
export async function enrichSessionsWithClosingBrandTpv(
  sessions: TpvRegisterSession[],
  dataUserId: string,
  opts: {
    brands?: Brand[];
    billingSheets?: BrandBillingSheet[] | null;
    billingConfig?: BrandBillingConfig | null;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<TpvRegisterSession[]> {
  const userId = String(dataUserId || '').trim();
  if (!userId || sessions.length === 0) return sessions;

  const out = sessions.map((s) => withBrandLabels(s, opts.brands));
  const need = out
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => {
      if (!isClosedSession(s)) return false;
      const amounts = sessionToCajaAmounts(s);
      if (!sessionHasSavedBrandTpv(s)) return true;
      return !isTrustworthyClosingBrandTpvForExcel(s, amounts);
    });
  if (need.length === 0) return out;

  const concurrency = Math.max(1, Math.min(6, opts.concurrency || 4));
  let done = 0;

  for (let i = 0; i < need.length; i += concurrency) {
    const batch = need.slice(i, i + concurrency);
    await Promise.all(batch.map(async ({ s, index }) => {
      try {
        const orders = await fetchShiftOrdersForSession(userId, s);
        const totals = computeClosingBrandTpvTotalsForSession(s, orders, opts);
        const resolved = resolveClosingBrandTpvForExcelExport(s, totals)
          ?? (Object.keys(totals).length > 0 ? totals : undefined);
        const next: TpvRegisterSession = { ...out[index] };
        if (resolved && Object.keys(resolved).length > 0) {
          next.closingBrandTpvTotals = resolved;
        } else {
          delete next.closingBrandTpvTotals;
        }
        out[index] = next;
      } catch {
        const resolved = resolveClosingBrandTpvForExcelExport(s, null);
        const next: TpvRegisterSession = { ...out[index] };
        if (resolved && Object.keys(resolved).length > 0) {
          next.closingBrandTpvTotals = resolved;
        } else {
          delete next.closingBrandTpvTotals;
        }
        out[index] = next;
      } finally {
        done += 1;
        opts.onProgress?.(done, need.length);
      }
    }));
  }
  return out;
}
