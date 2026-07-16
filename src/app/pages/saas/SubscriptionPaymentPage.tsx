import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, CreditCard, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getTransferInstructions,
  notifyTransferPayment,
  type TransferInstructionsResponse,
} from '../../lib/subscriptionApi';

export function SubscriptionPaymentPage() {
  const { user, logout, refreshCurrentUser } = useAuth();
  const [data, setData] = useState<TransferInstructionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getTransferInstructions();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos de pago');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleNotifyPaid = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await notifyTransferPayment();
      setDoneMessage(res.message || 'Hemos recibido tu aviso.');
      if (res.subscription) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                subscription: {
                  ...prev.subscription,
                  status: String(res.subscription?.status || 'payment_sent'),
                  paymentSentAt: String(res.subscription?.paymentSentAt || new Date().toISOString()),
                },
                accessBlocked: Boolean(
                  res.subscription?.status &&
                    ['pending_payment', 'payment_sent', 'suspended', 'grace_period', 'payment_failed', 'trial_expired'].includes(
                      String(res.subscription.status),
                    ),
                ),
              }
            : prev,
        );
      }
      await refreshCurrentUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el aviso');
    } finally {
      setSubmitting(false);
    }
  };

  const companyName = data?.companyName || user?.companyName || user?.fullName || 'Tu empresa';
  const planName = data?.plan?.name || data?.subscription?.planName || 'Básico';
  const price = data?.plan?.monthlyPriceEuros ?? 49;
  const concept = data?.subscription?.paymentConcept || 'VERTIAL-······';
  const iban = data?.transfer?.iban || '—';
  const holder = data?.transfer?.holder || 'Vertial';
  const alreadySent = data?.subscription?.status === 'payment_sent' || Boolean(doneMessage);
  const isActive =
    data?.subscription?.status === 'subscription_active' ||
    data?.subscription?.status === 'trial_active' ||
    data?.subscription?.status === 'trial_expiring';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/vertial-logo.svg" alt="Vertial" className="h-9 w-auto" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Suscripción</p>
              <h1 className="text-xl font-semibold tracking-tight">Activa Vertial</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-300" aria-label="Cargando" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm text-white/60">Empresa</p>
              <p className="mt-1 text-2xl font-semibold">{companyName}</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/50">Plan</p>
                  <p className="mt-1 text-lg font-medium">{planName}</p>
                </div>
                <div className="rounded-xl bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/50">Precio mensual</p>
                  <p className="mt-1 text-lg font-medium">{price.toFixed(2)} €</p>
                </div>
              </div>
              {isActive ? (
                <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Tu suscripción está activa. Puedes seguir usando Vertial con normalidad.
                </p>
              ) : (
                <p className="mt-4 text-sm text-white/70">
                  Para acceder al SaaS realiza la transferencia con el concepto indicado. Cuando
                  validemos el pago, activaremos tu cuenta.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 to-transparent p-6">
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-300" />
                <h2 className="text-lg font-semibold">Pago por transferencia</h2>
              </div>

              <div className="space-y-3">
                <InfoRow
                  label="IBAN"
                  value={iban}
                  onCopy={() => void copyText(iban, 'iban')}
                  copied={copied === 'iban'}
                />
                <InfoRow
                  label="Titular"
                  value={holder}
                  onCopy={() => void copyText(holder, 'holder')}
                  copied={copied === 'holder'}
                />
                <InfoRow
                  label="Concepto (obligatorio)"
                  value={concept}
                  emphasis
                  onCopy={() => void copyText(concept, 'concept')}
                  copied={copied === 'concept'}
                />
              </div>

              <ol className="mt-6 space-y-2 text-sm text-white/75">
                <li>1. Realiza la transferencia con el importe del plan.</li>
                <li>2. Usa exactamente el concepto indicado.</li>
                <li>3. Pulsa el botón cuando hayas realizado el pago.</li>
              </ol>
            </section>

            {error ? (
              <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            {alreadySent || doneMessage ? (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-medium text-emerald-100">Hemos recibido tu aviso</p>
                    <p className="mt-1 text-sm text-emerald-50/80">
                      {doneMessage ||
                        'Comprobaremos la transferencia lo antes posible. Recibirás acceso automáticamente una vez validado el pago.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {!isActive ? (
              <button
                type="button"
                disabled={submitting || alreadySent}
                onClick={() => void handleNotifyPaid()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {alreadySent ? 'Aviso enviado' : 'He realizado el pago'}
              </button>
            ) : (
              <a
                href="/saas/dashboard"
                className="inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-white/90"
              >
                Ir al Dashboard
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
  emphasis,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
        emphasis ? 'bg-emerald-400/15 ring-1 ring-emerald-300/30' : 'bg-black/25'
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
        <p className={`truncate font-mono text-sm ${emphasis ? 'font-semibold text-emerald-100' : ''}`}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/5"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
