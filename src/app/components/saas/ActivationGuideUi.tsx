import type { ReactNode } from 'react';
import { MousePointerClick, X } from 'lucide-react';
import { getActivationFieldGuide } from '../../lib/activationGuide';

const HIGHLIGHT_CLASS = 'activation-field-highlight';

export function ActivationFieldWrap({
  fieldKey,
  activeKey,
  children,
  className = '',
}: {
  fieldKey: string;
  activeKey?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const lit = activeKey === fieldKey;
  return (
    <div
      data-activation-field={fieldKey}
      className={[lit ? `${HIGHLIGHT_CLASS} -mx-1 px-1 py-0.5` : '', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

export function scrollToActivationField(fieldKey: string, options?: { focusInput?: boolean }) {
  const el = document.querySelector<HTMLElement>(`[data-activation-field="${fieldKey}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add(HIGHLIGHT_CLASS);
  if (options?.focusInput !== false) {
    const input = el.querySelector('input, textarea, select, button');
    if (input instanceof HTMLElement) {
      window.setTimeout(() => input.focus(), 400);
    }
  }
  return true;
}

export function ActivationFocusBanner({
  fieldKey,
  onDismiss,
}: {
  fieldKey: string;
  onDismiss?: () => void;
}) {
  const guide = getActivationFieldGuide(fieldKey);
  if (!guide) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-600 dark:bg-amber-950/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
        <MousePointerClick className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
          Guía de arranque — {guide.bannerTitle}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
          {guide.bannerDetail} Busca el bloque resaltado en <strong>amarillo</strong>.
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1.5 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/50"
          title="Cerrar guía"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
