import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { VertialLogo } from '../VertialLogo';
import { VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import {
  formatPrepRemaining,
  PLAN_UPGRADE_PREP_STEPS,
  PLAN_UPGRADE_PREP_TOTAL_MS,
  type PlanUpgradePrepStep,
} from '../../lib/planUpgradePrep';

type Props = {
  fromPlanLabel: string;
  /** Solo admin preview: permite saltar la espera. */
  allowSkip?: boolean;
  onComplete: () => void;
  onSkip?: () => void;
};

function stepStatus(
  index: number,
  activeIndex: number,
): 'done' | 'active' | 'pending' {
  if (index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  return 'pending';
}

export function PlanUpgradePrepOverlay({
  fromPlanLabel,
  allowSkip = false,
  onComplete,
  onSkip,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const completedRef = useRef(false);
  const startedAtRef = useRef(Date.now());

  const steps = PLAN_UPGRADE_PREP_STEPS;
  const active: PlanUpgradePrepStep = steps[stepIndex] || steps[steps.length - 1];

  const overallPct = useMemo(() => {
    let done = 0;
    for (let i = 0; i < stepIndex; i += 1) done += steps[i].durationMs;
    done += Math.round(active.durationMs * stepProgress);
    return Math.min(100, Math.round((done / PLAN_UPGRADE_PREP_TOTAL_MS) * 100));
  }, [stepIndex, stepProgress, steps, active.durationMs]);

  const remainingMs = Math.max(0, PLAN_UPGRADE_PREP_TOTAL_MS - elapsedMs);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    const tick = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (completedRef.current) return;
    const duration = active.durationMs;
    const started = Date.now();
    setStepProgress(0);

    const progressTimer = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / duration);
      setStepProgress(p);
    }, 80);

    const stepTimer = window.setTimeout(() => {
      setStepProgress(1);
      if (stepIndex >= steps.length - 1) {
        finish();
        return;
      }
      setStepIndex((i) => i + 1);
    }, duration);

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(stepTimer);
    };
  }, [stepIndex, active.durationMs, steps.length, finish]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-upgrade-prep-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="border-b border-stone-100 px-6 py-5 dark:border-stone-800">
          <div className="mb-3 flex items-center gap-2">
            <VertialLogo size="sm" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              Vertial
            </span>
          </div>
          <h2
            id="plan-upgrade-prep-title"
            className="text-lg font-bold text-stone-900 dark:text-stone-100"
          >
            Preparando tu sistema Pro
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Estamos pasando de {fromPlanLabel} a Pro. Esto tarda unos minutos:
            configuramos módulos, permisos y el dashboard completo.
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
              <span>Progreso</span>
              <span className="tabular-nums">{overallPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <div
                className="h-full rounded-full bg-[var(--v-blue,#2563eb)] transition-[width] duration-200 ease-out"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-stone-400 dark:text-stone-500">
              Tiempo restante estimado · {formatPrepRemaining(remainingMs)}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950/40">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--v-blue,#2563eb)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  {active.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                  {active.detail}
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                  <div
                    className="h-full rounded-full bg-teal-500/80 transition-[width] duration-100"
                    style={{ width: `${Math.round(stepProgress * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <ol className="space-y-2">
            {steps.map((step, index) => {
              const status = stepStatus(index, stepIndex);
              return (
                <li key={step.id} className="flex items-center gap-2.5 text-xs">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      status === 'done'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : status === 'active'
                          ? 'bg-blue-100 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/50'
                          : 'bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500'
                    }`}
                  >
                    {status === 'done' ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : status === 'active' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span className="text-[10px] font-bold">{index + 1}</span>
                    )}
                  </span>
                  <span
                    className={
                      status === 'pending'
                        ? 'text-stone-400 dark:text-stone-500'
                        : 'font-medium text-stone-800 dark:text-stone-200'
                    }
                  >
                    {step.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-6 py-4 dark:border-stone-800">
          <p className="text-[11px] text-stone-400 dark:text-stone-500">
            No cierres esta ventana. El sistema se actualizará al terminar.
          </p>
          {allowSkip && onSkip ? (
            <button
              type="button"
              className={VERTIAL_BTN_SECONDARY}
              onClick={() => {
                if (completedRef.current) return;
                completedRef.current = true;
                onSkip();
              }}
            >
              Saltar (solo admin)
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
