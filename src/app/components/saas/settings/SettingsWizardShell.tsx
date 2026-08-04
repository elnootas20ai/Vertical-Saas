import { type ReactNode, useEffect, useRef } from 'react';
import { Check, ChevronLeft, X } from 'lucide-react';
import { useModalClose } from '../../../hooks/useModalClose';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

export type SettingsWizardStep = {
  id: string;
  title: string;
  /** Subtítulo corto bajo el título del paso (opcional). */
  hint?: string;
  hasError?: boolean;
  /** Si no se indica, se infiere por pasos anteriores al activo. */
  completed?: boolean;
};

export type SettingsWizardSize = 'default' | 'medium' | 'large';

const SHELL_SIZE_STYLES: Record<
  SettingsWizardSize,
  {
    panel: string;
    overlay: string;
    header: string;
    title: string;
    subtitle: string;
    icon: string;
    steps: string;
    stepNum: string;
    stepTitle: string;
    preview: string;
    body: string;
    footer: string;
  }
> = {
  default: {
    panel: 'max-w-2xl rounded-2xl',
    overlay: 'p-3 sm:p-4',
    header: 'px-4 py-4 sm:px-5',
    title: 'text-lg',
    subtitle: 'text-xs',
    icon: 'h-10 w-10 rounded-xl',
    steps: 'px-3 py-2.5 sm:px-4',
    stepNum: 'h-7 w-7 text-xs',
    stepTitle: 'text-xs',
    preview: 'hidden w-36 shrink-0 p-3 sm:block md:w-40',
    body: 'p-4 sm:p-5',
    footer: 'px-4 py-3 sm:px-5',
  },
  medium: {
    panel: 'max-w-3xl rounded-2xl',
    overlay: 'p-3 sm:p-4',
    header: 'px-5 py-4 sm:px-6',
    title: 'text-lg sm:text-xl',
    subtitle: 'text-xs sm:text-sm',
    icon: 'h-11 w-11 rounded-xl',
    steps: 'px-4 py-2.5 sm:px-5',
    stepNum: 'h-7 w-7 text-xs',
    stepTitle: 'text-xs sm:text-sm',
    preview: 'hidden w-40 shrink-0 p-4 sm:block md:w-44',
    body: 'p-4 sm:p-5',
    footer: 'px-4 py-3 sm:px-5',
  },
  large: {
    panel: 'max-w-6xl rounded-3xl',
    overlay: 'p-4 sm:p-6 lg:p-8',
    header: 'px-6 py-5 sm:px-8',
    title: 'text-xl sm:text-2xl',
    subtitle: 'text-sm',
    icon: 'h-12 w-12 rounded-2xl',
    steps: 'px-4 py-3.5 sm:px-6',
    stepNum: 'h-8 w-8 text-sm',
    stepTitle: 'text-sm',
    preview: 'hidden w-52 shrink-0 p-5 sm:block lg:w-64 lg:p-6',
    body: 'p-6 sm:p-8',
    footer: 'px-6 py-4 sm:px-8',
  },
};

export type SettingsWizardShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  steps: SettingsWizardStep[];
  activeStepId: string;
  onStepChange: (stepId: string) => void;
  children: ReactNode;
  footer: ReactNode;
  /** Panel lateral (vista previa en vivo, resumen…). */
  preview?: ReactNode;
  maxHeight?: string;
  /** `large` para wizards de configuración (marca, etc.). */
  size?: SettingsWizardSize;
  /** Si el contenido del paso cabe sin desplazamiento (p. ej. grid de presets). */
  bodyOverflow?: 'auto' | 'hidden';
};

export function SettingsWizardShell({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  steps,
  activeStepId,
  onStepChange,
  children,
  footer,
  preview,
  maxHeight,
  size = 'default',
  bodyOverflow = 'auto',
}: SettingsWizardShellProps) {
  const ui = SHELL_SIZE_STYLES[size];
  const resolvedMaxHeight = maxHeight ?? (size === 'large' ? 'min(92dvh, 900px)' : 'min(90dvh, 720px)');
  useModalClose(isOpen, onClose);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeStepId, isOpen]);

  if (!isOpen) return null;

  const activeIndex = Math.max(0, steps.findIndex((s) => s.id === activeStepId));
  const activeStep = steps[activeIndex];
  const progressPct = steps.length > 0 ? ((activeIndex + 1) / steps.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="settings-wizard-title">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className={`relative flex h-full min-h-0 items-center justify-center pointer-events-none ${ui.overlay}`}>
        <div
          className={`pointer-events-auto flex w-full flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 ${ui.panel}`}
          style={{ maxHeight: resolvedMaxHeight }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex shrink-0 items-start gap-4 border-b border-gray-200 dark:border-gray-700 ${ui.header}`}>
            {icon ? (
              <div
                className={`flex shrink-0 items-center justify-center bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 ${ui.icon}`}
              >
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 flex-1 pr-10 sm:pr-12">
              <h2 id="settings-wizard-title" className={`font-bold text-gray-900 dark:text-gray-100 ${ui.title}`}>
                {title}
              </h2>
              <p className={`mt-1 text-gray-500 dark:text-gray-400 ${ui.subtitle}`}>
                {subtitle ?? (
                  <>
                    Paso {activeIndex + 1} de {steps.length}
                    {activeStep?.title ? (
                      <>
                        {' '}
                        · <span className="font-semibold text-gray-700 dark:text-gray-300">{activeStep.title}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-xl p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 sm:right-6 sm:top-5"
              aria-label="Cerrar"
            >
              <X className={`text-gray-500 ${size === 'large' ? 'h-6 w-6' : 'h-5 w-5'}`} />
            </button>
          </div>

          <div className={`shrink-0 bg-gray-100 dark:bg-gray-900 ${size === 'large' ? 'h-1.5' : 'h-1'}`} aria-hidden>
            <div
              className="h-full bg-gray-900 transition-[width] duration-300 ease-out dark:bg-gray-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className={`shrink-0 border-b border-gray-200 bg-gray-50/90 dark:border-gray-700 dark:bg-gray-900/50 ${ui.steps}`}>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}
            >
              {steps.map((step, index) => {
                const active = step.id === activeStepId;
                const completed = step.completed ?? index < activeIndex;
                const err = Boolean(step.hasError);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onStepChange(step.id)}
                    className={`flex min-h-[4.25rem] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center transition-all sm:min-h-[4.5rem] sm:px-2.5 ${
                      active
                        ? 'border-gray-900 bg-white shadow-sm dark:border-gray-100 dark:bg-gray-800'
                        : completed
                          ? 'border-gray-200 bg-white/80 dark:border-gray-600 dark:bg-gray-800/80'
                          : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-white/60 dark:hover:border-gray-600'
                    } ${err ? 'ring-2 ring-red-400 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
                  >
                    <span
                      className={`flex shrink-0 items-center justify-center rounded-full font-bold transition-colors ${ui.stepNum} ${
                        active
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : completed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {completed && !active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                    </span>
                    <span
                      className={`block w-full truncate font-bold leading-tight ${ui.stepTitle} ${
                        active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {step.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {preview ? (
              <aside
                className={`border-r border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40 ${ui.preview}`}
              >
                {preview}
              </aside>
            ) : null}
            <div
              ref={scrollRef}
              className={`min-h-0 flex-1 overscroll-contain ${ui.body} ${
                bodyOverflow === 'hidden' ? 'overflow-hidden' : 'overflow-y-auto'
              }`}
            >
              <div key={activeStepId} className="animate-in fade-in duration-200">{children}</div>
            </div>
          </div>

          <div className={`shrink-0 border-t border-gray-200 bg-gray-50/90 dark:border-gray-700 dark:bg-gray-900/40 ${ui.footer}`}>
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}

export type SettingsWizardFooterProps = {
  onCancel: () => void;
  onBack?: () => void;
  showBack?: boolean;
  onNext?: () => void;
  onSave: () => void;
  isLastStep: boolean;
  saving?: boolean;
  saveLabel: string;
  nextLabel?: string;
  disableSave?: boolean;
  disableNext?: boolean;
};

export function SettingsWizardFooter({
  onCancel,
  onBack,
  showBack = false,
  onNext,
  onSave,
  isLastStep,
  saving = false,
  saveLabel,
  nextLabel = 'Siguiente',
  disableSave = false,
  disableNext = false,
}: SettingsWizardFooterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onCancel} className={VERTIAL_BTN_SECONDARY}>
        Cancelar
      </button>
      {showBack && onBack ? (
        <button type="button" onClick={onBack} className={VERTIAL_BTN_SECONDARY}>
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </button>
      ) : null}
      {!isLastStep && onNext ? (
        <button
          type="button"
          onClick={onNext}
          disabled={disableNext}
          className={`${VERTIAL_BTN_PRIMARY} min-w-[7rem] flex-1`}
        >
          {nextLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={saving || disableSave}
          className={`${VERTIAL_BTN_PRIMARY} min-w-[7rem] flex-1`}
        >
          {saving ? 'Guardando…' : saveLabel}
        </button>
      )}
    </div>
  );
}
