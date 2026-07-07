import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { EventRecord } from '../../../lib/eventsTypes';
import {
  summarizeEventFinancials,
  registerEventDepositPayment,
  createEventFinalInvoice,
  registerEventFinalPayment,
  sendEventFinalInvoiceEmail,
} from '../../../lib/eventsFinance';
import { Loader2, Receipt, Banknote, FileText, CheckCircle2, Mail } from 'lucide-react';

type BusinessIssuer = {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
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

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Presupuesto" value={`${summary.presupuesto.toLocaleString('es-ES')} €`} />
        <StatCard label="Señal acordada" value={`${summary.depositoAcordado.toLocaleString('es-ES')} €`} />
        <StatCard label="Cobrado" value={`${summary.cobradoTotal.toLocaleString('es-ES')} €`} tone="ok" />
        <StatCard label="Pendiente" value={`${summary.pendiente.toLocaleString('es-ES')} €`} tone={summary.pendiente > 0 ? 'warn' : 'ok'} />
      </div>

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
            {event.depositInvoiceId && (
              <> · <Link to="/saas/client-billing" className="underline">Ver facturación</Link></>
            )}
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
                toast.success('Señal registrada y vinculada a finanzas');
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
          <h3 className="font-semibold">Factura final</h3>
        </div>
        {!event.finalInvoiceId ? (
          <button
            type="button"
            disabled={Boolean(busy) || event.estado === 'presupuesto' || event.estado === 'enviado'}
            onClick={() => void run('invoice', async () => {
              const { event: updated } = await createEventFinalInvoice(userId, event, business);
              onEventUpdated(updated);
              toast.success('Factura final creada');
            })}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
          >
            {busy === 'invoice' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generar factura final
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Factura creada · Cobrado final: {Number(event.finalPaidAmount || 0).toLocaleString('es-ES')} €
              {' · '}
              <Link to="/saas/client-billing" className="text-cyan-600 font-semibold hover:underline">Abrir facturación</Link>
            </p>
            {summary.pendiente > 0.01 && (
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
                  disabled={Boolean(busy)}
                  onClick={() => void run('final', async () => {
                    const updated = await registerEventFinalPayment(
                      userId,
                      event,
                      Number(finalAmount),
                      finalMethod,
                    );
                    onEventUpdated(updated);
                    toast.success('Cobro final registrado');
                  })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === 'final' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                  Registrar cobro
                </button>
              </div>
            )}
            {event.clientEmail && (
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
            )}
          </div>
        )}
      </section>
    </div>
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
