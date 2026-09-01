import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { EventRecord } from '../../../lib/eventsTypes';
import {
  summarizeEventFinancials,
  registerEventDepositPayment,
  collectEventFinalBalance,
  sendEventFinalInvoiceEmail,
} from '../../../lib/eventsFinance';
import {
  downloadClientInvoicePdf,
  loadEventLinkedInvoices,
} from '../../../lib/eventsInvoiceUi';
import type { ClientInvoiceRecord } from '../../../lib/clientInvoicesApi';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { Loader2, Receipt, Banknote, FileText, CheckCircle2, Mail, Download, ExternalLink } from 'lucide-react';

type BusinessIssuer = {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  business_id?: string;
  businessId?: string;
  id?: string;
};

type Props = {
  event: EventRecord;
  business: BusinessIssuer | null;
  userId: string;
  onEventUpdated: (event: EventRecord) => void;
};

const inputClass =
  'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm';

export function EventsProjectFinancePanel({ event, business, userId, onEventUpdated }: Props) {
  const summary = summarizeEventFinancials(event);
  const [depositMethod, setDepositMethod] = useState('transferencia');
  const [depositAmount, setDepositAmount] = useState(String(event.deposito || summary.depositoAcordado || ''));
  const [finalMethod, setFinalMethod] = useState('transferencia');
  const [finalAmount, setFinalAmount] = useState(String(summary.pendiente || ''));
  const [busy, setBusy] = useState<string | null>(null);
  const [depositInvoice, setDepositInvoice] = useState<ClientInvoiceRecord | null>(null);
  const [finalInvoice, setFinalInvoice] = useState<ClientInvoiceRecord | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!event.depositInvoiceId && !event.finalInvoiceId) {
      setDepositInvoice(null);
      setFinalInvoice(null);
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    void loadEventLinkedInvoices(userId, event)
      .then((res) => {
        if (cancelled) return;
        setDepositInvoice(res.deposit);
        setFinalInvoice(res.final);
      })
      .catch(() => {
        if (cancelled) return;
        setDepositInvoice(null);
        setFinalInvoice(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, event.depositInvoiceId, event.finalInvoiceId, event._id]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error en finanzas');
    } finally {
      setBusy(null);
    }
  };

  const openPdf = (inv: ClientInvoiceRecord | null, label: string) => {
    if (!inv) {
      toast.error(`No se encontró la factura de ${label}`);
      return;
    }
    try {
      downloadClientInvoicePdf(inv);
      toast.success(`PDF ${inv.number}`);
    } catch {
      toast.error('No se pudo descargar el PDF');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Presupuesto" value={`${summary.presupuesto.toLocaleString('es-ES')} €`} />
        <StatCard label="Señal cobrada" value={`${summary.depositoCobrado.toLocaleString('es-ES')} €`} tone={summary.depositoCobrado > 0 ? 'ok' : 'neutral'} />
        <StatCard label="Resto cobrado" value={`${summary.cobradoFinal.toLocaleString('es-ES')} €`} tone={summary.cobradoFinal > 0 ? 'ok' : 'neutral'} />
        <StatCard label="Pendiente" value={`${summary.pendiente.toLocaleString('es-ES')} €`} tone={summary.pendiente > 0 ? 'warn' : 'ok'} />
      </div>

      {(event.depositInvoiceId || event.finalInvoiceId) ? (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-cyan-600" />
              <h3 className="font-semibold">Facturas</h3>
            </div>
            <Link
              to="/saas/client-billing"
              className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-700 dark:text-cyan-300 hover:underline"
            >
              Facturación clientes <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
          {loadingInvoices ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando facturas…
            </div>
          ) : (
            <ul className="space-y-2">
              {event.depositInvoiceId ? (
                <InvoiceRow
                  title="Señal"
                  invoice={depositInvoice}
                  fallbackId={event.depositInvoiceId}
                  amount={Number(event.depositPaidAmount) || depositInvoice?.total || 0}
                  onPdf={() => openPdf(depositInvoice, 'señal')}
                />
              ) : null}
              {event.finalInvoiceId ? (
                <InvoiceRow
                  title="Factura final"
                  invoice={finalInvoice}
                  fallbackId={event.finalInvoiceId}
                  amount={finalInvoice?.total || summary.facturaFinalTotal}
                  onPdf={() => openPdf(finalInvoice, 'factura final')}
                />
              ) : null}
            </ul>
          )}
        </section>
      ) : null}

      {event.estado === 'finalizado' && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          summary.cierreEconomicoOk
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
            : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
        }`}>
          <CheckCircle2 className={`w-5 h-5 shrink-0 ${summary.cierreEconomicoOk ? 'text-emerald-600' : 'text-amber-600'}`} />
          <div>
            <p className="font-semibold text-sm">
              {summary.cierreEconomicoOk ? 'Cierre económico completo' : 'Evento finalizado con saldo pendiente'}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Cobrado {summary.cobradoTotal.toLocaleString('es-ES')} € de {summary.presupuesto.toLocaleString('es-ES')} € presupuestados.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-cyan-600" />
          <h3 className="font-semibold">Cobro de señal</h3>
        </div>
        {event.depositPaidAt ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Señal registrada: {Number(event.depositPaidAmount || 0).toLocaleString('es-ES')} €
            {depositInvoice ? (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => openPdf(depositInvoice, 'señal')}
                  className="underline font-semibold"
                >
                  Descargar factura {depositInvoice.number}
                </button>
              </>
            ) : event.depositInvoiceId ? (
              <> · <Link to="/saas/client-billing" className="underline">Ver en facturación</Link></>
            ) : null}
          </p>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <label className="text-xs text-gray-500">
              Importe
              <input className={inputClass} type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            </label>
            <label className="text-xs text-gray-500">
              Método
              <select className={inputClass} value={depositMethod} onChange={(e) => setDepositMethod(e.target.value)}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </label>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run('deposit', async () => {
                const { event: updated } = await registerEventDepositPayment(
                  userId,
                  event,
                  Number(depositAmount),
                  depositMethod,
                  business,
                );
                onEventUpdated(updated);
                toast.success('Señal registrada · factura creada');
              })}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {busy === 'deposit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Registrar señal
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-600" />
          <h3 className="font-semibold">Pago final / resto</h3>
        </div>
        {summary.pendiente <= 0.01 && summary.cobradoFinal > 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Resto liquidado: {Number(event.finalPaidAmount || 0).toLocaleString('es-ES')} €
            {finalInvoice ? (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => openPdf(finalInvoice, 'factura final')}
                  className="underline font-semibold"
                >
                  Descargar factura {finalInvoice.number}
                </button>
              </>
            ) : event.finalInvoiceId ? (
              <> · <Link to="/saas/client-billing" className="underline">Ver en facturación</Link></>
            ) : null}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Pendiente {summary.pendiente.toLocaleString('es-ES')} €
              {summary.depositoCobrado > 0
                ? ` (señal ya cobrada: ${summary.depositoCobrado.toLocaleString('es-ES')} €)`
                : ''}
            </p>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <label className="text-xs text-gray-500">
                Cobro
                <input className={inputClass} type="number" value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} />
              </label>
              <label className="text-xs text-gray-500">
                Método
                <select className={inputClass} value={finalMethod} onChange={(e) => setFinalMethod(e.target.value)}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </label>
              <button
                type="button"
                disabled={Boolean(busy) || event.estado === 'presupuesto' || event.estado === 'enviado'}
                onClick={() => void run('final', async () => {
                  const updated = await collectEventFinalBalance(
                    userId,
                    event,
                    Number(finalAmount),
                    finalMethod,
                    business,
                  );
                  onEventUpdated(updated);
                  toast.success('Pago final registrado · factura creada');
                })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'final' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                Registrar pago final
              </button>
            </div>
            {event.finalInvoiceId && event.clientEmail ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void run('email', async () => {
                  await sendEventFinalInvoiceEmail(userId, event);
                  toast.success('Factura enviada por email');
                })}
                className="inline-flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300 font-semibold hover:underline disabled:opacity-50"
              >
                {busy === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Enviar factura al cliente
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function InvoiceRow({
  title,
  invoice,
  fallbackId,
  amount,
  onPdf,
}: {
  title: string;
  invoice: ClientInvoiceRecord | null;
  fallbackId: string;
  amount: number;
  onPdf: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-800">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
          {invoice?.number ? ` · ${invoice.number}` : ''}
        </p>
        <p className="text-xs text-gray-500 tabular-nums">
          {formatMoneyEs(amount)}
          {invoice?.status ? ` · ${invoice.status === 'paid' ? 'Cobrada' : invoice.status}` : ''}
          {!invoice ? ` · id ${fallbackId.slice(0, 12)}…` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPdf}
          disabled={!invoice}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <Download className="w-3.5 h-3.5" />
          PDF
        </button>
        <Link
          to="/saas/client-billing"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
        >
          Abrir
        </Link>
      </div>
    </li>
  );
}

function StatCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-gray-900 dark:text-gray-100';
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}
