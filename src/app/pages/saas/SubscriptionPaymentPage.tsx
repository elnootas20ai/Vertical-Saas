import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Copy, CreditCard, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getTransferInstructions,
  notifyTransferPayment,
  type TransferInstructionsResponse,
} from '../../lib/subscriptionApi';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import { IosCustomerAccessOnlyScreen } from '../../components/saas/IosCustomerAccessOnlyScreen';
import {
  companyNeedsOnboarding,
  resolveCompanyOnboardingResumePath,
} from '../../../../shared/onboarding/resumePath.js';

export function SubscriptionPaymentPage() {
  const navigate = useNavigate();
  const { user, logout, refreshCurrentUser, sessionSyncedWithServer } = useAuth();
  const [data, setData] = useState<TransferInstructionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const iosAccessOnly = isIosCustomerAccessOnlyApp();

  useEffect(() => {
    if (!user) return;
    if (companyNeedsOnboarding(user)) {
      navigate(resolveCompanyOnboardingResumePath(user), { replace: true });
    }
  }, [user, navigate]);
  useEffect(() => {
    if (iosAccessOnly) return;
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
  }, [iosAccessOnly]);

  // Si el admin ya activó el pago, salir de la pantalla de transferencia.
  // Solo con sesión sync del auth (evitar reload loop por estados stale).
  useEffect(() => {
    if (iosAccessOnly || !sessionSyncedWithServer) return;
    const status = String(user?.subscription?.status || '');
    if (status === 'subscription_active' || status === 'trial_active' || status === 'trial_expiring') {
      navigate('/saas/dashboard', { replace: true });
    }
  }, [iosAccessOnly, sessionSyncedWithServer, user?.subscription?.status, navigate]);

  // Mientras espera validación, refrescar perfil por si el admin acaba de marcar pagado.
  useEffect(() => {
    if (iosAccessOnly) return;
    const status = String(user?.subscription?.status || data?.subscription?.status || '');
    if (status !== 'payment_sent' && status !== 'pending_payment') return;
    const id = window.setInterval(() => {
      void refreshCurrentUser();
    }, 8000);
    return () => window.clearInterval(id);
  }, [iosAccessOnly, user?.subscription?.status, data?.subscription?.status, refreshCurrentUser]);

  if (iosAccessOnly) {
    return (
      <IosCustomerAccessOnlyScreen
        title="Suscripción no disponible en iOS"
        onLogout={() => void logout()}
      />
    );
  }

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
  const billingMode =
    data?.quote?.billingMode === 'annual' || data?.subscription?.billingMode === 'annual'
      ? 'annual'
      : 'monthly';
  const amountDue =
    Number(data?.quote?.amountDueEuros) ||
    Number(data?.subscription?.quotedAmountDueEuros) ||
    (billingMode === 'annual'
      ? Number(data?.plan?.annualPriceEuros) || (Number(data?.plan?.monthlyPriceEuros) || 49) * 12 * 0.8
      : Number(data?.plan?.monthlyPriceEuros) || 49);
  const monthlyEquiv =
    Number(data?.quote?.monthlyEquivalentEuros) ||
    Number(data?.subscription?.quotedMonthlyEquivalentEuros) ||
    (billingMode === 'annual' ? amountDue / 12 : amountDue);
  const billingLabel =
    data?.quote?.billingLabel ||
    (billingMode === 'annual' ? 'cobro anual (−20%)' : 'cobro mensual');
  const periodLabel = data?.quote?.periodLabel || (billingMode === 'annual' ? 'año' : 'mes');
  const extras = data?.quote?.extras;
  const concept = data?.subscription?.paymentConcept || 'VERTIAL-······';
  const iban = data?.transfer?.iban || '—';
  const holder = data?.transfer?.holder || 'Vertial';
  const alreadySent = data?.subscription?.status === 'payment_sent' || Boolean(doneMessage);
  const isActive =
    data?.subscription?.status === 'subscription_active' ||
    data?.subscription?.status === 'trial_active' ||
    data?.subscription?.status === 'trial_expiring';

  return (
    <div className="h-dvh max-h-dvh overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white">
      <div className="mx-auto flex h-full max-w-2xl flex-col px-4 py-3 sm:px-6 sm:py-4">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/vertial-logo.svg" alt="Vertial" className="h-7 w-auto sm:h-8" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">Suscripción</p>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">Activa Vertial</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/5 sm:text-sm"
          >
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-300" aria-label="Cargando" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 sm:gap-3">
            <section className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold sm:text-base">{companyName}</p>
                  <p className="mt-0.5 text-[11px] text-white/60">
                    Plan {planName} · {billingLabel}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-200">
                    {amountDue.toFixed(2)} €
                    <span className="text-xs font-medium text-white/55">/{periodLabel}</span>
                  </p>
                  {data?.quote?.formulaNote ? (
                    <p className="mt-0.5 text-[10px] text-white/50">{data.quote.formulaNote}</p>
                  ) : billingMode === 'annual' ? (
                    <p className="text-[10px] text-white/50">
                      Equiv. {monthlyEquiv.toFixed(2)} €/mes
                    </p>
                  ) : null}
                  {Array.isArray(data?.quote?.lines) && data.quote.lines.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-[10px] text-white/45">
                      {data.quote.lines.map((line) => (
                        <li key={line.key}>
                          {line.label}
                          {line.qty > 1 ? ` ×${line.qty}` : ''}: {line.totalMonthly} €/mes
                        </li>
                      ))}
                    </ul>
                  ) : extras &&
                    (extras.extraPdv > 0 ||
                      extras.extraBusinesses > 0 ||
                      extras.extraBrands > 0 ||
                      extras.extraWorkers > 0) ? (
                    <p className="mt-0.5 text-[10px] text-white/45">
                      Incluye extras
                      {extras.extraPdv > 0 ? ` · +${extras.extraPdv} PDV` : ''}
                      {extras.extraWorkers > 0 ? ` · +${extras.extraWorkers} trab.` : ''}
                      {extras.extraBusinesses > 0 ? ` · +${extras.extraBusinesses} emp.` : ''}
                      {extras.extraBrands > 0 ? ` · +${extras.extraBrands} marcas` : ''}
                    </p>
                  ) : null}
                </div>
                {isActive ? (
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                    Activa
                  </span>
                ) : (
                  <span className="text-[11px] text-white/55">Transfiere este importe</span>
                )}
              </div>
            </section>

            <section className="min-h-0 flex-1 rounded-xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 to-transparent px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="mb-2 flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-emerald-300" />
                <h2 className="text-sm font-semibold sm:text-base">Datos de transferencia</h2>
              </div>

              <div className="space-y-1.5">
                <InfoRow
                  label="IBAN / cuenta"
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

              <p className="mt-2 text-[10px] leading-snug text-white/55 sm:text-[11px]">
                Transfiere el importe · pega el concepto exacto · pulsa «He realizado el pago».
              </p>
            </section>

            {error ? (
              <p className="shrink-0 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {error}
              </p>
            ) : null}

            {alreadySent || doneMessage ? (
              <div className="shrink-0 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <p className="text-xs leading-snug text-emerald-50/90">
                    {doneMessage ||
                      'Aviso recibido. Activaremos el acceso al validar la transferencia.'}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
              {!isActive ? (
                <button
                  type="button"
                  disabled={submitting || alreadySent}
                  onClick={() => void handleNotifyPaid()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {alreadySent ? 'Aviso enviado' : 'He realizado el pago'}
                </button>
              ) : (
                <a
                  href="/saas/dashboard"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90"
                >
                  Ir al Dashboard
                </a>
              )}
            </div>
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
      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 sm:px-3 ${
        emphasis ? 'bg-emerald-400/15 ring-1 ring-emerald-300/30' : 'bg-black/25'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-white/50">{label}</p>
        <p
          className={`truncate font-mono text-xs sm:text-sm ${
            emphasis ? 'font-semibold text-emerald-100' : 'text-white/95'
          }`}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/80 hover:bg-white/5 sm:text-xs"
      >
        <Copy className="h-3 w-3" />
        {copied ? 'OK' : 'Copiar'}
      </button>
    </div>
  );
}
