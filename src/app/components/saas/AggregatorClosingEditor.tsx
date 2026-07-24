import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import { Plug } from 'lucide-react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  sumAggregatorCard,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { formatMoneyAsYouType } from '../../lib/workCenterMoneyInput';
import type { FoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';
import { emptyFoodFamilyCounts, sumFoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';

export type ManualFoodByChannel = Record<string, { pizza: string; burger: string; taco: string }>;

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
  /** Número del primer paso (Glovo = startStep, Uber = startStep+1…). */
  startStep?: number;
  /** Cada cambio en los cuadraditos → suma para TOTAL DE TODO. */
  onSnapshotChange?: (snapshot: AggregatorClosingSnapshot) => void;
}

function parseCount(raw: string): number {
  const t = String(raw ?? '').trim();
  if (!t) return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Quita basura y ceros a la izquierda: "05"→"5", "050"→"50", ""→"". */
function normalizeCountInput(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return '';
  return String(n);
}

function buildSeedFood(
  autoRows: AggregatorCashRow[],
  foodByChannel: Record<string, FoodFamilyCounts>,
): ManualFoodByChannel {
  const out: ManualFoodByChannel = {};
  for (const row of autoRows) {
    const ch = row.platform.channel;
    const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
    out[ch] = {
      // Vacío si el sistema tiene 0 → al teclear "50" no sale "050".
      pizza: auto.pizza > 0 ? String(auto.pizza) : '',
      burger: auto.burger > 0 ? String(auto.burger) : '',
      taco: auto.taco > 0 ? String(auto.taco) : '',
    };
  }
  return out;
}

function buildSeedMoney(autoRows: AggregatorCashRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of autoRows) out[row.platform.channel] = '';
  return out;
}

/**
 * Cierre TPV: por app → pizzas / burgers / tacos + efectivo + tarjeta.
 * Estado local de los inputs (no lo pisa el padre al cargar pedidos).
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
  const [foodDraft, setFoodDraft] = useState<ManualFoodByChannel>(() =>
    buildSeedFood(autoRows, foodByChannel),
  );
  const [cashDraft, setCashDraft] = useState<Record<string, string>>(() => buildSeedMoney(autoRows));
  const [cardDraft, setCardDraft] = useState<Record<string, string>>(() => buildSeedMoney(autoRows));

  // Primera siembra / canales nuevos (sin tocar lo que el usuario ya escribió).
  useEffect(() => {
    setFoodDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (touchedRef.current.has(ch)) continue;
        if (next[ch] && seededRef.current) continue;
        const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
        next[ch] = {
          pizza: auto.pizza > 0 ? String(auto.pizza) : '',
          burger: auto.burger > 0 ? String(auto.burger) : '',
          taco: auto.taco > 0 ? String(auto.taco) : '',
        };
        changed = true;
      }
      return changed ? next : prev;
    });
    setCashDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (ch in next) continue;
        next[ch] = '';
        changed = true;
      }
      return changed ? next : prev;
    });
    setCardDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (ch in next) continue;
        next[ch] = '';
        changed = true;
      }
      return changed ? next : prev;
    });
    seededRef.current = true;
  }, [autoRows, foodByChannel]);

  // Si el sistema trae conteos > 0 después, solo rellena canales no tocados que sigan en 0.
  useEffect(() => {
    setFoodDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of autoRows) {
        const ch = row.platform.channel;
        if (touchedRef.current.has(ch)) continue;
        const auto = foodByChannel[ch] || emptyFoodFamilyCounts();
        const cur = next[ch];
        const allZero =
          !cur
          || (parseCount(cur.pizza) === 0 && parseCount(cur.burger) === 0 && parseCount(cur.taco) === 0);
        const autoHas =
          auto.pizza > 0 || auto.burger > 0 || auto.taco > 0;
        if (allZero && autoHas) {
          next[ch] = {
            pizza: auto.pizza > 0 ? String(auto.pizza) : '',
            burger: auto.burger > 0 ? String(auto.burger) : '',
            taco: auto.taco > 0 ? String(auto.taco) : '',
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
      const draft = foodDraft[ch] || { pizza: '', burger: '', taco: '' };
      foodByCh[ch] = {
        pizza: parseCount(draft.pizza),
        burger: parseCount(draft.burger),
        taco: parseCount(draft.taco),
      };
      const parsedCash = parseAggregatorAmount(cashDraft[ch] ?? '');
      const parsedCard = parseAggregatorAmount(cardDraft[ch] ?? '');
      const cashSales = parsedCash != null ? parsedCash : row.cashSales;
      const cardSales = parsedCard != null ? parsedCard : row.cardSales;
      cashByChannel[ch] = cashSales;
      cardByChannel[ch] = cardSales;
      let totalSales = row.totalSales;
      const declared = Math.round((cashSales + cardSales) * 100) / 100;
      if (declared > totalSales) totalSales = declared;
      return {
        ...row,
        cashSales,
        cardSales,
        totalSales,
        manualOverride: parsedCash != null || parsedCard != null,
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
  }, [autoRows, foodDraft, cashDraft, cardDraft]);

  useEffect(() => {
    onSnapshotChange?.(snapshot);
  }, [snapshot, onSnapshotChange]);

  const setFoodField = (channel: string, key: keyof FoodFamilyCounts, raw: string) => {
    touchedRef.current.add(channel);
    const cleaned = normalizeCountInput(raw);
    setFoodDraft((prev) => {
      const cur = prev[channel] || { pizza: '', burger: '', taco: '' };
      return {
        ...prev,
        [channel]: {
          pizza: cur.pizza,
          burger: cur.burger,
          taco: cur.taco,
          [key]: cleaned,
        },
      };
    });
  };

  const focusCountField = (e: FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (!v || v === '0') {
      e.currentTarget.select();
    }
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
        Escribe en cada app. La suma aparece abajo al momento (Total apps y TOTAL DE TODO).
      </p>

      <div className="p-3 space-y-3">
        {autoRows.map((row, index) => {
          const ch = row.platform.channel;
          const autoFood = foodByChannel[ch] || emptyFoodFamilyCounts();
          const food = foodDraft[ch] || { pizza: '', burger: '', taco: '' };
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

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200">🍕 Pizzas</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={food.pizza}
                    onFocus={focusCountField}
                    onChange={(e) => setFoodField(ch, 'pizza', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/40 dark:bg-amber-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Sist. {autoFood.pizza}</span>
                </div>
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-orange-800 dark:text-orange-200">🍔 Burgers</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={food.burger}
                    onFocus={focusCountField}
                    onChange={(e) => setFoodField(ch, 'burger', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50/40 dark:bg-orange-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Sist. {autoFood.burger}</span>
                </div>
                <div className="rounded-lg border border-lime-200 dark:border-lime-800 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-lime-800 dark:text-lime-200">🌮 Tacos</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={food.taco}
                    onFocus={focusCountField}
                    onChange={(e) => setFoodField(ch, 'taco', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-lime-200 dark:border-lime-800 rounded-lg bg-lime-50/40 dark:bg-lime-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Sist. {autoFood.taco}</span>
                </div>
                <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">💵 Efectivo (€)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={cashDraft[ch] ?? ''}
                    onChange={(e) => {
                      touchedRef.current.add(ch);
                      setCashDraft((prev) => ({
                        ...prev,
                        [ch]: formatMoneyAsYouType(e.target.value, true),
                      }));
                    }}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Entra en caja</span>
                </div>
                <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">💳 Tarjeta (€)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={cardDraft[ch] ?? ''}
                    onChange={(e) => {
                      touchedRef.current.add(ch);
                      setCardDraft((prev) => ({
                        ...prev,
                        [ch]: formatMoneyAsYouType(e.target.value, true),
                      }));
                    }}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Solo registro</span>
                </div>
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
