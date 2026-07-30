/**
 * Modal TPV: pago dividido por artículos (cada unidad efectivo/tarjeta).
 * Efectivo: mini calculadora de cambio + «Pagado» para ir tachando.
 */
import { useMemo, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Loader2, ShoppingBag, X } from 'lucide-react';
import { TpvModalRoot } from './TpvModalRoot';
import type { DeliveryOrderItem, TpvPaymentMethod } from '../../../lib/deliveryApi';
import {
  buildOrderSplitPayLines,
  cashQuickAmountsFor,
  formatSplitPartsSummary,
  itemAssignmentsToSplitParts,
  roundMoney2,
  validateItemPayAssignments,
  type TpvSplitPaymentPart,
} from '../../../lib/tpvSplitPayment';

function formatEuro(n: number): string {
  return `${roundMoney2(n).toFixed(2)} €`;
}

const METHOD_BTNS: Array<{ value: TpvPaymentMethod; label: string; Icon: typeof Banknote }> = [
  { value: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { value: 'tarjeta', label: 'Tarjeta', Icon: CreditCard },
];

export function TpvSplitByItemsModal({
  items,
  total,
  title = 'Pago por artículos',
  subtitle,
  loading = false,
  onConfirm,
  onClose,
  onBack,
}: {
  items: DeliveryOrderItem[];
  total: number;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  onConfirm: (parts: TpvSplitPaymentPart[]) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const chargeTotal = roundMoney2(total);
  const lines = useMemo(
    () => buildOrderSplitPayLines(items, chargeTotal),
    [items, chargeTotal],
  );
  const [methodByLineId, setMethodByLineId] = useState<
    Record<string, TpvPaymentMethod | undefined>
  >({});
  /** Cliente entrega (efectivo) por línea. */
  const [cashGivenByLineId, setCashGivenByLineId] = useState<Record<string, number>>({});
  /** Líneas ya cobradas / tachadas. */
  const [paidByLineId, setPaidByLineId] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const assignedCount = lines.filter((l) => methodByLineId[l.lineId]).length;
  const paidCount = lines.filter((l) => paidByLineId[l.lineId]).length;
  const allPaid = paidCount === lines.length && lines.length > 0;

  const totalsByMethod = useMemo(() => {
    let efectivo = 0;
    let tarjeta = 0;
    for (const line of lines) {
      const m = methodByLineId[line.lineId];
      if (m === 'efectivo') efectivo = roundMoney2(efectivo + line.amount);
      else if (m === 'tarjeta') tarjeta = roundMoney2(tarjeta + line.amount);
    }
    return { efectivo, tarjeta };
  }, [lines, methodByLineId]);

  const totalChange = useMemo(() => {
    let change = 0;
    for (const line of lines) {
      if (methodByLineId[line.lineId] !== 'efectivo') continue;
      if (!paidByLineId[line.lineId]) continue;
      const given = cashGivenByLineId[line.lineId];
      if (!(given > 0)) continue;
      change = roundMoney2(change + Math.max(0, given - line.amount));
    }
    return change;
  }, [lines, methodByLineId, paidByLineId, cashGivenByLineId]);

  const markPaid = (lineId: string, cashGiven?: number) => {
    setError('');
    setPaidByLineId((prev) => ({ ...prev, [lineId]: true }));
    if (cashGiven != null && cashGiven > 0) {
      setCashGivenByLineId((prev) => ({ ...prev, [lineId]: roundMoney2(cashGiven) }));
    }
  };

  const unmarkPaid = (lineId: string) => {
    setPaidByLineId((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  const setMethod = (lineId: string, method: TpvPaymentMethod) => {
    setError('');
    setMethodByLineId((prev) => ({ ...prev, [lineId]: method }));
    if (method === 'tarjeta') {
      markPaid(lineId);
      setCashGivenByLineId((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
    } else {
      // Efectivo: hay que calcular cambio y marcar pagado.
      unmarkPaid(lineId);
    }
  };

  const setAll = (method: TpvPaymentMethod) => {
    setError('');
    const nextMethods: Record<string, TpvPaymentMethod> = {};
    const nextPaid: Record<string, boolean> = {};
    const nextCash: Record<string, number> = {};
    for (const line of lines) {
      nextMethods[line.lineId] = method;
      if (method === 'tarjeta') {
        nextPaid[line.lineId] = true;
      } else {
        // Exacto por defecto → listo para marcar / auto-pagado exacto.
        nextCash[line.lineId] = roundMoney2(line.amount);
      }
    }
    setMethodByLineId(nextMethods);
    setCashGivenByLineId(nextCash);
    setPaidByLineId(method === 'tarjeta' ? nextPaid : {});
  };

  const applyCashQuick = (lineId: string, given: number) => {
    const received = roundMoney2(given);
    setError('');
    setCashGivenByLineId((prev) => ({ ...prev, [lineId]: received }));
    // Solo calcula cambio; Pagado lo marca el trabajador a mano.
    unmarkPaid(lineId);
  };

  const buildAssignments = () =>
    lines.map((l) => {
      const method = methodByLineId[l.lineId]!;
      const base = {
        lineId: l.lineId,
        method,
        amount: l.amount,
      };
      if (method !== 'efectivo') return base;
      const received = roundMoney2(cashGivenByLineId[l.lineId] || l.amount);
      return {
        ...base,
        amountReceived: received,
        changeGiven: roundMoney2(Math.max(0, received - l.amount)),
      };
    });

  const handleConfirm = () => {
    if (!allPaid) {
      setError(`Marca pagado en cada artículo (${paidCount}/${lines.length})`);
      return;
    }
    const err = validateItemPayAssignments(chargeTotal, lines, methodByLineId);
    if (err) {
      setError(err);
      return;
    }
    onConfirm(itemAssignmentsToSplitParts(buildAssignments()));
  };

  const summaryParts = useMemo(() => {
    if (!allPaid) return '';
    const assignments = lines.map((l) => {
      const method = methodByLineId[l.lineId]!;
      const base = { lineId: l.lineId, method, amount: l.amount };
      if (method !== 'efectivo') return base;
      const received = roundMoney2(cashGivenByLineId[l.lineId] || l.amount);
      return {
        ...base,
        amountReceived: received,
        changeGiven: roundMoney2(Math.max(0, received - l.amount)),
      };
    });
    return formatSplitPartsSummary(itemAssignmentsToSplitParts(assignments));
  }, [allPaid, lines, methodByLineId, cashGivenByLineId]);

  return (
    <TpvModalRoot className="fixed inset-0 z-[120] flex items-center justify-center p-4">
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
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
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
              <ShoppingBag className="w-5 h-5 text-violet-700 dark:text-violet-300" />
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
            Elige efectivo o tarjeta y marca pagado ({paidCount}/{lines.length}).
            {assignedCount > 0 && assignedCount !== paidCount ? (
              <span className="text-amber-700 dark:text-amber-400">
                {' '}
                · {assignedCount} con método
              </span>
            ) : null}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setAll('efectivo')}
              disabled={loading || !lines.length}
              className="flex-1 min-h-[36px] rounded-lg border border-emerald-300 dark:border-emerald-800 text-[11px] font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 disabled:opacity-40"
            >
              Todo efectivo
            </button>
            <button
              type="button"
              onClick={() => setAll('tarjeta')}
              disabled={loading || !lines.length}
              className="flex-1 min-h-[36px] rounded-lg border border-blue-300 dark:border-blue-800 text-[11px] font-bold text-blue-800 dark:text-blue-200 bg-blue-50/80 dark:bg-blue-950/30 disabled:opacity-40"
            >
              Todo tarjeta
            </button>
          </div>
        </div>

        <ul className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 touch-pan-y">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No hay artículos</p>
          ) : (
            lines.map((line) => {
              const method = methodByLineId[line.lineId];
              const paid = Boolean(paidByLineId[line.lineId]);
              const cashGiven = cashGivenByLineId[line.lineId];
              const change =
                method === 'efectivo' && cashGiven != null && cashGiven > 0
                  ? roundMoney2(cashGiven - line.amount)
                  : null;
              const quicks = method === 'efectivo' && !paid ? cashQuickAmountsFor(line.amount) : [];

              return (
                <li
                  key={line.lineId}
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${
                    paid
                      ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/25'
                      : method
                        ? 'border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold leading-snug ${
                          paid
                            ? 'text-gray-500 dark:text-gray-400 line-through decoration-2'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {line.name}
                      </p>
                      {paid ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pagado
                          {method === 'efectivo' && change != null && change > 0.001 ? (
                            <span className="font-semibold text-emerald-600/90">
                              · cambio {formatEuro(change)}
                            </span>
                          ) : null}
                          {method === 'tarjeta' ? (
                            <span className="font-medium text-blue-600 dark:text-blue-400">· tarjeta</span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={`text-sm font-bold tabular-nums shrink-0 ${
                        paid
                          ? 'text-gray-400 line-through'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {formatEuro(line.amount)}
                    </p>
                  </div>

                  {!paid ? (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        {METHOD_BTNS.map(({ value, label, Icon }) => {
                          const active = method === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              disabled={loading}
                              onClick={() => setMethod(line.lineId, value)}
                              className={`min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border-2 text-xs font-bold touch-manipulation disabled:opacity-40 ${
                                active
                                  ? value === 'efectivo'
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      {method === 'efectivo' ? (
                        <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white/80 dark:bg-gray-900/60 p-2 space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                            Cliente paga con
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {quicks.map((amount) => {
                              const isExact = Math.abs(amount - line.amount) < 0.001;
                              const label = isExact
                                ? 'Exacto'
                                : `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}€`;
                              const selected =
                                cashGiven != null && Math.abs(cashGiven - amount) < 0.001;
                              return (
                                <button
                                  key={label + String(amount)}
                                  type="button"
                                  disabled={loading}
                                  onClick={() => applyCashQuick(line.lineId, amount)}
                                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border touch-manipulation disabled:opacity-40 ${
                                    selected
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white dark:bg-gray-800 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {change != null ? (
                            <div
                              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold tabular-nums ${
                                change >= 0
                                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              }`}
                            >
                              <span>{change >= 0 ? 'Cambio' : 'Falta'}</span>
                              <span>{formatEuro(Math.abs(change))}</span>
                            </div>
                          ) : (
                            <p className="text-[10px] text-gray-500">
                              Elige Exacto o un billete, mira el cambio y pulsa Pagado.
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={loading || change == null || change < -0.001}
                            onClick={() =>
                              markPaid(
                                line.lineId,
                                cashGiven != null && cashGiven > 0 ? cashGiven : line.amount,
                              )
                            }
                            className="w-full min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Pagado
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        unmarkPaid(line.lineId);
                        if (method === 'tarjeta') {
                          setMethodByLineId((prev) => {
                            const next = { ...prev };
                            delete next[line.lineId];
                            return next;
                          });
                        }
                      }}
                      className="w-full min-h-[32px] rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
                    >
                      Deshacer
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>

        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">
              Efectivo {formatEuro(totalsByMethod.efectivo)}
              {totalChange > 0.001 ? (
                <span className="font-medium text-emerald-600/80"> · cambio {formatEuro(totalChange)}</span>
              ) : null}
            </span>
            <span className="text-blue-700 dark:text-blue-400">
              Tarjeta {formatEuro(totalsByMethod.tarjeta)}
            </span>
          </div>
          {allPaid && summaryParts ? (
            <p className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {summaryParts}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack || onClose}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              {onBack ? 'Atrás' : 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !allPaid}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Cobrar
            </button>
          </div>
        </div>
      </div>
    </TpvModalRoot>
  );
}
