/**
 * Enriquece cierres con Caja 1 por marca (efectivo/tarjeta) para el Excel.
 * - Si ya viene `closingBrandTpvTotals` del cierre → no recalcula importes.
 * - Siempre aporta nombres de marca (para enlazar hojas del Excel).
 * - Si no hay desglose (cierres antiguos) → recalcula desde pedidos del turno, igual que la UI de Caja.
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

function sessionAlreadyHasBrandTpv(session: TpvRegisterSession): boolean {
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
  return closingBrandTpvTotalsFromRows(rolled.rows);
}

/**
 * Para descarga Excel: rellena Caja 1 por marca en cierres que no la tenían guardada
 * y asegura nombres de marca para enlazar hojas.
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
    .filter(({ s }) => !sessionAlreadyHasBrandTpv(s));
  if (need.length === 0) return out;

  const concurrency = Math.max(1, Math.min(6, opts.concurrency || 4));
  let done = 0;

  for (let i = 0; i < need.length; i += concurrency) {
    const batch = need.slice(i, i + concurrency);
    await Promise.all(batch.map(async ({ s, index }) => {
      try {
        const orders = await fetchShiftOrdersForSession(userId, s);
        const totals = computeClosingBrandTpvTotalsForSession(s, orders, opts);
        if (Object.keys(totals).length > 0) {
          out[index] = {
            ...out[index],
            closingBrandTpvTotals: totals,
          };
        }
      } catch {
        /* deja el cierre sin enriquecer → Excel cae a reparto por uds */
      } finally {
        done += 1;
        opts.onProgress?.(done, need.length);
      }
    }));
  }
  return out;
}
