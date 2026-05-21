import { type ReactNode, useEffect, useRef } from 'react';
import { Check, ChevronLeft, X } from 'lucide-react';
import { useModalClose } from '../../../hooks/useModalClose';

export type SettingsWizardStep = {
  id: string;
  title: string;
  /** Subtítulo corto bajo el título del paso (opcional). */
  hint?: string;
  hasError?: boolean;
  /** Si no se indica, se infiere por pasos anteriores al activo. */
  completed?: boolean;
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
  maxHeight = 'min(90dvh,720px)',
}: SettingsWizardShellProps) {
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
      <div className="relative flex h-full min-h-0 items-center justify-center p-3 sm:p-4 pointer-events-none">
        <div
          className="pointer-events-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          style={{ maxHeight }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-4 py-4 sm:px-5 dark:border-gray-700">
            {icon ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 flex-1 pr-8">
              <h2 id="settings-wizard-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
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
              className="absolute right-3 top-3 rounded-xl p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 sm:right-4 sm:top-4"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="h-1 shrink-0 bg-gray-100 dark:bg-gray-900" aria-hidden>
            <div
              className="h-full bg-gray-900 transition-[width] duration-300 ease-out dark:bg-gray-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="shrink-0 border-b border-gray-200 bg-gray-50/90 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50 sm:px-4">
            <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {steps.map((step, index) => {
                const active = step.id === activeStepId;
                const completed = step.completed ?? index < activeIndex;
                const err = Boolean(step.hasError);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onStepChange(step.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                      active
                        ? 'border-gray-900 bg-white shadow-sm dark:border-gray-100 dark:bg-gray-800'
                        : completed
                          ? 'border-gray-200 bg-white/80 dark:border-gray-600 dark:bg-gray-800/80'
                          : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-white/60 dark:hover:border-gray-600'
                    } ${err ? 'ring-2 ring-red-400 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        active
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : completed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {completed && !active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-xs font-bold leading-tight ${
                          active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {step.title}
                      </span>
                      {step.hint ? (
                        <span className="block text-[10px] leading-tight text-gray-500 dark:text-gray-500">{step.hint}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {preview ? (
              <aside className="hidden w-36 shrink-0 border-r border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40 sm:block md:w-40">
                {preview}
              </aside>
            ) : null}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div key={activeStepId} className="animate-in fade-in duration-200">{children}</div>
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-gray-50/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40 sm:px-5">
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
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        Cancelar
      </button>
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </button>
      ) : null}
      {!isLastStep && onNext ? (
        <button
          type="button"
          onClick={onNext}
          disabled={disableNext}
          className="min-w-[7rem] flex-1 rounded-xl border-2 border-gray-900 bg-gray-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          {nextLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={saving || disableSave}
          className="min-w-[7rem] flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          {saving ? 'Guardando…' : saveLabel}
        </button>
      )}
    </div>
  );
}
