/**
 * Overlay de cierres de caja (Caja 2) para el panel de Marcas.
 *
 * Al cerrar caja se declaran a mano los totales por app y por marca
 * (`aggregatorClosingTotals` / `aggregatorClosingBrandTotals`) y las unidades
 * por app (`productClosingCounts.byChannel`). Esas ventas pueden no existir
 * como pedidos en Vertial, así que la comparativa de marcas se quedaría corta.
 *
 * Regla anti doble conteo (misma filosofía que el Resumen operativo):
 * si un día tiene declaración manual para un canal, lo declarado PISA a los
 * pedidos de ese canal ese día (los pedidos se excluyen y entra el cierre).
 */
import type { TpvRegisterSession } from './deliveryApi';
import { sessionWorkDayKey } from './tpvCajaScope';
import { emptyFoodFamilyCounts, type FoodFamilyCounts } from './shiftFoodFamilyCounts';

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Canales de integrador que se declaran al cierre. */
const CLOSING_AGGREGATOR_CHANNELS = ['glovo', 'ubereats', 'justeat', 'flipdish', 'app'] as const;

/** App propia: 'flipdish' y 'app' son el mismo grupo (como en el Excel de cierres). */
function channelAliases(channel: string): string[] {
  if (channel === 'flipdish' || channel === 'app') return ['flipdish', 'app'];
  return [channel];
}

/** Clave canónica para acumular € (las filas de integradores usan 'flipdish'). */
function canonicalChannel(channel: string): string {
  return channel === 'app' ? 'flipdish' : channel;
}

export type ClosingBrandOverlay = {
  /** dayKey → canales (normalizados) cuyo cierre manda ese día. */
  overlaidChannelsByDay: Map<string, Set<string>>;
  /** € declarados por marca (suma del rango). */
  revenueByBrand: Record<string, number>;
  /** € declarados por canal (suma del rango; incluye lo sin marca). */
  revenueByChannel: Record<string, number>;
  /** € declarados por canal y marca (para la vista de una marca). */
  revenueByChannelByBrand: Record<string, Record<string, number>>;
  /** Unidades declaradas al cierre para los canales pisados. */
  food: FoodFamilyCounts;
  /** brandId → nombre capturado al cerrar (fallback si el catálogo no lo trae). */
  brandLabels: Record<string, string>;
  /** ¿Hay algo declarado en el rango? */
  hasData: boolean;
};

export function emptyClosingBrandOverlay(): ClosingBrandOverlay {
  return {
    overlaidChannelsByDay: new Map(),
    revenueByBrand: {},
    revenueByChannel: {},
    revenueByChannelByBrand: {},
    food: emptyFoodFamilyCounts(),
    brandLabels: {},
    hasData: false,
  };
}

/**
 * Construye el overlay para los días que cumplan `dayInRange`.
 * Solo cuenta canales con declaración manual (total del canal o total por
 * marca > 0). Si el cierre no declaró nada, los pedidos siguen mandando.
 */
export function buildClosingBrandOverlay(
  sessions: TpvRegisterSession[] | null | undefined,
  dayInRange: (dayKey: string) => boolean,
): ClosingBrandOverlay {
  const overlay = emptyClosingBrandOverlay();
  if (!Array.isArray(sessions) || sessions.length === 0) return overlay;

  for (const session of sessions) {
    const dayKey = sessionWorkDayKey(session);
    if (!dayKey || !dayInRange(dayKey)) continue;

    for (const [brandId, label] of Object.entries(session.closingBrandLabels || {})) {
      const id = String(brandId || '').trim();
      const name = String(label || '').trim();
      if (id && name && !overlay.brandLabels[id]) overlay.brandLabels[id] = name;
    }

    for (const channel of CLOSING_AGGREGATOR_CHANNELS) {
      const declaredTotal = r2(Number(session.aggregatorClosingTotals?.[channel] || 0));
      const brandMap = session.aggregatorClosingBrandTotals?.[channel] || {};
      let brandSum = 0;
      const brandAmounts: Array<[string, number]> = [];
      for (const [brandId, raw] of Object.entries(brandMap)) {
        const id = String(brandId || '').trim();
        const amt = r2(Number(raw) || 0);
        if (!id || amt <= 0) continue;
        brandAmounts.push([id, amt]);
        brandSum = r2(brandSum + amt);
      }

      // Sin declaración manual → los pedidos mandan (no se pisa nada).
      if (declaredTotal <= 0 && brandSum <= 0) continue;

      const effectiveTotal = declaredTotal > 0 ? declaredTotal : brandSum;

      let daySet = overlay.overlaidChannelsByDay.get(dayKey);
      if (!daySet) {
        daySet = new Set<string>();
        overlay.overlaidChannelsByDay.set(dayKey, daySet);
      }
      for (const alias of channelAliases(channel)) daySet.add(alias);

      const chKey = canonicalChannel(channel);
      overlay.revenueByChannel[chKey] = r2(
        (overlay.revenueByChannel[chKey] || 0) + effectiveTotal,
      );
      for (const [brandId, amt] of brandAmounts) {
        overlay.revenueByBrand[brandId] = r2((overlay.revenueByBrand[brandId] || 0) + amt);
        const chMap = overlay.revenueByChannelByBrand[chKey] || {};
        chMap[brandId] = r2((chMap[brandId] || 0) + amt);
        overlay.revenueByChannelByBrand[chKey] = chMap;
      }

      const food = session.productClosingCounts?.byChannel?.[channel];
      if (food) {
        overlay.food = {
          pizza: overlay.food.pizza + Math.max(0, Math.floor(Number(food.pizza) || 0)),
          burger: overlay.food.burger + Math.max(0, Math.floor(Number(food.burger) || 0)),
          taco: overlay.food.taco + Math.max(0, Math.floor(Number(food.taco) || 0)),
        };
      }

      overlay.hasData = true;
    }
  }

  return overlay;
}

/** ¿El pedido cae en un día/canal pisado por el cierre? (→ excluirlo). */
export function isOrderReplacedByClosing(
  overlay: ClosingBrandOverlay,
  orderDayKey: string,
  normalizedChannel: string,
): boolean {
  if (!overlay.hasData) return false;
  const daySet = overlay.overlaidChannelsByDay.get(orderDayKey);
  return Boolean(daySet?.has(normalizedChannel));
}

/** Suma € de cierre a filas de canal/integrador y recalcula el % de reparto. */
export function mergeClosingIntoChannelRows<
  T extends { key: string; revenue: number; sharePercent: number },
>(rows: T[], closingByChannel: Record<string, number>): T[] {
  const amounts = Object.entries(closingByChannel).filter(([, n]) => (Number(n) || 0) > 0);
  if (amounts.length === 0) return rows;
  const extra = new Map(amounts.map(([k, n]) => [k, r2(Number(n) || 0)]));
  const merged = rows.map((row) => {
    const add = extra.get(row.key) || 0;
    return add > 0 ? { ...row, revenue: r2(row.revenue + add) } : row;
  });
  const total = r2(merged.reduce((s, row) => s + row.revenue, 0));
  return merged.map((row) => ({
    ...row,
    sharePercent: total > 0 ? Math.round((row.revenue / total) * 1000) / 10 : 0,
  }));
}
