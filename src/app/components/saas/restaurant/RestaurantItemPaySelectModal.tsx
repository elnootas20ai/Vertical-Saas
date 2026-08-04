/**
 * Pago por artículos (bar/restaurante): seleccionar varios → efectivo/tarjeta → repetir.
 * No cambia el modal de delivery (TpvSplitByItemsModal).
 */
import { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShoppingBag,
  X,
} from 'lucide-react';
import { TpvModalRoot } from '../tpv/TpvModalRoot';
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
  return roundMoney2(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type LinePayState = {
  method: TpvPaymentMethod;
  amountReceived?: number;
  changeGiven?: number;
};

export function RestaurantItemPaySelectModal({
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [paidByLineId, setPaidByLineId] = useState<Record<string, LinePayState>>({});
  /** Tras elegir efectivo sobre la selección: pedir billete. */
  const [cashDraftOpen, setCashDraftOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const [error, setError] = useState('');

  const unpaidLines = useMemo(
    () => lines.filter((l) => !paidByLineId[l.lineId]),
    [lines, paidByLineId],
  );
  const paidLines = useMemo(
    () => lines.filter((l) => paidByLineId[l.lineId]),
    [lines, paidByLineId],
  );

  const selectedUnpaid = useMemo(
    () => unpaidLines.filter((l) => selectedIds.has(l.lineId)),
    [unpaidLines, selectedIds],
  );
  const selectedTotal = useMemo(
    () => roundMoney2(selectedUnpaid.reduce((s, l) => s + l.amount, 0)),
    [selectedUnpaid],
  );

  const paidCount = paidLines.length;
  const allPaid = paidCount === lines.length && lines.length > 0;

  const totalsByMethod = useMemo(() => {
    let efectivo = 0;
    let tarjeta = 0;
    for (const line of lines) {
      const st = paidByLineId[line.lineId];
      if (!st) continue;
      if (st.method === 'efectivo') efectivo = roundMoney2(efectivo + line.amount);
      else if (st.method === 'tarjeta') tarjeta = roundMoney2(tarjeta + line.amount);
    }
    return { efectivo, tarjeta };
  }, [lines, paidByLineId]);

  const cashGivenAmount = roundMoney2(Number(cashGiven) || 0);
  const cashChange =
    cashDraftOpen && selectedTotal > 0 && cashGivenAmount > 0
      ? roundMoney2(cashGivenAmount - selectedTotal)
      : null;
  const cashQuicks = cashDraftOpen ? cashQuickAmountsFor(selectedTotal) : [];

  const toggleSelect = (lineId: string) => {
    if (paidByLineId[lineId]) return;
    setError('');
    setCashDraftOpen(false);
    setCashGiven('');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setCashDraftOpen(false);
    setCashGiven('');
  };

  const applyMethodToSelection = (method: TpvPaymentMethod, cash?: { given: number }) => {
    if (selectedUnpaid.length === 0) {
      setError('Selecciona al menos un artículo');
      return;
    }
    setError('');
    const nextPaid = { ...paidByLineId };
    if (method === 'tarjeta') {
      for (const line of selectedUnpaid) {
        nextPaid[line.lineId] = { method: 'tarjeta' };
      }
      setPaidByLineId(nextPaid);
      clearSelection();
      return;
    }

    const given = cash?.given != null ? roundMoney2(cash.given) : selectedTotal;
    if (given + 0.001 < selectedTotal) {
      setError('El billete no cubre la selección');
      return;
    }
    // Reparte el billete/cambio proporcionalmente (caja agrupa por método igual).
    let remainingGiven = given;
    selectedUnpaid.forEach((line, idx) => {
      const isLast = idx === selectedUnpaid.length - 1;
      const share = isLast
        ? remainingGiven
        : roundMoney2((given * line.amount) / selectedTotal);
      if (!isLast) remainingGiven = roundMoney2(remainingGiven - share);
      nextPaid[line.lineId] = {
        method: 'efectivo',
        amountReceived: share,
        changeGiven: roundMoney2(Math.max(0, share - line.amount)),
      };
    });
    setPaidByLineId(nextPaid);
    clearSelection();
  };

  const startCashForSelection = () => {
    if (selectedUnpaid.length === 0) {
      setError('Selecciona al menos un artículo');
      return;
    }
    setError('');
    setCashDraftOpen(true);
    setCashGiven(selectedTotal.toFixed(2));
  };

  const undoPaid = (lineId: string) => {
    setPaidByLineId((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  const methodByLineId = useMemo(() => {
    const out: Record<string, TpvPaymentMethod | undefined> = {};
    for (const line of lines) {
      out[line.lineId] = paidByLineId[line.lineId]?.method;
    }
    return out;
  }, [lines, paidByLineId]);

  const handleConfirm = () => {
    if (!allPaid) {
      setError(`Faltan artículos por cobrar (${paidCount}/${lines.length})`);
      return;
    }
    const err = validateItemPayAssignments(chargeTotal, lines, methodByLineId);
    if (err) {
      setError(err);
      return;
    }
    const assignments = lines.map((l) => {
      const st = paidByLineId[l.lineId]!;
      return {
        lineId: l.lineId,
        method: st.method,
        amount: l.amount,
        ...(st.method === 'efectivo'
          ? {
              amountReceived: st.amountReceived ?? l.amount,
              changeGiven: st.changeGiven ?? 0,
            }
          : {}),
      };
    });
    onConfirm(itemAssignmentsToSplitParts(assignments));
  };

  const summaryParts = useMemo(() => {
    if (!allPaid) return '';
    const assignments = lines.map((l) => {
      const st = paidByLineId[l.lineId]!;
      return {
        lineId: l.lineId,
        method: st.method,
        amount: l.amount,
        ...(st.method === 'efectivo'
          ? {
              amountReceived: st.amountReceived ?? l.amount,
              changeGiven: st.changeGiven ?? 0,
            }
          : {}),
      };
    });
    return formatSplitPartsSummary(itemAssignmentsToSplitParts(assignments));
  }, [allPaid, lines, paidByLineId]);

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
            Marca artículos, cobra con efectivo o tarjeta, y sigue hasta terminar
            ({paidCount}/{lines.length}).
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
          {unpaidLines.length > 0 ? (
            <div className="px-3 pt-3 pb-1">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Pendientes
                </p>
                {selectedUnpaid.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={loading}
                    className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 disabled:opacity-40"
                  >
                    Quitar selección
                  </button>
                ) : null}
              </div>
              <ul className="space-y-1.5">
                {unpaidLines.map((line) => {
                  const selected = selectedIds.has(line.lineId);
                  return (
                    <li key={line.lineId}>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => toggleSelect(line.lineId)}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left touch-manipulation transition-colors disabled:opacity-40 ${
                          selected
                            ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center ${
                            selected
                              ? 'border-violet-600 bg-violet-600 text-white'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                          aria-hidden
                        >
                          {selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {line.name}
                        </span>
                        <span className="text-sm font-bold tabular-nums shrink-0 text-gray-900 dark:text-gray-100">
                          {formatEuro(line.amount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {paidLines.length > 0 ? (
            <div className="px-3 pt-3 pb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-2 px-1">
                Ya cobrados
              </p>
              <ul className="space-y-1.5">
                {paidLines.map((line) => {
                  const st = paidByLineId[line.lineId]!;
                  return (
                    <li
                      key={line.lineId}
                      className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/25 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-500 line-through decoration-2 truncate">
                            {line.name}
                          </p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {st.method === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
                            {st.method === 'efectivo' && (st.changeGiven || 0) > 0.001 ? (
                              <span className="font-semibold">
                                · cambio {formatEuro(st.changeGiven || 0)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-gray-400 line-through">
                            {formatEuro(line.amount)}
                          </p>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => undoPaid(line.lineId)}
                            className="mt-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
                          >
                            Deshacer
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No hay artículos</p>
          ) : null}
        </div>

        {selectedUnpaid.length > 0 && !allPaid ? (
          <div className="shrink-0 border-t border-violet-200 dark:border-violet-900 bg-violet-50/90 dark:bg-violet-950/40 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-violet-900 dark:text-violet-100">
                {selectedUnpaid.length} seleccionado{selectedUnpaid.length === 1 ? '' : 's'}
              </p>
              <p className="text-base font-bold tabular-nums text-violet-900 dark:text-violet-100">
                {formatEuro(selectedTotal)}
              </p>
            </div>

            {!cashDraftOpen ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={startCashForSelection}
                  className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-600 text-white text-sm font-bold touch-manipulation disabled:opacity-40"
                >
                  <Banknote className="w-4 h-4" />
                  Efectivo
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => applyMethodToSelection('tarjeta')}
                  className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-blue-600 bg-blue-600 text-white text-sm font-bold touch-manipulation disabled:opacity-40"
                >
                  <CreditCard className="w-4 h-4" />
                  Tarjeta
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-gray-900 p-2.5 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Cliente paga con
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cashQuicks.map((amount) => {
                    const isExact = Math.abs(amount - selectedTotal) < 0.001;
                    const label = isExact
                      ? 'Exacto'
                      : `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}€`;
                    const selected =
                      cashGivenAmount > 0 && Math.abs(cashGivenAmount - amount) < 0.001;
                    return (
                      <button
                        key={label + String(amount)}
                        type="button"
                        disabled={loading}
                        onClick={() => setCashGiven(amount.toFixed(2))}
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
                {cashChange != null ? (
                  <div
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold tabular-nums ${
                      cashChange >= 0
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    }`}
                  >
                    <span>{cashChange >= 0 ? 'Cambio' : 'Falta'}</span>
                    <span>{formatEuro(Math.abs(cashChange))}</span>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setCashDraftOpen(false);
                      setCashGiven('');
                    }}
                    className="flex-1 min-h-[40px] rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    disabled={loading || cashChange == null || cashChange < -0.001}
                    onClick={() =>
                      applyMethodToSelection('efectivo', {
                        given: cashGivenAmount > 0 ? cashGivenAmount : selectedTotal,
                      })
                    }
                    className="flex-[1.4] min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Cobrar selección
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">
              Efectivo {formatEuro(totalsByMethod.efectivo)}
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
              Cobrar cuenta
            </button>
          </div>
        </div>
      </div>
    </TpvModalRoot>
  );
}
