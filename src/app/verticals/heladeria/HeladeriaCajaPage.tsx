import { Banknote, CreditCard } from 'lucide-react';
import {
  VERTIAL_CARD_BG,
  VERTIAL_CARD_BORDER,
  VERTIAL_CARD_TEXT,
  VERTIAL_CASH_BG,
  VERTIAL_CASH_BORDER,
  VERTIAL_CASH_TEXT,
  VERTIAL_SURFACE,
} from '../../lib/vertialUiTokens';
import { HeladeriaMvpShell } from './HeladeriaMvpShell';

function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Caja Heladería — MVP (mock). */
export function HeladeriaCajaPage() {
  return (
    <HeladeriaMvpShell
      title="Caja"
      subtitle="Heladería · apertura, cobros y cierre del día"
      area="caja"
    >
      <section className={`${VERTIAL_SURFACE} p-5`}>
        <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
          Resumen del día (demo)
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Datos de ejemplo. En la siguiente fase se conectan aperturas, arqueo y cierres.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={`rounded-xl border ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} p-4`}>
            <div className="flex items-center gap-2">
              <Banknote className={`h-4 w-4 ${VERTIAL_CASH_TEXT}`} />
              <span className={`text-xs font-semibold ${VERTIAL_CASH_TEXT}`}>Efectivo</span>
            </div>
            <p className={`mt-2 text-2xl font-semibold ${VERTIAL_CASH_TEXT}`}>{formatEur(0)}</p>
          </div>
          <div className={`rounded-xl border ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} p-4`}>
            <div className="flex items-center gap-2">
              <CreditCard className={`h-4 w-4 ${VERTIAL_CARD_TEXT}`} />
              <span className={`text-xs font-semibold ${VERTIAL_CARD_TEXT}`}>Tarjeta</span>
            </div>
            <p className={`mt-2 text-2xl font-semibold ${VERTIAL_CARD_TEXT}`}>{formatEur(0)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Total caja</span>
            <span className="font-semibold text-stone-900 dark:text-stone-100">{formatEur(0)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-stone-500">Estado</span>
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Sin apertura (MVP)
            </span>
          </div>
        </div>
      </section>
    </HeladeriaMvpShell>
  );
}
