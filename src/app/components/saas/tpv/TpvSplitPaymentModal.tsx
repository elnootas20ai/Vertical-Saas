/**
 * Modal TPV: pago dividido (varios métodos hasta cubrir el total).
 */
import { useMemo, useState } from 'react';
import { Banknote, CreditCard, Loader2, Plus, Split, Trash2, X } from 'lucide-react';
import { DecimalNumpadField } from '../DecimalNumpadField';
import { parseDecimalPadValue } from '../../../lib/decimalNumpadInput';
import { TpvModalRoot } from './TpvModalRoot';
import type { TpvPaymentMethod } from '../../../lib/deliveryApi';
import {
  formatSplitPartsSummary,
  newSplitPartId,
  remainingSplitAmount,
  roundMoney2,
  splitPartsAreComplete,
  TPV_SPLIT_METHOD_OPTIONS,
  type TpvSplitPaymentPart,
  validateSplitParts,
} from '../../../lib/tpvSplitPayment';

function formatEuro(n: number): string {
  return `${roundMoney2(n).toFixed(2)} €`;
}

function MethodIcon({ method }: { method: TpvPaymentMethod }) {
  if (method === 'tarjeta') return <CreditCard className="w-4 h-4" />;
  return <Banknote className="w-4 h-4" />;
}

export function TpvSplitPaymentModal({
  total,
  title = 'Pago dividido',
  subtitle,
  loading = false,
  onConfirm,
  onClose,
}: {
  total: number;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  onConfirm: (parts: TpvSplitPaymentPart[]) => void;
  onClose: () => void;
}) {
  const chargeTotal = roundMoney2(total);
  const [parts, setParts] = useState<TpvSplitPaymentPart[]>([]);
  const [draftMethod, setDraftMethod] = useState<TpvPaymentMethod>('efectivo');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftCashGiven, setDraftCashGiven] = useState('');
  const [error, setError] = useState('');

  const remaining = remainingSplitAmount(chargeTotal, parts);
  const draftValue = parseDecimalPadValue(draftAmount);
  const draftCashValue = parseDecimalPadValue(draftCashGiven);
  const draftChange =
    draftMethod === 'efectivo'
    && !isNaN(draftCashValue)
    && draftCashValue > 0
    && !isNaN(draftValue)
    && draftValue > 0
      ? roundMoney2(draftCashValue - draftValue)
      : null;

  const canAdd =
    !loading
    && remaining > 0.009
    && !isNaN(draftValue)
    && draftValue > 0
    && draftValue <= remaining + 0.009
    && (draftMethod !== 'efectivo'
      || draftChange === null
      || draftChange >= -0.001);

  const complete = splitPartsAreComplete(chargeTotal, parts);
  const summary = useMemo(() => formatSplitPartsSummary(parts), [parts]);

  const addPart = () => {
    setError('');
    if (!canAdd) return;
    const amount = roundMoney2(Math.min(draftValue, remaining));
    const part: TpvSplitPaymentPart = {
      id: newSplitPartId(),
      method: draftMethod,
      amount,
    };
    if (draftMethod === 'efectivo') {
      const received =
        !isNaN(draftCashValue) && draftCashValue > 0
          ? roundMoney2(draftCashValue)
          : amount;
      part.amountReceived = received;
      part.changeGiven = roundMoney2(Math.max(0, received - amount));
    }
    setParts((prev) => [...prev, part]);
    setDraftAmount('');
    setDraftCashGiven('');
    setDraftMethod(remaining - amount > 0.009 ? 'tarjeta' : 'efectivo');
  };

  const fillRemaining = () => {
    if (remaining <= 0.009) return;
    setDraftAmount(remaining.toFixed(2));
    if (draftMethod === 'efectivo') {
      setDraftCashGiven(remaining.toFixed(2));
    }
  };

  const removePart = (id: string) => {
    setParts((prev) => prev.filter((p) => p.id !== id));
    setError('');
  };

  const handleConfirm = () => {
    const err = validateSplitParts(chargeTotal, parts);
    if (err) {
      setError(err);
      return;
    }
    onConfirm(parts);
  };

  return (
    <TpvModalRoot className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm border-0 cursor-default"
        aria-label="Cerrar"
        onClick={loading ? undefined : onClose}
        disabled={loading}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[92vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="flex items-center gap-2 pr-8">
          <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center">
            <Split className="w-5 h-5 text-violet-700 dark:text-violet-300" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
            {subtitle ? (
              <p className="text-xs text-gray-500 font-mono mt-0.5">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
          {formatEuro(chargeTotal)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Parte el cobro en efectivo, tarjeta o Bizum hasta cubrir el total.
        </p>

        {parts.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {parts.map((p) => {
              const label =
                TPV_SPLIT_METHOD_OPTIONS.find((o) => o.value === p.method)?.label || p.method;
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <MethodIcon method={p.method} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {label} · {formatEuro(p.amount)}
                    </p>
                    {p.method === 'efectivo' && p.changeGiven != null && p.changeGiven > 0 ? (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        Cambio {formatEuro(p.changeGiven)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePart(p.id)}
                    disabled={loading}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
                    aria-label="Quitar tramo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {remaining > 0.009 ? (
          <div className="mt-4 rounded-xl border-2 border-dashed border-violet-200 dark:border-violet-800 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Añadir tramo
              </p>
              <button
                type="button"
                onClick={fillRemaining}
                className="text-xs font-semibold text-violet-700 dark:text-violet-300 underline"
              >
                Resto {formatEuro(remaining)}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {TPV_SPLIT_METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setDraftMethod(opt.value);
                    if (opt.value !== 'efectivo') setDraftCashGiven('');
                  }}
                  className={`min-h-[40px] rounded-lg text-xs font-bold border-2 touch-manipulation ${
                    draftMethod === opt.value
                      ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-100'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Importe</label>
              <DecimalNumpadField
                value={draftAmount}
                onChange={setDraftAmount}
                placeholder={remaining.toFixed(2)}
                showNumpad
                compactNumpad
                inputClassName="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-semibold tabular-nums pr-8"
                suffix={
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                }
              />
            </div>
            {draftMethod === 'efectivo' ? (
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                  Cliente entrega
                </label>
                <DecimalNumpadField
                  value={draftCashGiven}
                  onChange={setDraftCashGiven}
                  placeholder={(!isNaN(draftValue) && draftValue > 0 ? draftValue : remaining).toFixed(2)}
                  showNumpad
                  compactNumpad
                  inputClassName="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-semibold tabular-nums pr-8"
                  suffix={
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                  }
                />
                {draftChange != null ? (
                  <p
                    className={`mt-1.5 text-xs font-semibold tabular-nums ${
                      draftChange >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {draftChange >= 0 ? `Cambio ${formatEuro(draftChange)}` : `Falta ${formatEuro(Math.abs(draftChange))}`}
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={addPart}
              disabled={!canAdd}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              Añadir {TPV_SPLIT_METHOD_OPTIONS.find((o) => o.value === draftMethod)?.label}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Total cubierto · {summary}
          </p>
        )}

        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !complete}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Cobrar dividido
          </button>
        </div>
      </div>
    </TpvModalRoot>
  );
}
