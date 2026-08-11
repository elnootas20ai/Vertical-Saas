import { useMemo, useState } from 'react';
import { Loader2, X, ArrowDownCircle, ArrowUpCircle, RotateCcw, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import type { TpvRegisterTransaction } from '../../lib/deliveryApi';
import type { TpvClockedInWorker } from '../../lib/tpvClockedInWorkers';
import { DecimalNumpadField } from './DecimalNumpadField';
import { parseDecimalPadValue } from '../../lib/decimalNumpadInput';
import { ClockedInWorkerBubbles } from './ClockedInWorkerBubbles';
import { VERTIAL_BTN_PRIMARY } from '../../lib/vertialUiTokens';
import { normalizeClockinUserId } from '../../lib/clockinUserId';
import { formatMoneyEs } from '../../lib/formatNumberEs';

const TPV_MODAL_Z = 'z-[100]';

type CashOpType = 'cash_in' | 'cash_out' | 'return';

/** Orden UI: Salida · Entrada · Devolución */
const OP_ORDER: CashOpType[] = ['cash_out', 'cash_in', 'return'];

/** Atajos opcionales; el importe es libre (numpad / teclado). */
const QUICK_AMOUNTS = [10, 20, 50, 100, 200] as const;

const CASH_OUT_REASONS = [
  { id: 'worker_pay', label: 'Pago trabajador' },
  { id: 'other', label: 'Otro motivo' },
] as const;

type CashOutReasonId = (typeof CASH_OUT_REASONS)[number]['id'];

const OP_CONFIG: Record<CashOpType, { label: string; short: string; icon: typeof ArrowUpCircle; color: string }> = {
  cash_out: {
    label: 'Salida de efectivo',
    short: 'Salida',
    icon: ArrowUpCircle,
    color: 'text-amber-600',
  },
  cash_in: {
    label: 'Entrada de efectivo',
    short: 'Entrada',
    icon: ArrowDownCircle,
    color: 'text-emerald-600',
  },
  return: {
    label: 'Devolución',
    short: 'Devolución',
    icon: RotateCcw,
    color: 'text-red-600',
  },
};

function roundCashAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

export function TpvCashOpsModal({
  onConfirm,
  onClose,
  loading,
  registeredBy,
  workers = [],
  workersLoading = false,
  /** Efectivo esperado en cajón ahora (no se puede sacar más). */
  availableCash = 0,
}: {
  onConfirm: (op: Omit<TpvRegisterTransaction, 'id' | 'date'>) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
  registeredBy?: string;
  /** Fichados en tienda — para «Pago trabajador». */
  workers?: TpvClockedInWorker[];
  workersLoading?: boolean;
  availableCash?: number;
}) {
  useModalClose(!loading, onClose);
  const [opType, setOpType] = useState<CashOpType>('cash_out');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [outReason, setOutReason] = useState<CashOutReasonId>('other');
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsed = parseDecimalPadValue(amount);
  const cashAmount = Number.isFinite(parsed) ? roundCashAmount(parsed) : Number.NaN;
  const isWorkerPay = opType === 'cash_out' && outReason === 'worker_pay';
  const takesCashFromDrawer = opType === 'cash_out' || opType === 'return';
  const drawerCash = Math.max(0, roundCashAmount(Number(availableCash) || 0));
  const exceedsDrawer =
    takesCashFromDrawer
    && Number.isFinite(cashAmount)
    && cashAmount > 0
    && cashAmount - drawerCash > 0.009;

  const selectedWorker = useMemo(() => {
    if (!workerId) return null;
    const id = normalizeClockinUserId(workerId);
    return workers.find((w) => normalizeClockinUserId(w.id) === id) || null;
  }, [workerId, workers]);

  const validAmount = Number.isFinite(cashAmount) && cashAmount > 0 && !exceedsDrawer;
  const workerPayNameOk =
    Boolean(selectedWorker) || (workers.length === 0 && description.trim().length >= 2);
  const valid = isWorkerPay
    ? validAmount && workerPayNameOk
    : validAmount && description.trim().length >= 2;

  const handleOpType = (key: CashOpType) => {
    setOpType(key);
    if (key !== 'cash_out') {
      setOutReason('other');
      setWorkerId(null);
    }
  };

  const handleOutReason = (id: CashOutReasonId) => {
    setOutReason(id);
    if (id === 'worker_pay') {
      setDescription('');
      if (workers.length === 1) {
        setWorkerId(workers[0].id);
      }
    } else {
      setWorkerId(null);
    }
  };

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    if (exceedsDrawer) {
      toast.error(
        `No hay tanto en caja. Disponible: ${formatMoneyEs(drawerCash)}`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const note = description.trim();
      let finalDescription = note;
      let txWorkerId: string | undefined;
      let txWorkerName: string | undefined;

      if (isWorkerPay) {
        if (selectedWorker) {
          txWorkerId = selectedWorker.id;
          txWorkerName = selectedWorker.name;
          finalDescription = note
            ? `Pago trabajador · ${selectedWorker.name} · ${note}`
            : `Pago trabajador · ${selectedWorker.name}`;
        } else {
          txWorkerName = note;
          finalDescription = `Pago trabajador · ${note}`;
        }
      }

      await onConfirm({
        type: opType,
        paymentMethod: 'efectivo',
        amount: cashAmount,
        description: finalDescription,
        registeredBy: registeredBy || 'Tablet',
        ...(txWorkerId
          ? { workerId: txWorkerId, workerName: txWorkerName }
          : txWorkerName
            ? { workerName: txWorkerName }
            : {}),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting;

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Movimiento de caja</h3>
        <p className="text-sm text-gray-500 mb-4">Salida, entrada o devolución en efectivo</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {OP_ORDER.map((key) => {
            const cfg = OP_CONFIG[key];
            const Icon = cfg.icon;
            const selected = opType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleOpType(key)}
                disabled={busy}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-colors ${
                  selected
                    ? 'border-gray-900 dark:border-gray-200 bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                <Icon className={`w-5 h-5 ${cfg.color}`} />
                {cfg.short}
              </button>
            );
          })}
        </div>

        {takesCashFromDrawer ? (
          <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">
              En caja ahora:{' '}
              <span className="tabular-nums font-black">{formatMoneyEs(drawerCash)}</span>
            </p>
            <p className="text-[10px] text-amber-800/90 dark:text-amber-200/80 mt-0.5">
              No puedes sacar más de lo que hay.
            </p>
          </div>
        ) : null}

        {opType === 'cash_out' ? (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Tipo de salida</p>
            <div className="flex flex-wrap gap-2">
              {CASH_OUT_REASONS.map((r) => {
                const selected = outReason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleOutReason(r.id)}
                    className={`min-h-11 px-3 rounded-xl text-sm font-bold border transition-colors touch-manipulation ${
                      selected
                        ? r.id === 'worker_pay'
                          ? 'border-blue-600 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:border-blue-500'
                          : 'border-stone-800 bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-500'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-blue-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {isWorkerPay ? (
          <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/25 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">
              <UserRound className="w-3.5 h-3.5" />
              ¿A quién se paga?
            </div>
            <ClockedInWorkerBubbles
              workers={workers}
              selectedId={workerId}
              onSelect={setWorkerId}
              loading={workersLoading}
              label=""
              emptyHint="Nadie fichado. Ficha al trabajador o escribe el nombre abajo en «nota»."
            />
            {workers.length === 0 && !workersLoading ? (
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nombre del trabajador (obligatorio si nadie fichado)"
                disabled={busy}
                className="mt-2 w-full px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 text-sm"
              />
            ) : (
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nota opcional (anticipo, semana…)"
                disabled={busy}
                className="mt-2 w-full px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 text-sm"
              />
            )}
          </div>
        ) : null}

        <label className="block text-xs font-semibold text-gray-500 mb-1">Importe (€)</label>
        <p className="text-[11px] text-stone-400 mb-1.5">Cualquier cantidad — o atajo:</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {QUICK_AMOUNTS.map((n) => {
            const selected = cashAmount === n;
            const over = takesCashFromDrawer && n - drawerCash > 0.009;
            return (
              <button
                key={n}
                type="button"
                disabled={busy || over}
                onClick={() => setAmount(String(n))}
                title={over ? `Solo hay ${formatMoneyEs(drawerCash)} en caja` : undefined}
                className={`min-h-11 min-w-[3.25rem] px-3 rounded-xl text-sm font-bold tabular-nums border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  selected
                    ? 'border-blue-600 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:border-blue-500'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-blue-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'
                }`}
              >
                {n}€
              </button>
            );
          })}
        </div>
        <DecimalNumpadField
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          disabled={busy}
          showNumpad
          inputClassName={`w-full mb-1 px-3 py-2.5 rounded-xl border bg-white dark:bg-gray-800 text-lg font-semibold tabular-nums ${
            exceedsDrawer
              ? 'border-rose-400 dark:border-rose-600'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        />
        {exceedsDrawer ? (
          <p className="mb-3 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
            Importe mayor que el efectivo en caja ({formatMoneyEs(drawerCash)}).
          </p>
        ) : (
          <div className="mb-3" />
        )}

        {!isWorkerPay ? (
          <>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {opType === 'cash_out' ? 'Motivo de la salida' : opType === 'return' ? 'Motivo de la devolución' : 'Motivo'}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                opType === 'cash_out'
                  ? 'Ej. compra de hielo, pagar proveedor, cambio…'
                  : 'Ej. cambio de monedas, devolución pedido #123'
              }
              disabled={busy}
              className="w-full mb-4 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            />
          </>
        ) : (
          <div className="mb-4" />
        )}

        {/* Fallback: sin fichados, validar nombre en nota como «quién» */}
        {isWorkerPay && workers.length === 0 && !selectedWorker ? (
          <p className="mb-3 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
            Escribe el nombre del trabajador arriba para poder registrar el pago.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!valid || busy}
          className={`w-full ${VERTIAL_BTN_PRIMARY}`}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {isWorkerPay
            ? `Registrar pago${selectedWorker ? ` · ${selectedWorker.name}` : ''}`
            : 'Registrar movimiento'}
          {validAmount ? ` · ${formatMoneyEs(cashAmount)}` : ''}
        </button>
      </div>
    </div>
  );
}
