/**
 * Conteos de productos vendidos (pizza, kebab, burger…) para dashboard delivery.
 * Se apoya en el tipo de línea de cada marca (`deliveryLineKind`) y en categoría/nombre del ítem.
 */
import type { DeliveryOrder, DeliveryOrderItem } from './deliveryApi';
import type { DeliveryBrandLineKindId } from './deliveryBrandLineKinds';
import { getDeliveryBrandLinePreset } from './deliveryBrandLineKinds';
import { localCalendarDayKey } from './tpvCajaScope';

/** Familias vendibles que se muestran en dashboard (alineadas a tipos de marca). */
export type SoldProductFamilyId =
  | 'pizza'
  | 'burger'
  | 'taco'
  | 'kebab'
  | 'sushi'
  | 'tapas'
  | 'prepared';

export type SoldProductFamilyMeta = {
  id: SoldProductFamilyId;
  label: string;
  color: string;
  lineKinds: DeliveryBrandLineKindId[];
};

export const SOLD_PRODUCT_FAMILIES: SoldProductFamilyMeta[] = [
  { id: 'pizza', label: 'Pizzas', color: '#DC2626', lineKinds: ['pizza'] },
  { id: 'burger', label: 'Burgers', color: '#D97706', lineKinds: ['burger_fastfood'] },
  { id: 'taco', label: 'Tacos', color: '#16A34A', lineKinds: ['tacos_mexican'] },
  { id: 'kebab', label: 'Kebab', color: '#B45309', lineKinds: ['kebab'] },
  { id: 'sushi', label: 'Sushi', color: '#059669', lineKinds: ['sushi_asian'] },
  { id: 'tapas', label: 'Tapas', color: '#9F1239', lineKinds: ['tapas_bar'] },
  { id: 'prepared', label: 'Platos / menús', color: '#EA580C', lineKinds: ['prepared_meals', 'mixed_restaurant'] },
];

const FAMILY_BY_ID = Object.fromEntries(SOLD_PRODUCT_FAMILIES.map((f) => [f.id, f])) as Record<
  SoldProductFamilyId,
  SoldProductFamilyMeta
>;

function fold(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Clasifica una línea de pedido según categoría / nombre. */
export function classifySoldProductFamily(
  category: string | undefined,
  name: string | undefined,
): SoldProductFamilyId | null {
  const cat = fold(category || '');
  const nm = fold(name || '');
  const blob = `${cat} ${nm}`;

  if (/taco|burrito|quesadilla|nacho|pastor|carnitas/.test(blob)) return 'taco';
  if (/burger|hamburg|smash|bocadillo/.test(blob)) return 'burger';
  if (/pizza|calzone/.test(blob)) return 'pizza';
  if (/kebab|doner|doerner|shawarma|durum|falafel/.test(blob)) return 'kebab';
  if (/sushi|maki|nigiri|sashimi|ramen|poke|wok|gyoza/.test(blob)) return 'sushi';
  if (/tapa|racion|pincho|montadito|bravas/.test(blob)) return 'tapas';
  if (/menu|menú|plato|principal|entrante|racion|combo familiar|menu del dia/.test(blob)) return 'prepared';
  return null;
}

export function emptySoldProductCounts(
  families: SoldProductFamilyId[] = SOLD_PRODUCT_FAMILIES.map((f) => f.id),
): Record<SoldProductFamilyId, number> {
  const out = {} as Record<SoldProductFamilyId, number>;
  for (const id of families) out[id] = 0;
  return out;
}

/** Familias activas según marcas de la empresa (fallback: las que tengan ventas). */
export function resolveActiveSoldFamilies(
  brands: Array<{ deliveryLineKind?: string | null; name?: string | null; active?: boolean }> = [],
  soldTotals?: Partial<Record<SoldProductFamilyId, number>>,
): SoldProductFamilyMeta[] {
  const fromBrands = new Set<SoldProductFamilyId>();
  for (const brand of brands) {
    if (brand.active === false) continue;
    const kind = String(brand.deliveryLineKind || '').trim() as DeliveryBrandLineKindId;
    if (!kind) continue;
    for (const fam of SOLD_PRODUCT_FAMILIES) {
      if (fam.lineKinds.includes(kind)) fromBrands.add(fam.id);
    }
  }

  let ids: SoldProductFamilyId[] = [...fromBrands];
  if (ids.length === 0 && soldTotals) {
    ids = SOLD_PRODUCT_FAMILIES.map((f) => f.id).filter((id) => Number(soldTotals[id] || 0) > 0);
  }
  if (ids.length === 0) {
    // Sin marcas tipadas: mostrar las clásicas para no dejar el panel vacío.
    ids = ['pizza', 'burger', 'taco', 'kebab'];
  }
  return ids.map((id) => FAMILY_BY_ID[id]).filter(Boolean);
}

function countItem(item: DeliveryOrderItem): SoldProductFamilyId | null {
  const qty = Number(item.quantity || 0);
  if (qty <= 0) return null;
  return classifySoldProductFamily(item.category, item.name);
}

function orderDayKey(order: DeliveryOrder): string {
  const raw = String(order.deliveredAt || order.createdAt || order.updatedAt || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return localCalendarDayKey(d);
}

/** Totales del día (pedidos no cancelados). */
export function soldProductCountsForDay(
  orders: DeliveryOrder[],
  dayKey: string,
): Record<SoldProductFamilyId, number> {
  const out = emptySoldProductCounts();
  for (const order of orders) {
    if (String(order.status || '').toLowerCase() === 'cancelled') continue;
    if (orderDayKey(order) !== dayKey) continue;
    for (const item of order.items || []) {
      const fam = countItem(item);
      if (!fam) continue;
      out[fam] = (out[fam] || 0) + Number(item.quantity || 0);
    }
  }
  return out;
}

export type SoldProductDailyPoint = {
  dayKey: string;
  label: string;
} & Record<string, number | string>;

/**
 * Serie diaria (p. ej. 14 días) para gráfica apilada/agrupada.
 * `families` = columnas a incluir (según marcas).
 */
export function buildSoldProductDailySeries(
  orders: DeliveryOrder[],
  dayKeys: string[],
  families: SoldProductFamilyMeta[],
  labelFn: (dayKey: string) => string = (k) => k.slice(5),
): SoldProductDailyPoint[] {
  const famIds = families.map((f) => f.id);
  return dayKeys.map((dayKey) => {
    const counts = soldProductCountsForDay(orders, dayKey);
    const row: SoldProductDailyPoint = { dayKey, label: labelFn(dayKey) };
    for (const id of famIds) {
      row[id] = counts[id] || 0;
    }
    return row;
  });
}

export function soldProductFamilyLabel(id: string): string {
  return FAMILY_BY_ID[id as SoldProductFamilyId]?.label
    || getDeliveryBrandLinePreset(id)?.label
    || id;
}

export function soldProductFamilyColor(id: string): string {
  return FAMILY_BY_ID[id as SoldProductFamilyId]?.color || '#6366F1';
}
