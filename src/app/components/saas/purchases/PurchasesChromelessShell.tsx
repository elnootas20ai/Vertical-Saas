import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

type PurchasesChromelessShellProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  left: ReactNode;
  right: ReactNode;
  /** Form id if primary submits a form via form= attribute */
  formId?: string;
  /** Overlay encima del SaaS (cubre sidebar). */
  portal?: boolean;
};

/**
 * Pantalla completa Compras: cabecera fija + izquierda (meta) + derecha (trabajo, scroll propio).
 */
export function PurchasesChromelessShell({
  title,
  subtitle,
  onBack,
  backLabel = 'Volver',
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  left,
  right,
  formId,
  portal = false,
}: PurchasesChromelessShellProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className={`${portal ? 'fixed inset-0 z-[200]' : 'fixed inset-0 z-40'} flex flex-col bg-stone-50 dark:bg-stone-950`}
    >
      <header className="shrink-0 flex items-center gap-3 border-b border-stone-200 bg-white px-3 py-2.5 sm:px-5 dark:border-stone-800 dark:bg-stone-900">
        <button type="button" onClick={onBack} className={`${VERTIAL_BTN_SECONDARY} !min-h-10 shrink-0`}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{backLabel}</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-stone-900 dark:text-stone-100 sm:text-lg">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>
          ) : null}
        </div>
        <button
          type={formId ? 'submit' : 'button'}
          form={formId}
          onClick={formId ? undefined : onPrimary}
          disabled={primaryDisabled || primaryLoading}
          className={`${VERTIAL_BTN_PRIMARY} !min-h-10 shrink-0`}
        >
          {primaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {primaryLoading ? 'Guardando…' : primaryLabel}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-stone-200 bg-white md:w-[280px] md:overflow-y-auto md:border-b-0 md:border-r dark:border-stone-800 dark:bg-stone-900">
          <div className="space-y-3 p-3 sm:p-4">{left}</div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-stone-100/80 dark:bg-stone-950">
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {right}
          </div>
        </main>
      </div>
    </div>
  );
}

export const PURCHASES_FIELD_LABEL =
  'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400';

export const PURCHASES_FIELD_INPUT =
  'w-full rounded-xl border-2 border-stone-200 bg-white px-2.5 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';
