import { formatMoneyAsYouType } from '../../lib/workCenterMoneyInput';
import { formatDecimalEs, formatMoneyEs } from '../../lib/formatNumberEs';
import type { FoodFamilyCounts, FoodFamilyKey } from '../../lib/shiftFoodFamilyCounts';
import { emptyFoodFamilyCounts, sumFoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';
import {
  DELIVERY_FOOD_UNIT_ORDER,
  DeliveryFoodUnitIcon,
  deliveryFoodUnitTitle,
} from './delivery/DeliveryFoodUnitIcon';
import {
  VERTIAL_CASH_BG,
  VERTIAL_CASH_BORDER,
  VERTIAL_CASH_TEXT,
  VERTIAL_CARD_BG,
  VERTIAL_CARD_BORDER,
  VERTIAL_CARD_TEXT,
} from '../../lib/vertialUiTokens';
import { QuietTip } from './QuietTip';
import type { ShiftAppsBrandTotalRow } from '../../lib/registerShiftBrandBilling';
import { scaleAppsBrandTotalsToAppTotal } from '../../lib/registerShiftBrandBilling';
import { Banknote, Check, CreditCard, Plug, Store } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import {
  parseAggregatorAmount,
  resolveClosingChannelTotalSales,
  sumAggregatorCash,
  sumAggregatorCard,
  sumClosingBrandTotals,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';

/** Borrador por app: unidades + total por marca (2ª caja apps) + no pagados tienda. */
export type ChannelClosingDraft = {
  pizza: { qty: string };
  burger: { qty: string };
  taco: { qty: string };
  /** Total ventas app (legacy / suma de marcas). Excel y arqueo apps. */
  total: string;
  /** Total hecho en integrador por marca (p. ej. Modomio / Blackburger). */
  totalByBrand?: Record<string, string>;
  /**
   * No pagado efectivo por marca (cobrado en tienda → arqueo).
   * Si hay marcas de Facturación, prima sobre `unpaidCash`.
   */
  unpaidCashByBrand?: Record<string, string>;
  /** No pagado tarjeta por marca (informativo; no suma al cajón). */
  unpaidCardByBrand?: Record<string, string>;
  /** Suma / legacy no pagado efectivo (sin marcas o borradores antiguos). */
  unpaidCash: string;
  unpaidCard: string;
};

export type ManualLinesByChannel = Record<string, ChannelClosingDraft>;

/** Compat borradores antiguos con cash/card por línea. */
export type LineDraft = { qty: string; cash?: string; card?: string };
export type ChannelLinesDraft = Record<FoodFamilyKey, LineDraft> & {
  total?: string;
  unpaidCash?: string;
  unpaidCard?: string;
};

export type AggregatorClosingSnapshot = {
  foodByChannel: Record<string, FoodFamilyCounts>;
  foodTotals: FoodFamilyCounts;
  /** No pagado efectivo (arqueo). */
  cashByChannel: Record<string, number>;
  /** No pagado tarjeta. */
  cardByChannel: Record<string, number>;
  cashTotal: number;
  cardTotal: number;
  /** Suma de totales app (hecho en integrador). */
  appTotal: number;
  rows: AggregatorCashRow[];
  /** Totales por marca y canal (2ª caja). channel → brandId → € */
  brandTotalsByChannel: Record<string, Record<string, number>>;
  /** No pagado efectivo por marca. channel → brandId → € */
  unpaidCashByBrandByChannel: Record<string, Record<string, number>>;
  /** No pagado tarjeta por marca. channel → brandId → € */
  unpaidCardByBrandByChannel: Record<string, Record<string, number>>;
};

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  foodByChannel: Record<string, FoodFamilyCounts>;
  title?: string;
  startStep?: number;
  initialManualDraft?: ManualLinesByChannel | Record<string, unknown> | null;
  onSnapshotChange?: (snapshot: AggregatorClosingSnapshot) => void;
  onManualDraftChange?: (draft: ManualLinesByChannel) => void;
  /** Totales apps por marca (Facturación), p. ej. Modomio / Blackburger. */
  appsBrandRows?: ShiftAppsBrandTotalRow[];
  appsBrandUnbranded?: number;
  /**
   * Slots de 2ª caja = hojas de Facturación (marca que manda).
   * Si tacos facturan con Black Burger → un solo «Total Black Burger».
   */
  closingBrands?: Array<{ brandId: string; name: string; memberBrandIds?: string[] }>;
  /** Cierre por pasos: todas las apps visibles en una sola vista compacta. */
  dense?: boolean;
  /** Ocupa altura del padre sin scroll interno. */
  fillHeight?: boolean;
  /**
   * Si se pasa, el cockpit muestra solo esa app (pasos Glovo/Uber/Just/Flip del cierre).
   * El rail y «Siguiente app» se ocultan: navega el wizard del padre.
   */
  focusChannel?: string | null;
}

const FOOD_LINES = DELIVERY_FOOD_UNIT_ORDER.map((key) => ({
  key,
  label: deliveryFoodUnitTitle(key),
}));

const CHIP =
  'px-2 py-0.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
const INPUT_QTY =
  'w-full min-h-11 px-2 py-2 text-lg font-black tabular-nums border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const INPUT_TOTAL =
  'w-full min-h-11 px-2 py-2 text-lg font-black tabular-nums border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const INPUT_CASH =
  `w-full min-h-11 px-2 py-2 text-lg font-black tabular-nums border ${VERTIAL_CASH_BORDER} rounded-xl ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT} focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500`;
const INPUT_CARD =
  `w-full min-h-11 px-2 py-2 text-lg font-black tabular-nums border ${VERTIAL_CARD_BORDER} rounded-xl ${VERTIAL_CARD_BG} ${VERTIAL_CARD_TEXT} focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500`;

function emptyChannel(systemTotal = 0): ChannelClosingDraft {
  return {
    pizza: { qty: '' },
    burger: { qty: '' },
    taco: { qty: '' },
    total: systemTotal > 0 ? systemTotal.toFixed(2).replace('.', ',') : '',
    totalByBrand: {},
    unpaidCashByBrand: {},
    unpaidCardByBrand: {},
    unpaidCash: '',
    unpaidCard: '',
  };
}

function parseBrandMoneyMap(
  raw: unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(id || '').trim();
    if (!key) continue;
    out[key] = String(val ?? '');
  }
  return out;
}

/** Suma € de un mapa marca→draft; si nadie ha tocado marcas, cae al legacy. */
function resolveUnpaidAmount(
  byBrand: Record<string, string> | undefined,
  brandIds: string[],
  legacy: string,
): { amount: number; fromBrands: boolean; byBrand: Record<string, number> } {
  const map: Record<string, number> = {};
  let anyFilled = false;
  let sum = 0;
  const ids = brandIds.length > 0 ? brandIds : Object.keys(byBrand || {});
  for (const id of ids) {
    const raw = String(byBrand?.[id] ?? '').trim();
    if (!raw) continue;
    anyFilled = true;
    const p = parseAggregatorAmount(raw);
    if (p != null && p > 0) {
      const v = Math.round(p * 100) / 100;
      map[id] = v;
      sum += v;
    }
  }
  if (anyFilled) {
    return { amount: Math.round(sum * 100) / 100, fromBrands: true, byBrand: map };
  }
  const legacyAmt = Math.max(0, parseAggregatorAmount(legacy) ?? 0);
  return {
    amount: Math.round(legacyAmt * 100) / 100,
    fromBrands: false,
    byBrand: {},
  };
}

function parseCount(raw: string): number {
  const t = String(raw ?? '').trim();
  if (!t) return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeCountInput(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return '';
  return String(n);
}

function moneyToDraft(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(2).replace('.', ',');
}

/** Acepta borrador nuevo o legacy (cash/card por pizza/burger/taco). */
function normalizeChannelDraft(
  raw: unknown,
  autoFood: FoodFamilyCounts,
  systemTotal: number,
): ChannelClosingDraft {
  const base = emptyChannel(systemTotal);
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      pizza: { qty: autoFood.pizza > 0 ? String(autoFood.pizza) : '' },
      burger: { qty: autoFood.burger > 0 ? String(autoFood.burger) : '' },
      taco: { qty: autoFood.taco > 0 ? String(autoFood.taco) : '' },
    };
  }
  const o = raw as Record<string, unknown>;
  const qtyOf = (key: FoodFamilyKey): string => {
    const line = o[key];
    if (line && typeof line === 'object' && 'qty' in line) {
      return String((line as { qty?: string }).qty ?? '');
    }
    return autoFood[key] > 0 ? String(autoFood[key]) : '';
  };

  let unpaidCash = String(o.unpaidCash ?? o.cash ?? '');
  let unpaidCard = String(o.unpaidCard ?? o.card ?? '');
  let total = String(o.total ?? '');

  if (!unpaidCash && !unpaidCard) {
    let cashSum = 0;
    let cardSum = 0;
    let hadMoney = false;
    for (const key of DELIVERY_FOOD_UNIT_ORDER) {
      const line = o[key];
      if (!line || typeof line !== 'object') continue;
      const c = parseAggregatorAmount(String((line as { cash?: string }).cash ?? ''));
      const d = parseAggregatorAmount(String((line as { card?: string }).card ?? ''));
      if (c != null) {
        cashSum += c;
        hadMoney = true;
      }
      if (d != null) {
        cardSum += d;
        hadMoney = true;
      }
    }
    if (hadMoney) {
      unpaidCash = moneyToDraft(cashSum);
      unpaidCard = moneyToDraft(cardSum);
    }
  }

  if (!total.trim() && systemTotal > 0) {
    total = moneyToDraft(systemTotal);
  }

  const totalByBrand = parseBrandMoneyMap(o.totalByBrand);
  const unpaidCashByBrand = parseBrandMoneyMap(o.unpaidCashByBrand);
  const unpaidCardByBrand = parseBrandMoneyMap(o.unpaidCardByBrand);

  return {
    pizza: { qty: qtyOf('pizza') },
    burger: { qty: qtyOf('burger') },
    taco: { qty: qtyOf('taco') },
    total,
    totalByBrand,
    unpaidCashByBrand,
    unpaidCardByBrand,
    unpaidCash,
    unpaidCard,
  };
}

function buildSeedDraft(
  autoRows: AggregatorCashRow[],
  foodByChannel: Record<string, FoodFamilyCounts>,
  initial?: Record<string, unknown> | null,
): ManualLinesByChannel {
  const out: ManualLinesByChannel = {};
  for (const row of autoRows) {
    const ch = row.platform.channel;
    const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
    out[ch] = normalizeChannelDraft(initial?.[ch], auto, row.totalSales);
  }
  return out;
}

function channelQtyAllZero(lines: ChannelClosingDraft | undefined): boolean {
  if (!lines) return true;
  return parseCount(lines.pizza.qty) === 0
    && parseCount(lines.burger.qty) === 0
    && parseCount(lines.taco.qty) === 0;
}

/**
 * Cierre por app: unidades + total hecho en integrador + no pagados (tienda).
 */
export function AggregatorClosingEditor({
  autoRows,
  foodByChannel,
  title = 'Integraciones',
  startStep = 2,
  initialManualDraft = null,
  onSnapshotChange,
  onManualDraftChange,
  appsBrandRows = [],
  appsBrandUnbranded = 0,
  closingBrands = [],
  dense = false,
  fillHeight = false,
  focusChannel = null,
}: AggregatorClosingEditorProps) {
  const seededRef = useRef(false);
  const touchedRef = useRef<Set<string>>(new Set());
  const [draft, setDraft] = useState<ManualLinesByChannel>(() =>
    buildSeedDraft(autoRows, foodByChannel, initialManualDraft as Record<string, unknown> | null),
  );
  const focusLocked = Boolean(focusChannel);
  /** App enfocada en vista cockpit (cierre denso). */
  const [activeChannel, setActiveChannel] = useState(() =>
    String(focusChannel || autoRows[0]?.platform.channel || ''),
  );
  const brandIds = useMemo(
    () => closingBrands.map((b) => b.brandId).filter(Boolean),
    [closingBrands],
  );
  /** Todas las hojas de Facturación del cierre (Total Modomio, Total Black Burger…). */
  const marcaSlots = useMemo(() => {
    return closingBrands
      .filter((b) => b.brandId)
      .map((brand, index) => {
        const name = String(brand.name || '').trim() || `Marca ${index + 1}`;
        return {
          brandId: brand.brandId,
          name,
          label: `Total ${name}`,
          slot: index + 1,
        };
      });
  }, [closingBrands]);
  const hasBrandTotals = marcaSlots.length > 0;
  const marcaBrandIds = useMemo(() => marcaSlots.map((s) => s.brandId), [marcaSlots]);

  useEffect(() => {
    if (initialManualDraft && typeof initialManualDraft === 'object') {
      for (const ch of Object.keys(initialManualDraft)) touchedRef.current.add(ch);
    }
  }, [initialManualDraft]);

  /** Borrador auto-guardado: quitar `total` legacy si las marcas están vacías. */
  useEffect(() => {
    if (marcaBrandIds.length === 0) return;
    setDraft((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of autoRows) {
        const ch = row.platform.channel;
        const lines = next[ch];
        if (!lines?.total?.trim()) continue;
        if (sumClosingBrandTotals(lines, marcaBrandIds) >= 0) continue;
        next[ch] = { ...lines, total: '' };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [autoRows, marcaBrandIds]);

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (touchedRef.current.has(ch)) continue;
        if (next[ch] && seededRef.current) continue;
        const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
        next[ch] = normalizeChannelDraft(null, auto, row.totalSales);
        changed = true;
      }
      return changed ? next : prev;
    });
    seededRef.current = true;
  }, [autoRows, foodByChannel]);

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (touchedRef.current.has(ch)) continue;
        const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
        const autoHas = auto.pizza > 0 || auto.burger > 0 || auto.taco > 0;
        if (channelQtyAllZero(next[ch]) && autoHas) {
          const cur = next[ch] || emptyChannel(row.totalSales);
          next[ch] = {
            ...cur,
            pizza: { qty: auto.pizza > 0 ? String(auto.pizza) : '' },
            burger: { qty: auto.burger > 0 ? String(auto.burger) : '' },
            taco: { qty: auto.taco > 0 ? String(auto.taco) : '' },
            total: cur.total.trim() ? cur.total : moneyToDraft(row.totalSales),
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [autoRows, foodByChannel]);

  const snapshot = useMemo((): AggregatorClosingSnapshot => {
    const foodByCh: Record<string, FoodFamilyCounts> = {};
    const cashByChannel: Record<string, number> = {};
    const cardByChannel: Record<string, number> = {};
    const brandTotalsByChannel: Record<string, Record<string, number>> = {};
    const unpaidCashByBrandByChannel: Record<string, Record<string, number>> = {};
    const unpaidCardByBrandByChannel: Record<string, Record<string, number>> = {};
    let appTotal = 0;

    const rows: AggregatorCashRow[] = autoRows.map((row) => {
      const ch = row.platform.channel;
      const lines = draft[ch] || emptyChannel(row.totalSales);
      const pizzaQty = parseCount(lines.pizza.qty);
      const burgerQty = parseCount(lines.burger.qty);
      const tacoQty = parseCount(lines.taco.qty);
      foodByCh[ch] = { pizza: pizzaQty, burger: burgerQty, taco: tacoQty };

      const cashResolved = resolveUnpaidAmount(
        lines.unpaidCashByBrand,
        marcaBrandIds,
        lines.unpaidCash,
      );
      const cardResolved = resolveUnpaidAmount(
        lines.unpaidCardByBrand,
        marcaBrandIds,
        lines.unpaidCard,
      );
      const cashSales = cashResolved.amount;
      const cardSales = cardResolved.amount;
      cashByChannel[ch] = cashSales;
      cardByChannel[ch] = cardSales;
      if (Object.keys(cashResolved.byBrand).length > 0) {
        unpaidCashByBrandByChannel[ch] = cashResolved.byBrand;
      }
      if (Object.keys(cardResolved.byBrand).length > 0) {
        unpaidCardByBrandByChannel[ch] = cardResolved.byBrand;
      }

      const brandMoney: Record<string, number> = {};
      for (const id of marcaBrandIds) {
        const p = parseAggregatorAmount(String(lines.totalByBrand?.[id] ?? ''));
        if (p != null && p > 0) brandMoney[id] = Math.round(p * 100) / 100;
      }
      if (Object.keys(brandMoney).length > 0) brandTotalsByChannel[ch] = brandMoney;

      // Total de esta vista = solo hecho en app (2ª caja / marcas).
      // El no pagado NUNCA suma aquí: va aparte al cajón (cashSales / cardSales).
      const resolved = resolveClosingChannelTotalSales(lines, row.totalSales, marcaBrandIds);
      const totalSales = resolved.totalSales;

      appTotal += totalSales;
      const brandTouched = marcaBrandIds.some((id) => String(lines.totalByBrand?.[id] ?? '').trim());
      const unpaidBrandTouched = marcaBrandIds.some(
        (id) =>
          String(lines.unpaidCashByBrand?.[id] ?? '').trim()
          || String(lines.unpaidCardByBrand?.[id] ?? '').trim(),
      );
      const manualOverride =
        resolved.fromBrands
        || brandTouched
        || unpaidBrandTouched
        || parseAggregatorAmount(lines.total) != null
        || parseAggregatorAmount(lines.unpaidCash) != null
        || parseAggregatorAmount(lines.unpaidCard) != null;

      return {
        ...row,
        cashSales,
        cardSales,
        totalSales: Math.round(totalSales * 100) / 100,
        manualOverride,
      };
    });

    return {
      foodByChannel: foodByCh,
      foodTotals: sumFoodFamilyCounts(Object.values(foodByCh)),
      cashByChannel,
      cardByChannel,
      cashTotal: sumAggregatorCash(rows),
      cardTotal: sumAggregatorCard(rows),
      appTotal: Math.round(appTotal * 100) / 100,
      rows,
      brandTotalsByChannel,
      unpaidCashByBrandByChannel,
      unpaidCardByBrandByChannel,
    };
  }, [autoRows, draft, marcaBrandIds]);

  useEffect(() => {
    onSnapshotChange?.(snapshot);
  }, [snapshot, onSnapshotChange]);

  useEffect(() => {
    onManualDraftChange?.(draft);
  }, [draft, onManualDraftChange]);

  /** Totales marca desde inputs manuales (2ª caja); si vacío, escala del sistema. */
  const brandAppsDisplay = useMemo(() => {
    if (hasBrandTotals) {
      const sums: Record<string, number> = {};
      let anyManual = false;
      for (const row of autoRows) {
        const lines = draft[row.platform.channel];
        if (!lines?.totalByBrand) continue;
        for (const slot of marcaSlots) {
          const p = parseAggregatorAmount(String(lines.totalByBrand[slot.brandId] ?? ''));
          if (p == null) continue;
          anyManual = true;
          sums[slot.brandId] = Math.round(((sums[slot.brandId] || 0) + p) * 100) / 100;
        }
      }
      if (anyManual) {
        const rows = marcaSlots
          .map((slot) => ({
            brandId: slot.brandId,
            name: slot.name,
            revenue: sums[slot.brandId] || 0,
            orderCount: 0,
            sharePercent: 0,
          }))
          .filter((r) => r.revenue > 0);
        const total = rows.reduce((s, r) => s + r.revenue, 0);
        return {
          rows: rows.map((r) => ({
            ...r,
            sharePercent: total > 0 ? Math.round((r.revenue / total) * 1000) / 10 : 0,
          })),
          unbranded: 0,
        };
      }
    }
    if (!appsBrandRows.length && appsBrandUnbranded <= 0) return null;
    return scaleAppsBrandTotalsToAppTotal(
      appsBrandRows,
      appsBrandUnbranded,
      snapshot.appTotal,
    );
  }, [
    hasBrandTotals,
    marcaSlots,
    autoRows,
    draft,
    appsBrandRows,
    appsBrandUnbranded,
    snapshot.appTotal,
  ]);

  const patchQty = (channel: string, family: FoodFamilyKey, value: string) => {
    touchedRef.current.add(channel);
    setDraft((prev) => {
      const cur = prev[channel] || emptyChannel();
      return {
        ...prev,
        [channel]: {
          ...cur,
          [family]: { qty: value },
        },
      };
    });
  };

  const patchMoney = (
    channel: string,
    field: 'total' | 'unpaidCash' | 'unpaidCard',
    value: string,
  ) => {
    touchedRef.current.add(channel);
    setDraft((prev) => {
      const cur = prev[channel] || emptyChannel();
      return {
        ...prev,
        [channel]: {
          ...cur,
          [field]: value,
        },
      };
    });
  };

  const patchBrandTotal = (channel: string, brandId: string, value: string) => {
    touchedRef.current.add(channel);
    setDraft((prev) => {
      const cur = prev[channel] || emptyChannel();
      const totalByBrand = { ...(cur.totalByBrand || {}), [brandId]: value };
      const brandSum = sumClosingBrandTotals({ ...cur, totalByBrand }, marcaBrandIds);
      return {
        ...prev,
        [channel]: {
          ...cur,
          totalByBrand,
          total: brandSum >= 0 ? moneyToDraft(brandSum) : '',
        },
      };
    });
  };

  const patchUnpaidBrand = (
    channel: string,
    brandId: string,
    kind: 'cash' | 'card',
    value: string,
  ) => {
    touchedRef.current.add(channel);
    setDraft((prev) => {
      const cur = prev[channel] || emptyChannel();
      const cashMap = { ...(cur.unpaidCashByBrand || {}) };
      const cardMap = { ...(cur.unpaidCardByBrand || {}) };
      if (kind === 'cash') cashMap[brandId] = value;
      else cardMap[brandId] = value;
      const cashSum = resolveUnpaidAmount(cashMap, marcaBrandIds, '').amount;
      const cardSum = resolveUnpaidAmount(cardMap, marcaBrandIds, '').amount;
      return {
        ...prev,
        [channel]: {
          ...cur,
          unpaidCashByBrand: cashMap,
          unpaidCardByBrand: cardMap,
          unpaidCash: cashSum > 0 ? moneyToDraft(cashSum) : '',
          unpaidCard: cardSum > 0 ? moneyToDraft(cardSum) : '',
        },
      };
    });
  };

  const renderUnpaidBrandGrid = (
    channel: string,
    platformLabel: string,
    lines: ChannelClosingDraft,
    inputClass: string,
  ) => {
    if (!hasBrandTotals) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 min-w-0">
            <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${VERTIAL_CASH_TEXT}`}>
              <Banknote className="w-3.5 h-3.5" /> Efectivo
            </span>
            <input
              type="text"
              inputMode="decimal"
              lang="es-ES"
              placeholder="0,00"
              aria-label={`${platformLabel} No pagado efectivo`}
              value={lines.unpaidCash}
              onChange={(e) =>
                patchMoney(channel, 'unpaidCash', formatMoneyAsYouType(e.target.value, true))
              }
              className={`${inputClass} font-black ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT}`}
            />
          </label>
          <label className="flex flex-col gap-1 min-w-0">
            <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${VERTIAL_CARD_TEXT}`}>
              <CreditCard className="w-3.5 h-3.5" /> Tarjeta
            </span>
            <input
              type="text"
              inputMode="decimal"
              lang="es-ES"
              placeholder="0,00"
              aria-label={`${platformLabel} No pagado tarjeta`}
              value={lines.unpaidCard}
              onChange={(e) =>
                patchMoney(channel, 'unpaidCard', formatMoneyAsYouType(e.target.value, true))
              }
              className={`${inputClass} font-black ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} ${VERTIAL_CARD_TEXT}`}
            />
          </label>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 px-0.5">
          <p className={`text-[9px] font-bold uppercase tracking-wider ${VERTIAL_CASH_TEXT}`}>
            Efectivo · al cajón
          </p>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${VERTIAL_CARD_TEXT}`}>
            Tarjeta · valora marca
          </p>
        </div>
        {marcaSlots.map((slot) => (
          <div key={slot.brandId} className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 min-w-0">
              <span className={`text-[11px] font-bold truncate ${VERTIAL_CASH_TEXT}`}>
                Efectivo {slot.name}
              </span>
              <input
                type="text"
                inputMode="decimal"
                lang="es-ES"
                placeholder="0,00"
                aria-label={`${platformLabel} Efectivo ${slot.name}`}
                value={lines.unpaidCashByBrand?.[slot.brandId] ?? ''}
                onChange={(e) =>
                  patchUnpaidBrand(
                    channel,
                    slot.brandId,
                    'cash',
                    formatMoneyAsYouType(e.target.value, true),
                  )
                }
                className={`${inputClass} font-black ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT}`}
              />
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className={`text-[11px] font-bold truncate ${VERTIAL_CARD_TEXT}`}>
                Tarjeta {slot.name}
              </span>
              <input
                type="text"
                inputMode="decimal"
                lang="es-ES"
                placeholder="0,00"
                aria-label={`${platformLabel} Tarjeta ${slot.name}`}
                value={lines.unpaidCardByBrand?.[slot.brandId] ?? ''}
                onChange={(e) =>
                  patchUnpaidBrand(
                    channel,
                    slot.brandId,
                    'card',
                    formatMoneyAsYouType(e.target.value, true),
                  )
                }
                className={`${inputClass} font-black ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} ${VERTIAL_CARD_TEXT}`}
              />
            </label>
          </div>
        ))}
      </div>
    );
  };

  const focusCountField = (e: FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (!v || v === '0') e.currentTarget.select();
  };

  useEffect(() => {
    if (focusChannel) {
      setActiveChannel(focusChannel);
      return;
    }
    if (!autoRows.length) {
      setActiveChannel('');
      return;
    }
    const channels = new Set(autoRows.map((r) => r.platform.channel));
    if (!channels.has(activeChannel)) {
      setActiveChannel(autoRows[0].platform.channel);
    }
  }, [autoRows, activeChannel, focusChannel]);

  const channelReady = (ch: string): boolean => {
    const lines = draft[ch];
    if (!lines) return false;
    const resolved = resolveClosingChannelTotalSales(
      lines,
      autoRows.find((r) => r.platform.channel === ch)?.totalSales ?? 0,
      marcaBrandIds,
    );
    const units =
      parseCount(lines.pizza.qty) + parseCount(lines.burger.qty) + parseCount(lines.taco.qty);
    return resolved.totalSales > 0 || units > 0;
  };

  if (dense) {
    const inputBig =
      'w-full min-h-12 px-2 rounded-xl border bg-white dark:bg-stone-950 text-xl font-black tabular-nums tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500';
    const inputNeutral = `${inputBig} border-stone-200 dark:border-stone-700`;
    const activeRow =
      autoRows.find((r) => r.platform.channel === activeChannel) || autoRows[0] || null;
    const activeCh = activeRow?.platform.channel || '';
    const activeLines = activeCh
      ? draft[activeCh] || emptyChannel(activeRow?.totalSales || 0)
      : emptyChannel();
    const activeSnap = snapshot.rows.find((r) => r.platform.channel === activeCh);
    const readyCount = autoRows.filter((r) => channelReady(r.platform.channel)).length;
    const accent = activeRow?.platform.colorClass || 'bg-stone-800 text-white';

    return (
      <div
        className={`rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-950 overflow-hidden ${
          fillHeight ? 'h-full min-h-0 flex flex-col' : ''
        }`}
      >
        {/* Cockpit — totales vivos */}
        <div className="shrink-0 border-b border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Apps · {readyCount}/{autoRows.length} listas
              </p>
              <p className="mt-0.5 text-2xl font-black tabular-nums tracking-tight text-stone-900 dark:text-stone-50">
                {formatMoneyEs(snapshot.appTotal)}
              </p>
              <p className="text-[10px] font-medium text-stone-500">
                Hecho en app · Caja 2 (sin no pagado)
              </p>
            </div>
            <QuietTip tip="Solo no pagado en efectivo. Va al arqueo del cajón. La tarjeta no pagada se anota abajo por marca, no aquí.">
              <div
                className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-right ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG}`}
              >
                <p className={`text-[9px] font-bold uppercase tracking-wide ${VERTIAL_CASH_TEXT} flex items-center justify-end gap-1`}>
                  <Banknote className="w-3 h-3" /> Al cajón
                </p>
                <p className={`text-lg font-black tabular-nums leading-none ${VERTIAL_CASH_TEXT}`}>
                  {formatMoneyEs(snapshot.cashTotal)}
                </p>
              </div>
            </QuietTip>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold tabular-nums text-stone-600 dark:text-stone-300">
            {DELIVERY_FOOD_UNIT_ORDER.map((unit) => (
              <span
                key={unit}
                className="inline-flex items-center gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 px-2 py-0.5"
              >
                <DeliveryFoodUnitIcon unit={unit} className="w-3.5 h-3.5" muted />
                {snapshot.foodTotals[unit]}
              </span>
            ))}
            {brandAppsDisplay?.rows.length ? (
              <span className="ml-auto text-[10px] font-semibold text-stone-400 truncate max-w-[50%]">
                {brandAppsDisplay.rows
                  .map((r) => `${r.name} ${formatMoneyEs(r.revenue)}`)
                  .join(' · ')}
              </span>
            ) : null}
          </div>
        </div>

        {/* Rail de apps (solo si no hay wizard externo por canal) */}
        {!focusLocked ? (
          <div className="shrink-0 flex gap-1.5 overflow-x-auto px-2.5 py-2 border-b border-stone-200/70 dark:border-stone-800 scrollbar-none">
            {autoRows.map((row, index) => {
              const ch = row.platform.channel;
              const selected = ch === activeCh;
              const ready = channelReady(ch);
              const snapRow = snapshot.rows.find((r) => r.platform.channel === ch);
              const pillAccent = row.platform.colorClass || 'bg-stone-700 text-white';
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setActiveChannel(ch)}
                  className={`relative shrink-0 min-w-[7.5rem] rounded-xl border-2 px-2.5 py-2 text-left transition-all ${
                    selected
                      ? 'border-blue-600 bg-white shadow-sm dark:border-blue-400 dark:bg-stone-900'
                      : 'border-transparent bg-white/70 hover:border-stone-300 dark:bg-stone-900/60 dark:hover:border-stone-600'
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${pillAccent}`}
                  >
                    {startStep + index}. {row.platform.label}
                    {ready ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
                  </span>
                  <p className="mt-1 text-sm font-black tabular-nums text-stone-900 dark:text-stone-100">
                    {formatMoneyEs(snapRow?.totalSales ?? 0)}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* App enfocada */}
        <div
          className={`px-2.5 py-2 space-y-2 ${
            fillHeight ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain' : ''
          }`}
        >
          {!activeRow ? (
            <p className="text-sm text-stone-500 px-1 py-6 text-center">No hay apps en este turno.</p>
          ) : (
            <div
              key={activeCh}
              className="rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-white dark:bg-stone-950 shadow-sm"
            >
              <div className={`px-3 py-2 flex items-center justify-between gap-2 ${accent}`}>
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-wide truncate">{activeRow.platform.label}</p>
                  <p className="text-[10px] font-medium opacity-90">
                    Tres pasos · unidades → marcas → tienda
                  </p>
                </div>
                <p className="text-lg font-black tabular-nums shrink-0">
                  {formatMoneyEs(activeSnap?.totalSales ?? 0)}
                </p>
              </div>

              <div className="p-2.5 space-y-2.5">
                {/* 1 · Unidades */}
                <section className="rounded-xl bg-stone-100/90 dark:bg-stone-900/80 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">
                    1 · Unidades
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {FOOD_LINES.map((line) => (
                      <label key={line.key} className="flex flex-col gap-1 min-w-0">
                        <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-400 inline-flex items-center gap-1">
                          <DeliveryFoodUnitIcon unit={line.key} className="w-3.5 h-3.5" muted />
                          {line.label}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="0"
                          aria-label={`${activeRow.platform.label} ${line.label}`}
                          value={activeLines[line.key].qty}
                          onFocus={focusCountField}
                          onChange={(e) =>
                            patchQty(activeCh, line.key, normalizeCountInput(e.target.value))
                          }
                          className={inputNeutral}
                        />
                      </label>
                    ))}
                  </div>
                </section>

                {/* 2 · Caja 2 */}
                <section className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/35 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1.5">
                    2 · Caja 2 · Hecho en app
                  </p>
                  <div
                    className={`grid gap-2 ${
                      marcaSlots.length <= 1
                        ? 'grid-cols-1'
                        : marcaSlots.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-2 sm:grid-cols-3'
                    }`}
                  >
                    {hasBrandTotals ? (
                      marcaSlots.map((slot) => (
                        <label key={slot.brandId} className="flex flex-col gap-1 min-w-0">
                          <span className="text-[11px] font-bold text-blue-900 dark:text-blue-100 truncate">
                            {slot.label}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            lang="es-ES"
                            placeholder="0,00"
                            aria-label={`${activeRow.platform.label} ${slot.label}`}
                            value={activeLines.totalByBrand?.[slot.brandId] ?? ''}
                            onChange={(e) =>
                              patchBrandTotal(
                                activeCh,
                                slot.brandId,
                                formatMoneyAsYouType(e.target.value, true),
                              )
                            }
                            className={`${inputBig} border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-50`}
                          />
                        </label>
                      ))
                    ) : (
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[11px] font-bold text-blue-900 dark:text-blue-100">
                          Total app
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          lang="es-ES"
                          placeholder="0,00"
                          aria-label={`${activeRow.platform.label} Total app`}
                          value={activeLines.total}
                          onChange={(e) =>
                            patchMoney(activeCh, 'total', formatMoneyAsYouType(e.target.value, true))
                          }
                          className={`${inputBig} border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-50`}
                        />
                      </label>
                    )}
                  </div>
                </section>

                {/* 3 · Caja 1 · no pagado por marca */}
                <section className="rounded-xl border border-emerald-200 dark:border-emerald-900/45 bg-emerald-50/70 dark:bg-emerald-950/30 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1">
                    <Store className="w-3 h-3" /> 3 · Cobrado en Caja 1 · no pagado
                  </p>
                  <p className="text-[10px] text-emerald-800/80 dark:text-emerald-200/70 mb-1.5 leading-snug">
                    No suma al total de arriba (Caja 2). Efectivo → cajón. Tarjeta no va al cajón:
                    se apunta por marca para valorar bien cada una.
                  </p>
                  {renderUnpaidBrandGrid(
                    activeCh,
                    activeRow.platform.label,
                    activeLines,
                    inputBig,
                  )}
                </section>

                {!focusLocked ? (() => {
                  const idx = autoRows.findIndex((r) => r.platform.channel === activeCh);
                  const next = idx >= 0 ? autoRows[idx + 1] : undefined;
                  if (!next) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveChannel(next.platform.channel)}
                      className="w-full min-h-11 rounded-xl bg-[#2563EB] text-white text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors"
                    >
                      Siguiente · {next.platform.label}
                    </button>
                  );
                })() : null}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-sm">
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300">
          <Plug className="w-3.5 h-3.5 opacity-70" /> {title}
        </div>
        <div className="text-right">
          <QuietTip tip="Total hecho en apps (plataformas). No es el cajón de tienda. El efectivo de abajo solo es «no pagado» cobrado en local.">
            <p className="text-sm font-black tabular-nums text-stone-900 dark:text-stone-100">
              Total apps {snapshot.appTotal.toFixed(2)}€
            </p>
          </QuietTip>
          <p className="text-[11px] font-semibold tabular-nums mt-0.5">
            <QuietTip tip="No pagado en efectivo en tienda → sí suma al arqueo del cajón.">
              <span className={VERTIAL_CASH_TEXT}>No pagado efectivo {formatDecimalEs(snapshot.cashTotal)}€</span>
            </QuietTip>
            <span className="mx-1 font-semibold text-stone-400">·</span>
            <QuietTip tip="No pagado con tarjeta en tienda. No suma al cajón de efectivo.">
              <span className={VERTIAL_CARD_TEXT}>No pagado tarjeta {formatDecimalEs(snapshot.cardTotal)}€</span>
            </QuietTip>
          </p>
        </div>
      </div>

      {brandAppsDisplay && (brandAppsDisplay.rows.length > 0 || brandAppsDisplay.unbranded > 0) ? (
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-stone-50/80 dark:bg-stone-900/40 space-y-1">
          <QuietTip tip="Reparto / totales por marca de las apps (Caja 2). No suma al cajón de tienda. Solo el «No pagado efectivo» entra en el arqueo.">
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Caja 2 · totales por marca
            </p>
          </QuietTip>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {brandAppsDisplay.rows.map((row) => (
              <p
                key={row.brandId}
                className="text-xs font-semibold text-stone-800 dark:text-stone-100 tabular-nums"
              >
                <span className="text-stone-500 dark:text-stone-400 font-medium">Total {row.name}</span>
                {' '}
                <span className="font-black">{formatMoneyEs(row.revenue)}</span>
                {row.sharePercent > 0 ? (
                  <span className="ml-1 text-[10px] font-semibold text-stone-400">{row.sharePercent}%</span>
                ) : null}
              </p>
            ))}
            {brandAppsDisplay.unbranded > 0 ? (
              <p className="text-xs font-semibold text-stone-500 tabular-nums">
                Sin marca {formatMoneyEs(brandAppsDisplay.unbranded)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="p-2.5 space-y-2">
        <div className="hidden lg:grid grid-cols-[6.5rem_repeat(3,minmax(0,4rem))_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 text-[11px] font-semibold text-stone-500">
          <span>App</span>
          {FOOD_LINES.map((line) => (
            <span key={line.key} className="text-center">{line.label}</span>
          ))}
          <QuietTip tip="Todo lo vendido en esa app por marca (Caja 2). No entra en el cajón de tienda.">
            <span>{hasBrandTotals ? 'Total marca 1 / 2' : 'Total app'}</span>
          </QuietTip>
          <QuietTip tip="Pedidos de la app cobrados en efectivo en tienda. Sí suma al arqueo de la caja de tienda.">
            <span className={VERTIAL_CASH_TEXT}>No pagado efectivo</span>
          </QuietTip>
          <QuietTip tip="Pedidos de la app cobrados con tarjeta en tienda. No suma al cajón.">
            <span className={VERTIAL_CARD_TEXT}>No pagado tarjeta</span>
          </QuietTip>
        </div>

        {autoRows.map((row, index) => {
          const ch = row.platform.channel;
          const lines = draft[ch] || emptyChannel(row.totalSales);
          const stepNum = startStep + index;

          return (
            <div
              key={ch}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/80 dark:bg-stone-900/40 px-2.5 py-2"
            >
              <div className="grid grid-cols-2 lg:grid-cols-[6.5rem_repeat(3,minmax(0,4rem))_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-end">
                <div className="col-span-2 lg:col-span-1 flex items-center gap-1.5 min-w-0 pb-1 lg:pb-0">
                  <span className="text-xs text-stone-400 tabular-nums">{stepNum}.</span>
                  <span className={`${CHIP} truncate`}>{row.platform.label}</span>
                </div>

                {FOOD_LINES.map((line) => (
                  <label key={line.key} className="flex flex-col gap-0.5 min-w-0">
                    <span className="lg:hidden text-[11px] font-semibold text-stone-500">
                      {line.label}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      aria-label={`${row.platform.label} ${line.label}`}
                      value={lines[line.key].qty}
                      onFocus={focusCountField}
                      onChange={(e) =>
                        patchQty(ch, line.key, normalizeCountInput(e.target.value))
                      }
                      className={INPUT_QTY}
                    />
                  </label>
                ))}

                {hasBrandTotals ? (
                  <div className="col-span-2 lg:col-span-1 grid grid-cols-1 gap-1.5 min-w-0">
                    {marcaSlots.map((slot) => (
                      <label key={slot.brandId} className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] font-bold text-stone-700 dark:text-stone-200 truncate">
                          {slot.label}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          lang="es-ES"
                          autoComplete="off"
                          enterKeyHint="done"
                          placeholder="0,00"
                          aria-label={`${row.platform.label} ${slot.label}`}
                          value={lines.totalByBrand?.[slot.brandId] ?? ''}
                          onChange={(e) =>
                            patchBrandTotal(ch, slot.brandId, formatMoneyAsYouType(e.target.value, true))
                          }
                          className={INPUT_TOTAL}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="flex flex-col gap-0.5 min-w-0">
                    <QuietTip tip="Todo lo vendido en esa app. Excel. No entra en el cajón (Caja 2).">
                      <span className="lg:hidden text-[11px] font-semibold text-stone-500">Total app</span>
                    </QuietTip>
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="es-ES"
                      autoComplete="off"
                      enterKeyHint="done"
                      placeholder="0,00"
                      aria-label={`${row.platform.label} total app`}
                      value={lines.total}
                      onChange={(e) =>
                        patchMoney(ch, 'total', formatMoneyAsYouType(e.target.value, true))
                      }
                      className={INPUT_TOTAL}
                    />
                  </label>
                )}
                <div className="col-span-2 lg:col-span-2 min-w-0">
                  <QuietTip tip="No pagado cobrado en tienda, por marca. Efectivo → arqueo; tarjeta no suma al cajón.">
                    <p className="text-[11px] font-semibold text-stone-500 mb-1">
                      No pagado por marca
                    </p>
                  </QuietTip>
                  {renderUnpaidBrandGrid(
                    ch,
                    row.platform.label,
                    lines,
                    'w-full min-h-11 px-2 py-2 text-lg font-black tabular-nums border rounded-xl bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-sm font-black tabular-nums text-stone-900 dark:text-stone-100">
          <span className="inline-flex items-center gap-1 font-bold">
            <DeliveryFoodUnitIcon unit="pizza" className="w-4 h-4" muted />
            {snapshot.foodTotals.pizza}
          </span>
          <span className="inline-flex items-center gap-1 font-bold">
            <DeliveryFoodUnitIcon unit="burger" className="w-4 h-4" muted />
            {snapshot.foodTotals.burger}
          </span>
          <span className="inline-flex items-center gap-1 font-bold">
            <DeliveryFoodUnitIcon unit="taco" className="w-4 h-4" muted />
            {snapshot.foodTotals.taco}
          </span>
          <span>Total apps {formatMoneyEs(snapshot.appTotal)}</span>
          <span className={VERTIAL_CASH_TEXT}>No pagado efectivo {formatMoneyEs(snapshot.cashTotal)}</span>
          <span className={VERTIAL_CARD_TEXT}>No pagado tarjeta {formatMoneyEs(snapshot.cardTotal)}</span>
        </div>
      </div>
    </div>
  );
}
