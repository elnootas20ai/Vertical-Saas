import { useCallback, useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import {
  fetchMoneiConnectSignupUrl,
  fetchMoneiConnectStatus,
  type MoneiConnectState,
} from '../../lib/moneiConnectApi';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Sin alta en MONEI',
  pending: 'Alta en revisión',
  approved: 'Aprobada',
  active: 'Activa — puedes cobrar',
  rejected: 'Rechazada',
  suspended: 'Suspendida',
};

export function MoneiConnectPanel() {
  const [state, setState] = useState<MoneiConnectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMoneiConnectStatus();
      setState(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el estado MONEI');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenSignup = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetchMoneiConnectSignupUrl();
      window.open(res.signupUrl, '_blank', 'noopener,noreferrer');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el alta MONEI');
    } finally {
      setOpening(false);
    }
  };

  const status = state?.status || 'not_started';
  const statusLabel = STATUS_LABEL[status] || status;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-500" />
            Pasarela MONEI para tu negocio
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
            Alta como comercio MONEI a través de Vertial (<strong>promo vertial</strong>).
            Vertial valida el alta y la vincula a tu cuenta cuando MONEI confirma el registro.
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Comprobando estado…
            </p>
          ) : (
            <p className="mt-3 text-sm">
              Estado:{' '}
              <span
                className={`font-semibold ${
                  state?.validated ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {statusLabel}
              </span>
              {state?.validated ? (
                <ShieldCheck className="inline w-4 h-4 ml-1 text-emerald-500" aria-hidden />
              ) : null}
            </p>
          )}
          {state?.adminEmail ? (
            <p className="text-xs text-gray-400 mt-1">Email MONEI: {state.adminEmail}</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => void handleOpenSignup()}
          disabled={opening}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 shrink-0"
        >
          {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          {state?.validated ? 'Gestionar en MONEI' : 'Darse de alta en MONEI'}
        </button>
      </div>
    </div>
  );
}
