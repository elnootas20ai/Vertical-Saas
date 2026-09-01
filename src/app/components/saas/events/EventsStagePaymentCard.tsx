/**
 * Cobro operativo en el paso del acuerdo (señal o resto), sin ir al tab Finanzas.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Banknote, CheckCircle2, Download, Loader2, Receipt } from 'lucide-react';
import type { EventRecord } from '../../../lib/eventsTypes';
import {
  collectEventFinalBalance,
  registerEventDepositPayment,
  summarizeEventFinancials,
} from '../../../lib/eventsFinance';
import {
  downloadClientInvoicePdf,
  loadEventLinkedInvoices,
} from '../../../lib/eventsInvoiceUi';
import type { ClientInvoiceRecord } from '../../../lib/clientInvoicesApi';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_FOCUS_RING } from '../../../lib/vertialUiTokens';

type BusinessIssuer = {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  business_id?: string;
  businessId?: string;
  id?: string;
};

const inputClass =
  `w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

type Props = {
  mode: 'deposit' | 'final';
  event: EventRecord;
  userId: string;
  business: BusinessIssuer | null;
  onEventUpdated: (event: EventRecord) => void;
  /** Tras cobrar señal, avanzar a contratado si aún está en aceptado. */
  onDepositDoneAdvance?: (event: EventRecord) => void | Promise<void>;
  /** Ir al tab Finanzas (facturas del evento). */
  onOpenFinanzas?: () => void;
};

export function EventsStagePaymentCard({
  mode,
  event,
  userId,
  business,
  onEventUpdated,
  onDepositDoneAdvance,
  onOpenFinanzas,
}: Props) {
  const summary = summarizeEventFinancials(event);
  const defaultAmount = mode === 'deposit'
    ? (Number(event.deposito) || summary.depositoAcordado || 0)
    : summary.pendiente;

  const [amount, setAmount] = useState(String(defaultAmount || ''));
  const [method, setMethod] = useState('transferencia');
  const [busy, setBusy] = useState(false);
  const [linkedInvoice, setLinkedInvoice] = useState<ClientInvoiceRecord | null>(null);

  useEffect(() => {
    setAmount(String(defaultAmount || ''));
  }, [defaultAmount, event._id, mode]);

  useEffect(() => {
    const invoiceId = mode === 'deposit'
      ? String(event.depositInvoiceId || '').trim()
      : String(event.finalInvoiceId || '').trim();
    if (!userId || !invoiceId) {
      setLinkedInvoice(null);
      return;
    }
    let cancelled = false;
    void loadEventLinkedInvoices(userId, event)
      .then((res) => {
        if (cancelled) return;
        setLinkedInvoice(mode === 'deposit' ? res.deposit : res.final);
      })
      .catch(() => {
        if (!cancelled) setLinkedInvoice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, mode, event.depositInvoiceId, event.finalInvoiceId, event._id]);

  const downloadLinked = () => {
    if (!linkedInvoice) {
      toast.error('Factura aún no disponible');
      onOpenFinanzas?.();
      return;
    }
    try {
      downloadClientInvoicePdf(linkedInvoice);
      toast.success(`PDF ${linkedInvoice.number}`);
    } catch {
      toast.error('No se pudo descargar el PDF');
    }
  };

  if (mode === 'deposit' && event.depositPaidAt) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          Señal cobrada
        </p>
        <p className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
          {formatMoneyEs(Number(event.depositPaidAmount) || 0)}
          {linkedInvoice?.number ? ` · Factura ${linkedInvoice.number}` : ''}
          {summary.pendiente > 0.01
            ? ` · Resta ${formatMoneyEs(summary.pendiente)} al finalizar`
            : ' · Sin pendiente'}
        </p>
        <div className="flex flex-wrap gap-2">
          {event.depositInvoiceId ? (
            <button
              type="button"
              onClick={downloadLinked}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-9 text-xs`}
            >
              <Download className="w-3.5 h-3.5" />
              Descargar factura
            </button>
          ) : null}
          {onOpenFinanzas ? (
            <button
              type="button"
              onClick={onOpenFinanzas}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-9 text-xs`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Ver en Finanzas
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (mode === 'final' && summary.pendiente <= 0.01) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          Liquidado
        </p>
        <p className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
          Señal {formatMoneyEs(summary.depositoCobrado)}
          {summary.cobradoFinal > 0 ? ` · Resto ${formatMoneyEs(summary.cobradoFinal)}` : ''}
          {' · '}Total {formatMoneyEs(summary.cobradoTotal)}
          {linkedInvoice?.number ? ` · Factura ${linkedInvoice.number}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {event.finalInvoiceId ? (
            <button
              type="button"
              onClick={downloadLinked}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-9 text-xs`}
            >
              <Download className="w-3.5 h-3.5" />
              Descargar factura
            </button>
          ) : null}
          {onOpenFinanzas ? (
            <button
              type="button"
              onClick={onOpenFinanzas}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-9 text-xs`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Ver en Finanzas
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const title = mode === 'deposit' ? 'Cobrar señal' : 'Cobrar pago final';
  const hint = mode === 'deposit'
    ? 'Anticipo al contratar. El resto se cobra al cerrar el evento.'
    : `Resto pendiente: ${formatMoneyEs(summary.pendiente)}`;
  const cta = mode === 'deposit' ? 'Registrar señal' : 'Registrar pago final';

  const handleSubmit = async () => {
    setBusy(true);
    try {
      if (mode === 'deposit') {
        const { event: updated } = await registerEventDepositPayment(
          userId,
          event,
          Number(amount),
          method,
          business,
        );
        onEventUpdated(updated);
        toast.success(updated.depositInvoiceId ? 'Señal registrada · factura creada' : 'Señal registrada');
        if (onDepositDoneAdvance) await onDepositDoneAdvance(updated);
      } else {
        const updated = await collectEventFinalBalance(
          userId,
          event,
          Number(amount),
          method,
          business,
        );
        onEventUpdated(updated);
        toast.success(updated.finalInvoiceId ? 'Pago final registrado · factura creada' : 'Pago final registrado');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el cobro');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 space-y-3 dark:border-stone-700 dark:bg-stone-900/50">
      <div>
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 inline-flex items-center gap-1.5">
          <Banknote className="w-4 h-4 text-[#2563EB]" />
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-stone-500">{hint}</p>
        {mode === 'final' && summary.depositoCobrado > 0 ? (
          <p className="mt-1 text-[11px] font-medium text-stone-600 dark:text-stone-300">
            Ya cobrado en señal: {formatMoneyEs(summary.depositoCobrado)}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-stone-500">Importe €</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-stone-500">Método</span>
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSubmit()}
          className={`${VERTIAL_BTN_PRIMARY} w-full`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
          {cta}
        </button>
      </div>
      {mode === 'deposit' && Number(event.deposito) > 0 && Number(amount) !== Number(event.deposito) ? (
        <button
          type="button"
          className={`${VERTIAL_BTN_SECONDARY} w-full !min-h-9 text-xs`}
          onClick={() => setAmount(String(event.deposito || ''))}
        >
          Usar señal acordada ({formatMoneyEs(Number(event.deposito) || 0)})
        </button>
      ) : null}
    </div>
  );
}

/** Resumen compacto señal / resto / pendiente para cabeceras y listados. */
export function formatEventPaymentBreakdown(event: EventRecord): string {
  const s = summarizeEventFinancials(event);
  const bits: string[] = [];
  if (s.depositoCobrado > 0) bits.push(`Señal ${formatMoneyEs(s.depositoCobrado)}`);
  else if (s.depositoAcordado > 0) bits.push(`Señal pdte. ${formatMoneyEs(s.depositoAcordado)}`);
  if (s.cobradoFinal > 0) bits.push(`Resto ${formatMoneyEs(s.cobradoFinal)}`);
  if (s.pendiente > 0.01) bits.push(`Falta ${formatMoneyEs(s.pendiente)}`);
  else if (s.presupuesto > 0 && s.cobradoTotal > 0) bits.push('Liquidado');
  return bits.join(' · ') || 'Sin cobros';
}
