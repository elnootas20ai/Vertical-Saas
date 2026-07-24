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

export type LineDraft = { qty: string; cash: string; card: string };
export type ChannelLinesDraft = Record<FoodFamilyKey, LineDraft>;
export type ManualLinesByChannel = Record<string, ChannelLinesDraft>;

export type AggregatorClosingSnapshot = {
  foodByChannel: Record<string, FoodFamilyCounts>;
  foodTotals: FoodFamilyCounts;
  cashByChannel: Record<string, number>;
  cardByChannel: Record<string, number>;
  cashTotal: number;
  cardTotal: number;
  rows: AggregatorCashRow[];
};

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  /** Conteo sistema por canal (pizzas / burgers / tacos). */
  foodByChannel: Record<string, FoodFamilyCounts>;
  title?: string;
  startStep?: number;
  onSnapshotChange?: (snapshot: AggregatorClosingSnapshot) => void;
}

const FOOD_LINES: Array<{
  key: FoodFamilyKey;
  label: string;
  emoji: string;
  border: string;
  bg: string;
  title: string;
}> = [
  {
    key: 'pizza',
    label: 'Pizzas',
    emoji: '🍕',
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    title: 'text-amber-800 dark:text-amber-200',
  },
  {
    key: 'burger',
    label: 'Burgers',
    emoji: '🍔',
    border: 'border-orange-200 dark:border-orange-800',
    bg: 'bg-orange-50/50 dark:bg-orange-950/20',
    title: 'text-orange-800 dark:text-orange-200',
  },
  {
    key: 'taco',
    label: 'Tacos',
    emoji: '🌮',
    border: 'border-lime-200 dark:border-lime-800',
    bg: 'bg-lime-50/50 dark:bg-lime-950/20',
    title: 'text-lime-800 dark:text-lime-200',
  },
];

function emptyLine(): LineDraft {
  return { qty: '', cash: '', card: '' };
}

function emptyChannelLines(): ChannelLinesDraft {
  return { pizza: emptyLine(), burger: emptyLine(), taco: emptyLine() };
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

function buildSeedLines(
  autoRows: AggregatorCashRow[],
  foodByChannel: Record<string, FoodFamilyCounts>,
): ManualLinesByChannel {
  const out: ManualLinesByChannel = {};
  for (const row of autoRows) {
    const ch = row.platform.channel;
    const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
    out[ch] = {
      pizza: { qty: auto.pizza > 0 ? String(auto.pizza) : '', cash: '', card: '' },
      burger: { qty: auto.burger > 0 ? String(auto.burger) : '', cash: '', card: '' },
      taco: { qty: auto.taco > 0 ? String(auto.taco) : '', cash: '', card: '' },
    };
  }
  return out;
}

function channelQtyAllZero(lines: ChannelLinesDraft | undefined): boolean {
  if (!lines) return true;
  return parseCount(lines.pizza.qty) === 0
    && parseCount(lines.burger.qty) === 0
    && parseCount(lines.taco.qty) === 0;
}

/**
 * Cierre TPV por app: una línea por producto (pizzas / burgers / tacos)
 * con cantidad + efectivo + tarjeta.
 */
export function AggregatorClosingEditor({
  autoRows,
  foodByChannel,
  title = 'Integraciones',
  startStep = 2,
  onSnapshotChange,
}: AggregatorClosingEditorProps) {
  const seededRef = useRef(false);
  const touchedRef = useRef<Set<string>>(new Set());
  const [draft, setDraft] = useState<ManualLinesByChannel>(() =>
    buildSeedLines(autoRows, foodByChannel),
  );

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (touchedRef.current.has(ch)) continue;
        if (next[ch] && seededRef.current) continue;
        const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
        next[ch] = {
          pizza: { qty: auto.pizza > 0 ? String(auto.pizza) : '', cash: '', card: '' },
          burger: { qty: auto.burger > 0 ? String(auto.burger) : '', cash: '', card: '' },
          taco: { qty: auto.taco > 0 ? String(auto.taco) : '', cash: '', card: '' },
        };
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
          const cur = next[ch] || emptyChannelLines();
          next[ch] = {
            pizza: { ...cur.pizza, qty: auto.pizza > 0 ? String(auto.pizza) : '' },
            burger: { ...cur.burger, qty: auto.burger > 0 ? String(auto.burger) : '' },
            taco: { ...cur.taco, qty: auto.taco > 0 ? String(auto.taco) : '' },
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

    const rows: AggregatorCashRow[] = autoRows.map((row) => {
      const ch = row.platform.channel;
      const lines = draft[ch] || emptyChannelLines();
      const pizzaQty = parseCount(lines.pizza.qty);
      const burgerQty = parseCount(lines.burger.qty);
      const tacoQty = parseCount(lines.taco.qty);
      foodByCh[ch] = { pizza: pizzaQty, burger: burgerQty, taco: tacoQty };

      const cashParts = [
        parseAggregatorAmount(lines.pizza.cash),
        parseAggregatorAmount(lines.burger.cash),
        parseAggregatorAmount(lines.taco.cash),
      ];
      const cardParts = [
        parseAggregatorAmount(lines.pizza.card),
        parseAggregatorAmount(lines.burger.card),
        parseAggregatorAmount(lines.taco.card),
      ];
      const cashSales = Math.round(
        cashParts.reduce((s, n) => s + (n ?? 0), 0) * 100,
      ) / 100;
      const cardSales = Math.round(
        cardParts.reduce((s, n) => s + (n ?? 0), 0) * 100,
      ) / 100;
      cashByChannel[ch] = cashSales;
      cardByChannel[ch] = cardSales;

      let totalSales = row.totalSales;
      const declared = Math.round((cashSales + cardSales) * 100) / 100;
      if (declared > totalSales) totalSales = declared;
      const manualOverride = cashParts.some((n) => n != null) || cardParts.some((n) => n != null);

      return {
        ...row,
        cashSales,
        cardSales,
        totalSales,
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
      rows,
    };
  }, [autoRows, draft]);

  useEffect(() => {
    onSnapshotChange?.(snapshot);
  }, [snapshot, onSnapshotChange]);

  const patchLine = (
    channel: string,
    family: FoodFamilyKey,
    field: keyof LineDraft,
    value: string,
  ) => {
    touchedRef.current.add(channel);
    setDraft((prev) => {
      const cur = prev[channel] || emptyChannelLines();
      const line = cur[family] || emptyLine();
      return {
        ...prev,
        [channel]: {
          ...cur,
          [family]: {
            ...line,
            [field]: value,
          },
        },
      };
    });
  };

  const focusCountField = (e: FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (!v || v === '0') e.currentTarget.select();
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5 text-purple-600" /> {title}
        </div>
        <div className="text-right text-[11px] font-semibold tabular-nums space-y-0.5">
          <div className="text-emerald-700 dark:text-emerald-300">
            Efectivo apps → caja: {snapshot.cashTotal.toFixed(2)}€
          </div>
          <div className="text-blue-700 dark:text-blue-300">
            Tarjeta apps: {snapshot.cardTotal.toFixed(2)}€
          </div>
        </div>
      </div>

      <p className="px-3 pt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Por cada app: una línea de pizzas, otra de burgers y otra de tacos (unidades + efectivo + tarjeta).
      </p>

      <div className="p-3 space-y-3">
        {autoRows.map((row, index) => {
          const ch = row.platform.channel;
          const autoFood = foodByChannel[ch] || emptyFoodFamilyCounts();
          const lines = draft[ch] || emptyChannelLines();
          const stepNum = startStep + index;
          const autoHint =
            row.orderCount > 0
              ? `${row.orderCount} ped. · ${row.totalSales.toFixed(2)}€`
              : row.totalSales > 0
                ? `${row.totalSales.toFixed(2)}€`
                : 'Sin ventas';

          return (
            <div
              key={ch}
              className={`rounded-xl border bg-gray-50/80 dark:bg-gray-800/60 p-3 ${row.platform.accentClass}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tabular-nums">
                    {stepNum}.
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${row.platform.colorClass}`}>
                    {row.platform.label}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 truncate shrink-0">{autoHint}</span>
              </div>

              <div className="space-y-2">
                {FOOD_LINES.map((line) => {
                  const draftLine = lines[line.key];
                  const sist = autoFood[line.key];
                  return (
                    <div
                      key={line.key}
                      className={`rounded-lg border ${line.border} ${line.bg} p-2.5`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`text-[11px] font-bold ${line.title}`}>
                          {line.emoji} {line.label}
                        </span>
                        <span className="text-[9px] text-gray-400">Sist. {sist}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">
                            Cantidad
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="0"
                            value={draftLine.qty}
                            onFocus={focusCountField}
                            onChange={(e) =>
                              patchLine(ch, line.key, 'qty', normalizeCountInput(e.target.value))
                            }
                            className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-400/40"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                            Efectivo €
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0,00"
                            value={draftLine.cash}
                            onChange={(e) =>
                              patchLine(ch, line.key, 'cash', formatMoneyAsYouType(e.target.value, true))
                            }
                            className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-emerald-200 dark:border-emerald-800 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                            Tarjeta €
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0,00"
                            value={draftLine.card}
                            onChange={(e) =>
                              patchLine(ch, line.key, 'card', formatMoneyAsYouType(e.target.value, true))
                            }
                            className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="rounded-xl border-2 border-gray-900 dark:border-gray-200 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Total apps</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded-lg bg-white/10 dark:bg-black/5 px-2 py-1.5">
              <p className="text-[10px] opacity-70">🍕 Pizzas</p>
              <p className="text-base font-bold tabular-nums">{snapshot.foodTotals.pizza}</p>
            </div>
            <div className="rounded-lg bg-white/10 dark:bg-black/5 px-2 py-1.5">
              <p className="text-[10px] opacity-70">🍔 Burgers</p>
              <p className="text-base font-bold tabular-nums">{snapshot.foodTotals.burger}</p>
            </div>
            <div className="rounded-lg bg-white/10 dark:bg-black/5 px-2 py-1.5">
              <p className="text-[10px] opacity-70">🌮 Tacos</p>
              <p className="text-base font-bold tabular-nums">{snapshot.foodTotals.taco}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/20 dark:bg-emerald-600/15 px-2 py-1.5">
              <p className="text-[10px] opacity-70">💵 Efectivo</p>
              <p className="text-base font-bold tabular-nums">{snapshot.cashTotal.toFixed(2)}€</p>
            </div>
            <div className="rounded-lg bg-blue-500/20 dark:bg-blue-600/15 px-2 py-1.5">
              <p className="text-[10px] opacity-70">💳 Tarjeta</p>
              <p className="text-base font-bold tabular-nums">{snapshot.cardTotal.toFixed(2)}€</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/15 dark:border-black/10">
            <span className="text-xs font-semibold opacity-80">Suma efectivo + tarjeta apps</span>
            <span className="text-lg font-bold tabular-nums">
              {(Math.round((snapshot.cashTotal + snapshot.cardTotal) * 100) / 100).toFixed(2)}€
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
