/**
 * Enriquece cierres con Caja 1 por marca (efectivo/tarjeta) para el Excel.
 * Misma fuente que la UI al cerrar: pedidos del turno → buildShiftBrandRevenue.
 * Si la Caja 1 guardada es incoherente (p. ej. uds como €) → recalcula o elimina para reparto por uds.
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

export function closingBrandTpvTotalsFromRows(
  rows: Array<Pick<ShiftBrandRevenueRow, 'brandId' | 'revenueEfectivo' | 'revenueTarjeta'>>,
): Record<string, { efectivo: number; tarjeta: number }> {
  const out: Record<string, { efectivo: number; tarjeta: number }> = {};
  for (const row of rows || []) {
    const brandId = String(row.brandId || '').trim();
    if (!brandId) continue;
    const efectivo = Math.round((Number(row.revenueEfectivo) || 0) * 100) / 100;
    const tarjeta = Math.round((Number(row.revenueTarjeta) || 0) * 100) / 100;
    if (efectivo <= 0 && tarjeta <= 0) continue;
    const prev = out[brandId] || { efectivo: 0, tarjeta: 0 };
    out[brandId] = {
      efectivo: Math.round((prev.efectivo + efectivo) * 100) / 100,
      tarjeta: Math.round((prev.tarjeta + tarjeta) * 100) / 100,
    };
  }
  return out;
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
  return closingBrandTpvTotalsFromRows(rolled.rows);
}

function isClosedSession(session: TpvRegisterSession): boolean {
  return String(session.status || '').toLowerCase() !== 'open';
}

/** Elige Caja 1 para Excel: pedidos del turno > guardado fiable > sin Caja 1 (reparto uds). */
export function resolveClosingBrandTpvForExcelExport(
  session: TpvRegisterSession,
  recomputed: Record<string, { efectivo: number; tarjeta: number }> | null | undefined,
): Record<string, { efectivo: number; tarjeta: number }> | undefined {
  const amounts = sessionToCajaAmounts(session);
  const savedTrust = isTrustworthyClosingBrandTpvForExcel(session, amounts);

  const fromOrders = recomputed && Object.keys(recomputed).length > 0 ? recomputed : null;
  if (fromOrders) {
    const preview = { ...session, closingBrandTpvTotals: fromOrders };
    if (isTrustworthyClosingBrandTpvForExcel(preview, sessionToCajaAmounts(preview))) {
      return fromOrders;
    }
  }

  if (savedTrust && session.closingBrandTpvTotals) {
    return session.closingBrandTpvTotals;
  }

  return undefined;
}

/**
 * Para descarga Excel: Caja 1 por marca alineada con Vertial (pedidos del turno).
 * Corrige cierres con Caja 1 corrupta antes de generar el archivo.
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
    .filter(({ s }) => isClosedSession(s));
  if (need.length === 0) return out;

  const concurrency = Math.max(1, Math.min(6, opts.concurrency || 4));
  let done = 0;

  for (let i = 0; i < need.length; i += concurrency) {
    const batch = need.slice(i, i + concurrency);
    await Promise.all(batch.map(async ({ s, index }) => {
      try {
        const orders = await fetchShiftOrdersForSession(userId, s);
        const totals = computeClosingBrandTpvTotalsForSession(s, orders, opts);
        const resolved = resolveClosingBrandTpvForExcelExport(s, totals);
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
