import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import { Plug } from 'lucide-react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  sumAggregatorCard,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { formatMoneyAsYouType } from '../../lib/workCenterMoneyInput';
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

/** Borrador por app: unidades + total hecho en integrador + no pagados tienda. */
export type ChannelClosingDraft = {
  pizza: { qty: string };
  burger: { qty: string };
  taco: { qty: string };
  /** Total ventas de la app (todo lo hecho). Excel. */
  total: string;
  /** No pagado cobrado en tienda → arqueo. */
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
};

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  foodByChannel: Record<string, FoodFamilyCounts>;
  title?: string;
  startStep?: number;
  initialManualDraft?: ManualLinesByChannel | Record<string, unknown> | null;
  onSnapshotChange?: (snapshot: AggregatorClosingSnapshot) => void;
  onManualDraftChange?: (draft: ManualLinesByChannel) => void;
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

  return {
    pizza: { qty: qtyOf('pizza') },
    burger: { qty: qtyOf('burger') },
    taco: { qty: qtyOf('taco') },
    total,
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
}: AggregatorClosingEditorProps) {
  const seededRef = useRef(false);
  const touchedRef = useRef<Set<string>>(new Set());
  const [draft, setDraft] = useState<ManualLinesByChannel>(() =>
    buildSeedDraft(autoRows, foodByChannel, initialManualDraft as Record<string, unknown> | null),
  );

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

      const parsedTotal = parseAggregatorAmount(lines.total);
      let totalSales = parsedTotal != null ? parsedTotal : row.totalSales;
      const unpaidSum = Math.round((cashSales + cardSales) * 100) / 100;
      if (totalSales <= 0 && unpaidSum > 0) totalSales = unpaidSum;
      if (unpaidSum > totalSales) totalSales = unpaidSum;

      appTotal += totalSales;
      const manualOverride =
        parsedTotal != null
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
    };
  }, [autoRows, draft]);

  useEffect(() => {
    onSnapshotChange?.(snapshot);
  }, [snapshot, onSnapshotChange]);

  useEffect(() => {
    onManualDraftChange?.(draft);
  }, [draft, onManualDraftChange]);

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

  const focusCountField = (e: FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (!v || v === '0') e.currentTarget.select();
  };

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-sm">
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300">
          <Plug className="w-3.5 h-3.5 opacity-70" /> {title}
        </div>
        <p className="text-sm font-black tabular-nums text-stone-900 dark:text-stone-100">
          Total {snapshot.appTotal.toFixed(2)}€
          <span className="mx-1.5 font-semibold text-stone-400">·</span>
          <span className={VERTIAL_CASH_TEXT}>Efectivo {snapshot.cashTotal.toFixed(2)}€</span>
          <span className="mx-1.5 font-semibold text-stone-400">·</span>
          <span className={VERTIAL_CARD_TEXT}>Tarjeta {snapshot.cardTotal.toFixed(2)}€</span>
        </p>
      </div>

      <div className="p-2.5 space-y-2">
        <div className="hidden lg:grid grid-cols-[6.5rem_repeat(3,minmax(0,4rem))_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 text-[11px] font-semibold text-stone-500">
          <span>App</span>
          {FOOD_LINES.map((line) => (
            <span key={line.key} className="text-center">{line.label}</span>
          ))}
          <QuietTip tip="Todo lo vendido en esa app hoy. Sale en el Excel. No entra en el cajón.">
            <span>Total app</span>
          </QuietTip>
          <QuietTip tip="Pedidos de la app cobrados en efectivo en tienda. Sí suma al arqueo.">
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

                <label className="flex flex-col gap-0.5 min-w-0">
                  <QuietTip tip="Todo lo vendido en esa app. Excel. No entra en el cajón.">
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
                <label className="flex flex-col gap-0.5 min-w-0">
                  <QuietTip tip="Cobrado en efectivo en tienda. Sí va al arqueo.">
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
                  <QuietTip tip="Cobrado con tarjeta en tienda. No suma al cajón.">
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
          <span>Total apps {snapshot.appTotal.toFixed(2)}€</span>
          <span className={VERTIAL_CASH_TEXT}>Efectivo {snapshot.cashTotal.toFixed(2)}€</span>
          <span className={VERTIAL_CARD_TEXT}>Tarjeta {snapshot.cardTotal.toFixed(2)}€</span>
        </div>
      </div>
    </div>
  );
}
