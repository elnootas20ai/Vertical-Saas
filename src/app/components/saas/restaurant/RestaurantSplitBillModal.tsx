import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { DecimalNumpadField } from '../DecimalNumpadField';
import { parseDecimalPadValue } from '../../../lib/decimalNumpadInput';
import {
  computeEqualSplitAmounts,
  scaleAmountsToTotal,
  type DiningAccountLineView,
} from '../../../lib/restaurantDiningTpv';

function formatEuro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

export type SplitBillResult =
  | { mode: 'equal'; parts: number }
  | { mode: 'custom'; amounts: number[] };

type SplitTab = 'equal' | 'items' | 'custom';

const PART_OPTIONS = [2, 3, 4, 5, 6, 8, 10];

type Props = {
  total: number;
  lines?: DiningAccountLineView[];
  onConfirm: (result: SplitBillResult) => void;
  onClose: () => void;
  submitting?: boolean;
};

export function RestaurantSplitBillModal({ total, lines = [], onConfirm, onClose, submitting = false }: Props) {
  const [tab, setTab] = useState<SplitTab>('equal');
  const [parts, setParts] = useState(2);
  // Por artículo: línea → índice de parte (0-based). Sin asignar = parte 1.
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  // Importe libre: texto de cada parte menos la última (que va por resto).
  const [customInputs, setCustomInputs] = useState<string[]>(['']);

  const equalPreview = useMemo(
    () => computeEqualSplitAmounts(total, parts),
    [total, parts],
  );

  const itemPartsPreview = useMemo(() => {
    if (lines.length === 0) return [];
    const sums = Array.from({ length: parts }, () => 0);
    for (const line of lines) {
      const idx = Math.min(assignments[line.key] ?? 0, parts - 1);
      sums[idx] += line.lineTotal;
    }
    return scaleAmountsToTotal(sums, total);
  }, [lines, assignments, parts, total]);

  const itemPartsValid = itemPartsPreview.length >= 2
    && itemPartsPreview.every((a) => a > 0);

  const customAmounts = useMemo(() => {
    const fixed = customInputs.map((v) => {
      const n = parseDecimalPadValue(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    });
    const fixedSum = fixed.reduce((s, a) => s + a, 0);
    const rest = Math.round((total - fixedSum) * 100) / 100;
    return { fixed, rest };
  }, [customInputs, total]);

  const customValid = customAmounts.fixed.every((a) => a > 0) && customAmounts.rest > 0;

  const setPartsCount = (n: number) => {
    setParts(n);
    setAssignments((prev) => {
      const next: Record<string, number> = {};
      for (const [key, idx] of Object.entries(prev)) {
        next[key] = Math.min(idx, n - 1);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (tab === 'equal') {
      onConfirm({ mode: 'equal', parts });
      return;
    }
    if (tab === 'items') {
      if (!itemPartsValid) return;
      onConfirm({ mode: 'custom', amounts: itemPartsPreview });
      return;
    }
    if (!customValid) return;
    onConfirm({ mode: 'custom', amounts: [...customAmounts.fixed, customAmounts.rest] });
  };

  const confirmDisabled = submitting
    || total <= 0
    || (tab === 'items' && !itemPartsValid)
    || (tab === 'custom' && !customValid);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Dividir cuenta</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
            {([
              { id: 'equal' as const, label: 'Iguales' },
              { id: 'items' as const, label: 'Por artículo' },
              { id: 'custom' as const, label: 'Importes' },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                disabled={t.id === 'items' && lines.length === 0}
                className={`flex-1 min-h-[36px] rounded-lg text-xs font-bold touch-manipulation transition-colors disabled:opacity-40 ${
                  tab === t.id
                    ? 'bg-white dark:bg-gray-900 text-violet-700 dark:text-violet-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total a dividir: <span className="font-bold tabular-nums">{formatEuro(total)}</span>
          </p>

          {tab !== 'custom' ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                ¿Entre cuántos?
              </label>
              <div className="flex flex-wrap gap-2">
                {PART_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPartsCount(n)}
                    className={`min-w-[44px] min-h-[44px] rounded-xl border-2 font-bold text-sm touch-manipulation ${
                      parts === n
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'equal' ? (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 space-y-1">
              {equalPreview.map((amount, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Parte {i + 1}</span>
                  <span className="font-bold tabular-nums">{formatEuro(amount)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'items' ? (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Asigna cada artículo a una parte
                </label>
                <div className="space-y-2">
                  {lines.map((line) => {
                    const selected = Math.min(assignments[line.key] ?? 0, parts - 1);
                    return (
                      <div
                        key={line.key}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {line.quantity}× {line.name}
                          </span>
                          <span className="text-xs font-bold tabular-nums text-gray-600 dark:text-gray-300 shrink-0">
                            {formatEuro(line.lineTotal)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from({ length: parts }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setAssignments((prev) => ({ ...prev, [line.key]: i }))}
                              className={`min-w-[38px] min-h-[32px] rounded-lg border text-[11px] font-bold touch-manipulation ${
                                selected === i
                                  ? 'border-violet-500 bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              P{i + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 space-y-1">
                {itemPartsPreview.map((amount, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Parte {i + 1}</span>
                    <span className={`font-bold tabular-nums ${amount <= 0 ? 'text-red-500' : ''}`}>
                      {formatEuro(amount)}
                    </span>
                  </div>
                ))}
                {!itemPartsValid ? (
                  <p className="text-[11px] text-red-500 pt-1">
                    Cada parte necesita al menos un artículo.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {tab === 'custom' ? (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Importe de cada parte (la última va por resto)
                </label>
                <div className="space-y-2">
                  {customInputs.map((value, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500 w-14 shrink-0">Parte {i + 1}</span>
                      <DecimalNumpadField
                        value={value}
                        onChange={(next) => setCustomInputs((prev) => prev.map((v, j) => (j === i ? next : v)))}
                        placeholder="0.00"
                        showNumpad
                        compactNumpad
                        className="flex-1 min-w-0"
                        inputClassName="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-bold tabular-nums text-right outline-none focus:border-violet-400"
                      />
                      <span className="text-xs text-gray-400 shrink-0">€</span>
                      {customInputs.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setCustomInputs((prev) => prev.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 touch-manipulation"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 w-14 shrink-0">
                      Parte {customInputs.length + 1}
                    </span>
                    <span className={`flex-1 px-3 py-2 rounded-xl border-2 border-dashed text-sm font-bold tabular-nums text-right ${
                      customAmounts.rest > 0
                        ? 'border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                        : 'border-red-200 dark:border-red-900 text-red-500'
                    }`}
                    >
                      {formatEuro(Math.max(0, customAmounts.rest))}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">resto</span>
                  </div>
                </div>
                {customInputs.length + 1 < 10 ? (
                  <button
                    type="button"
                    onClick={() => setCustomInputs((prev) => [...prev, ''])}
                    className="mt-2 text-xs font-bold text-violet-600 dark:text-violet-400 touch-manipulation"
                  >
                    + Añadir parte
                  </button>
                ) : null}
              </div>
              {!customValid ? (
                <p className="text-[11px] text-red-500">
                  Indica importes mayores que cero y deja resto positivo para la última parte.
                </p>
              ) : null}
            </>
          ) : null}

          {tab === 'items' && !itemPartsValid ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Reparte al menos un artículo a cada parte (ninguna parte puede quedar a 0 €).
            </p>
          ) : null}
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold disabled:opacity-50 touch-manipulation"
            title={
              tab === 'items' && !itemPartsValid
                ? 'Reparte artículos a todas las partes'
                : undefined
            }
          >
            {submitting ? 'Dividiendo…' : 'Confirmar división'}
          </button>
        </div>
      </div>
    </div>
  );
}
