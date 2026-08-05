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
import { Plug } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  sumAggregatorCard,
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
  /** No pagado cobrado en tienda → arqueo caja tienda. */
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
    unpaidCash: '',
    unpaidCard: '',
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

/** Suma totales por marca del borrador. -1 si ninguno rellenado. */
function sumDraftBrandTotals(
  lines: ChannelClosingDraft | undefined,
  brandIds: string[],
): number {
  if (!lines || brandIds.length === 0) return -1;
  const byBrand = lines.totalByBrand || {};
  let sum = 0;
  let any = false;
  for (const id of brandIds) {
    const p = parseAggregatorAmount(String(byBrand[id] ?? ''));
    if (p != null) {
      sum += p;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : -1;
}

function resolveChannelTotalSales(
  lines: ChannelClosingDraft,
  systemTotal: number,
  brandIds: string[],
): { totalSales: number; fromBrands: boolean } {
  const brandSum = sumDraftBrandTotals(lines, brandIds);
  if (brandSum >= 0) return { totalSales: brandSum, fromBrands: true };
  const parsedTotal = parseAggregatorAmount(lines.total);
  if (parsedTotal != null) return { totalSales: parsedTotal, fromBrands: false };
  return { totalSales: Math.max(0, systemTotal), fromBrands: false };
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

  const totalByBrand: Record<string, string> = {};
  const rawBrands = o.totalByBrand;
  if (rawBrands && typeof rawBrands === 'object') {
    for (const [id, val] of Object.entries(rawBrands as Record<string, unknown>)) {
      const key = String(id || '').trim();
      if (!key) continue;
      totalByBrand[key] = String(val ?? '');
    }
  }

  return {
    pizza: { qty: qtyOf('pizza') },
    burger: { qty: qtyOf('burger') },
    taco: { qty: qtyOf('taco') },
    total,
    totalByBrand,
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
}: AggregatorClosingEditorProps) {
  const seededRef = useRef(false);
  const touchedRef = useRef<Set<string>>(new Set());
  const [draft, setDraft] = useState<ManualLinesByChannel>(() =>
    buildSeedDraft(autoRows, foodByChannel, initialManualDraft as Record<string, unknown> | null),
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
    let appTotal = 0;

    const rows: AggregatorCashRow[] = autoRows.map((row) => {
      const ch = row.platform.channel;
      const lines = draft[ch] || emptyChannel(row.totalSales);
      const pizzaQty = parseCount(lines.pizza.qty);
      const burgerQty = parseCount(lines.burger.qty);
      const tacoQty = parseCount(lines.taco.qty);
      foodByCh[ch] = { pizza: pizzaQty, burger: burgerQty, taco: tacoQty };

      const unpaidCash = parseAggregatorAmount(lines.unpaidCash) ?? 0;
      const unpaidCard = parseAggregatorAmount(lines.unpaidCard) ?? 0;
      const cashSales = Math.round(Math.max(0, unpaidCash) * 100) / 100;
      const cardSales = Math.round(Math.max(0, unpaidCard) * 100) / 100;
      cashByChannel[ch] = cashSales;
      cardByChannel[ch] = cardSales;

      const brandMoney: Record<string, number> = {};
      for (const id of marcaBrandIds) {
        const p = parseAggregatorAmount(String(lines.totalByBrand?.[id] ?? ''));
        if (p != null && p > 0) brandMoney[id] = Math.round(p * 100) / 100;
      }
      if (Object.keys(brandMoney).length > 0) brandTotalsByChannel[ch] = brandMoney;

      const resolved = resolveChannelTotalSales(lines, row.totalSales, marcaBrandIds);
      let totalSales = resolved.totalSales;
      const unpaidSum = Math.round((cashSales + cardSales) * 100) / 100;
      // No pagado suma al cajón; no debe pisar el total de la 2ª caja (marcas).
      if (!resolved.fromBrands) {
        if (totalSales <= 0 && unpaidSum > 0) totalSales = unpaidSum;
        if (unpaidSum > totalSales) totalSales = unpaidSum;
      }

      appTotal += totalSales;
      const brandTouched = marcaBrandIds.some((id) => String(lines.totalByBrand?.[id] ?? '').trim());
      const manualOverride =
        resolved.fromBrands
        || brandTouched
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
      const brandSum = sumDraftBrandTotals({ ...cur, totalByBrand }, marcaBrandIds);
      return {
        ...prev,
        [channel]: {
          ...cur,
          totalByBrand,
          total: brandSum >= 0 ? moneyToDraft(brandSum) : cur.total,
        },
      };
    });
  };

  const focusCountField = (e: FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (!v || v === '0') e.currentTarget.select();
  };

  if (dense) {
    const inputCls =
      'w-full min-h-8 px-1.5 rounded-md border bg-white dark:bg-stone-950 text-sm font-bold tabular-nums leading-none';
    const inputNeutral = `${inputCls} border-stone-200 dark:border-stone-700`;
    return (
      <div
        className={`rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden ${
          fillHeight ? 'h-full min-h-0 flex flex-col' : ''
        }`}
      >
        {/* Resumen corto — una sola franja */}
        <div className="shrink-0 px-2.5 py-1.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-stone-50 dark:bg-stone-900/60">
          <span className="text-[11px] font-bold text-stone-700 dark:text-stone-200">
            Apps {formatMoneyEs(snapshot.appTotal)}
          </span>
          <span className="text-[11px] font-semibold tabular-nums">
            <span className={VERTIAL_CASH_TEXT}>No pagado efectivo {formatDecimalEs(snapshot.cashTotal)}€</span>
            <span className="mx-1.5 text-stone-300">|</span>
            <span className={VERTIAL_CARD_TEXT}>No pagado tarjeta {formatDecimalEs(snapshot.cardTotal)}€</span>
          </span>
        </div>

        <div
          className={`px-2 py-1.5 space-y-2 ${
            fillHeight ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain' : ''
          }`}
        >
          {autoRows.map((row, index) => {
            const ch = row.platform.channel;
            const lines = draft[ch] || emptyChannel(row.totalSales);
            const snapRow = snapshot.rows.find((r) => r.platform.channel === ch);
            const accent = row.platform.colorClass || 'bg-stone-700 text-white';
            return (
              <div
                key={ch}
                className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-white dark:bg-stone-950 shrink-0 shadow-sm"
              >
                {/* Cabecera app — color de plataforma */}
                <div className={`px-2.5 py-1.5 flex items-center justify-between gap-2 ${accent}`}>
                  <span className="text-xs font-bold tracking-wide">
                    {startStep + index}. {row.platform.label}
                  </span>
                  <span className="text-xs font-black tabular-nums opacity-95">
                    {formatMoneyEs(snapRow?.totalSales ?? 0)}
                  </span>
                </div>

                <div className="p-1.5 space-y-1.5">
                  {/* Bloque 1 — unidades */}
                  <div className="rounded-lg bg-stone-100/90 dark:bg-stone-900/80 px-1.5 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-stone-500 mb-1 px-0.5">
                      Unidades
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {FOOD_LINES.map((line) => (
                        <label key={line.key} className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-semibold text-stone-600 dark:text-stone-400">
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
                            onChange={(e) => patchQty(ch, line.key, normalizeCountInput(e.target.value))}
                            className={inputNeutral}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Bloque 2 — 2ª caja / marcas */}
                  <div className="rounded-lg border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 px-1.5 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1 px-0.5">
                      2ª caja · marcas
                    </p>
                    <div
                      className={`grid gap-1.5 ${
                        marcaSlots.length <= 1
                          ? 'grid-cols-1'
                          : marcaSlots.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-2 sm:grid-cols-3'
                      }`}
                    >
                      {hasBrandTotals ? (
                        marcaSlots.map((slot) => (
                          <label key={slot.brandId} className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[10px] font-bold text-blue-800 dark:text-blue-200 truncate">
                              {slot.label}
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              lang="es-ES"
                              placeholder="0,00"
                              aria-label={`${row.platform.label} ${slot.label}`}
                              value={lines.totalByBrand?.[slot.brandId] ?? ''}
                              onChange={(e) =>
                                patchBrandTotal(ch, slot.brandId, formatMoneyAsYouType(e.target.value, true))
                              }
                              className={`${inputCls} border-blue-200 dark:border-blue-800 font-black`}
                            />
                          </label>
                        ))
                      ) : (
                        <label className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-bold text-blue-800 dark:text-blue-200">Total</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            lang="es-ES"
                            placeholder="0,00"
                            aria-label={`${row.platform.label} Total app`}
                            value={lines.total}
                            onChange={(e) => patchMoney(ch, 'total', formatMoneyAsYouType(e.target.value, true))}
                            className={`${inputCls} border-blue-200 dark:border-blue-800 font-black`}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Bloque 3 — caja tienda */}
                  <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/25 px-1.5 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-1 px-0.5">
                      Caja tienda · no pagado
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="flex flex-col gap-0.5 min-w-0">
                        <span className={`text-[10px] font-bold ${VERTIAL_CASH_TEXT}`}>No pagado efectivo</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          lang="es-ES"
                          placeholder="0,00"
                          aria-label={`${row.platform.label} No pagado efectivo`}
                          value={lines.unpaidCash}
                          onChange={(e) =>
                            patchMoney(ch, 'unpaidCash', formatMoneyAsYouType(e.target.value, true))
                          }
                          className={`${inputCls} font-black ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT}`}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 min-w-0">
                        <span className={`text-[10px] font-bold ${VERTIAL_CARD_TEXT}`}>No pagado tarjeta</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          lang="es-ES"
                          placeholder="0,00"
                          aria-label={`${row.platform.label} No pagado tarjeta`}
                          value={lines.unpaidCard}
                          onChange={(e) =>
                            patchMoney(ch, 'unpaidCard', formatMoneyAsYouType(e.target.value, true))
                          }
                          className={`${inputCls} font-black ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} ${VERTIAL_CARD_TEXT}`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
          <QuietTip tip="Reparto / totales por marca de las apps (2ª caja). No suma al cajón de tienda. Solo el «No pagado efectivo» entra en el arqueo.">
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              2ª caja · totales por marca
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
          <QuietTip tip="Todo lo vendido en esa app por marca (2ª caja). No entra en el cajón de tienda.">
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
                    <QuietTip tip="Todo lo vendido en esa app. Excel. No entra en el cajón (2ª caja).">
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
                <label className="flex flex-col gap-0.5 min-w-0">
                  <QuietTip tip="Cobrado en efectivo en tienda. Sí va al arqueo de la caja de tienda.">
                    <span className={`lg:hidden text-[11px] font-semibold ${VERTIAL_CASH_TEXT}`}>No pagado efectivo</span>
                  </QuietTip>
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="es-ES"
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="0,00"
                    aria-label={`${row.platform.label} no pagado efectivo`}
                    value={lines.unpaidCash}
                    onChange={(e) =>
                      patchMoney(ch, 'unpaidCash', formatMoneyAsYouType(e.target.value, true))
                    }
                    className={INPUT_CASH}
                  />
                </label>
                <label className="flex flex-col gap-0.5 min-w-0">
                  <QuietTip tip="Cobrado con tarjeta en tienda. No suma al cajón de efectivo.">
                    <span className={`lg:hidden text-[11px] font-semibold ${VERTIAL_CARD_TEXT}`}>No pagado tarjeta</span>
                  </QuietTip>
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="es-ES"
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="0,00"
                    aria-label={`${row.platform.label} no pagado tarjeta`}
                    value={lines.unpaidCard}
                    onChange={(e) =>
                      patchMoney(ch, 'unpaidCard', formatMoneyAsYouType(e.target.value, true))
                    }
                    className={INPUT_CARD}
                  />
                </label>
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
